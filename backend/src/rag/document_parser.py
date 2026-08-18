import io
import pickle
from pathlib import Path

import cv2
import numpy as np
import pytesseract
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode, TesseractCliOcrOptions
from docling.document_converter import DocumentConverter, ImageFormatOption, PdfFormatOption
from docling_core.types.doc import PictureItem
from docling_core.types.doc.document import DescriptionAnnotation

from src.core.errors import DocumentParseError
from src.rag.vision import caption_picture, load_vision_llm

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}


def picture_image_filename(item):
    """Deterministic filename from a PictureItem's self_ref (e.g. "#/pictures/0") —
    shared with chunker.py so a picture chunk's metadata can point at the exact same
    file _process_pictures persisted, without needing to thread a path through the
    docling Document itself."""
    return item.self_ref.strip("#/").replace("/", "_") + ".png"


def parse_document(source_path, cache_path):
    if cache_path.exists():
        try:
            doc = pickle.loads(cache_path.read_bytes())
            return doc
        except Exception:
            cache_path.unlink(missing_ok=True)

    convert_path = source_path
    if Path(source_path).suffix.lower() in IMAGE_EXTENSIONS:
        # A tilted/rotated photo (phone snapshot, scanned-at-an-angle page) tanks
        # OCR accuracy well before it becomes visually obvious, and docling has no
        # deskew step of its own — straighten it up front so both Tesseract and the
        # layout/table models see an upright, level page.
        convert_path = _deskew_image(Path(source_path))

    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = True
    pipeline_options.ocr_options = TesseractCliOcrOptions(force_full_page_ocr=False)
    pipeline_options.do_table_structure = True
    pipeline_options.table_structure_options.mode = TableFormerMode.ACCURATE
    pipeline_options.generate_picture_images = True  # keep raster crops so we can OCR/caption each picture directly
    pipeline_options.images_scale = 2.0  # higher-res crops = better OCR accuracy on small in-image text
    pipeline_options.do_picture_description = False  # replaced by Qwen3-VL-8B in _process_pictures below —
    # the local SmolVLM-256M was too weak to describe a dense diagram's actual structure/relationships

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
            # Images route through the same OCR/table/picture-description pipeline as
            # PDFs — do_ocr=True full-page-OCRs the image itself since there's no
            # separate text layer to fall back on, so a scanned photo/screenshot gets
            # the same literal-text extraction a scanned PDF page would.
            InputFormat.IMAGE: ImageFormatOption(pipeline_options=pipeline_options),
        }
    )

    try:
        result = converter.convert(str(convert_path))
    except Exception as exc:
        kind = "image" if Path(source_path).suffix.lower() in IMAGE_EXTENSIONS else "PDF"
        raise DocumentParseError(
            f"Could not read '{source_path}'. It may be password-protected, corrupted, or not a valid {kind}."
        ) from exc

    doc = result.document
    if not doc.pages:
        raise DocumentParseError(f"'{source_path}' has no pages — nothing to index.")

    pictures_dir = cache_path.parent / "pictures"
    _process_pictures(doc, pictures_dir)
    cache_path.write_bytes(pickle.dumps(doc))
    return doc


def _deskew_image(source_path):
    """Straighten a photographed/scanned image before OCR: first correct any
    90/180/270 rotation via Tesseract's orientation detection (OSD), then correct
    fine skew (a few degrees off-level) via OpenCV's minimum-area-rect over the
    text mask. Writes the corrected image next to the original and returns its
    path; returns the original path untouched if nothing needed fixing or
    detection failed (better to OCR a tilted image than crash the upload)."""
    image = cv2.imread(str(source_path))
    if image is None:
        return source_path

    try:
        osd = pytesseract.image_to_osd(image)
        rotate_line = next(line for line in osd.splitlines() if line.startswith("Rotate:"))
        rotate_angle = int(rotate_line.split(":")[1].strip())
    except Exception:
        rotate_angle = 0
    if rotate_angle:
        image = _rotate_bound(image, -rotate_angle)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    coords = np.column_stack(np.where(thresh > 0))
    if coords.size == 0:
        return source_path

    angle = cv2.minAreaRect(coords)[-1]
    angle = -(90 + angle) if angle < -45 else -angle

    if rotate_angle == 0 and abs(angle) < 0.3:
        return source_path  # already level enough — skip a no-op re-encode

    if abs(angle) >= 0.3:
        image = _rotate_bound(image, angle)

    out_path = source_path.with_name(f"{source_path.stem}.deskewed.png")
    cv2.imwrite(str(out_path), image)
    return out_path


def _rotate_bound(image, angle):
    """Rotate by `angle` degrees around center, expanding the canvas so corners
    aren't clipped (plain cv2.warpAffine on the original size would crop them)."""
    h, w = image.shape[:2]
    cx, cy = w / 2, h / 2
    matrix = cv2.getRotationMatrix2D((cx, cy), angle, 1.0)
    cos, sin = abs(matrix[0, 0]), abs(matrix[0, 1])
    new_w = int((h * sin) + (w * cos))
    new_h = int((h * cos) + (w * sin))
    matrix[0, 2] += (new_w / 2) - cx
    matrix[1, 2] += (new_h / 2) - cy
    return cv2.warpAffine(image, matrix, (new_w, new_h), borderValue=(255, 255, 255))


def _image_to_png_bytes(image):
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def _process_pictures(doc, pictures_dir):
    """For every picture in the doc: persist its crop to disk (so the API can serve
    the actual image back to the frontend, not just a text description of it), run
    Tesseract on the crop for literal in-image text (docling's page-level OCR skips
    text baked into picture bitmaps), and caption it with Qwen3-VL-8B (see
    src.rag.vision) for a real structural description — box labels, connections,
    flow — that the local SmolVLM captioner was too weak to produce. Both text
    sources are attached as DescriptionAnnotations so chunker.chunk_document surfaces
    them, and the persisted file lets retriever.py point a chat citation at the image."""
    vision_llm = load_vision_llm()
    pictures_dir.mkdir(parents=True, exist_ok=True)
    tesseract_available = True

    for item, _level in doc.iterate_items():
        if not isinstance(item, PictureItem):
            continue
        try:
            image = item.get_image(doc)
        except Exception:
            continue
        if image is None:
            continue

        png_bytes = _image_to_png_bytes(image)
        (pictures_dir / picture_image_filename(item)).write_bytes(png_bytes)

        if tesseract_available:
            try:
                text = pytesseract.image_to_string(image).strip()
            except pytesseract.TesseractNotFoundError:
                tesseract_available = False
                text = ""
            except Exception:
                text = ""
            if text:
                item.annotations.append(DescriptionAnnotation(text=text, provenance="tesseract-ocr"))

        caption = caption_picture(vision_llm, png_bytes)
        if caption:
            item.annotations.append(DescriptionAnnotation(text=caption, provenance="qwen3-vl"))


def document_metadata(doc):
    data = doc.export_to_dict()
    return {
        "total_pages": len(doc.pages),
        "total_tables": len(data.get("tables", [])),
        "total_pictures": len(data.get("pictures", [])),
        "total_text_blocks": len(data.get("texts", [])),
    }

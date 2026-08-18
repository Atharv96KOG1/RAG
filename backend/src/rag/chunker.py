import json

from docling_core.transforms.chunker import HybridChunker
from docling_core.types.doc import DocItemLabel

from src.core.config import settings
from src.core.errors import EmptyDocumentError
from src.rag.document_parser import picture_image_filename


def _concrete_items_by_ref(doc):
    """HybridChunker's chunk.meta.doc_items are generic DocItem stubs — isinstance
    against TableItem/PictureItem always fails. The concrete subclass instances
    (with export_to_markdown/get_image/caption_text) live in doc.tables/doc.pictures,
    addressable by self_ref (e.g. "#/tables/0")."""
    by_ref = {}
    for t in doc.tables:
        by_ref[t.self_ref] = ("table", t)
    for p in doc.pictures:
        by_ref[p.self_ref] = ("picture", p)
    return by_ref


def _picture_text(item, doc):
    """caption_text is the PDF's own figure caption (e.g. "Figure 3: ...").
    annotations carry the VLM's visual description plus our Tesseract OCR pass
    (document_parser._ocr_pictures) — both wanted, neither should be dropped."""
    parts = []
    caption = item.caption_text(doc)
    if caption:
        parts.append(f"Caption: {caption}")
    for ann in item.annotations:
        text = getattr(ann, "text", None)
        if not text:
            continue
        text = text.split("<end_of_utterance")[0].strip()  # SmolVLM leaks its stop token into the output
        if text:
            label = "OCR text" if getattr(ann, "provenance", "") == "tesseract-ocr" else "Description"
            parts.append(f"{label}: {text}")
    return "\n".join(parts) if parts else None


def _item_page(item):
    return item.prov[0].page_no if item.prov else None


# Milvus VARCHAR fields hard-cap at 65535 bytes (2^16-1) — the database's own ceiling.
# A markdown-exported table with enough rows (or a docling table-structure
# misdetection merging several logical tables into one TableItem) can exceed that in a
# single chunk, which crashed the whole ingest with a MilvusException instead of
# failing just that one document.
_MAX_TABLE_TEXT_BYTES = 60_000


def _split_oversized_table_markdown(markdown, tokenizer):
    """Split an over-limit markdown table into several self-contained pieces, each
    repeating the header/separator row so every piece still reads as a valid, complete
    table on its own (not just an arbitrary text truncation). Bounded by BOTH real
    constraints downstream, not just one: Milvus's byte cap (above), and — the one
    that actually crashed ingestion — the embedding model's own token context window.
    HybridChunker already token-limits every other chunk type to settings.chunk_max_tokens
    via this same tokenizer; a table's markdown was the one text type that bypassed
    that (chunker splits by structure, not by size, for tables), so a big table could
    reach tens of thousands of tokens — self-attention memory scales quadratically with
    sequence length, which is what exhausted MPS memory on a real document's table."""
    max_tokens = tokenizer.max_tokens
    if len(markdown.encode("utf-8")) <= _MAX_TABLE_TEXT_BYTES and tokenizer.count_tokens(markdown) <= max_tokens:
        return [markdown]

    lines = markdown.splitlines()
    if len(lines) < 3:
        # Not actually a header+separator+rows table (or a single giant row) — nothing
        # structured to split on. Hard-truncate at a safe UTF-8 boundary as a last
        # resort so ingestion never crashes, even though this loses that row's tail.
        encoded = markdown.encode("utf-8")[: _MAX_TABLE_TEXT_BYTES - 20]
        return [encoded.decode("utf-8", errors="ignore") + "\n\n[...truncated: row exceeded storage limit]"]

    header, separator, rows = lines[0], lines[1], lines[2:]
    header_bytes = len(header.encode("utf-8")) + len(separator.encode("utf-8")) + 2
    header_tokens = tokenizer.count_tokens(f"{header}\n{separator}")

    pieces = []
    current_rows, current_bytes, current_tokens = [], header_bytes, header_tokens
    for row in rows:
        row_bytes = len(row.encode("utf-8")) + 1
        row_tokens = tokenizer.count_tokens(row)
        if current_rows and (
            current_bytes + row_bytes > _MAX_TABLE_TEXT_BYTES or current_tokens + row_tokens > max_tokens
        ):
            pieces.append("\n".join([header, separator, *current_rows]))
            current_rows, current_bytes, current_tokens = [], header_bytes, header_tokens
        if header_bytes + row_bytes > _MAX_TABLE_TEXT_BYTES or header_tokens + row_tokens > max_tokens:
            # A single row alone would still overflow — truncate just that row rather
            # than the whole table. Truncate by tokens first (the tighter of the two
            # real limits in practice), then re-check the byte cap.
            while row and tokenizer.count_tokens(row) + header_tokens > max_tokens:
                row = row[: max(1, len(row) // 2)]
            row = row.encode("utf-8")[: _MAX_TABLE_TEXT_BYTES - header_bytes - 20].decode("utf-8", errors="ignore")
            row += "…"
            row_bytes = len(row.encode("utf-8")) + 1
            row_tokens = tokenizer.count_tokens(row)
        current_rows.append(row)
        current_bytes += row_bytes
        current_tokens += row_tokens
    if current_rows:
        pieces.append("\n".join([header, separator, *current_rows]))

    return pieces or [markdown]


_EMPTY_BBOX = {"left": 0.0, "top": 0.0, "width": 0.0, "height": 0.0}


def _chunk_bbox_fraction(doc_items, doc, page):
    """Union bounding box of every doc_item in this chunk, as a fraction (0-1) of the
    page's own width/height — resolution-independent, so the frontend can position a
    highlight over the actual PDF.js-rendered page at any zoom level. width == 0 is the
    "no bbox available" sentinel (not None — see the image_path comment below on why
    Milvus can't infer a field's type from an all/mostly-None column); a real bbox
    always has positive width, so callers just check `width > 0`."""
    if page is None or page not in doc.pages:
        return _EMPTY_BBOX
    boxes = [item.prov[0].bbox for item in doc_items if item.prov and item.prov[0].page_no == page]
    if not boxes:
        return _EMPTY_BBOX

    page_size = doc.pages[page].size
    if page_size.width <= 0 or page_size.height <= 0:
        return _EMPTY_BBOX

    top_left = [b.to_top_left_origin(page_size.height) for b in boxes]
    left, top = min(b.l for b in top_left), min(b.t for b in top_left)
    right, bottom = max(b.r for b in top_left), max(b.b for b in top_left)
    return {
        "left": max(0.0, left / page_size.width),
        "top": max(0.0, top / page_size.height),
        "width": max(0.0, (right - left) / page_size.width),
        "height": max(0.0, (bottom - top) / page_size.height),
    }


def _overlap_tail(text, fraction=None):
    """Last ~15% (settings.text_overlap_fraction) of a text chunk's words, used to
    prepend trailing context onto the next chunk so information split across a chunk
    boundary isn't lost to either side."""
    words = text.split()
    if not words:
        return ""
    n = max(1, round(len(words) * (fraction if fraction is not None else settings.text_overlap_fraction)))
    return " ".join(words[-n:])


def chunk_document(doc, cache_path):
    if cache_path.exists():
        try:
            cached = json.loads(cache_path.read_text())
            return cached["texts"], cached["metas"]
        except (json.JSONDecodeError, KeyError):
            # Truncated/corrupted cache file (e.g. process killed mid-write) —
            # reparse instead of failing forever on every future upload.
            cache_path.unlink(missing_ok=True)

    chunker = HybridChunker(
        tokenizer=settings.embed_model_name, max_tokens=settings.chunk_max_tokens, merge_peers=False
    )
    raw_chunks = list(chunker.chunk(doc))
    concrete_by_ref = _concrete_items_by_ref(doc)

    chunk_metas = []
    bodies = []  # raw serialized text, headings NOT yet prepended — overlap is computed
    # against this raw body so a chunk's overlap-tail never drags in the *previous*
    # chunk's heading line, only its actual content.
    for c in raw_chunks:
        doc_items = c.meta.doc_items or []
        headings = " > ".join(c.meta.headings) if c.meta.headings else ""
        page = _item_page(doc_items[0]) if doc_items else None

        # merge_peers=False keeps each chunk to a single doc_items group, so a chunk
        # is either a table, a picture, or prose — never a blend. Tables/pictures get
        # their own clean serialization instead of the chunker's generic flattened text,
        # which is what was garbling table cells and dropping picture text before.
        resolved = [concrete_by_ref.get(i.self_ref) for i in doc_items]
        table_items = [item for kind, item in filter(None, resolved) if kind == "table"]
        picture_items = [item for kind, item in filter(None, resolved) if kind == "picture"]

        if table_items:
            # Each table gets split independently (not the joined "\n\n" text) so a
            # split boundary never lands mid-table when several tables share one chunk.
            table_texts = [
                piece
                for t in table_items
                for piece in _split_oversized_table_markdown(t.export_to_markdown(doc), chunker.tokenizer)
            ]
            content_type = "table"
            image_filename = ""  # not None — Milvus infers a metadata field's schema type from its
            # sampled values, and can't infer one from an all-None/mostly-None field (this is a
            # picture-only field, so most chunks have nothing here); "" is falsy just like None for
            # every `if image_path` check downstream, but gives Milvus a stable VARCHAR to infer.
            bbox = _chunk_bbox_fraction(doc_items, doc, page)
            for text in table_texts:
                bodies.append(text)
                chunk_metas.append(
                    {
                        "chunk_index": len(bodies) - 1,
                        "page": page,
                        "headings": headings,
                        "content_type": content_type,
                        "has_table": True,
                        "has_picture": False,
                        "image_path": image_filename,
                        "bbox_left": bbox["left"],
                        "bbox_top": bbox["top"],
                        "bbox_width": bbox["width"],
                        "bbox_height": bbox["height"],
                    }
                )
            continue
        elif picture_items:
            picture_texts = [_picture_text(p, doc) for p in picture_items]
            picture_texts = [t for t in picture_texts if t]
            if not picture_texts:
                continue  # picture with no caption, no VLM description, no OCR text — nothing to embed
            text = "\n\n".join(picture_texts)
            content_type = "picture"
            # First picture's persisted crop (see document_parser._process_pictures) —
            # lets a chat citation for this chunk point straight at the actual image
            # instead of only the whole PDF page.
            image_filename = picture_image_filename(picture_items[0])
        else:
            # DocItem stubs already carry a populated `label` field directly — no need
            # for the table/picture self_ref indirection above to detect list content.
            is_list = any(getattr(item, "label", None) == DocItemLabel.LIST_ITEM for item in doc_items)
            text = chunker.contextualize(c)
            content_type = "list" if is_list else "text"
            image_filename = ""

        bbox = _chunk_bbox_fraction(doc_items, doc, page)

        bodies.append(text)
        chunk_metas.append(
            {
                "chunk_index": len(bodies) - 1,  # position in this doc's own chunk list — graph_builder.py
                # namespaces its chunk nodes as f"chunk:{source_file}:{chunk_index}" using this same value,
                # so retrieval fusion (retriever.py) can map a retrieved Document back to its graph node.
                "page": page,
                "headings": headings,
                "content_type": content_type,
                "has_table": content_type == "table",
                "has_picture": content_type == "picture",
                "image_path": image_filename,
                "bbox_left": bbox["left"],
                "bbox_top": bbox["top"],
                "bbox_width": bbox["width"],
                "bbox_height": bbox["height"],
            }
        )

    # Sliding-window overlap: only between consecutive plain-text chunks. Never into/out
    # of table, picture, or list chunks — overlap would corrupt a table's cell grid or a
    # list's bullet structure, and a table/picture/list chunk's own content already
    # stands alone (it's a discrete unit, not prose that got arbitrarily cut).
    for i in range(1, len(bodies)):
        if chunk_metas[i]["content_type"] == "text" and chunk_metas[i - 1]["content_type"] == "text":
            tail = _overlap_tail(bodies[i - 1])
            if tail:
                bodies[i] = f"{tail} {bodies[i]}"

    chunk_texts = [
        f"{meta['headings']}\n\n{body}" if meta["headings"] else body
        for meta, body in zip(chunk_metas, bodies, strict=True)
    ]

    if not chunk_texts:
        # A PDF that's all blank pages, or all pictures with no caption/description/
        # OCR text, parses fine but chunks to nothing — BM25Retriever.from_documents([])
        # and Milvus.from_documents([]) both fail on an empty list, so catch it here
        # with a clear message instead of a confusing crash two steps downstream.
        raise EmptyDocumentError(
            "No searchable content found in this document (blank pages, or images "
            "with no caption/description/OCR text)."
        )

    cache_path.write_text(json.dumps({"texts": chunk_texts, "metas": chunk_metas}))
    return chunk_texts, chunk_metas


def to_langchain_documents(chunk_texts, chunk_metas):
    from langchain_core.documents import Document

    return [Document(page_content=chunk_texts[i], metadata=chunk_metas[i]) for i in range(len(chunk_texts))]

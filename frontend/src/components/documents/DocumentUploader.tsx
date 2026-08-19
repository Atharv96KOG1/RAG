import { useCallback, useRef, useState } from "react";
import type { DragEvent } from "react";
import { ImageIcon, UploadIcon } from "../icons";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"];
const ACCEPTED_EXTENSIONS = [".pdf", ...IMAGE_EXTENSIONS];

interface Props {
  onUpload: (file: File) => void;
  uploading: boolean;
}

function isAcceptedFile(file: File) {
  const name = file.name.toLowerCase();
  return file.type === "application/pdf" || file.type.startsWith("image/") || ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function DocumentUploader({ onUpload, uploading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      Array.from(files).filter(isAcceptedFile).forEach(onUpload);
    },
    [onUpload],
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className="group flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-4 text-center transition-colors"
      style={{
        borderColor: dragOver ? "var(--accent)" : "var(--border-strong)",
        background: dragOver ? "var(--accent-soft)" : "var(--surface-2)",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={[...ACCEPTED_EXTENSIONS, "application/pdf", "image/*"].join(",")}
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full transition-transform group-hover:-translate-y-0.5"
        style={{ background: "var(--surface)", color: "var(--accent)", boxShadow: "var(--shadow-sm)" }}
      >
        {uploading ? (
          <span
            className="spin block h-3.5 w-3.5 rounded-full border-2 border-transparent"
            style={{ borderTopColor: "var(--accent)", borderRightColor: "var(--accent)" }}
          />
        ) : (
          <UploadIcon width={15} height={15} />
        )}
      </div>
      <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
        {uploading ? "Processing…" : "Drop PDFs/images or click to upload"}
      </p>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Parsed, OCR'd, chunked, embedded, and indexed automatically
      </p>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          ocrInputRef.current?.click();
        }}
        className="mt-1 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:opacity-80"
        style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
      >
        <ImageIcon width={13} height={13} />
        OCR Image
      </button>
      <input
        ref={ocrInputRef}
        type="file"
        accept={[...IMAGE_EXTENSIONS, "image/*"].join(",")}
        multiple
        className="hidden"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

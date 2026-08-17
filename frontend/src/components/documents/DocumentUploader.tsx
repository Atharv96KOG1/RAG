import { useCallback, useRef, useState } from "react";
import type { DragEvent } from "react";
import { UploadIcon } from "../icons";

interface Props {
  onUpload: (file: File) => void;
  uploading: boolean;
}

export function DocumentUploader({ onUpload, uploading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      Array.from(files)
        .filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))
        .forEach(onUpload);
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
        accept="application/pdf"
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
        {uploading ? "Processing…" : "Drop PDFs or click to upload"}
      </p>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Parsed, chunked, embedded, and indexed automatically
      </p>
    </div>
  );
}

import { FileIcon, LayersIcon } from "../icons";

export function EmptyState({ hasDocuments }: { hasDocuments: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
      >
        {hasDocuments ? <LayersIcon width={26} height={26} /> : <FileIcon width={26} height={26} />}
      </div>
      <p className="text-base font-semibold" style={{ color: "var(--ink)" }}>
        {hasDocuments ? "Select up to 4 documents to start" : "Upload a PDF to get started"}
      </p>
      <p className="max-w-xs text-sm" style={{ color: "var(--muted)" }}>
        {hasDocuments
          ? "Check the boxes in the sidebar for the documents you want to ask questions about."
          : "Drop a PDF in the sidebar — it's parsed, chunked, embedded, and indexed automatically."}
      </p>
    </div>
  );
}

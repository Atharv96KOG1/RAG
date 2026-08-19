import type { DocumentSummary } from "../../types";
import { MAX_ACTIVE_DOCUMENTS } from "../../constants";
import { CheckIcon, FileIcon, TrashIcon } from "../icons";

interface Props {
  documents: DocumentSummary[];
  selected: string[];
  onToggle: (hash: string) => void;
  onRemove: (hash: string) => void;
}

export function DocumentList({ documents, selected, onToggle, onRemove }: Props) {
  if (documents.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        No documents uploaded yet.
      </p>
    );
  }

  const atMax = selected.length >= MAX_ACTIVE_DOCUMENTS;

  return (
    <ul className="flex flex-col gap-1">
      {documents.map((doc) => {
        const isSelected = selected.includes(doc.hash);
        const notReady = doc.ingest_status !== "ready";
        const disabled = notReady || (!isSelected && atMax);
        return (
          <li
            key={doc.hash}
            onClick={() => !disabled && onToggle(doc.hash)}
            className="group flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 transition-colors"
            style={{
              background: isSelected ? "var(--accent-soft)" : "transparent",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
            title={doc.ingest_status === "failed" ? (doc.error ?? "Processing failed") : undefined}
          >
            <div
              className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border transition-colors"
              style={{
                background: isSelected ? "var(--accent)" : "transparent",
                borderColor: isSelected ? "var(--accent)" : "var(--border-strong)",
                color: "var(--accent-ink)",
                width: 18,
                height: 18,
              }}
            >
              {isSelected && <CheckIcon width={11} height={11} strokeWidth={3} />}
            </div>

            {doc.ingest_status === "pending" ? (
              <span
                className="spin block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-transparent"
                style={{ borderTopColor: "var(--accent)", borderRightColor: "var(--accent)" }}
              />
            ) : (
              <FileIcon
                width={15}
                height={15}
                className="shrink-0"
                style={{ color: doc.ingest_status === "failed" ? "var(--danger)" : disabled ? "var(--muted)" : "var(--accent2)" }}
              />
            )}

            <span className="min-w-0 flex-1 truncate text-sm" style={{ color: disabled ? "var(--muted)" : "var(--ink)" }} title={doc.filename}>
              {doc.filename}
              {doc.ingest_status === "pending" && <span style={{ color: "var(--muted)" }}> · processing…</span>}
              {doc.ingest_status === "failed" && <span style={{ color: "var(--danger)" }}> · failed</span>}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(doc.hash);
              }}
              className="shrink-0 rounded-md p-1 opacity-0 transition-opacity hover:bg-black/5 group-hover:opacity-100"
              style={{ color: "var(--danger)" }}
              title="Remove"
              aria-label={`Remove ${doc.filename}`}
            >
              <TrashIcon width={13} height={13} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

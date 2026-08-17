import { DocumentUploader } from "../documents/DocumentUploader";
import { DocumentList } from "../documents/DocumentList";
import { StatsPanel } from "../documents/StatsPanel";
import { MAX_ACTIVE_DOCUMENTS } from "../../constants";
import type { DocumentMetadata, DocumentSummary } from "../../types";
import { SparkleIcon } from "../icons";

interface Props {
  documents: DocumentSummary[];
  selected: string[];
  activeNames: string[];
  activeMetadata: DocumentMetadata | null;
  uploading: boolean;
  activating: boolean;
  onUpload: (file: File) => void;
  onToggle: (hash: string) => void;
  onRemove: (hash: string) => void;
}

export function Sidebar({
  documents,
  selected,
  activeNames,
  activeMetadata,
  uploading,
  activating,
  onUpload,
  onToggle,
  onRemove,
}: Props) {
  return (
    <aside
      className="scroll-thin flex h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r p-4"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex items-center gap-2.5 px-1 pt-1">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
        >
          <SparkleIcon width={16} height={16} />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>
            Document RAG
          </h1>
          <p className="truncate text-xs" style={{ color: "var(--muted)" }}>
            Multi-document Q&A
          </p>
        </div>
      </div>

      <DocumentUploader onUpload={onUpload} uploading={uploading} />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1.5 flex items-baseline justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Documents
          </span>
          <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
            {selected.length}/{MAX_ACTIVE_DOCUMENTS} active
          </span>
        </div>
        <DocumentList documents={documents} selected={selected} onToggle={onToggle} onRemove={onRemove} />
      </div>

      {activating && (
        <p className="flex items-center gap-2 text-xs" style={{ color: "var(--accent)" }}>
          <span
            className="spin block h-3 w-3 shrink-0 rounded-full border-2 border-transparent"
            style={{ borderTopColor: "var(--accent)", borderRightColor: "var(--accent)" }}
          />
          Building retriever over selected documents…
        </p>
      )}

      {activeMetadata && !activating && <StatsPanel metadata={activeMetadata} activeNames={activeNames} />}
    </aside>
  );
}

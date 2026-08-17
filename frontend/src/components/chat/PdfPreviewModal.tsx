import { API_BASE_URL } from "../../api/client";
import { CloseIcon } from "../icons";

interface Props {
  docHash: string;
  filename: string;
  page: number | null;
  onClose: () => void;
}

export function PdfPreviewModal({ docHash, filename, page, onClose }: Props) {
  const src = `${API_BASE_URL}/api/documents/${docHash}/file${page ? `#page=${page}` : ""}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl"
        style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" style={{ color: "var(--ink)" }} title={filename}>
              {filename}
            </p>
            {page && (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Page {page}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 hover:bg-black/5"
            style={{ color: "var(--muted)" }}
            aria-label="Close preview"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>
        <iframe title={`${filename} preview`} src={src} className="min-h-0 flex-1" style={{ border: "none" }} />
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { API_BASE_URL } from "../../api/client";
import { CloseIcon } from "../icons";
import type { BoundingBox } from "../../types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  docHash: string;
  filename: string;
  page: number | null;
  bboxes?: BoundingBox[];
  onClose: () => void;
}

export function PdfPreviewModal({ docHash, filename, page, bboxes, onClose }: Props) {
  const hasBoxes = Boolean(bboxes && bboxes.length > 0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [renderedSize, setRenderedSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    async function render() {
      try {
        const url = `${API_BASE_URL}/api/documents/${docHash}/file`;
        // pdfjs-dist v6's getDocument() no longer normalizes a bare string into
        // {url} itself (older versions did) — passing just `url` silently fails with
        // "expected either `data`, `range`, or `url` parameter" since destructuring a
        // string gives undefined for every named property.
        const pdf = await pdfjsLib.getDocument({ url }).promise;
        if (cancelled) return;

        const pageNumber = Math.min(Math.max(page ?? 1, 1), pdf.numPages);
        const pdfPage = await pdf.getPage(pageNumber);
        if (cancelled) return;

        // Fit to the container's width — bbox is a page-relative fraction, so it maps
        // onto whatever size we render at without needing to know the scale ourselves.
        const containerWidth = containerRef.current?.clientWidth || 800;
        const unscaledViewport = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: containerWidth / unscaledViewport.width });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (cancelled) return;

        setRenderedSize({ width: viewport.width, height: viewport.height });
        setStatus("ready");
      } catch (err) {
        // Surfaced to the console (not just the generic UI message) so a real failure
        // here — e.g. a CORS/header issue — is diagnosable from devtools next time,
        // instead of just "it didn't load" with no trace of why.
        console.error("PDF preview failed to load:", err);
        if (!cancelled) setStatus("error");
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [docHash, page]);

  useEffect(() => {
    if (status === "ready" && hasBoxes) {
      highlightRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [status, hasBoxes]);

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
                {hasBoxes &&
                  (bboxes!.length > 1
                    ? ` · ${bboxes!.length} highlighted passages below`
                    : " · highlighted passage below")}
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

        <div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto" style={{ background: "var(--surface-3, #e5e5e5)" }}>
          {status === "loading" && (
            <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--muted)" }}>
              Loading page…
            </div>
          )}
          {status === "error" && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
              <p>Could not load this PDF for preview.</p>
              <a
                href={`${API_BASE_URL}/api/documents/${docHash}/file`}
                target="_blank"
                rel="noreferrer"
                className="underline"
                style={{ color: "var(--accent)" }}
              >
                Open the PDF directly instead
              </a>
            </div>
          )}
          <div
            className="relative mx-auto"
            style={{ width: renderedSize.width || undefined, display: status === "ready" ? "block" : "none" }}
          >
            <canvas ref={canvasRef} className="block" />
            {hasBoxes &&
              renderedSize.width > 0 &&
              bboxes!.map((box, i) => (
                <div
                  key={i}
                  ref={i === 0 ? highlightRef : undefined}
                  className="pointer-events-none absolute rounded-sm"
                  style={{
                    left: `${box.left * 100}%`,
                    top: `${box.top * 100}%`,
                    width: `${box.width * 100}%`,
                    height: `${box.height * 100}%`,
                    background: "rgba(250, 204, 21, 0.35)",
                    boxShadow: "0 0 0 3px rgba(234, 179, 8, 0.95)",
                  }}
                />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

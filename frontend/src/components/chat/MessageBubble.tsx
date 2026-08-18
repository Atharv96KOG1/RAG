import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_BASE_URL } from "../../api/client";
import type { ChatMessage, PreviewTarget, SourceCitation } from "../../types";
import { CheckIcon, CopyIcon, FileIcon, SparkleIcon } from "../icons";

interface Props {
  message: ChatMessage;
  onPreview?: (target: PreviewTarget) => void;
}

interface SourceGroup {
  doc_hash: string | null;
  source_file: string | null;
  page: number | null;
  // Highest-scoring citation in the group represents the chip (label, snippet
  // tooltip) — citations already arrive sorted best-first from the reranker.
  top: SourceCitation;
  bboxes: import("../../types").BoundingBox[];
}

function groupSourcesByPage(sources: SourceCitation[]): SourceGroup[] {
  // Grouping (not dropping) same-page citations matters: two genuinely different
  // passages can both land on the same page, and collapsing them into one entry used
  // to silently keep only the first one's highlight box, discarding the second. A
  // citation with no doc_hash can't be grouped/previewed at all — kept as its own
  // standalone (non-clickable) entry rather than silently dropped.
  const groups = new Map<string, SourceGroup>();
  const ungroupable: SourceGroup[] = [];
  for (const s of sources) {
    if (!s.doc_hash) {
      ungroupable.push({ doc_hash: null, source_file: s.source_file, page: s.page, top: s, bboxes: [] });
      continue;
    }
    const key = `${s.doc_hash}:${s.page}`;
    let group = groups.get(key);
    if (!group) {
      group = { doc_hash: s.doc_hash, source_file: s.source_file, page: s.page, top: s, bboxes: [] };
      groups.set(key, group);
    }
    if (s.bbox) group.bboxes.push(s.bbox);
  }
  return [...groups.values(), ...ungroupable];
}

export function MessageBubble({ message, onPreview }: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isUser) {
    return (
      <div className="message-in flex justify-end">
        <div
          className="max-w-[75%] rounded-3xl px-4 py-2.5 text-sm leading-relaxed"
          style={{ background: "var(--surface-2)", color: "var(--ink)" }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  const sources = message.sources ?? [];
  const groups = groupSourcesByPage(sources);

  return (
    <div className="message-in group flex gap-3">
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
      >
        <SparkleIcon width={15} height={15} />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="markdown-body" style={{ color: "var(--ink)" }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>

        {sources.some((s) => s.image_url) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {[...new Map(sources.filter((s) => s.image_url).map((s) => [s.image_url, s])).values()].map((s) => {
              const fullUrl = `${API_BASE_URL}${s.image_url}`;
              return (
                <img
                  key={s.image_url}
                  src={fullUrl}
                  alt={s.source_file ? `Figure from ${s.source_file}` : "Referenced figure"}
                  onClick={() => window.open(fullUrl, "_blank")}
                  className="max-h-48 cursor-zoom-in rounded-lg border"
                  style={{ borderColor: "var(--border)" }}
                />
              );
            })}
          </div>
        )}

        {groups.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {groups.map((g, i) => {
              const clickable = Boolean(g.doc_hash);
              const scorePct = g.top.relevance_score != null ? Math.round(g.top.relevance_score * 100) : null;
              const tooltip = clickable
                ? [g.top.snippet, scorePct != null ? `Relevance: ${scorePct}%` : null].filter(Boolean).join("\n\n")
                : undefined;
              return (
                <button
                  key={i}
                  disabled={!clickable}
                  onClick={() =>
                    clickable &&
                    onPreview?.({
                      doc_hash: g.doc_hash as string,
                      source_file: g.source_file,
                      page: g.page,
                      bboxes: g.bboxes,
                    })
                  }
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors disabled:cursor-default"
                  style={{ background: "var(--surface-2)", color: "var(--muted)" }}
                  title={tooltip}
                >
                  <FileIcon width={11} height={11} className="shrink-0" style={{ color: "var(--accent2)" }} />
                  <span className="max-w-[160px] truncate">{g.source_file ?? "source"}</span>
                  {g.page != null && (
                    <span className="font-medium" style={{ color: clickable ? "var(--accent)" : "var(--muted)" }}>
                      p.{g.page}
                    </span>
                  )}
                  {g.bboxes.length > 1 && (
                    <span
                      className="rounded-full px-1.5 text-[10px] font-medium"
                      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                      title={`${g.bboxes.length} highlighted passages on this page`}
                    >
                      {g.bboxes.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={copy}
          className="mt-1.5 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: "var(--muted)" }}
          title="Copy response"
        >
          {copied ? <CheckIcon width={13} height={13} /> : <CopyIcon width={13} height={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

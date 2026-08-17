import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, SourceCitation } from "../../types";
import { CheckIcon, CopyIcon, FileIcon, SparkleIcon } from "../icons";

interface Props {
  message: ChatMessage;
  onPreview?: (source: SourceCitation) => void;
}

function dedupeSources(sources: SourceCitation[]) {
  const seen = new Set<string>();
  const out: SourceCitation[] = [];
  for (const s of sources) {
    const key = `${s.doc_hash ?? s.source_file}:${s.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
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

  const sources = dedupeSources(message.sources ?? []);

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

        {sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sources.map((s, i) => {
              const clickable = Boolean(s.doc_hash);
              return (
                <button
                  key={i}
                  disabled={!clickable}
                  onClick={() => clickable && onPreview?.(s)}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors disabled:cursor-default"
                  style={{ background: "var(--surface-2)", color: "var(--muted)" }}
                  title={clickable ? "Open PDF at this page" : undefined}
                >
                  <FileIcon width={11} height={11} className="shrink-0" style={{ color: "var(--accent2)" }} />
                  <span className="max-w-[160px] truncate">{s.source_file ?? "source"}</span>
                  {s.page != null && (
                    <span className="font-medium" style={{ color: clickable ? "var(--accent)" : "var(--muted)" }}>
                      p.{s.page}
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

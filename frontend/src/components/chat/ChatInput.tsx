import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { SendIcon } from "../icons";

interface Props {
  onSend: (question: string) => void;
  disabled: boolean;
  sending: boolean;
}

export function ChatInput({ onSend, disabled, sending }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const submit = () => {
    if (!value.trim() || disabled || sending) return;
    onSend(value);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = !disabled && !sending && value.trim().length > 0;

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2">
        <div
          className="flex w-full items-end gap-2 rounded-3xl border px-3 py-2.5 transition-shadow"
          style={{
            borderColor: "var(--border-strong)",
            background: "var(--surface)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            rows={1}
            placeholder={disabled ? "Activate a document first…" : "Message Document RAG…"}
            className="max-h-[200px] min-h-6 flex-1 resize-none bg-transparent px-1 py-0.5 text-sm leading-6 outline-none placeholder:opacity-60"
            style={{ color: "var(--ink)" }}
          />
          <button
            onClick={submit}
            disabled={!canSend}
            aria-label="Send message"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-30"
            style={{
              background: canSend ? "var(--accent)" : "var(--surface-3)",
              color: canSend ? "var(--accent-ink)" : "var(--muted)",
            }}
          >
            <SendIcon width={15} height={15} />
          </button>
        </div>
        <p className="text-[0.7rem]" style={{ color: "var(--muted)" }}>
          Answers are generated from your uploaded documents and may be incomplete.
        </p>
      </div>
    </div>
  );
}

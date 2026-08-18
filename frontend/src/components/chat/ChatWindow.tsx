import { useEffect, useRef } from "react";
import type { ChatMessage, PreviewTarget } from "../../types";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { EmptyState } from "./EmptyState";

interface Props {
  messages: ChatMessage[];
  sending: boolean;
  hasActiveDocuments: boolean;
  hasDocuments: boolean;
  onPreview?: (target: PreviewTarget) => void;
}

export function ChatWindow({ messages, sending, hasActiveDocuments, hasDocuments, onPreview }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  if (!hasActiveDocuments) {
    return <EmptyState hasDocuments={hasDocuments} />;
  }

  return (
    <div className="scroll-thin flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            Ask a question about the active document(s)…
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onPreview={onPreview} />
        ))}
        {sending && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

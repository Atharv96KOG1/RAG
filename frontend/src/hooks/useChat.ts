import { useCallback, useState } from "react";
import { sendMessage } from "../api/chat";
import { ApiRequestError } from "../api/client";
import type { ChatMessage } from "../types";

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;

    setError(null);
    setMessages((prev) => [...prev, { id: makeId(), role: "user", content: trimmed }]);
    setSending(true);

    try {
      const res = await sendMessage(trimmed);
      setMessages((prev) => [...prev, { id: makeId(), role: "assistant", content: res.answer, sources: res.sources }]);
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : "Could not reach the server.";
      setError(message);
      setMessages((prev) => [...prev, { id: makeId(), role: "assistant", content: `⚠️ ${message}` }]);
    } finally {
      setSending(false);
    }
  }, []);

  const reset = useCallback(() => setMessages([]), []);

  return { messages, sending, error, send, reset, clearError: () => setError(null) };
}

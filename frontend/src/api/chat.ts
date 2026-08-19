import { api } from "./client";
import type { SourceCitation } from "../types";

export function sendMessage(question: string) {
  return api.post<{ answer: string; sources: SourceCitation[] }>("/api/chat", { question });
}

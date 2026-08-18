import { api } from "./client";
import type { ActivateResponse, DocumentListResponse } from "../types";

export function listDocuments() {
  return api.get<DocumentListResponse>("/api/documents");
}

export function uploadDocument(file: File) {
  const form = new FormData();
  form.append("file", file);
  return api.postForm<DocumentListResponse>("/api/documents", form);
}

export function removeDocument(hash: string) {
  return api.delete<DocumentListResponse>(`/api/documents/${hash}`);
}

export function activateDocuments(hashes: string[]) {
  return api.post<ActivateResponse>("/api/documents/activate", { hashes });
}

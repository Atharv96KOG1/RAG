import { useCallback, useEffect, useState } from "react";
import { activateDocuments, listDocuments, removeDocument, uploadDocument } from "../api/documents";
import { ApiRequestError } from "../api/client";
import type { DocumentMetadata, DocumentSummary } from "../types";
import { MAX_ACTIVE_DOCUMENTS } from "../constants";

export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [activeHashes, setActiveHashes] = useState<string[]>([]);
  const [activeMetadata, setActiveMetadata] = useState<DocumentMetadata | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await listDocuments();
      setDocuments(res.documents);
      setActiveHashes(res.active_hashes);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not reach the server.");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Ingestion runs in a backend background task (see routes/documents.py) so upload
  // returns before parsing/chunking/embedding finishes — poll while anything is still
  // "pending" so the sidebar flips to ready/failed without a manual refresh.
  useEffect(() => {
    if (!documents.some((d) => d.ingest_status === "pending")) return;
    const timer = setTimeout(refresh, 2000);
    return () => clearTimeout(timer);
  }, [documents, refresh]);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      try {
        const res = await uploadDocument(file);
        setDocuments(res.documents);
        setActiveHashes(res.active_hashes);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  const remove = useCallback(async (hash: string) => {
    try {
      const res = await removeDocument(hash);
      setDocuments(res.documents);
      setActiveHashes(res.active_hashes);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not remove document.");
    }
  }, []);

  const activate = useCallback(async (hashes: string[]) => {
    if (hashes.length === 0 || hashes.length > MAX_ACTIVE_DOCUMENTS) return;
    setActivating(true);
    setError(null);
    try {
      const res = await activateDocuments(hashes);
      setActiveHashes(res.active_hashes);
      setActiveMetadata(res.combined_metadata);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not activate documents.");
    } finally {
      setActivating(false);
    }
  }, []);

  return {
    documents,
    activeHashes,
    activeMetadata,
    uploading,
    activating,
    error,
    upload,
    remove,
    activate,
    clearError: () => setError(null),
  };
}

export interface DocumentMetadata {
  total_pages: number;
  total_tables: number;
  total_pictures: number;
  total_text_blocks: number;
}

export type IngestStatus = "pending" | "ready" | "failed";

export interface DocumentSummary {
  hash: string;
  filename: string;
  metadata: DocumentMetadata | null;
  ingest_status: IngestStatus;
  graph_status: IngestStatus;
  error: string | null;
}

export interface DocumentListResponse {
  documents: DocumentSummary[];
  active_hashes: string[];
}

export interface ActivateResponse {
  active_hashes: string[];
  combined_metadata: DocumentMetadata & { per_document?: Record<string, DocumentMetadata> };
}

export interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SourceCitation {
  source_file: string | null;
  doc_hash: string | null;
  page: number | null;
  content_type: string | null;
  snippet: string;
  relevance_score: number | null;
  image_url: string | null;
  bbox: BoundingBox | null;
}

// What a source chip click hands to the PDF preview — grouped by (doc_hash, page) so
// multiple distinct passages cited from the SAME page all get highlighted together,
// instead of only ever showing the first one and silently dropping the rest.
export interface PreviewTarget {
  doc_hash: string;
  source_file: string | null;
  page: number | null;
  bboxes: BoundingBox[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceCitation[];
}

export interface ApiError {
  detail: string;
}

export interface GraphNode {
  id: string;
  kind: "entity" | "chunk";
  label: string;
  type: string | null;
  source_files: string[];
  page: number | null;
  content_type: string | null;
  preview: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlighted_node_ids: string[];
  overlap_node_ids: string[];
}

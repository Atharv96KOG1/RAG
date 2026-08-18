"""Single source of truth for every model name, path, and tunable used across the
pipeline — chunking, embeddings, retrieval, GraphRAG extraction, and Milvus. Anything
that used to be a bare module-level constant now lives on the `settings` singleton
below, and every field can be overridden via env var or a .env file (pydantic-settings
matches env vars to field names case-insensitively) without touching code."""

import hashlib
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    # The repo's real .env lives at the repo root (one level up from backend/), not
    # inside backend/ itself — listing both here (root first, backend/.env can still
    # override if it ever exists) instead of just BASE_DIR/".env" is what broke
    # OPENAI_API_KEY after the config.py move, since python-dotenv's old
    # load_dotenv() used to walk upward from the CWD and find it automatically.
    model_config = SettingsConfigDict(
        env_file=(str(BASE_DIR.parent / ".env"), str(BASE_DIR / ".env")), extra="ignore"
    )
    openai_api_key: str | None = None
    # Qwen3-VL-8B via OpenRouter (OpenAI-compatible endpoint) — replaces the local
    # SmolVLM picture captioner and handles multimodal answers ("show me the diagram
    # and explain it") by seeing the actual figure crop, not just a text caption of it.
    # Additive: with no key set, ingestion/chat just fall back to OCR-only/text-only.
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    vision_model_name: str = "qwen/qwen3-vl-8b-instruct"
    # Single shared login (no user DB) — matches this app's existing single-tenant
    # design (see api/state.py's own comment on that). Every non-auth route requires
    # a valid JWT issued by POST /api/auth/login against these credentials.
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440
    auth_username: str = "admin"
    auth_password: str = "admin"
    milvus_uri: str = "http://localhost:19530"
    collection_prefix: str = "rag_doc_"
    data_dir: Path = BASE_DIR / "data"
    cache_dir: Path = BASE_DIR / "cache"
    source_path: Path = BASE_DIR / "data" / "26-004-crm-software-rfp-package.pdf"
    embed_model_name: str = "BAAI/bge-m3"
    reranker_model_name: str = "BAAI/bge-reranker-v2-m3"
    # Cross-attention cost scales with input length, and chunks run up to
    # chunk_max_tokens (1024) — reranking 25 candidates at full length measured at
    # ~4-5s per query. A reranker only needs enough text to judge relevance, not the
    # whole chunk, so truncating here (this doesn't affect what the LLM sees, only
    # what the reranker scores) is a real speed win, not just a cache/warm-up fix.
    reranker_max_length: int = 384
    llm_model_name: str = "gpt-4o-mini"
    chunk_max_tokens: int = 1024
    text_overlap_fraction: float = 0.15
    dense_retriever_k: int = 10
    bm25_retriever_k: int = 10
    hybrid_weights: list[float] = [0.6, 0.4]
    rerank_top_n: int = 8
    # Sigmoid'd cross-encoder score (see retriever.ScoredCrossEncoderReranker) below
    # which the top retrieved chunk is treated as "not actually relevant" — the answer
    # chain refuses instead of generating from context that doesn't support the
    # question, which is what let an unrelated chunk get hallucinated into an answer.
    min_relevance_score: float = 0.15
    graph_entity_types: list[str] = ["person", "organization", "product", "location", "concept", "date", "other"]
    graph_overlap_entity_types: list[str] = ["person", "organization", "product", "location"]
    graph_group_max_tokens: int = 2500
    graph_extraction_concurrency: int = 5
    graph_seed_k: int = 15
    graph_expand_limit: int = 10


settings = Settings()
settings.data_dir.mkdir(exist_ok=True)
settings.cache_dir.mkdir(exist_ok=True)


def cache_paths_for(source_path):
    """Cache keyed by file content hash, not a fixed filename — switching the source
    PDF (re-uploading a different file) can never silently reuse another doc's cached
    parse/chunks, which is what caused stale answers before this was per-file."""
    digest = hashlib.md5(Path(source_path).read_bytes()).hexdigest()[:16]
    doc_cache_dir = settings.cache_dir / digest
    doc_cache_dir.mkdir(parents=True, exist_ok=True)
    return {
        "key": digest,
        "document": doc_cache_dir / "document.cache.pkl",
        "chunks": doc_cache_dir / "chunks.cache.json",
        "graph": doc_cache_dir / "graph.cache.json",
        "collection_name": f"{settings.collection_prefix}{digest}",
    }

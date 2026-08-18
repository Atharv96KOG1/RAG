import logging
import math
import time

from langchain_community.cross_encoders import HuggingFaceCrossEncoder
from langchain_community.retrievers import BM25Retriever
from langchain_core.runnables import RunnableLambda

try:
    from langchain_classic.retrievers import ContextualCompressionRetriever, EnsembleRetriever
    from langchain_classic.retrievers.document_compressors import CrossEncoderReranker
except ModuleNotFoundError:
    from langchain.retrievers import ContextualCompressionRetriever, EnsembleRetriever
    from langchain.retrievers.document_compressors import CrossEncoderReranker

from src.core.config import settings

logger = logging.getLogger(__name__)


class ScoredCrossEncoderReranker(CrossEncoderReranker):
    """CrossEncoderReranker computes a relevance score per document, sorts by it, then
    throws the number away — nothing downstream can tell "barely relevant" from "dead
    on". That's what let an unrelated chunk get treated as good context and answered
    from anyway (see rag_chain.py's groundedness gate, which reads this back).
    bge-reranker-v2-m3 (like most cross-encoders) outputs an unbounded raw logit, not
    a 0-1 score — the model card's own recommendation is to sigmoid it before treating
    it as a relevance probability, which is what makes a fixed threshold meaningful."""

    def compress_documents(self, documents, query, callbacks=None):
        scores = self.model.score([(query, doc.page_content) for doc in documents])
        paired = sorted(zip(documents, scores, strict=False), key=lambda pair: pair[1], reverse=True)
        return [
            doc.model_copy(update={"metadata": {**doc.metadata, "relevance_score": 1 / (1 + math.exp(-score))}})
            for doc, score in paired[: self.top_n]
        ]


def _warm_up(cross_encoder, batch_size):
    """A cross-encoder's first .score() call pays a one-time lazy MPS/CUDA
    initialization cost on top of its real per-token compute — warming with a
    batch of realistic length (not a couple of tiny words) so that init cost
    lands here, during activation (which the user already expects to take a
    few seconds), rather than on the user's first actual chat message."""
    dummy_text = "warmup " * settings.reranker_max_length
    try:
        cross_encoder.score([("warmup query", dummy_text)] * batch_size)
    except Exception:
        logger.warning("Cross-encoder warm-up call failed; first real query will pay the cost instead", exc_info=True)


def build_hybrid_retriever(vectorstore, lc_documents):
    dense_retriever = vectorstore.as_retriever(search_kwargs={"k": settings.dense_retriever_k})

    bm25_retriever = BM25Retriever.from_documents(lc_documents)
    bm25_retriever.k = settings.bm25_retriever_k

    return EnsembleRetriever(retrievers=[dense_retriever, bm25_retriever], weights=settings.hybrid_weights)


def _scaled_top_n(num_docs):
    """Multi-doc queries compete for the same fixed rerank slots as a single-doc query
    unless top_n grows with the number of active documents — this was flagged as a
    likely cause of "missing obvious answers" in multi-doc mode. Capped at 12 so the
    LLM context doesn't balloon."""
    return min(12, settings.rerank_top_n + 2 * (num_docs - 1))


def _load_cross_encoder(device, warm_up_batch_size):
    cross_encoder = HuggingFaceCrossEncoder(
        model_name=settings.reranker_model_name,
        model_kwargs={"device": device, "max_length": settings.reranker_max_length},
    )
    _warm_up(cross_encoder, warm_up_batch_size)
    return cross_encoder


def build_reranked_retriever(hybrid_retriever, device, num_docs=1, cross_encoder=None, top_n=None):
    """cross_encoder can be passed in to reuse an already-loaded model (e.g. for a
    second, wider-recall retriever variant — see build_wide_table_retriever) instead of
    paying its load+warm-up cost twice. top_n overrides the doc-count-scaled default
    for the same reason."""
    if cross_encoder is None:
        cross_encoder = _load_cross_encoder(device, settings.dense_retriever_k + settings.bm25_retriever_k)
    reranker = ScoredCrossEncoderReranker(model=cross_encoder, top_n=top_n if top_n is not None else _scaled_top_n(num_docs))
    return ContextualCompressionRetriever(base_compressor=reranker, base_retriever=hybrid_retriever), cross_encoder


def _chunk_key(doc):
    return f"chunk:{doc.metadata.get('source_file')}:{doc.metadata.get('chunk_index')}"


def build_graph_expanded_retriever(
    hybrid_retriever, graph, lc_documents, device, num_docs, cross_encoder=None, top_n=None, seed_k=None, expand_limit=None
):
    """GraphRAG local-search retrieval: seed from the plain (unreranked) hybrid ensemble,
    1-hop expand through the entity graph to pull in chunks connected via a shared
    entity that the vector/BM25 search alone missed, dedup, then rerank the union once.
    Returns (retriever, touched_box, cross_encoder) — touched_box["node_ids"] is
    overwritten on every call with the chunk+entity node ids the final answer actually
    drew on, read by routes/graph.py to highlight the last query's subgraph without
    threading the query result through `state` from inside this module. cross_encoder
    is returned so a second, wider-recall variant (see build_wide_table_retriever) can
    reuse the same loaded model instead of loading it twice; top_n/seed_k/expand_limit
    override the doc-count-scaled defaults for that same variant."""
    doc_lookup = {_chunk_key(doc): doc for doc in lc_documents if doc.metadata.get("chunk_index") is not None}
    seed_k = seed_k if seed_k is not None else settings.graph_seed_k
    expand_limit = expand_limit if expand_limit is not None else settings.graph_expand_limit

    if cross_encoder is None:
        cross_encoder = _load_cross_encoder(device, settings.graph_seed_k + settings.graph_expand_limit)
    reranker = ScoredCrossEncoderReranker(model=cross_encoder, top_n=top_n if top_n is not None else _scaled_top_n(num_docs))

    touched_box = {"node_ids": []}

    def expand_and_rerank(query):
        t0 = time.perf_counter()
        seed_docs = hybrid_retriever.invoke(query)[:seed_k]
        t_hybrid = time.perf_counter()
        logger.info("timing: hybrid (dense+BM25) retrieval took %.2fs", t_hybrid - t0)
        seed_keys = {_chunk_key(d) for d in seed_docs}

        expanded_keys = set()
        for key in seed_keys:
            if key not in graph:
                continue
            for entity_id in graph.successors(key):
                if graph.nodes[entity_id].get("kind") != "entity":
                    continue
                for neighbor_key in graph.predecessors(entity_id):
                    if neighbor_key not in seed_keys and graph.nodes.get(neighbor_key, {}).get("kind") == "chunk":
                        expanded_keys.add(neighbor_key)
            if len(expanded_keys) >= expand_limit:
                break

        expanded_docs = [doc_lookup[k] for k in list(expanded_keys)[:expand_limit] if k in doc_lookup]
        candidates = seed_docs + expanded_docs
        t_expand = time.perf_counter()
        logger.info(
            "timing: graph expansion took %.2fs (%d seed, %d graph-expanded)",
            t_expand - t_hybrid,
            len(seed_docs),
            len(expanded_docs),
        )

        reranked = list(reranker.compress_documents(candidates, query))
        logger.info("timing: cross-encoder rerank of %d candidates took %.2fs", len(candidates), time.perf_counter() - t_expand)
        for doc in reranked:
            logger.debug(
                "retrieved: source=%s page=%s type=%s",
                doc.metadata.get("source_file"),
                doc.metadata.get("page"),
                doc.metadata.get("content_type"),
            )

        final_keys = {_chunk_key(d) for d in reranked}
        touched = set(final_keys)
        for key in final_keys:
            if key in graph:
                touched.update(n for n in graph.successors(key) if graph.nodes[n].get("kind") == "entity")
        touched_box["node_ids"] = sorted(touched)

        return reranked

    return RunnableLambda(expand_and_rerank), touched_box, cross_encoder


def build_wide_table_retriever(hybrid_retriever, graph, lc_documents, device, num_docs, cross_encoder):
    """A table/comparison question ("compare all leave types") is fundamentally
    different from a single-fact question: it names or implies MULTIPLE distinct
    entities, and a single query embedding doesn't match each entity's own section as
    strongly as a question aimed at just one of them would. Verified directly against a
    real document: the standard top_n=8 retrieval for "compare all leave types" surfaced
    only 5 of 8 actual leave-type sections, silently producing "Not specified" for the
    other 3 — not a hallucination, a recall gap. table_retrieval_breadth_multiplier
    scales seed/expand/top_n proportionally (not a new flat magic count) specifically
    for this query shape, reusing the already-loaded cross_encoder so it costs one
    extra rerank pass, not a second model load."""
    multiplier = settings.table_retrieval_breadth_multiplier
    top_n = min(30, round(_scaled_top_n(num_docs) * multiplier))
    if graph is not None and graph.number_of_nodes() > 0:
        retriever, _touched_box, _ce = build_graph_expanded_retriever(
            hybrid_retriever,
            graph,
            lc_documents,
            device,
            num_docs,
            cross_encoder=cross_encoder,
            top_n=top_n,
            seed_k=round(settings.graph_seed_k * multiplier),
            expand_limit=round(settings.graph_expand_limit * multiplier),
        )
        return retriever
    retriever, _ce = build_reranked_retriever(
        hybrid_retriever, device, num_docs, cross_encoder=cross_encoder, top_n=top_n
    )
    return retriever


def _bbox_from_metadata(metadata):
    # width <= 0 is chunker._chunk_bbox_fraction's "no bbox available" sentinel (see
    # its docstring for why that's a sentinel and not None) — surface nothing rather
    # than a zero-size highlight the frontend would have to special-case anyway.
    width = metadata.get("bbox_width")
    if not width or width <= 0:
        return None
    return {
        "left": metadata.get("bbox_left", 0.0),
        "top": metadata.get("bbox_top", 0.0),
        "width": width,
        "height": metadata.get("bbox_height", 0.0),
    }


REL_SCORE_NEUTRAL = 0.5  # sigmoid(0) — bge-reranker-v2-m3's own "no signal" point, not a tuned constant

# Observed across multiple test documents/questions: a genuinely relevant chunk scores
# 0.54-0.7+; a chunk with no real connection to the question clusters right at
# 0.500-0.502 regardless of document. When even the BEST candidate for a query falls in
# that noise band, "half of the top's confidence above neutral" (the relative rule
# below) is still noise — a query with nothing relevant needs zero citations, not its
# least-noisy candidate. This is the floor that catches that case.
_MIN_TOP_SCORE_FOR_ANY_CITATION = 0.55


def citation_relevance_cutoff(scores):
    """Per-query citation bar: a doc must retain at least citation_relevance_fraction
    of THIS query's own top match's confidence above the reranker's neutral point. The
    reranker's top_n (8-12) always returns that many candidates even when only 1-2 are
    actually relevant, and a flat absolute cutoff can't tell a weak-but-real match from
    noise clustered just above 0.5 — scaling the bar to the query's own top score can.
    But that alone breaks when the whole candidate set is uniformly weak (every score
    sits in the noise band) — _MIN_TOP_SCORE_FOR_ANY_CITATION catches that by requiring
    the top score itself to clear the noise band before anything is cited at all."""
    if not scores or max(scores) < _MIN_TOP_SCORE_FOR_ANY_CITATION:
        return float("inf")
    top = max(scores)
    return REL_SCORE_NEUTRAL + (top - REL_SCORE_NEUTRAL) * settings.citation_relevance_fraction


def _passes_relevance_gate(metadata, cutoff):
    # A stricter bar than rag_chain._is_grounded's min_relevance_score — that gate only
    # asks "is the single best candidate good enough to attempt an answer at all"
    # (deliberately loose to avoid false refusals). Citing a source is a stronger claim
    # ("the answer came from this page"), so every individual citation needs its own
    # score at or above this query's citation_relevance_cutoff. A doc with no
    # relevance_score (a retriever path that doesn't score) still passes.
    score = metadata.get("relevance_score")
    return score is None or score >= cutoff


def capture_sources(retriever, box, snippet_len=240):
    """Wraps any retriever (graph-expanded or the plain fallback) so the exact Documents
    it returns for a query are also recorded into box["items"] — used by routes/chat.py
    to attach citations (doc, page, snippet) to the answer without changing what the
    LCEL chain itself sees or returns."""

    def fn(query):
        docs = retriever.invoke(query)
        cutoff = citation_relevance_cutoff(
            [d.metadata["relevance_score"] for d in docs if "relevance_score" in d.metadata]
        )
        box["items"] = [
            {
                "source_file": d.metadata.get("source_file"),
                "doc_hash": d.metadata.get("doc_hash"),
                "page": d.metadata.get("page"),
                "content_type": d.metadata.get("content_type"),
                "snippet": d.page_content[:snippet_len],
                "relevance_score": d.metadata.get("relevance_score"),
                "image_url": (
                    f"/api/documents/{d.metadata['doc_hash']}/pictures/{d.metadata['image_path']}"
                    if d.metadata.get("image_path") and d.metadata.get("doc_hash")
                    else None
                ),
                "bbox": _bbox_from_metadata(d.metadata),
            }
            for d in docs
            if _passes_relevance_gate(d.metadata, cutoff)
        ]
        return docs

    return RunnableLambda(fn)

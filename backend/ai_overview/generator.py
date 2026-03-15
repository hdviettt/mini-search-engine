"""Generate AI Overviews using the full RAG pipeline.

Pipeline: query fan-out → hybrid retrieval (vector + BM25) → LLM synthesis
"""
import re

import httpx
import psycopg

from config import OLLAMA_BASE_URL, OLLAMA_MODEL, AI_OVERVIEW_MAX_TOKENS, AI_CACHE_TTL_HOURS
from rag.fanout import expand_query
from rag.retriever import hybrid_retrieve


def _normalize_query(query: str) -> str:
    tokens = sorted(query.lower().split())
    return " ".join(tokens)


def _get_cached(conn: psycopg.Connection, query: str) -> str | None:
    normalized = _normalize_query(query)
    row = conn.execute(
        """SELECT overview_text FROM ai_cache
           WHERE query_normalized = %s
           AND created_at > NOW() - INTERVAL '%s hours'""",
        (normalized, AI_CACHE_TTL_HOURS),
    ).fetchone()
    return row[0] if row else None


def _set_cache(conn: psycopg.Connection, query: str, overview: str):
    normalized = _normalize_query(query)
    conn.execute(
        """INSERT INTO ai_cache (query_normalized, overview_text)
           VALUES (%s, %s)
           ON CONFLICT (query_normalized) DO UPDATE
           SET overview_text = %s, created_at = NOW()""",
        (normalized, overview, overview),
    )
    conn.commit()


def generate_overview(conn: psycopg.Connection, query: str) -> dict | None:
    """Generate an AI Overview using the full RAG pipeline.

    Returns dict with 'overview' text and 'sources' list, or None.
    """
    # Check cache first
    cached = _get_cached(conn, query)
    if cached:
        return {"overview": cached, "sources": [], "from_cache": True}

    # Step 1: Query fan-out
    queries = expand_query(query)

    # Step 2: Hybrid retrieval (vector + keyword)
    chunks = hybrid_retrieve(conn, queries, top_k=5)

    if len(chunks) < 2:
        return None

    # Step 3: Build context from retrieved chunks
    context = ""
    sources = []
    for i, chunk in enumerate(chunks[:5], 1):
        context += f"\n\n[Source {i}: {chunk['title']}]\n{chunk['content'][:500]}"
        sources.append({
            "index": i,
            "title": chunk["title"],
            "url": chunk["url"],
            "vector_score": round(chunk.get("vector_score", 0), 4),
            "keyword_score": round(chunk.get("keyword_score", 0), 4),
        })

    # Step 4: LLM synthesis
    prompt = f"""Summarize these search results for "{query}" in 2-3 sentences. Cite as [1], [2], etc. Be concise and factual.

{context}

Summary:"""

    try:
        response = httpx.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "num_predict": 2048,
                    "temperature": 0.3,
                },
            },
            timeout=180,
        )
        response.raise_for_status()
        raw = response.json()["response"].strip()

        # Strip thinking tags
        overview = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()

        if not overview:
            return None

        # Cache the result
        _set_cache(conn, query, overview)

        return {"overview": overview, "sources": sources, "from_cache": False}

    except Exception as e:
        print(f"AI Overview error: {e}")
        return None

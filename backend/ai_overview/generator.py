"""Generate AI Overviews using Groq API + hybrid RAG retrieval."""
import re

import httpx
import psycopg

from config import GROQ_API_KEY, GROQ_MODEL, AI_OVERVIEW_MAX_TOKENS, AI_CACHE_TTL_HOURS
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
    """Generate an AI Overview using Groq + hybrid RAG retrieval."""
    if not GROQ_API_KEY:
        return None

    # Check cache first
    cached = _get_cached(conn, query)
    if cached:
        return {"overview": cached, "sources": [], "from_cache": True}

    # Step 1: Query fan-out via Groq (~1s)
    queries = expand_query(query)

    # Step 2: Hybrid retrieval (vector + keyword)
    chunks = hybrid_retrieve(conn, queries, top_k=5)

    if len(chunks) < 2:
        return None

    # Step 2: Build context from retrieved chunks
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

    # Step 3: LLM synthesis via Groq
    try:
        response = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": "You summarize search results concisely. Cite sources as [1], [2], etc. Use 2-3 sentences. Be factual.",
                    },
                    {
                        "role": "user",
                        "content": f"Summarize these search results for \"{query}\":\n{context}",
                    },
                ],
                "max_tokens": AI_OVERVIEW_MAX_TOKENS,
                "temperature": 0.3,
            },
            timeout=15,
        )
        response.raise_for_status()
        overview = response.json()["choices"][0]["message"]["content"].strip()

        if not overview:
            return None

        _set_cache(conn, query, overview)

        return {"overview": overview, "sources": sources, "from_cache": False}

    except Exception as e:
        print(f"AI Overview error: {e}")
        return None

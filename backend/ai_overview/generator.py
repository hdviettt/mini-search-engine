"""Generate AI Overviews using Groq API + hybrid RAG retrieval."""
import json
import time
from typing import Generator

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


def _get_sources_and_context(conn, query):
    """Run retrieval and build context + sources list."""
    chunks = hybrid_retrieve(conn, [query], top_k=5)
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
    return chunks, context, sources


def generate_overview(conn: psycopg.Connection, query: str) -> dict | None:
    """Generate an AI Overview (non-streaming, for backward compat)."""
    if not GROQ_API_KEY:
        return None

    trace = {}
    total_start = time.time()

    cached = _get_cached(conn, query)
    if cached:
        chunks, _, sources = _get_sources_and_context(conn, query)
        return {"overview": cached, "sources": sources, "trace": {}, "from_cache": True}

    t0 = time.time()
    queries = expand_query(query)
    trace["fanout"] = {"original": query, "expanded": queries, "time_ms": round((time.time() - t0) * 1000, 1)}

    t0 = time.time()
    chunks = hybrid_retrieve(conn, queries, top_k=5)
    trace["retrieval"] = {
        "chunks_retrieved": len(chunks),
        "chunks": [
            {"title": c["title"][:50], "content_preview": c["content"][:150],
             "vector_score": round(c.get("vector_score", 0), 4),
             "keyword_score": round(c.get("keyword_score", 0), 4),
             "combined_score": round(c.get("combined_score", 0), 4)}
            for c in chunks[:5]
        ],
        "time_ms": round((time.time() - t0) * 1000, 1),
    }

    if len(chunks) < 2:
        return None

    context = ""
    sources = []
    for i, chunk in enumerate(chunks[:5], 1):
        context += f"\n\n[Source {i}: {chunk['title']}]\n{chunk['content'][:500]}"
        sources.append({
            "index": i, "title": chunk["title"], "url": chunk["url"],
            "vector_score": round(chunk.get("vector_score", 0), 4),
            "keyword_score": round(chunk.get("keyword_score", 0), 4),
        })

    t0 = time.time()
    try:
        response = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": "You summarize search results concisely. Cite sources as [1], [2], etc. Use 2-3 sentences. Be factual."},
                    {"role": "user", "content": f"Summarize these search results for \"{query}\":\n{context}"},
                ],
                "max_tokens": AI_OVERVIEW_MAX_TOKENS,
                "temperature": 0.3,
            },
            timeout=15,
        )
        response.raise_for_status()
        overview = response.json()["choices"][0]["message"]["content"].strip()
        trace["synthesis"] = {"model": GROQ_MODEL, "time_ms": round((time.time() - t0) * 1000, 1)}

        if not overview:
            return None

        _set_cache(conn, query, overview)
        trace["total_ms"] = round((time.time() - total_start) * 1000, 1)
        return {"overview": overview, "sources": sources, "trace": trace, "from_cache": False}
    except Exception as e:
        print(f"AI Overview error: {e}")
        return None


def generate_overview_stream(conn: psycopg.Connection, query: str) -> Generator[str, None, None]:
    """Stream AI Overview as Server-Sent Events."""
    if not GROQ_API_KEY:
        return

    # Check cache
    cached = _get_cached(conn, query)
    if cached:
        _, _, sources = _get_sources_and_context(conn, query)
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"
        yield f"data: {json.dumps({'type': 'text', 'content': cached})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'from_cache': True})}\n\n"
        return

    total_start = time.time()

    # Fan-out
    t0 = time.time()
    queries = expand_query(query)
    fanout_trace = {"original": query, "expanded": queries, "time_ms": round((time.time() - t0) * 1000, 1)}
    yield f"data: {json.dumps({'type': 'trace', 'step': 'fanout', 'data': fanout_trace})}\n\n"

    # Retrieval
    t0 = time.time()
    chunks = hybrid_retrieve(conn, queries, top_k=5)
    retrieval_trace = {
        "chunks_retrieved": len(chunks),
        "chunks": [
            {"title": c["title"][:50], "content_preview": c["content"][:150],
             "vector_score": round(c.get("vector_score", 0), 4),
             "keyword_score": round(c.get("keyword_score", 0), 4)}
            for c in chunks[:5]
        ],
        "time_ms": round((time.time() - t0) * 1000, 1),
    }
    yield f"data: {json.dumps({'type': 'trace', 'step': 'retrieval', 'data': retrieval_trace})}\n\n"

    if len(chunks) < 2:
        yield f"data: {json.dumps({'type': 'done', 'error': 'Not enough results'})}\n\n"
        return

    # Build context + sources
    context = ""
    sources = []
    for i, chunk in enumerate(chunks[:5], 1):
        context += f"\n\n[Source {i}: {chunk['title']}]\n{chunk['content'][:500]}"
        sources.append({
            "index": i, "title": chunk["title"], "url": chunk["url"],
            "vector_score": round(chunk.get("vector_score", 0), 4),
            "keyword_score": round(chunk.get("keyword_score", 0), 4),
        })

    yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

    # Stream LLM synthesis
    yield f"data: {json.dumps({'type': 'trace', 'step': 'synthesis', 'data': {'model': GROQ_MODEL, 'status': 'generating'}})}\n\n"

    try:
        with httpx.stream(
            "POST",
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": "You summarize search results concisely. Cite sources as [1], [2], etc. Use 2-3 sentences. Be factual."},
                    {"role": "user", "content": f"Summarize these search results for \"{query}\":\n{context}"},
                ],
                "max_tokens": AI_OVERVIEW_MAX_TOKENS,
                "temperature": 0.3,
                "stream": True,
            },
            timeout=15,
        ) as response:
            full_text = ""
            for line in response.iter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        chunk_data = json.loads(line[6:])
                        delta = chunk_data["choices"][0].get("delta", {}).get("content", "")
                        if delta:
                            full_text += delta
                            yield f"data: {json.dumps({'type': 'token', 'content': delta})}\n\n"
                    except (json.JSONDecodeError, KeyError, IndexError):
                        pass

            if full_text:
                _set_cache(conn, query, full_text)

            total_ms = round((time.time() - total_start) * 1000, 1)
            yield f"data: {json.dumps({'type': 'done', 'total_ms': total_ms, 'from_cache': False})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

"""Generate AI Overviews from top search results using Ollama (Qwen3)."""
import httpx
import psycopg

from config import OLLAMA_BASE_URL, OLLAMA_MODEL, AI_OVERVIEW_MAX_TOKENS, AI_CACHE_TTL_HOURS


def _normalize_query(query: str) -> str:
    """Normalize query for cache key — lowercase, sorted tokens."""
    tokens = sorted(query.lower().split())
    return " ".join(tokens)


def _get_cached(conn: psycopg.Connection, query: str) -> str | None:
    """Check cache for an existing AI Overview."""
    normalized = _normalize_query(query)
    row = conn.execute(
        """SELECT overview_text FROM ai_cache
           WHERE query_normalized = %s
           AND created_at > NOW() - INTERVAL '%s hours'""",
        (normalized, AI_CACHE_TTL_HOURS),
    ).fetchone()
    return row[0] if row else None


def _set_cache(conn: psycopg.Connection, query: str, overview: str):
    """Cache an AI Overview."""
    normalized = _normalize_query(query)
    conn.execute(
        """INSERT INTO ai_cache (query_normalized, overview_text)
           VALUES (%s, %s)
           ON CONFLICT (query_normalized) DO UPDATE
           SET overview_text = %s, created_at = NOW()""",
        (normalized, overview, overview),
    )
    conn.commit()


def generate_overview(conn: psycopg.Connection, query: str, page_ids: list[int]) -> str | None:
    """Generate an AI Overview from top search results using Ollama.

    Returns None if: fewer than 3 results, Ollama unavailable, or error.
    """
    if len(page_ids) < 3:
        return None

    # Check cache first
    cached = _get_cached(conn, query)
    if cached:
        return cached

    # Fetch page content for top 5 results
    top_ids = page_ids[:5]
    placeholders = ",".join(["%s"] * len(top_ids))
    rows = conn.execute(
        f"SELECT id, title, body_text FROM pages WHERE id IN ({placeholders})",
        top_ids,
    ).fetchall()

    # Maintain order from ranking
    page_map = {row[0]: row for row in rows}
    ordered = [page_map[pid] for pid in top_ids if pid in page_map]

    # Build context from top results
    context = ""
    for i, (pid, title, body_text) in enumerate(ordered, 1):
        truncated = (body_text or "")[:1000]
        context += f"\n\n[Source {i}: {title}]\n{truncated}"

    prompt = f"""Based on the following search results for the query "{query}", provide a concise, informative overview that directly answers the query. Use 2-4 sentences. Cite sources as [1], [2], etc. Only use information from the provided sources. If the sources don't contain enough information to answer the query, say so briefly. Do not use any thinking tags or reasoning blocks - just provide the overview directly.

Sources:{context}

Overview:"""

    try:
        response = httpx.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "num_predict": AI_OVERVIEW_MAX_TOKENS,
                    "temperature": 0.3,
                },
            },
            timeout=60,
        )
        response.raise_for_status()
        overview = response.json()["response"].strip()

        # Cache the result
        _set_cache(conn, query, overview)

        return overview
    except Exception as e:
        print(f"AI Overview error: {e}")
        return None

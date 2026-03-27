"""Query fan-out: expand a user query into sub-queries grounded in the index.

Co-occurrence expansion: finds terms that appear alongside query terms in the
top BM25 results, then builds sub-queries from those terms.

No LLM calls — all expanded terms are guaranteed to exist in the index.
"""
import psycopg

from indexer.tokenizer import tokenize
from ranker.bm25 import search_bm25


def expand_query(query: str, conn: psycopg.Connection | None = None) -> tuple[list[str], dict]:
    """Expand a user query into 2-3 sub-queries using co-occurrence from the index.

    Returns (queries, trace) where queries[0] is always the original and
    trace contains diagnostic info for the Explore panel.

    Falls back to [query] if the index has no results for the query.
    """
    trace = {"method": "co_occurrence", "related_terms": [], "time_ms": 0}

    if conn is None:
        return [query], trace

    import time
    t0 = time.time()

    query_tokens = set(tokenize(query))
    if not query_tokens:
        trace["time_ms"] = round((time.time() - t0) * 1000, 1)
        return [query], trace

    bm25_scores = search_bm25(conn, query)
    if not bm25_scores:
        trace["time_ms"] = round((time.time() - t0) * 1000, 1)
        return [query], trace

    top_page_ids = sorted(bm25_scores, key=bm25_scores.get, reverse=True)[:10]
    placeholders = ",".join(["%s"] * len(top_page_ids))

    rows = conn.execute(
        f"""SELECT t.term, SUM(p.term_freq) AS total_freq
            FROM postings p
            JOIN terms t ON p.term_id = t.id
            WHERE p.page_id IN ({placeholders})
            GROUP BY t.term
            ORDER BY total_freq DESC
            LIMIT 50""",
        top_page_ids,
    ).fetchall()

    # Co-occurring terms not already in the query
    related = [term for term, _ in rows if term not in query_tokens][:8]
    trace["related_terms"] = related
    trace["time_ms"] = round((time.time() - t0) * 1000, 1)

    if not related:
        return [query], trace

    query_list = list(query_tokens)

    # Sub-query 1: original terms + top 2 co-occurring terms (broader context)
    sub1 = " ".join(query_list + related[:2])
    # Sub-query 2: top 4 co-occurring terms (different angle on same topic)
    sub2 = " ".join(related[:4])

    return [query, sub1, sub2], trace

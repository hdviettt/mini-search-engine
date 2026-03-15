"""Search engine — combines BM25 and PageRank into final ranked results."""
import time

import psycopg

from config import RANK_ALPHA
from indexer.tokenizer import tokenize
from ranker.bm25 import search_bm25
from models import SearchResult


def generate_snippet(body_text: str, query_terms: list[str], max_length: int = 200) -> str:
    """Find the best window of text containing query terms."""
    if not body_text:
        return ""

    words = body_text.split()
    if not words:
        return ""

    if not query_terms:
        return " ".join(words[:30])[:max_length]

    # Find the window with the most query term matches
    best_pos = 0
    best_count = 0
    for i in range(len(words)):
        window = " ".join(words[i:i + 30]).lower()
        count = sum(1 for t in query_terms if t in window)
        if count > best_count:
            best_count = count
            best_pos = i

    start = max(0, best_pos - 3)
    snippet = " ".join(words[start:start + 30])
    if start > 0:
        snippet = "..." + snippet
    if start + 30 < len(words):
        snippet += "..."
    return snippet[:max_length]


def _normalize_scores(scores: dict[int, float]) -> dict[int, float]:
    """Min-max normalize scores to [0, 1] range."""
    if not scores:
        return {}
    min_s = min(scores.values())
    max_s = max(scores.values())
    spread = max_s - min_s
    if spread == 0:
        return {k: 1.0 for k in scores}
    return {k: (v - min_s) / spread for k, v in scores.items()}


def search(conn: psycopg.Connection, query: str, page: int = 1, per_page: int = 10) -> dict:
    """Run a search query. Returns results with BM25 + PageRank combined scores."""
    start_time = time.time()
    query_terms = tokenize(query)

    # Get BM25 scores
    bm25_scores = search_bm25(conn, query)
    if not bm25_scores:
        return {
            "query": query,
            "results": [],
            "total_results": 0,
            "time_ms": (time.time() - start_time) * 1000,
        }

    # Get PageRank scores for matching documents
    matching_ids = list(bm25_scores.keys())
    placeholders = ",".join(["%s"] * len(matching_ids))
    pr_rows = conn.execute(
        f"SELECT page_id, score FROM pagerank WHERE page_id IN ({placeholders})",
        matching_ids,
    ).fetchall()
    pagerank_scores = dict(pr_rows)

    # Normalize both score sets
    norm_bm25 = _normalize_scores(bm25_scores)
    norm_pr = _normalize_scores(pagerank_scores)

    # Combine: alpha * BM25 + (1 - alpha) * PageRank
    combined = {}
    for page_id in bm25_scores:
        bm25_norm = norm_bm25.get(page_id, 0)
        pr_norm = norm_pr.get(page_id, 0)
        combined[page_id] = RANK_ALPHA * bm25_norm + (1 - RANK_ALPHA) * pr_norm

    # Sort by combined score
    ranked = sorted(combined.items(), key=lambda x: x[1], reverse=True)
    total_results = len(ranked)

    # Paginate
    start = (page - 1) * per_page
    page_results = ranked[start:start + per_page]

    # Fetch page details and build results
    results = []
    for page_id, final_score in page_results:
        row = conn.execute(
            "SELECT url, title, body_text FROM pages WHERE id = %s", (page_id,)
        ).fetchone()
        if row is None:
            continue
        url, title, body_text = row
        snippet = generate_snippet(body_text, query_terms)

        results.append(SearchResult(
            url=url,
            title=title or url,
            snippet=snippet,
            bm25_score=round(bm25_scores.get(page_id, 0), 4),
            pagerank_score=round(pagerank_scores.get(page_id, 0), 6),
            final_score=round(final_score, 4),
        ))

    elapsed_ms = (time.time() - start_time) * 1000

    return {
        "query": query,
        "results": results,
        "total_results": total_results,
        "time_ms": round(elapsed_ms, 2),
    }

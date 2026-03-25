"""Search engine — combines BM25 and PageRank into final ranked results."""
import time

import psycopg

from config import RANK_ALPHA
from indexer.tokenizer import tokenize
from ranker.bm25 import search_bm25
from ranker.reranker import rerank
from models import SearchResult


def generate_snippet(body_text: str, query_terms: list[str], max_length: int = 200) -> str:
    """Find the best window of text containing query terms.

    Optimized: stems first 2000 words once, then uses a sliding window
    with O(1) set lookups instead of the old O(n × m × 30) substring scan.
    """
    if not body_text:
        return ""

    words = body_text.split()
    if not words:
        return ""

    if not query_terms:
        return " ".join(words[:30])[:max_length]

    from indexer.stemmer import stem

    # Only scan first 2000 words — snippet is almost always near the top
    scan_limit = min(len(words), 2000)
    term_set = set(query_terms)  # already stemmed from tokenize()

    # Stem each word once for matching (keep original words for display)
    stemmed = [stem(w.lower()) for w in words[:scan_limit]]

    # Sliding window: find 30-word window with most query term matches
    window = 30
    best_pos = 0
    best_count = sum(1 for w in stemmed[:window] if w in term_set)
    current_count = best_count

    for i in range(1, scan_limit - window + 1):
        if stemmed[i - 1] in term_set:
            current_count -= 1
        if stemmed[i + window - 1] in term_set:
            current_count += 1
        if current_count > best_count:
            best_count = current_count
            best_pos = i

    start = max(0, best_pos - 3)
    snippet = " ".join(words[start:start + window])
    if start > 0:
        snippet = "..." + snippet
    if start + window < len(words):
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

    # Neural re-ranking: re-score top candidates with cross-encoder
    rerank_candidates = ranked[:5]
    candidate_dicts = []
    for page_id, score in rerank_candidates:
        row = conn.execute("SELECT url, title, body_text FROM pages WHERE id = %s", (page_id,)).fetchone()
        if row:
            candidate_dicts.append({
                "page_id": page_id, "combined_score": score,
                "url": row[0], "title": row[1], "body_text": row[2],
            })
    reranked = rerank(query, candidate_dicts, top_k=5)
    # Filter out clearly irrelevant results (negative reranker score)
    reranked = [c for c in reranked if c.get("rerank_score") is None or c["rerank_score"] > -8]
    reranked_ids = {c["page_id"] for c in reranked}

    # Build results: reranked top + remaining from original ranking
    results = []
    for c in reranked:
        snippet = generate_snippet(c.get("body_text", ""), query_terms)
        results.append(SearchResult(
            url=c["url"],
            title=c.get("title") or c["url"],
            snippet=snippet,
            bm25_score=round(bm25_scores.get(c["page_id"], 0), 4),
            pagerank_score=round(pagerank_scores.get(c["page_id"], 0), 6),
            final_score=round(c.get("rerank_score") or c["combined_score"], 4),
        ))

    # Fill remaining slots from the original ranking (not already reranked)
    for page_id, final_score in ranked:
        if len(results) >= per_page:
            break
        if page_id in reranked_ids:
            continue
        row = conn.execute("SELECT url, title, body_text FROM pages WHERE id = %s", (page_id,)).fetchone()
        if row is None:
            continue
        url, title, body_text = row
        snippet = generate_snippet(body_text, query_terms)
        results.append(SearchResult(
            url=url, title=title or url, snippet=snippet,
            bm25_score=round(bm25_scores.get(page_id, 0), 4),
            pagerank_score=round(pagerank_scores.get(page_id, 0), 6),
            final_score=round(final_score, 4),
        ))

    # Sports detection (lightweight keyword match, no DB)
    sports_data = None
    try:
        from sports.detector import detect_sports
        from sports.api import get_upcoming_fixtures, get_league_fixtures, get_standings, get_live_scores
        detection = detect_sports(query)
        if detection:
            if detection.action == "upcoming" and detection.teams:
                sports_data = {"type": "fixtures", "detection": detection.to_dict(), "data": get_upcoming_fixtures(detection.teams[0])}
            elif detection.action == "upcoming" and detection.leagues:
                sports_data = {"type": "fixtures", "detection": detection.to_dict(), "data": get_league_fixtures(detection.leagues[0])}
            elif detection.action == "standings" and detection.leagues:
                sports_data = {"type": "standings", "detection": detection.to_dict(), "data": get_standings(detection.leagues[0])}
            elif detection.action == "live":
                sports_data = {"type": "live", "detection": detection.to_dict(), "data": get_live_scores()}
    except Exception:
        pass

    elapsed_ms = (time.time() - start_time) * 1000

    return {
        "query": query,
        "sports": sports_data,
        "results": results,
        "total_results": total_results,
        "time_ms": round(elapsed_ms, 2),
    }

"""Search engine — combines BM25 and PageRank into final ranked results."""
import time
from datetime import datetime, timezone
from math import exp

import psycopg

from config import RANK_ALPHA, FRESHNESS_DECAY, FRESHNESS_FLOOR
from indexer.tokenizer import tokenize
from ranker.bm25 import search_bm25
from ranker.reranker import rerank
from models import SearchResult



def generate_snippet(body_text: str, query_terms: list[str], max_length: int = 250) -> str:
    """Extract a clean, sentence-aware snippet containing query terms.

    Strategy:
    1. Split text into sentences
    2. Find the sentence with the most query term matches
    3. Return that sentence (+ neighbors if short), trimmed to max_length
    4. Falls back to sliding window if no good sentence found
    """
    import re
    if not body_text:
        return ""

    # Clean Wikipedia noise from snippet text
    text = re.sub(r"\[\d+\]", "", body_text)  # remove [1], [2] citations
    text = re.sub(r"\[edit\]", "", text)
    text = re.sub(r"\s+", " ", text).strip()

    if not text:
        return ""

    if not query_terms:
        # No query terms — return first meaningful sentence
        sentences = re.split(r'(?<=[.!?])\s+', text[:1000])
        for s in sentences:
            s = s.strip()
            if len(s) > 40:
                return s[:max_length]
        return text[:max_length]

    from indexer.stemmer import stem

    # Split into sentences and score each by query term matches
    sentences = re.split(r'(?<=[.!?])\s+', text[:3000])
    term_set = set(query_terms)

    best_idx = 0
    best_score = 0
    for i, sent in enumerate(sentences):
        words = sent.lower().split()
        stemmed = [stem(w) for w in words]
        score = sum(1 for w in stemmed if w in term_set)
        # Bonus for sentences near the top (introductory sentences are usually best)
        if i < 3:
            score += 0.5
        if score > best_score:
            best_score = score
            best_idx = i

    if best_score > 0:
        # Take the best sentence + next sentence if short
        snippet = sentences[best_idx].strip()
        if len(snippet) < 100 and best_idx + 1 < len(sentences):
            snippet += " " + sentences[best_idx + 1].strip()
        return snippet[:max_length]

    # Fallback: first meaningful sentence
    for s in sentences[:5]:
        s = s.strip()
        if len(s) > 40:
            return s[:max_length]
    return text[:max_length]


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

    search_query = query
    query_terms = tokenize(search_query)

    # Get BM25 scores
    bm25_scores = search_bm25(conn, search_query)
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

    # Freshness boost — exponential decay; pages < 7 days old get a 1.15x bonus
    now = datetime.now(timezone.utc)
    freshness_rows = conn.execute(
        f"SELECT id, COALESCE(last_checked_at, crawled_at) FROM pages WHERE id IN ({placeholders})",
        matching_ids,
    ).fetchall()
    for page_id, crawled_at in freshness_rows:
        if page_id in combined and crawled_at:
            days_old = max(0, (now - crawled_at).days)
            boost = FRESHNESS_FLOOR + (1 - FRESHNESS_FLOOR) * exp(-days_old * FRESHNESS_DECAY)
            if days_old < 7:
                boost = min(boost * 1.15, 1.2)  # cap to avoid over-ranking new-but-low-quality pages
            combined[page_id] *= boost

    # Sort by combined score
    ranked = sorted(combined.items(), key=lambda x: x[1], reverse=True)
    total_results = len(ranked)

    # Neural re-ranking: skip for queries with very few results (not worth the latency)
    skip_rerank = total_results <= 3 or len(query_terms) == 0
    rerank_candidates = ranked[:5] if not skip_rerank else []
    candidate_dicts = []
    for page_id, score in rerank_candidates:
        row = conn.execute("SELECT url, title, body_text FROM pages WHERE id = %s", (page_id,)).fetchone()
        if row:
            candidate_dicts.append({
                "page_id": page_id, "combined_score": score,
                "url": row[0], "title": row[1], "body_text": row[2],
            })
    reranked = rerank(search_query, candidate_dicts, top_k=5)
    # Filter out clearly irrelevant results (negative reranker score)
    reranked = [c for c in reranked if c.get("rerank_score") is None or c["rerank_score"] > -8]
    reranked_ids = {c["page_id"] for c in reranked}

    # Build results with domain-level dedup (max 2 results per domain)
    from urllib.parse import urlparse
    results = []
    domain_counts: dict[str, int] = {}
    MAX_PER_DOMAIN = 2

    def _add_result(url: str, title: str, body_text: str, bm25: float, pr: float, score: float) -> bool:
        domain = urlparse(url).hostname or ""
        domain = domain.replace("www.", "")
        if domain_counts.get(domain, 0) >= MAX_PER_DOMAIN:
            return False
        snippet = generate_snippet(body_text, query_terms)
        results.append(SearchResult(
            url=url, title=title or url, snippet=snippet,
            bm25_score=round(bm25, 4),
            pagerank_score=round(pr, 6),
            final_score=round(score, 4),
        ))
        domain_counts[domain] = domain_counts.get(domain, 0) + 1
        return True

    for c in reranked:
        _add_result(c["url"], c.get("title") or c["url"], c.get("body_text", ""),
                    bm25_scores.get(c["page_id"], 0), pagerank_scores.get(c["page_id"], 0),
                    c.get("rerank_score") or c["combined_score"])

    # Fill remaining slots from the original ranking (not already reranked)
    for page_id, final_score in ranked:
        if len(results) >= per_page:
            break
        if page_id in reranked_ids:
            continue
        row = conn.execute("SELECT url, title, body_text FROM pages WHERE id = %s", (page_id,)).fetchone()
        if row is None:
            continue
        _add_result(row[0], row[1] or row[0], row[2] or "",
                    bm25_scores.get(page_id, 0), pagerank_scores.get(page_id, 0), final_score)

    # Sports detection (lightweight keyword match, no DB)
    sports_data = None
    try:
        from sports.detector import detect_sports
        from sports.api import get_upcoming_fixtures, get_league_fixtures, get_standings, get_live_scores
        detection = detect_sports(search_query)
        if detection:
            if detection.action == "upcoming" and detection.teams:
                sports_data = {"type": "fixtures", "detection": detection.to_dict(), "data": get_upcoming_fixtures(detection.teams[0])}
            elif detection.action == "upcoming" and detection.leagues:
                sports_data = {"type": "fixtures", "detection": detection.to_dict(), "data": get_league_fixtures(detection.leagues[0])}
            elif detection.action == "standings" and detection.leagues:
                sports_data = {"type": "standings", "detection": detection.to_dict(), "data": get_standings(detection.leagues[0])}
            elif detection.action == "live":
                sports_data = {"type": "live", "detection": detection.to_dict(), "data": get_live_scores()}
    except Exception as e:
        print(f"Sports detection error: {e}")

    elapsed_ms = (time.time() - start_time) * 1000

    return {
        "query": search_query,
        "sports": sports_data,
        "results": results,
        "total_results": total_results,
        "time_ms": round(elapsed_ms, 2),
    }

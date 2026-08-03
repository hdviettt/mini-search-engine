"""Search engine — combines BM25, PageRank, freshness and neural reranking."""
import re
import time
from datetime import UTC, datetime

import psycopg

from config import RANK_ALPHA
from indexer.stemmer import stem
from indexer.tokenizer import tokenize
from models import SearchResult
from ranker.bm25 import search_bm25
from ranker.reranker import rerank
from search.ranking import (
    CANDIDATE_POOL,
    RERANK_MIN_SCORE,
    RERANK_TOP_K,
    combine_scores,
    dedupe_by_domain,
    freshness_multiplier,
    normalize_scores,
)

# Re-exported for search.explainer, which shares this scoring path.
__all__ = ["search", "generate_snippet", "normalize_scores"]

_CITATION_RE = re.compile(r"\[\d+\]")
_EDIT_RE = re.compile(r"\[edit\]")
_WHITESPACE_RE = re.compile(r"\s+")
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")


def generate_snippet(body_text: str, query_terms: list[str], max_length: int = 250) -> str:
    """Extract a sentence-aware snippet containing query terms.

    Picks the sentence with the most query-term matches, biased toward the
    opening sentences, which are usually the best summary of a page.
    """
    if not body_text:
        return ""

    text = _CITATION_RE.sub("", body_text)
    text = _EDIT_RE.sub("", text)
    text = _WHITESPACE_RE.sub(" ", text).strip()

    if not text:
        return ""

    if not query_terms:
        for s in _SENTENCE_RE.split(text[:1000]):
            s = s.strip()
            if len(s) > 40:
                return s[:max_length]
        return text[:max_length]

    sentences = _SENTENCE_RE.split(text[:3000])
    term_set = set(query_terms)

    best_idx = 0
    best_score = 0.0
    for i, sent in enumerate(sentences):
        stemmed = [stem(w) for w in sent.lower().split()]
        score = float(sum(1 for w in stemmed if w in term_set))
        if i < 3:
            score += 0.5
        if score > best_score:
            best_score = score
            best_idx = i

    if best_score > 0:
        snippet = sentences[best_idx].strip()
        if len(snippet) < 100 and best_idx + 1 < len(sentences):
            snippet += " " + sentences[best_idx + 1].strip()
        return snippet[:max_length]

    for s in sentences[:5]:
        s = s.strip()
        if len(s) > 40:
            return s[:max_length]
    return text[:max_length]


def _empty(query: str, start_time: float) -> dict:
    return {
        "query": query,
        "sports": None,
        "results": [],
        "total_results": 0,
        "page": 1,
        "per_page": 0,
        "time_ms": round((time.time() - start_time) * 1000, 2),
    }


def _detect_sports(query: str) -> dict | None:
    """Live match / standings OneBox. Never allowed to break a search."""
    try:
        from sports.api import (
            get_league_fixtures,
            get_live_scores,
            get_standings,
            get_upcoming_fixtures,
        )
        from sports.detector import detect_sports

        detection = detect_sports(query)
        if not detection:
            return None

        payload = {"detection": detection.to_dict()}
        if detection.action == "upcoming" and detection.teams:
            return {**payload, "type": "fixtures", "data": get_upcoming_fixtures(detection.teams[0])}
        if detection.action == "upcoming" and detection.leagues:
            return {**payload, "type": "fixtures", "data": get_league_fixtures(detection.leagues[0])}
        if detection.action == "standings" and detection.leagues:
            return {**payload, "type": "standings", "data": get_standings(detection.leagues[0])}
        if detection.action == "live":
            return {**payload, "type": "live", "data": get_live_scores()}
    except Exception:
        import logging

        logging.getLogger(__name__).warning("Sports detection failed", exc_info=True)
    return None


def search(conn: psycopg.Connection, query: str, page: int = 1, per_page: int = 10) -> dict:
    """Run a search query and return one page of ranked results."""
    start_time = time.time()
    page = max(1, page)
    per_page = max(1, min(per_page, 50))

    query_terms = tokenize(query)

    bm25_scores = search_bm25(conn, query)
    if not bm25_scores:
        return _empty(query, start_time)

    total_results = len(bm25_scores)

    # Phase 1 — narrow by BM25 before touching PageRank, freshness or the
    # reranker. Everything downstream is bounded by CANDIDATE_POOL.
    pool = sorted(bm25_scores.items(), key=lambda kv: kv[1], reverse=True)[:CANDIDATE_POOL]
    pool_ids = [page_id for page_id, _ in pool]
    pool_bm25 = dict(pool)

    pagerank_scores = dict(
        conn.execute(
            "SELECT page_id, score FROM pagerank WHERE page_id = ANY(%s)", (pool_ids,)
        ).fetchall()
    )

    combined = combine_scores(pool_bm25, pagerank_scores, RANK_ALPHA)

    # One query gives both the freshness input and the URLs needed for
    # domain dedup, instead of a round-trip per result.
    meta_rows = conn.execute(
        """SELECT id, url, COALESCE(last_checked_at, crawled_at)
           FROM pages WHERE id = ANY(%s)""",
        (pool_ids,),
    ).fetchall()
    url_by_id = {row[0]: row[1] for row in meta_rows}

    now = datetime.now(UTC)
    for page_id, _url, crawled_at in meta_rows:
        if page_id in combined and crawled_at:
            combined[page_id] *= freshness_multiplier((now - crawled_at).days)

    ranked = sorted(combined.items(), key=lambda kv: kv[1], reverse=True)

    # Phase 2 — cross-encoder rerank of the head. Done for every page so the
    # ordering stays stable as the user pages through results.
    rerank_scores: dict[int, float] = {}
    head = [page_id for page_id, _ in ranked[:RERANK_TOP_K]]
    if head and query_terms:
        head_rows = conn.execute(
            "SELECT id, url, title, body_text FROM pages WHERE id = ANY(%s)", (head,)
        ).fetchall()
        by_id = {r[0]: r for r in head_rows}
        candidates = [
            {
                "page_id": pid,
                "url": by_id[pid][1],
                "title": by_id[pid][2],
                "body_text": by_id[pid][3],
            }
            for pid in head
            if pid in by_id
        ]
        for c in rerank(query, candidates, top_k=len(candidates)):
            if c.get("rerank_score") is not None:
                rerank_scores[c["page_id"]] = c["rerank_score"]

    # Reranked pages keep the reranker's order at the head; anything it judged
    # clearly irrelevant drops out entirely.
    reranked_ids = [
        pid
        for pid in sorted(rerank_scores, key=lambda p: rerank_scores[p], reverse=True)
        if rerank_scores[pid] > RERANK_MIN_SCORE
    ]
    dropped = {pid for pid in rerank_scores if pid not in reranked_ids}
    tail_ids = [pid for pid, _ in ranked if pid not in rerank_scores]
    ordered_ids = reranked_ids + tail_ids

    # Dedup across the whole pool, then paginate — deduping per page would
    # make page 2 depend on what page 1 dropped.
    final_ids = dedupe_by_domain(ordered_ids, url_by_id)

    offset = (page - 1) * per_page
    page_ids = final_ids[offset : offset + per_page]

    results: list[SearchResult] = []
    if page_ids:
        rows = conn.execute(
            "SELECT id, url, title, body_text FROM pages WHERE id = ANY(%s)", (page_ids,)
        ).fetchall()
        by_id = {r[0]: r for r in rows}
        for page_id in page_ids:  # preserve rank order
            row = by_id.get(page_id)
            if row is None:
                continue
            _, url, title, body_text = row
            rr = rerank_scores.get(page_id)
            results.append(
                SearchResult(
                    url=url,
                    title=title or url,
                    snippet=generate_snippet(body_text or "", query_terms),
                    bm25_score=round(pool_bm25.get(page_id, 0.0), 4),
                    pagerank_score=round(pagerank_scores.get(page_id, 0.0), 6),
                    final_score=round(rr if rr is not None else combined.get(page_id, 0.0), 4),
                    rerank_score=round(rr, 4) if rr is not None else None,
                )
            )

    return {
        "query": query,
        "sports": _detect_sports(query) if page == 1 else None,
        "results": results,
        "total_results": max(0, total_results - len(dropped)),
        "page": page,
        "per_page": per_page,
        "time_ms": round((time.time() - start_time) * 1000, 2),
    }

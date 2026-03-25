"""Instrumented search that captures pipeline details for the playground."""
import math
import time

import psycopg

from config import BM25_K1, BM25_B, RANK_ALPHA
from indexer.tokenizer import tokenize
from ranker.bm25 import search_bm25
from search.engine import generate_snippet, _normalize_scores
from models import SearchResult


def search_explain(conn: psycopg.Connection, query: str, params: dict | None = None) -> dict:
    """Run search with full pipeline instrumentation.

    Returns results + detailed trace of every step with timing and data.
    """
    p = params or {}
    k1 = p.get("bm25_k1", BM25_K1)
    b = p.get("bm25_b", BM25_B)
    alpha = p.get("rank_alpha", RANK_ALPHA)

    trace = {}
    total_start = time.time()

    # Step 1: Tokenization + Stemming
    t0 = time.time()
    import re
    from indexer.tokenizer import STOPWORDS
    from indexer.stemmer import stem

    cleaned = re.sub(r"[^a-z0-9\s]", " ", query.lower())
    raw_tokens = cleaned.split()
    removed = [t for t in raw_tokens if t in STOPWORDS or len(t) <= 1]
    pre_stem_tokens = [t for t in raw_tokens if t not in STOPWORDS and len(t) > 1]
    query_terms = [stem(t) for t in pre_stem_tokens]
    stems_applied = {orig: stemmed for orig, stemmed in zip(pre_stem_tokens, query_terms) if orig != stemmed}
    trace["tokenization"] = {
        "input": query,
        "pre_stem_tokens": pre_stem_tokens,  # after cleanup + stopword removal, before stemming
        "tokens": query_terms,               # final stemmed tokens
        "stopwords_removed": removed,
        "stems_applied": stems_applied,
        "time_ms": round((time.time() - t0) * 1000, 2),
    }

    if not query_terms:
        return {
            "query": query,
            "results": [],
            "total_results": 0,
            "time_ms": round((time.time() - total_start) * 1000, 2),
            "params_used": {"bm25_k1": k1, "bm25_b": b, "rank_alpha": alpha},
            "pipeline": trace,
        }

    # Step 2: Index lookup
    t0 = time.time()
    stats = dict(conn.execute("SELECT key, value FROM corpus_stats").fetchall())
    total_docs = int(stats.get("total_docs", 0))
    avg_doc_length = stats.get("avg_doc_length", 1)

    terms_found = {}
    terms_missing = []
    for term in query_terms:
        row = conn.execute("SELECT id FROM terms WHERE term = %s", (term,)).fetchone()
        if row:
            term_id = row[0]
            df = conn.execute("SELECT COUNT(*) FROM postings WHERE term_id = %s", (term_id,)).fetchone()[0]
            idf = math.log((total_docs - df + 0.5) / (df + 0.5) + 1)
            terms_found[term] = {"term_id": term_id, "doc_freq": df, "idf": round(idf, 4)}
        else:
            terms_missing.append(term)

    trace["index_lookup"] = {
        "terms_found": terms_found,
        "terms_missing": terms_missing,
        "corpus_stats": {"total_docs": total_docs, "avg_doc_length": round(avg_doc_length, 1)},
        "time_ms": round((time.time() - t0) * 1000, 2),
    }

    # Step 3: BM25 scoring
    t0 = time.time()
    bm25_scores = search_bm25(conn, query, k1=k1, b=b)

    # Get top 10 with titles (batched query)
    bm25_sorted = sorted(bm25_scores.items(), key=lambda x: x[1], reverse=True)[:10]
    top_ids = [pid for pid, _ in bm25_sorted]
    if top_ids:
        ph = ",".join(["%s"] * len(top_ids))
        title_rows = dict(conn.execute(f"SELECT id, title FROM pages WHERE id IN ({ph})", top_ids).fetchall())
    else:
        title_rows = {}
    bm25_top = [{"page_id": pid, "score": round(s, 4), "title": (title_rows.get(pid, "") or "")[:60]} for pid, s in bm25_sorted]

    trace["bm25_scoring"] = {
        "params": {"k1": k1, "b": b},
        "total_matched": len(bm25_scores),
        "top_scores": bm25_top,
        "time_ms": round((time.time() - t0) * 1000, 2),
    }

    if not bm25_scores:
        return {
            "query": query,
            "results": [],
            "total_results": 0,
            "time_ms": round((time.time() - total_start) * 1000, 2),
            "params_used": {"bm25_k1": k1, "bm25_b": b, "rank_alpha": alpha},
            "pipeline": trace,
        }

    # Step 4: PageRank fetch
    t0 = time.time()
    matching_ids = list(bm25_scores.keys())
    placeholders = ",".join(["%s"] * len(matching_ids))
    pr_rows = conn.execute(
        f"SELECT page_id, score FROM pagerank WHERE page_id IN ({placeholders})",
        matching_ids,
    ).fetchall()
    pagerank_scores = dict(pr_rows)

    pr_sorted = sorted(pagerank_scores.items(), key=lambda x: x[1], reverse=True)[:10]
    pr_ids = [pid for pid, _ in pr_sorted]
    if pr_ids:
        ph2 = ",".join(["%s"] * len(pr_ids))
        pr_title_rows = dict(conn.execute(f"SELECT id, title FROM pages WHERE id IN ({ph2})", pr_ids).fetchall())
    else:
        pr_title_rows = {}
    pr_top = [{"page_id": pid, "score": round(s, 6), "title": (pr_title_rows.get(pid, "") or "")[:60]} for pid, s in pr_sorted]

    trace["pagerank"] = {
        "damping": 0.85,
        "top_scores": pr_top,
        "time_ms": round((time.time() - t0) * 1000, 2),
    }

    # Step 5: Score combination
    t0 = time.time()
    norm_bm25 = _normalize_scores(bm25_scores)
    norm_pr = _normalize_scores(pagerank_scores)

    combined = {}
    for page_id in bm25_scores:
        bm25_norm = norm_bm25.get(page_id, 0)
        pr_norm = norm_pr.get(page_id, 0)
        combined[page_id] = alpha * bm25_norm + (1 - alpha) * pr_norm

    ranked = sorted(combined.items(), key=lambda x: x[1], reverse=True)

    # Track rank changes between BM25-only and combined
    bm25_rank = {pid: i + 1 for i, (pid, _) in enumerate(sorted(bm25_scores.items(), key=lambda x: x[1], reverse=True)[:10])}
    combined_rank = {pid: i + 1 for i, (pid, _) in enumerate(ranked[:10])}
    comb_ids = list(combined_rank.keys())[:10]
    if comb_ids:
        ph3 = ",".join(["%s"] * len(comb_ids))
        comb_title_rows = dict(conn.execute(f"SELECT id, title FROM pages WHERE id IN ({ph3})", comb_ids).fetchall())
    else:
        comb_title_rows = {}
    rank_changes = [{"page_id": pid, "title": (comb_title_rows.get(pid, "") or "")[:50], "bm25_rank": bm25_rank.get(pid, ">10"), "final_rank": combined_rank[pid]} for pid in comb_ids]

    trace["combination"] = {
        "alpha": alpha,
        "formula": f"{alpha} * BM25 + {round(1 - alpha, 1)} * PageRank",
        "rank_changes": rank_changes,
        "time_ms": round((time.time() - t0) * 1000, 2),
    }

    # Step 6: Neural re-ranking
    from ranker.reranker import rerank
    t0 = time.time()
    rerank_candidates = []
    pre_rerank_order = {}
    for i, (page_id, score) in enumerate(ranked[:5]):
        row = conn.execute("SELECT url, title, body_text FROM pages WHERE id = %s", (page_id,)).fetchone()
        if row:
            rerank_candidates.append({
                "page_id": page_id, "combined_score": score,
                "url": row[0], "title": row[1], "body_text": row[2],
            })
            pre_rerank_order[page_id] = i + 1

    reranked = rerank(query, rerank_candidates, top_k=10)

    # Track rank changes from re-ranking
    rerank_changes = []
    for i, c in enumerate(reranked):
        pid = c["page_id"]
        rerank_changes.append({
            "page_id": pid,
            "title": (c.get("title") or "")[:50],
            "before_rank": pre_rerank_order.get(pid, ">10"),
            "after_rank": i + 1,
            "rerank_score": c.get("rerank_score"),
        })

    model_available = reranked[0].get("rerank_score") is not None if reranked else False
    trace["reranking"] = {
        "model": "ms-marco-MiniLM-L-6-v2" if model_available else "unavailable",
        "candidates": len(rerank_candidates),
        "rank_changes": rerank_changes,
        "time_ms": round((time.time() - t0) * 1000, 2),
    }

    # Step 7: Build results with snippets (reranked top 5 + remaining from original order)
    t0 = time.time()
    reranked_ids = {c["page_id"] for c in reranked}
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
    for page_id, final_score in ranked:
        if len(results) >= 10:
            break
        if page_id in reranked_ids:
            continue
        row = conn.execute("SELECT url, title, body_text FROM pages WHERE id = %s", (page_id,)).fetchone()
        if row is None:
            continue
        snippet = generate_snippet(row[2] or "", query_terms)
        results.append(SearchResult(
            url=row[0], title=row[1] or row[0], snippet=snippet,
            bm25_score=round(bm25_scores.get(page_id, 0), 4),
            pagerank_score=round(pagerank_scores.get(page_id, 0), 6),
            final_score=round(final_score, 4),
        ))

    trace["snippet_generation"] = {
        "results_count": len(results),
        "time_ms": round((time.time() - t0) * 1000, 2),
    }

    # Sports detection
    sports_data = None
    try:
        from sports.detector import detect_sports
        from sports.api import get_upcoming_fixtures, get_standings, get_live_scores
        detection = detect_sports(query)
        if detection:
            if detection.action == "upcoming" and detection.teams:
                sports_data = {"type": "fixtures", "detection": detection.to_dict(), "data": get_upcoming_fixtures(detection.teams[0])}
            elif detection.action == "standings" and detection.leagues:
                sports_data = {"type": "standings", "detection": detection.to_dict(), "data": get_standings(detection.leagues[0])}
            elif detection.action == "live":
                sports_data = {"type": "live", "detection": detection.to_dict(), "data": get_live_scores()}
    except Exception:
        pass

    total_ms = round((time.time() - total_start) * 1000, 2)

    return {
        "query": query,
        "sports": sports_data,
        "results": results,
        "total_results": len(bm25_scores),
        "time_ms": total_ms,
        "params_used": {"bm25_k1": k1, "bm25_b": b, "rank_alpha": alpha},
        "pipeline": trace,
    }

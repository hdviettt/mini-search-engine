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

    # Get top 10 with titles
    bm25_sorted = sorted(bm25_scores.items(), key=lambda x: x[1], reverse=True)[:10]
    bm25_top = []
    for page_id, score in bm25_sorted:
        title = conn.execute("SELECT title FROM pages WHERE id = %s", (page_id,)).fetchone()
        bm25_top.append({
            "page_id": page_id,
            "score": round(score, 4),
            "title": (title[0] if title else "")[:60],
        })

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
    pr_top = []
    for page_id, score in pr_sorted:
        title = conn.execute("SELECT title FROM pages WHERE id = %s", (page_id,)).fetchone()
        pr_top.append({
            "page_id": page_id,
            "score": round(score, 6),
            "title": (title[0] if title else "")[:60],
        })

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
    rank_changes = []
    for pid in list(combined_rank.keys())[:10]:
        title = conn.execute("SELECT title FROM pages WHERE id = %s", (pid,)).fetchone()
        rank_changes.append({
            "page_id": pid,
            "title": (title[0] if title else "")[:50],
            "bm25_rank": bm25_rank.get(pid, ">10"),
            "final_rank": combined_rank[pid],
        })

    trace["combination"] = {
        "alpha": alpha,
        "formula": f"{alpha} * BM25 + {round(1 - alpha, 1)} * PageRank",
        "rank_changes": rank_changes,
        "time_ms": round((time.time() - t0) * 1000, 2),
    }

    # Step 6: Build results with snippets
    t0 = time.time()
    page_results = ranked[:10]
    results = []
    for page_id, final_score in page_results:
        row = conn.execute("SELECT url, title, body_text FROM pages WHERE id = %s", (page_id,)).fetchone()
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

    trace["snippet_generation"] = {
        "results_count": len(results),
        "time_ms": round((time.time() - t0) * 1000, 2),
    }

    total_ms = round((time.time() - total_start) * 1000, 2)

    return {
        "query": query,
        "results": results,
        "total_results": len(bm25_scores),
        "time_ms": total_ms,
        "params_used": {"bm25_k1": k1, "bm25_b": b, "rank_alpha": alpha},
        "pipeline": trace,
    }

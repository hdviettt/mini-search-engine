"""Playground API — search explain, stats, crawl/index/embed control, WebSocket."""
import asyncio
import logging
import queue

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from api.jobs import crawl_scheduler, job_manager
from auth import require_api_key
from db import db_conn, get_db
from ranker.pagerank import compute_pagerank
from search.explainer import search_explain
from search.spellcheck import spell_checker

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# Routes that write, crawl, spend money, or schedule recurring work.
# Read routes stay public — they are the demo.
admin = APIRouter(prefix="/api", dependencies=[Depends(require_api_key)])


# --- Request/Response models ---

class ExplainRequest(BaseModel):
    q: str
    params: dict | None = None


class CrawlRequest(BaseModel):
    seed_urls: list[str] = Field(default=[], max_length=50)
    max_pages: int = Field(default=100, ge=1, le=500)
    max_depth: int = Field(default=3, ge=0, le=3)
    extra_domains: list[str] = Field(default=[], max_length=20)
    # Turning this off widens the crawl to any *public* domain. Private,
    # loopback and link-local addresses are blocked unconditionally in
    # crawler.fetcher.is_safe_url and cannot be re-enabled from a request.
    restrict_domains: bool = True


class PageRankRequest(BaseModel):
    damping: float = Field(default=0.85, gt=0.0, lt=1.0)
    iterations: int = Field(default=20, ge=1, le=100)


class ScheduleRequest(BaseModel):
    seed_urls: list[str] = Field(default=[], max_length=50)
    max_pages: int = Field(default=50, ge=1, le=500)
    max_depth: int = Field(default=1, ge=0, le=3)
    interval_hours: float = Field(default=6.0, ge=1.0, le=720.0)
    strategy: str = "seed"  # 'seed' or 'top_pagerank'


def _log_query(conn: psycopg.Connection, query: str, results_count: int, time_ms: float) -> None:
    """Record a query for analytics. Never allowed to fail a search."""
    try:
        conn.execute(
            "INSERT INTO query_log (query, results_count, time_ms) VALUES (%s, %s, %s)",
            (query, results_count, time_ms),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        log.warning("Failed to log query %r", query, exc_info=True)


# --- Endpoints ---

@router.post("/search/explain")
def explain(req: ExplainRequest, conn: psycopg.Connection = Depends(get_db)):
    result = search_explain(conn, req.q, req.params)

    # Spell correction: if 0 results, try correcting the query
    result["correction"] = None
    result["original_query"] = None
    if result.get("total_results", 0) == 0 and req.q.strip():
        correction = spell_checker.correct_query(req.q, conn)
        if correction and correction.lower() != req.q.lower():
            corrected_result = search_explain(conn, correction, req.params)
            if corrected_result.get("total_results", 0) > 0:
                corrected_result["correction"] = correction
                corrected_result["original_query"] = req.q
                result = corrected_result
            else:
                result["correction"] = correction

    _log_query(conn, req.q, result.get("total_results", 0), result.get("time_ms", 0))
    return result


@router.get("/suggest")
def suggest(q: str = Query("", max_length=200), conn: psycopg.Connection = Depends(get_db)):
    """Return popular past queries matching a prefix, for autocomplete."""
    if len(q) < 2:
        return {"popular": []}
    rows = conn.execute(
        """SELECT query, COUNT(*) AS freq
           FROM query_log
           WHERE query ILIKE %s AND lower(query) != lower(%s)
           GROUP BY query
           ORDER BY freq DESC
           LIMIT 6""",
        (f"{q}%", q),
    ).fetchall()
    return {"popular": [r[0] for r in rows]}


@router.get("/stats")
def stats(conn: psycopg.Connection = Depends(get_db)):
    pages = conn.execute("SELECT COUNT(*) FROM pages").fetchone()[0]
    pages_failed = conn.execute("SELECT COUNT(*) FROM crawl_queue WHERE status = 'failed'").fetchone()[0]
    pages_pending = conn.execute("SELECT COUNT(*) FROM crawl_queue WHERE status = 'pending'").fetchone()[0]

    terms = conn.execute("SELECT COUNT(*) FROM terms").fetchone()[0]
    postings = conn.execute("SELECT COUNT(*) FROM postings").fetchone()[0]

    chunks = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    chunks_embedded = conn.execute("SELECT COUNT(*) FROM chunks WHERE embedding IS NOT NULL").fetchone()[0]

    avg_doc = conn.execute("SELECT value FROM corpus_stats WHERE key = 'avg_doc_length'").fetchone()
    avg_doc_length = round(avg_doc[0], 1) if avg_doc else 0

    last_crawl = conn.execute("SELECT MAX(crawled_at) FROM pages").fetchone()[0]

    return {
        "pages_crawled": pages,
        "pages_pending": pages_pending,
        "pages_failed": pages_failed,
        "total_terms": terms,
        "total_postings": postings,
        "total_chunks": chunks,
        "chunks_embedded": chunks_embedded,
        "avg_doc_length": avg_doc_length,
        "last_crawl_at": str(last_crawl) if last_crawl else None,
    }


def capture_stats_snapshot():
    """Capture current aggregate stats into stats_snapshots.

    Called both from a request and from the background snapshot thread, so it
    opens its own pooled connection rather than taking one as an argument.
    The table itself is created by db.init_db — never inline here.
    """
    try:
        with db_conn() as conn:
            pages = conn.execute("SELECT COUNT(*) FROM pages").fetchone()[0]
            terms = conn.execute("SELECT COUNT(*) FROM terms").fetchone()[0]
            postings = conn.execute("SELECT COUNT(*) FROM postings").fetchone()[0]
            chunks = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
            embedded = conn.execute("SELECT COUNT(*) FROM chunks WHERE embedding IS NOT NULL").fetchone()[0]
            avg_doc = conn.execute("SELECT value FROM corpus_stats WHERE key = 'avg_doc_length'").fetchone()
            avg_dl = round(avg_doc[0], 1) if avg_doc else 0
            queries = conn.execute("SELECT COUNT(*) FROM query_log").fetchone()[0]
            avg_lat = conn.execute(
                "SELECT AVG(time_ms) FROM query_log WHERE created_at > NOW() - INTERVAL '24 hours'"
            ).fetchone()[0] or 0

            conn.execute(
                """INSERT INTO stats_snapshots
                   (pages_crawled, terms_indexed, postings_count, chunks_count, chunks_embedded,
                    avg_doc_length, queries_total, avg_latency_ms)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (pages, terms, postings, chunks, embedded, avg_dl, queries, round(avg_lat, 1)),
            )
            conn.commit()
    except Exception:
        log.error("Stats snapshot failed", exc_info=True)


@router.get("/stats/history")
def stats_history(days: int = Query(30, ge=1, le=365), conn: psycopg.Connection = Depends(get_db)):
    """Return time-series stats for dashboard charts.

    Uses make_interval() rather than INTERVAL '%s days' — a placeholder inside
    a SQL string literal is not a placeholder, which made this endpoint raise
    on every call.
    """
    pages_over_time = conn.execute(
        """SELECT DATE(crawled_at) AS day, COUNT(*) AS cnt
           FROM pages WHERE crawled_at > NOW() - make_interval(days => %s)
           GROUP BY DATE(crawled_at) ORDER BY day""",
        (days,),
    ).fetchall()

    queries_per_day = conn.execute(
        """SELECT DATE(created_at) AS day, COUNT(*) AS cnt, ROUND(AVG(time_ms)::numeric, 1) AS avg_ms
           FROM query_log WHERE created_at > NOW() - make_interval(days => %s)
           GROUP BY DATE(created_at) ORDER BY day""",
        (days,),
    ).fetchall()

    snapshots = conn.execute(
        """SELECT snapshot_at, pages_crawled, terms_indexed, postings_count,
                  chunks_count, chunks_embedded, queries_total, avg_latency_ms
           FROM stats_snapshots
           WHERE snapshot_at > NOW() - make_interval(days => %s)
           ORDER BY snapshot_at""",
        (days,),
    ).fetchall()

    return {
        "pages_over_time": [{"day": str(r[0]), "count": r[1]} for r in pages_over_time],
        "queries_per_day": [
            {"day": str(r[0]), "count": r[1], "avg_ms": float(r[2]) if r[2] else 0}
            for r in queries_per_day
        ],
        "snapshots": [
            {
                "time": str(r[0]), "pages": r[1], "terms": r[2], "postings": r[3],
                "chunks": r[4], "embedded": r[5], "queries": r[6], "avg_ms": r[7],
            }
            for r in snapshots
        ],
    }


@admin.post("/stats/snapshot")
def take_snapshot():
    """Manually trigger a stats snapshot."""
    capture_stats_snapshot()
    return {"status": "captured"}


@admin.post("/crawl/start")
def crawl_start(req: CrawlRequest):
    try:
        job_id = job_manager.start_crawl(
            req.seed_urls, req.max_pages, req.max_depth, req.extra_domains, req.restrict_domains
        )
        return {"job_id": job_id, "status": "started"}
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e


@admin.post("/crawl/stop")
def crawl_stop(job_id: str):
    job_manager.stop_crawl(job_id)
    return {"status": "stop_requested"}


@admin.post("/crawl/refresh")
def crawl_refresh():
    """Re-crawl all existing pages with the current parser to clean stale body_text."""
    try:
        job_id = job_manager.start_refresh()
        return {"job_id": job_id, "status": "started"}
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e


@admin.post("/index/rebuild")
def index_rebuild():
    job_id = job_manager.start_index_rebuild()
    return {"job_id": job_id, "status": "started"}


@admin.post("/embedding/rebuild")
def embedding_rebuild():
    job_id = job_manager.start_embed_rebuild()
    return {"job_id": job_id, "status": "started"}


@router.get("/jobs")
def list_jobs():
    return job_manager.get_jobs()


@admin.post("/pagerank/recompute")
def pagerank_recompute(req: PageRankRequest, conn: psycopg.Connection = Depends(get_db)):
    """Re-compute PageRank with custom damping and iteration parameters."""
    compute_pagerank(conn, damping=req.damping, iterations=req.iterations)
    return {"status": "completed", "damping": req.damping, "iterations": req.iterations}


@admin.post("/crawl/schedule")
def schedule_create(req: ScheduleRequest):
    """Create a new recurring crawl schedule."""
    schedule_id = crawl_scheduler.add(
        req.seed_urls, req.max_pages, req.interval_hours,
        strategy=req.strategy, max_depth=req.max_depth,
    )
    return {
        "schedule_id": schedule_id,
        "status": "scheduled",
        "strategy": req.strategy,
        "interval_hours": req.interval_hours,
    }


@router.get("/crawl/schedules")
def schedule_list():
    """List all crawl schedules."""
    return {"schedules": crawl_scheduler.list_schedules()}


@admin.delete("/crawl/schedule/{schedule_id}")
def schedule_delete(schedule_id: str):
    """Delete a crawl schedule."""
    crawl_scheduler.remove(schedule_id)
    return {"status": "deleted", "schedule_id": schedule_id}


@admin.post("/crawl/schedule/{schedule_id}/toggle")
def schedule_toggle(schedule_id: str, enabled: bool = True):
    """Enable or disable a crawl schedule."""
    crawl_scheduler.toggle(schedule_id, enabled)
    return {"status": "toggled", "schedule_id": schedule_id, "enabled": enabled}


@router.get("/explore/pages")
def explore_pages(
    limit: int = Query(20, ge=1, le=200),
    # Capped because OFFSET makes Postgres walk every skipped row. An
    # unbounded value turns a browse endpoint into a full table scan.
    offset: int = Query(0, ge=0, le=100_000),
    conn: psycopg.Connection = Depends(get_db),
):
    """Browse crawled pages."""
    rows = conn.execute(
        """SELECT p.id, p.url, p.domain, p.title, p.status_code,
                  LENGTH(p.body_text) AS text_length, p.crawled_at,
                  (SELECT COUNT(*) FROM links WHERE source_id = p.id) AS outlinks
           FROM pages p ORDER BY p.id DESC LIMIT %s OFFSET %s""",
        (limit, offset),
    ).fetchall()
    total = conn.execute("SELECT COUNT(*) FROM pages").fetchone()[0]
    return {
        "total": total,
        "pages": [
            {
                "id": r[0], "url": r[1], "domain": r[2], "title": r[3],
                "status_code": r[4], "text_length": r[5],
                "crawled_at": str(r[6]) if r[6] else None, "outlinks": r[7],
            }
            for r in rows
        ],
    }


@router.get("/explore/index")
def explore_index(limit: int = Query(30, ge=1, le=200), conn: psycopg.Connection = Depends(get_db)):
    """Browse the inverted index — top terms by document frequency, with sample docs."""
    rows = conn.execute(
        """SELECT t.term, t.id,
                  COUNT(p.page_id) AS doc_freq,
                  SUM(p.term_freq) AS total_freq
           FROM terms t
           JOIN postings p ON t.id = p.term_id
           GROUP BY t.id, t.term
           ORDER BY doc_freq DESC
           LIMIT %s""",
        (limit,),
    ).fetchall()

    # One query for every term's samples instead of one query per term.
    term_ids = [r[1] for r in rows]
    samples: dict[int, list[dict]] = {tid: [] for tid in term_ids}
    if term_ids:
        sample_rows = conn.execute(
            """SELECT term_id, page_id, title, term_freq FROM (
                   SELECT po.term_id, po.page_id, pg.title, po.term_freq,
                          ROW_NUMBER() OVER (PARTITION BY po.term_id ORDER BY po.term_freq DESC) AS rn
                   FROM postings po JOIN pages pg ON pg.id = po.page_id
                   WHERE po.term_id = ANY(%s)
               ) ranked WHERE rn <= 4""",
            (term_ids,),
        ).fetchall()
        for term_id, page_id, title, freq in sample_rows:
            samples[term_id].append({"id": page_id, "title": (title or "")[:40], "freq": freq})

    terms_with_docs = [
        {
            "term": term,
            "doc_freq": doc_freq,
            "total_freq": total_freq,
            "sample_docs": samples.get(term_id, []),
        }
        for term, term_id, doc_freq, total_freq in rows
    ]

    corpus = conn.execute("SELECT value FROM corpus_stats WHERE key = 'total_docs'").fetchone()
    total_docs = int(corpus[0]) if corpus else 0
    total_terms = conn.execute("SELECT COUNT(*) FROM terms").fetchone()[0]
    return {
        "total_docs": total_docs,
        "total_terms": total_terms,
        "terms": terms_with_docs,
    }


@router.get("/explore/pagerank")
def explore_pagerank(limit: int = Query(20, ge=1, le=200), conn: psycopg.Connection = Depends(get_db)):
    """Top pages by PageRank score."""
    rows = conn.execute(
        """SELECT p.id, p.title, p.url, pr.score,
                  (SELECT COUNT(*) FROM links l JOIN pages p2 ON p2.url = l.target_url WHERE p2.id = p.id) AS inlinks
           FROM pagerank pr
           JOIN pages p ON pr.page_id = p.id
           ORDER BY pr.score DESC
           LIMIT %s""",
        (limit,),
    ).fetchall()
    return {
        "pages": [
            {"id": r[0], "title": r[1], "url": r[2], "score": round(r[3], 6), "inlinks": r[4]}
            for r in rows
        ],
    }


@router.get("/explore/page/{page_id}")
def explore_page_journey(page_id: int, conn: psycopg.Connection = Depends(get_db)):
    """Full journey of a single page through the search engine pipeline."""
    from collections import Counter

    from indexer.tokenizer import tokenize

    page = conn.execute(
        "SELECT id, url, domain, title, body_text, status_code, crawled_at FROM pages WHERE id = %s",
        (page_id,),
    ).fetchone()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    body_text = page[4] or ""
    tokens = tokenize(body_text[:2000])
    top_terms = Counter(tokens).most_common(15)

    doc_stat = conn.execute("SELECT doc_length FROM doc_stats WHERE page_id = %s", (page_id,)).fetchone()
    pr = conn.execute("SELECT score FROM pagerank WHERE page_id = %s", (page_id,)).fetchone()

    outlinks = conn.execute(
        """SELECT l.target_url, p2.title
           FROM links l LEFT JOIN pages p2 ON p2.url = l.target_url
           WHERE l.source_id = %s LIMIT 10""",
        (page_id,),
    ).fetchall()

    inlinks = conn.execute(
        """SELECT p2.id, p2.title
           FROM links l JOIN pages p2 ON p2.id = l.source_id
           WHERE l.target_url = (SELECT url FROM pages WHERE id = %s) LIMIT 10""",
        (page_id,),
    ).fetchall()

    chunks = conn.execute(
        """SELECT id, chunk_idx, content, embedding IS NOT NULL AS has_embedding
           FROM chunks WHERE page_id = %s ORDER BY chunk_idx""",
        (page_id,),
    ).fetchall()

    return {
        "page": {
            "id": page[0], "url": page[1], "domain": page[2], "title": page[3],
            "text_preview": body_text[:500],
            "text_length": len(body_text),
            "status_code": page[5],
            "crawled_at": str(page[6]) if page[6] else None,
        },
        "tokenization": {
            "doc_length": doc_stat[0] if doc_stat else 0,
            "top_terms": [{"term": t, "freq": f} for t, f in top_terms],
            "sample_tokens": tokens[:20],
        },
        "pagerank": {
            "score": round(pr[0], 6) if pr else 0,
            "inlinks": [{"id": r[0], "title": (r[1] or "")[:50]} for r in inlinks],
            "outlinks": [{"url": r[0], "title": (r[1] or "")[:50]} for r in outlinks],
        },
        "chunks": [
            {"id": c[0], "chunk_idx": c[1], "content": c[2][:200], "has_embedding": c[3]}
            for c in chunks[:8]
        ],
    }


@router.get("/explore/chunks")
def explore_chunks(
    page_id: int | None = None,
    limit: int = Query(10, ge=1, le=100),
    include_embeddings: bool = False,
    conn: psycopg.Connection = Depends(get_db),
):
    """Browse chunks — optionally filtered by page, optionally with embedding previews."""
    if page_id:
        rows = conn.execute(
            """SELECT c.id, c.page_id, c.chunk_idx, c.content, p.title,
                      c.embedding IS NOT NULL AS has_embedding, c.embedding
               FROM chunks c JOIN pages p ON c.page_id = p.id
               WHERE c.page_id = %s ORDER BY c.chunk_idx LIMIT %s""",
            (page_id, limit),
        ).fetchall()
    elif include_embeddings:
        rows = conn.execute(
            """SELECT c.id, c.page_id, c.chunk_idx, c.content, p.title,
                      c.embedding IS NOT NULL AS has_embedding, c.embedding
               FROM chunks c JOIN pages p ON c.page_id = p.id
               WHERE c.embedding IS NOT NULL
               ORDER BY c.id DESC LIMIT %s""",
            (limit,),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT c.id, c.page_id, c.chunk_idx, c.content, p.title,
                      c.embedding IS NOT NULL AS has_embedding, NULL AS embedding
               FROM chunks c JOIN pages p ON c.page_id = p.id
               ORDER BY c.id DESC LIMIT %s""",
            (limit,),
        ).fetchall()

    chunks = []
    for r in rows:
        chunk = {
            "id": r[0], "page_id": r[1], "chunk_idx": r[2],
            "content": r[3][:300], "title": r[4], "has_embedding": r[5],
            "word_count": len(r[3].split()),
        }
        if include_embeddings and r[6] is not None:
            vec = r[6]
            if isinstance(vec, str):
                vec = [float(x) for x in vec.strip("[]").split(",")]
            chunk["embedding_preview"] = [round(v, 4) for v in vec[:64]]
            chunk["dimensions"] = len(vec)
        chunks.append(chunk)

    return {"chunks": chunks}


@router.get("/explore/embed")
def explore_embed(q: str = Query(..., min_length=1, max_length=500)):
    """Return the embedding vector for a query string."""
    from rag.embedder import embed_query

    vec = embed_query(q)
    if vec is None:
        return {"query": q, "embedding": None, "dimensions": 0}
    return {"query": q, "embedding": [round(v, 6) for v in vec], "dimensions": len(vec)}


# --- Dashboard analytics ---

@router.get("/dashboard")
def dashboard(conn: psycopg.Connection = Depends(get_db)):
    """Aggregated search analytics for the dashboard."""
    total_queries = conn.execute("SELECT COUNT(*) FROM query_log").fetchone()[0]

    queries_today = conn.execute(
        "SELECT COUNT(*) FROM query_log WHERE created_at > NOW() - INTERVAL '24 hours'"
    ).fetchone()[0]

    avg_latency = conn.execute(
        "SELECT AVG(time_ms) FROM query_log WHERE created_at > NOW() - INTERVAL '24 hours'"
    ).fetchone()[0] or 0

    zero_results = conn.execute(
        "SELECT COUNT(*) FROM query_log WHERE results_count = 0 AND created_at > NOW() - INTERVAL '7 days'"
    ).fetchone()[0]

    popular = conn.execute(
        """SELECT query, COUNT(*) AS cnt, AVG(results_count) AS avg_results, AVG(time_ms) AS avg_ms
           FROM query_log WHERE created_at > NOW() - INTERVAL '7 days'
           GROUP BY query ORDER BY cnt DESC LIMIT 20"""
    ).fetchall()

    recent = conn.execute(
        "SELECT query, results_count, time_ms, created_at FROM query_log ORDER BY created_at DESC LIMIT 20"
    ).fetchall()

    pages = conn.execute("SELECT COUNT(*) FROM pages").fetchone()[0]
    terms = conn.execute("SELECT COUNT(*) FROM terms").fetchone()[0]
    chunks = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    embedded = conn.execute("SELECT COUNT(*) FROM chunks WHERE embedding IS NOT NULL").fetchone()[0]

    return {
        "search": {
            "total_queries": total_queries,
            "queries_today": queries_today,
            "avg_latency_ms": round(avg_latency, 1),
            "zero_result_queries_7d": zero_results,
        },
        "popular_queries": [
            {"query": r[0], "count": r[1], "avg_results": round(r[2] or 0, 1), "avg_ms": round(r[3] or 0, 1)}
            for r in popular
        ],
        "recent_queries": [
            {"query": r[0], "results": r[1], "time_ms": round(r[2] or 0, 1), "at": str(r[3])}
            for r in recent
        ],
        "corpus": {
            "pages": pages,
            "terms": terms,
            "chunks": chunks,
            "chunks_embedded": embedded,
        },
    }


# --- Sports data endpoints ---

@router.get("/sports/matches")
def sports_matches(team: str | None = None):
    """Get upcoming matches for a team."""
    from sports.api import get_upcoming_fixtures
    from sports.detector import TEAM_MAP

    if not team:
        raise HTTPException(status_code=400, detail="team parameter required")
    team_id = TEAM_MAP.get(team.lower())
    if not team_id:
        raise HTTPException(status_code=404, detail=f"Unknown team: {team}")
    return {"team": team, "fixtures": get_upcoming_fixtures(team_id)}


@router.get("/sports/standings")
def sports_standings(league: str):
    """Get league standings."""
    from sports.api import get_standings
    from sports.detector import LEAGUE_MAP

    league_id = LEAGUE_MAP.get(league.lower())
    if not league_id:
        raise HTTPException(status_code=404, detail=f"Unknown league: {league}")
    return {"league": league, "standings": get_standings(league_id)}


@router.get("/sports/live")
def sports_live():
    """Get all live scores."""
    from sports.api import get_live_scores

    return {"live": get_live_scores()}


# --- WebSocket for live progress ---

async def websocket_jobs(websocket: WebSocket):
    await websocket.accept()
    sub = job_manager.subscribe()
    try:
        while True:
            try:
                msg = sub.get_nowait()
                await websocket.send_json(msg)
            except queue.Empty:
                await asyncio.sleep(0.3)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.debug("Job WebSocket closed unexpectedly", exc_info=True)
    finally:
        job_manager.unsubscribe(sub)

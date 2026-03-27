"""Playground API — search explain, stats, crawl/index/embed control, WebSocket."""
import asyncio
import queue

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from db import get_connection
from search.explainer import search_explain
from search.spellcheck import spell_checker
from ranker.pagerank import compute_pagerank
from api.jobs import job_manager, crawl_scheduler

router = APIRouter(prefix="/api")


# --- Request/Response models ---

class ExplainRequest(BaseModel):
    q: str
    params: dict | None = None


class CrawlRequest(BaseModel):
    seed_urls: list[str] = []
    max_pages: int = 100
    max_depth: int = 3
    extra_domains: list[str] = []
    restrict_domains: bool = True


class PageRankRequest(BaseModel):
    damping: float = 0.85
    iterations: int = 20


class ScheduleRequest(BaseModel):
    seed_urls: list[str] = []
    max_pages: int = 50
    max_depth: int = 1
    interval_hours: float = 6.0
    strategy: str = "seed"  # 'seed' or 'top_pagerank'


# --- Endpoints ---

@router.post("/search/explain")
def explain(req: ExplainRequest):
    conn = get_connection()
    try:
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

        # Log query for analytics
        try:
            conn.execute(
                "INSERT INTO query_log (query, results_count, time_ms) VALUES (%s, %s, %s)",
                (req.q, result.get("total_results", 0), result.get("time_ms", 0)),
            )
            conn.commit()
        except Exception:
            conn.rollback()
        return result
    finally:
        conn.close()


@router.get("/suggest")
def suggest(q: str = Query("")):
    """Return popular past queries matching a prefix, for autocomplete."""
    if len(q) < 2:
        return {"popular": []}
    conn = get_connection()
    try:
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
    finally:
        conn.close()


@router.get("/stats")
def stats():
    conn = get_connection()
    try:
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
    finally:
        conn.close()


def capture_stats_snapshot():
    """Capture current aggregate stats into stats_snapshots table."""
    conn = get_connection()
    try:
        conn.execute("""CREATE TABLE IF NOT EXISTS stats_snapshots (
            id SERIAL PRIMARY KEY, snapshot_at TIMESTAMPTZ DEFAULT NOW(),
            pages_crawled INTEGER, terms_indexed INTEGER, postings_count INTEGER,
            chunks_count INTEGER, chunks_embedded INTEGER, avg_doc_length REAL,
            queries_total INTEGER, avg_latency_ms REAL
        )""")
        conn.commit()

        pages = conn.execute("SELECT COUNT(*) FROM pages").fetchone()[0]
        terms = conn.execute("SELECT COUNT(*) FROM terms").fetchone()[0]
        postings = conn.execute("SELECT COUNT(*) FROM postings").fetchone()[0]
        chunks = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        embedded = conn.execute("SELECT COUNT(*) FROM chunks WHERE embedding IS NOT NULL").fetchone()[0]
        avg_doc = conn.execute("SELECT value FROM corpus_stats WHERE key = 'avg_doc_length'").fetchone()
        avg_dl = round(avg_doc[0], 1) if avg_doc else 0
        queries = conn.execute("SELECT COUNT(*) FROM query_log").fetchone()[0]
        avg_lat = conn.execute("SELECT AVG(time_ms) FROM query_log WHERE created_at > NOW() - INTERVAL '24 hours'").fetchone()[0] or 0

        conn.execute(
            """INSERT INTO stats_snapshots
               (pages_crawled, terms_indexed, postings_count, chunks_count, chunks_embedded, avg_doc_length, queries_total, avg_latency_ms)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (pages, terms, postings, chunks, embedded, avg_dl, queries, round(avg_lat, 1)),
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"Stats snapshot error: {e}")
    finally:
        conn.close()


@router.get("/stats/history")
def stats_history(days: int = 30):
    """Return time-series stats for dashboard charts."""
    conn = get_connection()
    try:
        pages_over_time = conn.execute(
            """SELECT DATE(crawled_at) as day, COUNT(*) as cumulative
               FROM pages WHERE crawled_at > NOW() - INTERVAL '%s days'
               GROUP BY DATE(crawled_at) ORDER BY day""",
            (days,),
        ).fetchall()

        queries_per_day = conn.execute(
            """SELECT DATE(created_at) as day, COUNT(*) as count, ROUND(AVG(time_ms)::numeric, 1) as avg_ms
               FROM query_log WHERE created_at > NOW() - INTERVAL '%s days'
               GROUP BY DATE(created_at) ORDER BY day""",
            (days,),
        ).fetchall()

        snapshots = conn.execute(
            """SELECT snapshot_at, pages_crawled, terms_indexed, postings_count,
                      chunks_count, chunks_embedded, queries_total, avg_latency_ms
               FROM stats_snapshots
               WHERE snapshot_at > NOW() - INTERVAL '%s days'
               ORDER BY snapshot_at""",
            (days,),
        ).fetchall()

        return {
            "pages_over_time": [{"day": str(r[0]), "count": r[1]} for r in pages_over_time],
            "queries_per_day": [{"day": str(r[0]), "count": r[1], "avg_ms": float(r[2]) if r[2] else 0} for r in queries_per_day],
            "snapshots": [
                {
                    "time": str(r[0]), "pages": r[1], "terms": r[2], "postings": r[3],
                    "chunks": r[4], "embedded": r[5], "queries": r[6], "avg_ms": r[7],
                }
                for r in snapshots
            ],
        }
    finally:
        conn.close()


@router.post("/stats/snapshot")
def take_snapshot():
    """Manually trigger a stats snapshot."""
    capture_stats_snapshot()
    return {"status": "captured"}


@router.post("/crawl/start")
def crawl_start(req: CrawlRequest):
    try:
        job_id = job_manager.start_crawl(req.seed_urls, req.max_pages, req.max_depth, req.extra_domains, req.restrict_domains)
        return {"job_id": job_id, "status": "started"}
    except RuntimeError as e:
        return {"error": str(e)}, 409


@router.post("/crawl/stop")
def crawl_stop(job_id: str):
    job_manager.stop_crawl(job_id)
    return {"status": "stop_requested"}


@router.post("/crawl/refresh")
def crawl_refresh():
    """Re-crawl all existing pages with the current parser to clean stale body_text."""
    try:
        job_id = job_manager.start_refresh()
        return {"job_id": job_id, "status": "started"}
    except RuntimeError as e:
        return {"error": str(e)}, 409


@router.post("/index/rebuild")
def index_rebuild():
    job_id = job_manager.start_index_rebuild()
    return {"job_id": job_id, "status": "started"}


@router.post("/embedding/rebuild")
def embedding_rebuild():
    job_id = job_manager.start_embed_rebuild()
    return {"job_id": job_id, "status": "started"}


@router.get("/jobs")
def list_jobs():
    return job_manager.get_jobs()


@router.post("/pagerank/recompute")
def pagerank_recompute(req: PageRankRequest):
    """Re-compute PageRank with custom damping and iteration parameters."""
    conn = get_connection()
    try:
        compute_pagerank(conn, damping=req.damping, iterations=req.iterations)
        return {"status": "completed", "damping": req.damping, "iterations": req.iterations}
    finally:
        conn.close()


@router.post("/crawl/schedule")
def schedule_create(req: ScheduleRequest):
    """Create a new recurring crawl schedule."""
    schedule_id = crawl_scheduler.add(
        req.seed_urls, req.max_pages, req.interval_hours,
        strategy=req.strategy, max_depth=req.max_depth,
    )
    return {"schedule_id": schedule_id, "status": "scheduled", "strategy": req.strategy, "interval_hours": req.interval_hours}


@router.get("/crawl/schedules")
def schedule_list():
    """List all crawl schedules."""
    return {"schedules": crawl_scheduler.list_schedules()}


@router.delete("/crawl/schedule/{schedule_id}")
def schedule_delete(schedule_id: str):
    """Delete a crawl schedule."""
    crawl_scheduler.remove(schedule_id)
    return {"status": "deleted", "schedule_id": schedule_id}


@router.post("/crawl/schedule/{schedule_id}/toggle")
def schedule_toggle(schedule_id: str, enabled: bool = True):
    """Enable or disable a crawl schedule."""
    crawl_scheduler.toggle(schedule_id, enabled)
    return {"status": "toggled", "schedule_id": schedule_id, "enabled": enabled}


@router.get("/explore/pages")
def explore_pages(limit: int = 20, offset: int = 0):
    """Browse crawled pages."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT p.id, p.url, p.domain, p.title, p.status_code,
                      LENGTH(p.body_text) as text_length, p.crawled_at,
                      (SELECT COUNT(*) FROM links WHERE source_id = p.id) as outlinks
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
    finally:
        conn.close()


@router.get("/explore/index")
def explore_index(limit: int = 30):
    """Browse the inverted index — top terms by document frequency, with sample docs."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT t.term, t.id,
                      COUNT(p.page_id) as doc_freq,
                      SUM(p.term_freq) as total_freq
               FROM terms t
               JOIN postings p ON t.id = p.term_id
               GROUP BY t.id, t.term
               ORDER BY doc_freq DESC
               LIMIT %s""",
            (limit,),
        ).fetchall()

        terms_with_docs = []
        for r in rows:
            term, term_id, doc_freq, total_freq = r
            sample_docs = conn.execute(
                """SELECT pg.id, pg.title, po.term_freq
                   FROM postings po JOIN pages pg ON pg.id = po.page_id
                   WHERE po.term_id = %s
                   ORDER BY po.term_freq DESC
                   LIMIT 4""",
                (term_id,),
            ).fetchall()
            terms_with_docs.append({
                "term": term,
                "doc_freq": doc_freq,
                "total_freq": total_freq,
                "sample_docs": [
                    {"id": d[0], "title": (d[1] or "")[:40], "freq": d[2]}
                    for d in sample_docs
                ],
            })

        corpus = conn.execute("SELECT value FROM corpus_stats WHERE key = 'total_docs'").fetchone()
        total_docs = int(corpus[0]) if corpus else 0
        total_terms = conn.execute("SELECT COUNT(*) FROM terms").fetchone()[0]
        return {
            "total_docs": total_docs,
            "total_terms": total_terms,
            "terms": terms_with_docs,
        }
    finally:
        conn.close()


@router.get("/explore/pagerank")
def explore_pagerank(limit: int = 20):
    """Top pages by PageRank score."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT p.id, p.title, p.url, pr.score,
                      (SELECT COUNT(*) FROM links l JOIN pages p2 ON p2.url = l.target_url WHERE p2.id = p.id) as inlinks
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
    finally:
        conn.close()


@router.get("/explore/page/{page_id}")
def explore_page_journey(page_id: int):
    """Full journey of a single page through the search engine pipeline."""
    conn = get_connection()
    try:
        page = conn.execute(
            "SELECT id, url, domain, title, body_text, status_code, crawled_at FROM pages WHERE id = %s",
            (page_id,),
        ).fetchone()
        if not page:
            return {"error": "Page not found"}

        body_text = page[4] or ""

        from indexer.tokenizer import tokenize
        tokens = tokenize(body_text[:2000])
        from collections import Counter
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
            """SELECT id, chunk_idx, content, embedding IS NOT NULL as has_embedding
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
                "inlinks": [{"id": r[0], "title": r[1][:50]} for r in inlinks],
                "outlinks": [{"url": r[0], "title": (r[1] or "")[:50]} for r in outlinks],
            },
            "chunks": [
                {"id": c[0], "chunk_idx": c[1], "content": c[2][:200], "has_embedding": c[3]}
                for c in chunks[:8]
            ],
        }
    finally:
        conn.close()


@router.get("/explore/chunks")
def explore_chunks(page_id: int | None = None, limit: int = 10, include_embeddings: bool = False):
    """Browse chunks — optionally filtered by page, optionally with embedding previews."""
    conn = get_connection()
    try:
        embed_col = ", c.embedding" if include_embeddings else ""
        if page_id:
            rows = conn.execute(
                f"""SELECT c.id, c.page_id, c.chunk_idx, c.content, p.title,
                          c.embedding IS NOT NULL as has_embedding{embed_col}
                   FROM chunks c JOIN pages p ON c.page_id = p.id
                   WHERE c.page_id = %s ORDER BY c.chunk_idx LIMIT %s""",
                (page_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                f"""SELECT c.id, c.page_id, c.chunk_idx, c.content, p.title,
                          c.embedding IS NOT NULL as has_embedding{embed_col}
                   FROM chunks c JOIN pages p ON c.page_id = p.id
                   WHERE c.embedding IS NOT NULL
                   ORDER BY c.id DESC LIMIT %s""" if include_embeddings else
                f"""SELECT c.id, c.page_id, c.chunk_idx, c.content, p.title,
                          c.embedding IS NOT NULL as has_embedding{embed_col}
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
            if include_embeddings and len(r) > 6 and r[6] is not None:
                vec = r[6]
                if isinstance(vec, str):
                    vec = [float(x) for x in vec.strip("[]").split(",")]
                chunk["embedding_preview"] = [round(v, 4) for v in vec[:64]]
                chunk["dimensions"] = len(vec)
            chunks.append(chunk)

        return {"chunks": chunks}
    finally:
        conn.close()


@router.get("/explore/embed")
def explore_embed(q: str):
    """Return the embedding vector for a query string."""
    from rag.embedder import embed_query
    vec = embed_query(q)
    if vec is None:
        return {"query": q, "embedding": None, "dimensions": 0}
    return {"query": q, "embedding": [round(v, 6) for v in vec], "dimensions": len(vec)}


# --- Dashboard analytics ---

@router.get("/dashboard")
def dashboard():
    """Aggregated search analytics for the dashboard."""
    conn = get_connection()
    try:
        # Ensure query_log exists
        conn.execute("""CREATE TABLE IF NOT EXISTS query_log (
            id SERIAL PRIMARY KEY, query TEXT NOT NULL, results_count INTEGER,
            time_ms REAL, has_overview BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()
        )""")
        conn.commit()

        # Total queries
        total_queries = conn.execute("SELECT COUNT(*) FROM query_log").fetchone()[0]

        # Queries today
        queries_today = conn.execute(
            "SELECT COUNT(*) FROM query_log WHERE created_at > NOW() - INTERVAL '24 hours'"
        ).fetchone()[0]

        # Average latency
        avg_latency = conn.execute(
            "SELECT AVG(time_ms) FROM query_log WHERE created_at > NOW() - INTERVAL '24 hours'"
        ).fetchone()[0] or 0

        # Zero-result queries
        zero_results = conn.execute(
            "SELECT COUNT(*) FROM query_log WHERE results_count = 0 AND created_at > NOW() - INTERVAL '7 days'"
        ).fetchone()[0]

        # Popular queries (last 7 days)
        popular = conn.execute(
            """SELECT query, COUNT(*) as cnt, AVG(results_count) as avg_results, AVG(time_ms) as avg_ms
               FROM query_log WHERE created_at > NOW() - INTERVAL '7 days'
               GROUP BY query ORDER BY cnt DESC LIMIT 20"""
        ).fetchall()

        # Recent queries
        recent = conn.execute(
            "SELECT query, results_count, time_ms, created_at FROM query_log ORDER BY created_at DESC LIMIT 20"
        ).fetchall()

        # Corpus stats
        pages = conn.execute("SELECT COUNT(*) FROM pages").fetchone()[0]
        terms = conn.execute("SELECT COUNT(*) FROM terms").fetchone()[0]
        chunks = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        embedded = conn.execute("SELECT COUNT(*) FROM chunks WHERE embedding IS NOT NULL").fetchone()[0]

    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()
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
    from sports.detector import TEAM_MAP
    from sports.api import get_upcoming_fixtures
    if not team:
        return {"error": "team parameter required", "fixtures": []}
    team_id = TEAM_MAP.get(team.lower())
    if not team_id:
        return {"error": f"Unknown team: {team}", "fixtures": []}
    return {"team": team, "fixtures": get_upcoming_fixtures(team_id)}


@router.get("/sports/standings")
def sports_standings(league: str):
    """Get league standings."""
    from sports.detector import LEAGUE_MAP
    from sports.api import get_standings
    league_id = LEAGUE_MAP.get(league.lower())
    if not league_id:
        return {"error": f"Unknown league: {league}", "standings": []}
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
        pass
    finally:
        job_manager.unsubscribe(sub)

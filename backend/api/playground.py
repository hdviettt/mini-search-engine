"""Playground API — search explain, stats, crawl/index/embed control, WebSocket."""
import asyncio
import queue

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from db import get_connection
from search.explainer import search_explain
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
    interval_hours: float = 6.0


# --- Endpoints ---

@router.post("/search/explain")
def explain(req: ExplainRequest):
    conn = get_connection()
    result = search_explain(conn, req.q, req.params)
    conn.close()
    return result


@router.get("/stats")
def stats():
    conn = get_connection()

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

    conn.close()

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
    compute_pagerank(conn, damping=req.damping, iterations=req.iterations)
    conn.close()
    return {"status": "completed", "damping": req.damping, "iterations": req.iterations}


@router.post("/crawl/schedule")
def schedule_create(req: ScheduleRequest):
    """Create a new recurring crawl schedule."""
    schedule_id = crawl_scheduler.add(req.seed_urls, req.max_pages, req.interval_hours)
    return {"schedule_id": schedule_id, "status": "scheduled", "interval_hours": req.interval_hours}


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
    rows = conn.execute(
        """SELECT p.id, p.url, p.domain, p.title, p.status_code,
                  LENGTH(p.body_text) as text_length, p.crawled_at,
                  (SELECT COUNT(*) FROM links WHERE source_id = p.id) as outlinks
           FROM pages p ORDER BY p.id DESC LIMIT %s OFFSET %s""",
        (limit, offset),
    ).fetchall()
    total = conn.execute("SELECT COUNT(*) FROM pages").fetchone()[0]
    conn.close()

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
def explore_index(limit: int = 30):
    """Browse the inverted index — top terms by document frequency, with sample docs."""
    conn = get_connection()
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

    # For each term, fetch a few sample documents that contain it
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
    conn.close()

    return {
        "total_docs": total_docs,
        "total_terms": total_terms,
        "terms": terms_with_docs,
    }


@router.get("/explore/pagerank")
def explore_pagerank(limit: int = 20):
    """Top pages by PageRank score."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT p.id, p.title, p.url, pr.score,
                  (SELECT COUNT(*) FROM links l JOIN pages p2 ON p2.url = l.target_url WHERE p2.id = p.id) as inlinks
           FROM pagerank pr
           JOIN pages p ON pr.page_id = p.id
           ORDER BY pr.score DESC
           LIMIT %s""",
        (limit,),
    ).fetchall()
    conn.close()

    return {
        "pages": [
            {"id": r[0], "title": r[1], "url": r[2], "score": round(r[3], 6), "inlinks": r[4]}
            for r in rows
        ],
    }


@router.get("/explore/page/{page_id}")
def explore_page_journey(page_id: int):
    """Full journey of a single page through the search engine pipeline."""
    conn = get_connection()

    # Page info
    page = conn.execute(
        "SELECT id, url, domain, title, body_text, status_code, crawled_at FROM pages WHERE id = %s",
        (page_id,),
    ).fetchone()
    if not page:
        conn.close()
        return {"error": "Page not found"}

    body_text = page[4] or ""

    # Tokenization sample
    from indexer.tokenizer import tokenize
    tokens = tokenize(body_text[:2000])
    from collections import Counter
    top_terms = Counter(tokens).most_common(15)

    # Doc stats
    doc_stat = conn.execute("SELECT doc_length FROM doc_stats WHERE page_id = %s", (page_id,)).fetchone()

    # PageRank
    pr = conn.execute("SELECT score FROM pagerank WHERE page_id = %s", (page_id,)).fetchone()

    # Outlinks
    outlinks = conn.execute(
        """SELECT l.target_url, p2.title
           FROM links l LEFT JOIN pages p2 ON p2.url = l.target_url
           WHERE l.source_id = %s LIMIT 10""",
        (page_id,),
    ).fetchall()

    # Inlinks
    inlinks = conn.execute(
        """SELECT p2.id, p2.title
           FROM links l JOIN pages p2 ON p2.id = l.source_id
           WHERE l.target_url = (SELECT url FROM pages WHERE id = %s) LIMIT 10""",
        (page_id,),
    ).fetchall()

    # Chunks
    chunks = conn.execute(
        """SELECT id, chunk_idx, content, embedding IS NOT NULL as has_embedding
           FROM chunks WHERE page_id = %s ORDER BY chunk_idx""",
        (page_id,),
    ).fetchall()

    conn.close()

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


@router.get("/explore/chunks")
def explore_chunks(page_id: int | None = None, limit: int = 10):
    """Browse chunks — optionally filtered by page."""
    conn = get_connection()
    if page_id:
        rows = conn.execute(
            """SELECT c.id, c.page_id, c.chunk_idx, c.content, p.title,
                      c.embedding IS NOT NULL as has_embedding
               FROM chunks c JOIN pages p ON c.page_id = p.id
               WHERE c.page_id = %s ORDER BY c.chunk_idx LIMIT %s""",
            (page_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT c.id, c.page_id, c.chunk_idx, c.content, p.title,
                      c.embedding IS NOT NULL as has_embedding
               FROM chunks c JOIN pages p ON c.page_id = p.id
               ORDER BY c.id DESC LIMIT %s""",
            (limit,),
        ).fetchall()
    conn.close()

    return {
        "chunks": [
            {
                "id": r[0], "page_id": r[1], "chunk_idx": r[2],
                "content": r[3][:300], "title": r[4], "has_embedding": r[5],
            }
            for r in rows
        ],
    }


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

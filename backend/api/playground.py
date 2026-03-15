"""Playground API — search explain, stats, crawl/index/embed control, WebSocket."""
import asyncio
import queue

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from db import get_connection
from search.explainer import search_explain
from api.jobs import job_manager

router = APIRouter(prefix="/api")


# --- Request/Response models ---

class ExplainRequest(BaseModel):
    q: str
    params: dict | None = None


class CrawlRequest(BaseModel):
    seed_urls: list[str] = []
    max_pages: int = 100
    max_depth: int = 3


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
        job_id = job_manager.start_crawl(req.seed_urls, req.max_pages, req.max_depth)
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
    """Browse the inverted index — top terms by document frequency."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT t.term,
                  COUNT(p.page_id) as doc_freq,
                  SUM(p.term_freq) as total_freq
           FROM terms t
           JOIN postings p ON t.id = p.term_id
           GROUP BY t.id, t.term
           ORDER BY doc_freq DESC
           LIMIT %s""",
        (limit,),
    ).fetchall()

    corpus = conn.execute("SELECT value FROM corpus_stats WHERE key = 'total_docs'").fetchone()
    total_docs = int(corpus[0]) if corpus else 0
    total_terms = conn.execute("SELECT COUNT(*) FROM terms").fetchone()[0]
    conn.close()

    return {
        "total_docs": total_docs,
        "total_terms": total_terms,
        "terms": [
            {"term": r[0], "doc_freq": r[1], "total_freq": r[2]}
            for r in rows
        ],
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
    try:
        while True:
            try:
                msg = job_manager.message_queue.get_nowait()
                await websocket.send_json(msg)
            except queue.Empty:
                await asyncio.sleep(0.3)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass

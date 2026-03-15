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

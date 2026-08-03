import asyncio
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

import psycopg
from fastapi import Depends, FastAPI, Query, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse

from ai_overview.generator import generate_overview, generate_overview_stream
from api.playground import admin as admin_router
from api.playground import capture_stats_snapshot, websocket_jobs
from api.playground import router as playground_router
from db import close_pool, db_conn, get_db, init_db
from logging_config import setup_logging
from models import ChatRequest, OverviewResponse, SearchResponse
from search.engine import search

setup_logging()
log = logging.getLogger(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://search.hoangducviet.work")
SNAPSHOT_INTERVAL_SECONDS = 6 * 3600

_executor = ThreadPoolExecutor(max_workers=4)
_shutdown = threading.Event()


def _prewarm_reranker() -> None:
    try:
        from ranker.reranker import _get_model

        _get_model()
        log.info("Reranker model pre-warmed.")
    except Exception:
        log.warning("Reranker pre-warm failed", exc_info=True)


def _snapshot_loop() -> None:
    """Periodic stats snapshot.

    Waits on the shutdown event rather than sleeping, so the process exits
    promptly instead of hanging on a six-hour sleep. Backs off on repeated
    failures so a broken DB does not spin the log.
    """
    failures = 0
    while not _shutdown.is_set():
        try:
            capture_stats_snapshot()
            failures = 0
        except Exception:
            failures += 1
            log.error("Stats snapshot failed (%d in a row)", failures, exc_info=True)

        delay = SNAPSHOT_INTERVAL_SECONDS if failures == 0 else min(60 * 2**failures, SNAPSHOT_INTERVAL_SECONDS)
        if _shutdown.wait(delay):
            return


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Apply schema migrations on boot. Everything in init_db() is
    # CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, so it is
    # idempotent and additive.
    #
    # This exists because the production database never had the phase-2
    # migration applied — `python db.py` was a manual step somebody had to
    # remember. `pages.last_checked_at` was missing for months and every
    # /api/search raised UndefinedColumn. A deploy should heal its own schema.
    try:
        init_db()
    except Exception:
        log.error("Schema migration failed at startup", exc_info=True)

    threading.Thread(target=_prewarm_reranker, daemon=True, name="reranker-prewarm").start()

    try:
        from api.jobs import crawl_scheduler

        crawl_scheduler.load_from_db()
        crawl_scheduler.ensure_default_schedules()
    except Exception:
        log.error("Failed to load crawl schedules", exc_info=True)

    snapshot_thread = threading.Thread(target=_snapshot_loop, daemon=True, name="stats-snapshot")
    snapshot_thread.start()

    yield

    _shutdown.set()
    snapshot_thread.join(timeout=5)
    _executor.shutdown(wait=False)
    close_pool()
    log.info("Shutdown complete.")


app = FastAPI(
    title="Mini Search Engine",
    description="Crawling, indexing, ranking, neural reranking and AI Overviews — built from scratch.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "https://search.hoangducviet.work"],
    allow_origin_regex=r"https://.*\.(up\.railway\.app|hoangducviet\.work)",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(playground_router)
app.include_router(admin_router)


@app.websocket("/ws/jobs")
async def ws_jobs(websocket: WebSocket):
    await websocket_jobs(websocket)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
def home():
    """The UI is the Next.js frontend; this service is API-only."""
    return RedirectResponse(FRONTEND_URL)


@app.get("/api/search", response_model=SearchResponse)
def api_search(
    q: str = Query(""),
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    conn: psycopg.Connection = Depends(get_db),
):
    result = search(conn, q, page, per_page)
    try:
        conn.execute(
            "INSERT INTO query_log (query, results_count, time_ms) VALUES (%s, %s, %s)",
            (q, result.get("total_results", 0), result.get("time_ms", 0)),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        log.warning("Failed to log query %r", q, exc_info=True)
    return result


def _run_overview(q: str):
    with db_conn() as conn:
        return generate_overview(conn, q)


@app.get("/api/overview", response_model=OverviewResponse)
async def api_overview(q: str = Query("")):
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(_executor, _run_overview, q)
    if result:
        return {
            "query": q,
            "overview": result["overview"],
            "sources": result["sources"],
            "trace": result.get("trace", {}),
            "from_cache": result.get("from_cache", False),
        }
    return {"query": q, "overview": None, "sources": [], "trace": {}, "from_cache": False}


@app.get("/api/overview/stream")
def api_overview_stream(q: str = Query("")):
    def event_stream():
        with db_conn() as conn:
            yield from generate_overview_stream(conn, q)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/ai/chat")
def api_ai_chat(req: ChatRequest):
    from ai_overview.chat import generate_chat_stream

    def event_stream():
        yield from generate_chat_stream(req.messages)

    return StreamingResponse(event_stream(), media_type="text/event-stream")

"""Background job management for crawl, index, and embed operations."""
import datetime as dt
import threading
import queue
import uuid
import time

from db import get_connection
from crawler.manager import CrawlManager, is_quality_page
from crawler.fetcher import Fetcher
from crawler.parser import parse_page
from indexer.indexer import build_index, index_page, deindex_page
from ranker.pagerank import compute_pagerank
from rag.chunker import chunk_all_pages, chunk_page
from rag.embedder import embed_all_chunks


class JobManager:
    def __init__(self):
        self.jobs: dict[str, dict] = {}
        self.lock = threading.Lock()
        self.message_queue: queue.Queue = queue.Queue()  # legacy, kept for compat
        self._stop_events: dict[str, threading.Event] = {}
        self._subscribers: list[queue.Queue] = []
        self._sub_lock = threading.Lock()

    def get_jobs(self) -> list[dict]:
        with self.lock:
            return list(self.jobs.values())

    def subscribe(self) -> queue.Queue:
        """Create a new subscriber queue for a WebSocket connection."""
        q: queue.Queue = queue.Queue()
        with self._sub_lock:
            self._subscribers.append(q)
        return q

    def unsubscribe(self, q: queue.Queue):
        """Remove a subscriber queue."""
        with self._sub_lock:
            self._subscribers = [s for s in self._subscribers if s is not q]

    def _emit(self, msg: dict):
        self.message_queue.put(msg)  # legacy
        with self._sub_lock:
            subs = list(self._subscribers)
        for q in subs:
            try:
                q.put_nowait(msg)
            except queue.Full:
                pass
        if msg.get("type") in ("crawl_progress", "crawl_complete", "index_progress", "index_complete", "embed_progress", "embed_complete"):
            print(f"  [WS] Emitted {msg.get('type')} to {len(subs)} subscribers")

    def start_crawl(self, seed_urls: list[str], max_pages: int = 100, max_depth: int = 3, extra_domains: list[str] | None = None, restrict_domains: bool = True) -> str:
        # Only one crawl at a time
        with self.lock:
            for j in self.jobs.values():
                if j["type"] == "crawl" and j["status"] == "running":
                    raise RuntimeError("A crawl is already running")

        job_id = f"crawl-{uuid.uuid4().hex[:8]}"
        stop_event = threading.Event()
        self._stop_events[job_id] = stop_event

        def run():
            conn = get_connection()
            try:
                # Step 1: Crawl
                manager = CrawlManager(conn, extra_domains=extra_domains, restrict_domains=restrict_domains)
                if seed_urls:
                    manager.seed(seed_urls, clear_queue=True)

                def on_crawl_progress(data):
                    self._emit({"type": "crawl_progress", "job_id": job_id, "data": data})

                manager.crawl(
                    stop_event=stop_event,
                    max_pages_override=max_pages,
                    max_depth_override=max_depth,
                    progress_callback=on_crawl_progress,
                )
                self._emit({"type": "crawl_complete", "job_id": job_id, "data": {"status": "completed"}})

                if stop_event and stop_event.is_set():
                    with self.lock:
                        self.jobs[job_id]["status"] = "completed"
                    return

                # Step 2: PageRank (indexing + chunking already done per-page during crawl)
                compute_pagerank(conn)
                self._emit({"type": "index_complete", "job_id": job_id, "data": {"status": "completed"}})

                # Step 3: Embed
                def on_embed_progress(data):
                    self._emit({"type": "embed_progress", "job_id": job_id, "data": data})

                embed_all_chunks(conn, progress_callback=on_embed_progress)
                self._emit({"type": "embed_complete", "job_id": job_id, "data": {"status": "completed"}})

                with self.lock:
                    self.jobs[job_id]["status"] = "completed"
                self._emit({"type": "build_complete", "job_id": job_id, "data": {"status": "completed"}})
            except Exception as e:
                with self.lock:
                    self.jobs[job_id]["status"] = "failed"
                self._emit({"type": "crawl_complete", "job_id": job_id, "data": {"status": "failed", "error": str(e)}})
            finally:
                conn.close()

        thread = threading.Thread(target=run, daemon=True)
        with self.lock:
            self.jobs[job_id] = {"job_id": job_id, "type": "crawl", "status": "running", "started_at": time.time()}
        thread.start()
        return job_id

    def stop_crawl(self, job_id: str):
        if job_id in self._stop_events:
            self._stop_events[job_id].set()

    def start_index_rebuild(self) -> str:
        """Re-index all live pages incrementally — no downtime, search stays available."""
        job_id = f"index-{uuid.uuid4().hex[:8]}"

        def run():
            conn = get_connection()
            try:
                pages = conn.execute(
                    "SELECT id, title, body_text FROM pages WHERE is_dead = false ORDER BY id"
                ).fetchall()
                total = len(pages)

                for i, (page_id, title, body_text) in enumerate(pages):
                    index_page(conn, page_id, title or "", body_text or "")
                    conn.execute("UPDATE pages SET indexed_at = NOW() WHERE id = %s", (page_id,))
                    conn.commit()

                    if (i + 1) % 10 == 0:
                        self._emit({"type": "index_progress", "job_id": job_id, "data": {
                            "pages_done": i + 1, "pages_total": total,
                            "title": (title or "")[:60],
                        }})

                compute_pagerank(conn)

                with self.lock:
                    self.jobs[job_id]["status"] = "completed"
                self._emit({"type": "index_complete", "job_id": job_id, "data": {
                    "status": "completed", "pages_indexed": total,
                }})
            except Exception as e:
                with self.lock:
                    self.jobs[job_id]["status"] = "failed"
                self._emit({"type": "index_complete", "job_id": job_id, "data": {"status": "failed", "error": str(e)}})
            finally:
                conn.close()

        thread = threading.Thread(target=run, daemon=True)
        with self.lock:
            self.jobs[job_id] = {"job_id": job_id, "type": "index", "status": "running", "started_at": time.time()}
        thread.start()
        return job_id

    def start_embed_rebuild(self) -> str:
        job_id = f"embed-{uuid.uuid4().hex[:8]}"

        def run():
            conn = get_connection()
            try:
                def on_progress(data):
                    self._emit({"type": "embed_progress", "job_id": job_id, "data": data})

                chunk_all_pages(conn)
                embed_all_chunks(conn, progress_callback=on_progress)

                with self.lock:
                    self.jobs[job_id]["status"] = "completed"
                self._emit({"type": "embed_complete", "job_id": job_id, "data": {"status": "completed"}})
            except Exception as e:
                with self.lock:
                    self.jobs[job_id]["status"] = "failed"
                self._emit({"type": "embed_complete", "job_id": job_id, "data": {"status": "failed", "error": str(e)}})
            finally:
                conn.close()

        thread = threading.Thread(target=run, daemon=True)
        with self.lock:
            self.jobs[job_id] = {"job_id": job_id, "type": "embed", "status": "running", "started_at": time.time()}
        thread.start()
        return job_id

    def start_refresh(self) -> str:
        """Re-crawl all live pages with the current parser, track dead pages, re-index changed content."""
        with self.lock:
            for j in self.jobs.values():
                if j["type"] == "refresh" and j["status"] == "running":
                    raise RuntimeError("A refresh is already running")

        job_id = f"refresh-{uuid.uuid4().hex[:8]}"
        stop_event = threading.Event()
        self._stop_events[job_id] = stop_event

        def run():
            conn = get_connection()
            fetcher = Fetcher()
            try:
                rows = conn.execute(
                    "SELECT id, url FROM pages WHERE is_dead = false ORDER BY id"
                ).fetchall()
                total = len(rows)
                refreshed = 0
                failed = 0
                deindexed = 0

                self._emit({"type": "refresh_progress", "job_id": job_id, "data": {
                    "refreshed": 0, "failed": 0, "deindexed": 0, "total": total, "status": "starting",
                }})

                for page_id, url in rows:
                    if stop_event.is_set():
                        break

                    response = fetcher.fetch(url)
                    if response is None or response.status_code >= 400:
                        failed += 1
                        conn.execute(
                            """UPDATE pages
                               SET consecutive_failures = consecutive_failures + 1,
                                   last_checked_at = NOW(),
                                   is_dead = (consecutive_failures + 1 >= 3)
                               WHERE id = %s""",
                            (page_id,),
                        )
                        conn.commit()
                        dead_row = conn.execute(
                            "SELECT is_dead FROM pages WHERE id = %s", (page_id,)
                        ).fetchone()
                        if dead_row and dead_row[0]:
                            deindex_page(conn, page_id)
                            deindexed += 1
                        self._emit({"type": "refresh_progress", "job_id": job_id, "data": {
                            "refreshed": refreshed, "failed": failed, "deindexed": deindexed,
                            "total": total, "current_url": url, "status": "failed",
                        }})
                        continue

                    parsed = parse_page(url, response.text)
                    conn.execute(
                        """UPDATE pages SET title = %s, body_text = %s, content_hash = %s,
                                  last_checked_at = NOW(), consecutive_failures = 0
                           WHERE id = %s""",
                        (parsed["title"], parsed["body_text"], parsed["content_hash"], page_id),
                    )
                    conn.commit()

                    if is_quality_page(conn, page_id, parsed["title"], parsed["body_text"], parsed["content_hash"]):
                        index_page(conn, page_id, parsed["title"], parsed["body_text"])
                        conn.execute("UPDATE pages SET indexed_at = NOW() WHERE id = %s", (page_id,))
                        conn.commit()
                        chunk_page(conn, page_id, parsed["title"], parsed["body_text"])

                    refreshed += 1
                    self._emit({"type": "refresh_progress", "job_id": job_id, "data": {
                        "refreshed": refreshed, "failed": failed, "deindexed": deindexed,
                        "total": total, "current_url": url,
                        "title": (parsed["title"] or "")[:80], "status": "ok",
                    }})

                compute_pagerank(conn)

                with self.lock:
                    self.jobs[job_id]["status"] = "completed"
                self._emit({"type": "refresh_complete", "job_id": job_id, "data": {
                    "refreshed": refreshed, "failed": failed, "deindexed": deindexed,
                    "total": total, "status": "completed",
                }})
            except Exception as e:
                with self.lock:
                    self.jobs[job_id]["status"] = "failed"
                self._emit({"type": "refresh_complete", "job_id": job_id, "data": {
                    "status": "failed", "error": str(e),
                }})
            finally:
                fetcher.close()
                conn.close()

        thread = threading.Thread(target=run, daemon=True)
        with self.lock:
            self.jobs[job_id] = {"job_id": job_id, "type": "refresh", "status": "running", "started_at": time.time()}
        thread.start()
        return job_id


job_manager = JobManager()


class CrawlScheduler:
    """Recurring crawl scheduler with PostgreSQL persistence.

    Strategies:
      - 'seed': Crawl seed URLs to discover new content (max_depth, max_pages apply)
      - 'top_pagerank': Re-crawl top N pages by PageRank score (keeps important content fresh)
    """

    def __init__(self, job_manager: JobManager):
        self.job_manager = job_manager
        self._timers: dict[str, threading.Timer] = {}
        self.lock = threading.Lock()

    def load_from_db(self):
        """Load active schedules from DB and start their timers. Called on startup."""
        conn = get_connection()
        try:
            conn.execute("""CREATE TABLE IF NOT EXISTS crawl_schedules (
                id TEXT PRIMARY KEY, strategy TEXT NOT NULL DEFAULT 'seed',
                seed_urls TEXT[] NOT NULL DEFAULT '{}', max_pages INTEGER NOT NULL DEFAULT 50,
                max_depth INTEGER NOT NULL DEFAULT 1, interval_hours REAL NOT NULL DEFAULT 24.0,
                enabled BOOLEAN NOT NULL DEFAULT true, last_run_at TIMESTAMPTZ,
                next_run_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW()
            )""")
            conn.commit()
        except Exception:
            conn.rollback()

        rows = conn.execute(
            "SELECT id, next_run_at FROM crawl_schedules WHERE enabled = true"
        ).fetchall()
        conn.close()

        now = dt.datetime.now(dt.timezone.utc)
        for schedule_id, next_run_at in rows:
            if next_run_at:
                remaining = (next_run_at - now).total_seconds()
                delay = max(1.0, remaining)
            else:
                delay = None  # will use full interval
            self._start_timer(schedule_id, delay_seconds=delay)
        if rows:
            print(f"Loaded {len(rows)} active crawl schedule(s) from DB.")

    def ensure_default_schedules(self):
        """Create default schedules if none exist. Called once on startup."""
        conn = get_connection()
        try:
            existing = conn.execute("SELECT COUNT(*) FROM crawl_schedules").fetchone()[0]
        finally:
            conn.close()

        if existing > 0:
            return  # User has configured their own schedules

        print("[scheduler] No schedules found. Creating defaults...")

        # Weekly: re-crawl top 50 pages by PageRank to keep high-value content fresh
        self.add(
            seed_urls=[],
            max_pages=50,
            interval_hours=168.0,  # 7 days
            strategy="top_pagerank",
            max_depth=0,
        )

        # Daily: discover new content from seed URLs
        from config import SEED_URLS
        self.add(
            seed_urls=SEED_URLS,
            max_pages=30,
            interval_hours=24.0,
            strategy="seed",
            max_depth=1,
        )

        print("[scheduler] Created 2 default schedules (weekly top-pagerank refresh, daily seed discovery).")

    def add(self, seed_urls: list[str], max_pages: int, interval_hours: float,
            strategy: str = "seed", max_depth: int = 1) -> str:
        schedule_id = f"sched-{uuid.uuid4().hex[:8]}"
        next_run = time.time() + interval_hours * 3600

        conn = get_connection()
        try:
            conn.execute(
                """INSERT INTO crawl_schedules (id, strategy, seed_urls, max_pages, max_depth, interval_hours, next_run_at)
                   VALUES (%s, %s, %s, %s, %s, %s, to_timestamp(%s))""",
                (schedule_id, strategy, seed_urls, max_pages, max_depth, interval_hours, next_run),
            )
            conn.commit()
        finally:
            conn.close()

        self._start_timer(schedule_id)
        return schedule_id

    def remove(self, schedule_id: str):
        with self.lock:
            timer = self._timers.pop(schedule_id, None)
        if timer:
            timer.cancel()

        conn = get_connection()
        try:
            conn.execute("DELETE FROM crawl_schedules WHERE id = %s", (schedule_id,))
            conn.commit()
        finally:
            conn.close()

    def toggle(self, schedule_id: str, enabled: bool):
        conn = get_connection()
        try:
            conn.execute("UPDATE crawl_schedules SET enabled = %s WHERE id = %s", (enabled, schedule_id))
            conn.commit()
        finally:
            conn.close()

        if enabled:
            self._start_timer(schedule_id)
        else:
            with self.lock:
                timer = self._timers.pop(schedule_id, None)
            if timer:
                timer.cancel()

    def list_schedules(self) -> list[dict]:
        conn = get_connection()
        try:
            rows = conn.execute(
                """SELECT id, strategy, seed_urls, max_pages, max_depth, interval_hours,
                          enabled, last_run_at, next_run_at FROM crawl_schedules ORDER BY created_at"""
            ).fetchall()
        finally:
            conn.close()
        return [
            {
                "id": r[0], "strategy": r[1], "seed_urls": r[2], "max_pages": r[3],
                "max_depth": r[4], "interval_hours": r[5], "enabled": r[6],
                "last_run": str(r[7]) if r[7] else None,
                "next_run": str(r[8]) if r[8] else None,
            }
            for r in rows
        ]

    def _start_timer(self, schedule_id: str, delay_seconds: float | None = None):
        with self.lock:
            old = self._timers.pop(schedule_id, None)
        if old:
            old.cancel()

        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT interval_hours, enabled FROM crawl_schedules WHERE id = %s", (schedule_id,)
            ).fetchone()

            if not row or not row[1]:
                return

            interval_seconds = row[0] * 3600
            actual_delay = max(1.0, delay_seconds if delay_seconds is not None else interval_seconds)

            timer = threading.Timer(actual_delay, self._run_scheduled, args=[schedule_id])
            timer.daemon = True
            timer.start()

            with self.lock:
                self._timers[schedule_id] = timer

            if delay_seconds is None:
                conn.execute(
                    "UPDATE crawl_schedules SET next_run_at = to_timestamp(%s) WHERE id = %s",
                    (time.time() + actual_delay, schedule_id),
                )
                conn.commit()
        finally:
            conn.close()

    def _run_scheduled(self, schedule_id: str):
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT strategy, seed_urls, max_pages, max_depth, enabled FROM crawl_schedules WHERE id = %s",
                (schedule_id,),
            ).fetchone()
            if not row or not row[4]:
                return

            strategy, seed_urls, max_pages, max_depth, _ = row
            print(f"[scheduler] Running schedule {schedule_id} (strategy={strategy}, max_pages={max_pages})")

            try:
                if strategy == "top_pagerank":
                    from crawler.fetcher import Fetcher
                    from crawler.parser import parse_page
                    from crawler.manager import is_quality_page

                    top_rows = conn.execute(
                        """SELECT p.id, p.url FROM pagerank pr
                           JOIN pages p ON pr.page_id = p.id
                           ORDER BY pr.score DESC LIMIT %s""",
                        (max_pages,),
                    ).fetchall()

                    fetcher = Fetcher()
                    refreshed = 0
                    try:
                        for page_id, url in top_rows:
                            response = fetcher.fetch(url)
                            if response is None or response.status_code >= 400:
                                conn.execute(
                                    """UPDATE pages
                                       SET consecutive_failures = consecutive_failures + 1,
                                           last_checked_at = NOW(),
                                           is_dead = (consecutive_failures + 1 >= 3)
                                       WHERE id = %s""",
                                    (page_id,),
                                )
                                conn.commit()
                                dead_row = conn.execute(
                                    "SELECT is_dead FROM pages WHERE id = %s", (page_id,)
                                ).fetchone()
                                if dead_row and dead_row[0]:
                                    deindex_page(conn, page_id)
                                continue
                            parsed = parse_page(url, response.text)
                            conn.execute(
                                """UPDATE pages SET title=%s, body_text=%s, content_hash=%s,
                                          last_checked_at=NOW(), consecutive_failures=0
                                   WHERE id=%s""",
                                (parsed["title"], parsed["body_text"], parsed["content_hash"], page_id),
                            )
                            conn.commit()
                            if is_quality_page(conn, page_id, parsed["title"], parsed["body_text"], parsed["content_hash"]):
                                index_page(conn, page_id, parsed["title"], parsed["body_text"])
                                conn.execute("UPDATE pages SET indexed_at = NOW() WHERE id = %s", (page_id,))
                                conn.commit()
                                chunk_page(conn, page_id, parsed["title"], parsed["body_text"])
                            refreshed += 1
                    finally:
                        fetcher.close()
                    print(f"[scheduler] Refreshed {refreshed}/{len(top_rows)} top PageRank pages")

                else:
                    manager = CrawlManager(conn)
                    if seed_urls:
                        manager.seed(seed_urls)
                    stop_event = threading.Event()
                    manager.crawl(stop_event=stop_event, max_pages_override=max_pages, max_depth_override=max_depth)

                compute_pagerank(conn)

            except Exception as e:
                print(f"[scheduler] Schedule {schedule_id} failed: {e}")

            conn.execute(
                "UPDATE crawl_schedules SET last_run_at = NOW() WHERE id = %s", (schedule_id,)
            )
            conn.commit()
        finally:
            conn.close()

        self._start_timer(schedule_id)


crawl_scheduler = CrawlScheduler(job_manager)

"""Background job management for crawl, index, and embed operations."""
import threading
import queue
import uuid
import time

from db import get_connection
from crawler.manager import CrawlManager
from crawler.fetcher import Fetcher
from crawler.parser import parse_page
from indexer.indexer import build_index, index_page
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
            try:
                conn = get_connection()

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
                    conn.close()
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

                conn.close()

                with self.lock:
                    self.jobs[job_id]["status"] = "completed"
                self._emit({"type": "build_complete", "job_id": job_id, "data": {"status": "completed"}})
            except Exception as e:
                with self.lock:
                    self.jobs[job_id]["status"] = "failed"
                self._emit({"type": "crawl_complete", "job_id": job_id, "data": {"status": "failed", "error": str(e)}})

        thread = threading.Thread(target=run, daemon=True)
        with self.lock:
            self.jobs[job_id] = {"job_id": job_id, "type": "crawl", "status": "running", "started_at": time.time()}
        thread.start()
        return job_id

    def stop_crawl(self, job_id: str):
        if job_id in self._stop_events:
            self._stop_events[job_id].set()

    def start_index_rebuild(self) -> str:
        job_id = f"index-{uuid.uuid4().hex[:8]}"

        def run():
            try:
                conn = get_connection()

                def on_progress(data):
                    self._emit({"type": "index_progress", "job_id": job_id, "data": data})

                build_index(conn, progress_callback=on_progress)
                compute_pagerank(conn)
                conn.close()

                with self.lock:
                    self.jobs[job_id]["status"] = "completed"
                self._emit({"type": "index_complete", "job_id": job_id, "data": {"status": "completed"}})
            except Exception as e:
                with self.lock:
                    self.jobs[job_id]["status"] = "failed"
                self._emit({"type": "index_complete", "job_id": job_id, "data": {"status": "failed", "error": str(e)}})

        thread = threading.Thread(target=run, daemon=True)
        with self.lock:
            self.jobs[job_id] = {"job_id": job_id, "type": "index", "status": "running", "started_at": time.time()}
        thread.start()
        return job_id

    def start_embed_rebuild(self) -> str:
        job_id = f"embed-{uuid.uuid4().hex[:8]}"

        def run():
            try:
                conn = get_connection()

                def on_progress(data):
                    self._emit({"type": "embed_progress", "job_id": job_id, "data": data})

                chunk_all_pages(conn)
                embed_all_chunks(conn, progress_callback=on_progress)
                conn.close()

                with self.lock:
                    self.jobs[job_id]["status"] = "completed"
                self._emit({"type": "embed_complete", "job_id": job_id, "data": {"status": "completed"}})
            except Exception as e:
                with self.lock:
                    self.jobs[job_id]["status"] = "failed"
                self._emit({"type": "embed_complete", "job_id": job_id, "data": {"status": "failed", "error": str(e)}})

        thread = threading.Thread(target=run, daemon=True)
        with self.lock:
            self.jobs[job_id] = {"job_id": job_id, "type": "embed", "status": "running", "started_at": time.time()}
        thread.start()
        return job_id

    def start_refresh(self) -> str:
        """Re-crawl all existing pages with the current parser, then re-index and re-chunk."""
        with self.lock:
            for j in self.jobs.values():
                if j["type"] == "refresh" and j["status"] == "running":
                    raise RuntimeError("A refresh is already running")

        job_id = f"refresh-{uuid.uuid4().hex[:8]}"
        stop_event = threading.Event()
        self._stop_events[job_id] = stop_event

        def run():
            try:
                conn = get_connection()
                fetcher = Fetcher()

                # Get all existing page URLs
                rows = conn.execute("SELECT id, url FROM pages ORDER BY id").fetchall()
                total = len(rows)
                refreshed = 0
                failed = 0

                self._emit({"type": "refresh_progress", "job_id": job_id, "data": {
                    "refreshed": 0, "failed": 0, "total": total, "status": "starting",
                }})

                for page_id, url in rows:
                    if stop_event.is_set():
                        break

                    response = fetcher.fetch(url)
                    if response is None or response.status_code >= 400:
                        failed += 1
                        self._emit({"type": "refresh_progress", "job_id": job_id, "data": {
                            "refreshed": refreshed, "failed": failed, "total": total,
                            "current_url": url, "status": "failed",
                        }})
                        continue

                    parsed = parse_page(url, response.text)

                    # Update page content
                    conn.execute(
                        """UPDATE pages SET title = %s, body_text = %s, content_hash = %s, crawled_at = NOW()
                           WHERE id = %s""",
                        (parsed["title"], parsed["body_text"], parsed["content_hash"], page_id),
                    )
                    conn.commit()

                    # Re-index and re-chunk with new content
                    index_page(conn, page_id, parsed["title"], parsed["body_text"])
                    chunk_page(conn, page_id, parsed["title"], parsed["body_text"])

                    refreshed += 1
                    self._emit({"type": "refresh_progress", "job_id": job_id, "data": {
                        "refreshed": refreshed, "failed": failed, "total": total,
                        "current_url": url, "title": (parsed["title"] or "")[:80],
                        "status": "ok",
                    }})

                fetcher.close()

                # Recompute PageRank after refresh
                compute_pagerank(conn)

                conn.close()

                with self.lock:
                    self.jobs[job_id]["status"] = "completed"
                self._emit({"type": "refresh_complete", "job_id": job_id, "data": {
                    "refreshed": refreshed, "failed": failed, "total": total, "status": "completed",
                }})
            except Exception as e:
                with self.lock:
                    self.jobs[job_id]["status"] = "failed"
                self._emit({"type": "refresh_complete", "job_id": job_id, "data": {
                    "status": "failed", "error": str(e),
                }})

        thread = threading.Thread(target=run, daemon=True)
        with self.lock:
            self.jobs[job_id] = {"job_id": job_id, "type": "refresh", "status": "running", "started_at": time.time()}
        thread.start()
        return job_id


job_manager = JobManager()


class CrawlScheduler:
    """Simple recurring crawl scheduler using threading.Timer."""

    def __init__(self, job_manager: JobManager):
        self.job_manager = job_manager
        self.schedules: dict[str, dict] = {}
        self.lock = threading.Lock()

    def add(self, seed_urls: list[str], max_pages: int, interval_hours: float) -> str:
        schedule_id = f"sched-{uuid.uuid4().hex[:8]}"
        with self.lock:
            schedule = {
                "id": schedule_id,
                "seed_urls": seed_urls,
                "max_pages": max_pages,
                "interval_hours": interval_hours,
                "enabled": True,
                "timer": None,
                "last_run": None,
                "next_run": time.time() + interval_hours * 3600,
            }
            self.schedules[schedule_id] = schedule
        self._start_timer(schedule_id)
        return schedule_id

    def remove(self, schedule_id: str):
        with self.lock:
            schedule = self.schedules.pop(schedule_id, None)
        if schedule and schedule["timer"] is not None:
            schedule["timer"].cancel()

    def toggle(self, schedule_id: str, enabled: bool):
        with self.lock:
            schedule = self.schedules.get(schedule_id)
            if not schedule:
                return
            schedule["enabled"] = enabled
        if enabled:
            self._start_timer(schedule_id)
        else:
            with self.lock:
                timer = schedule.get("timer")
            if timer is not None:
                timer.cancel()
                with self.lock:
                    schedule["timer"] = None
                    schedule["next_run"] = None

    def list_schedules(self) -> list[dict]:
        with self.lock:
            return [
                {
                    "id": s["id"],
                    "seed_urls": s["seed_urls"],
                    "max_pages": s["max_pages"],
                    "interval_hours": s["interval_hours"],
                    "enabled": s["enabled"],
                    "last_run": s["last_run"],
                    "next_run": s["next_run"],
                }
                for s in self.schedules.values()
            ]

    def _start_timer(self, schedule_id: str):
        with self.lock:
            schedule = self.schedules.get(schedule_id)
            if not schedule or not schedule["enabled"]:
                return
            # Cancel any existing timer
            if schedule["timer"] is not None:
                schedule["timer"].cancel()
            interval_seconds = schedule["interval_hours"] * 3600
            schedule["next_run"] = time.time() + interval_seconds
            timer = threading.Timer(interval_seconds, self._run_scheduled, args=[schedule_id])
            timer.daemon = True
            timer.start()
            schedule["timer"] = timer

    def _run_scheduled(self, schedule_id: str):
        with self.lock:
            schedule = self.schedules.get(schedule_id)
            if not schedule or not schedule["enabled"]:
                return
            seed_urls = schedule["seed_urls"]
            max_pages = schedule["max_pages"]

        try:
            # Run crawl
            conn = get_connection()
            manager = CrawlManager(conn)
            if seed_urls:
                manager.seed(seed_urls)
            stop_event = threading.Event()
            manager.crawl(stop_event=stop_event, max_pages_override=max_pages)
            # Re-index
            build_index(conn)
            # Re-compute pagerank
            compute_pagerank(conn)
            conn.close()
        except Exception as e:
            print(f"Scheduled crawl {schedule_id} failed: {e}")

        with self.lock:
            schedule = self.schedules.get(schedule_id)
            if schedule:
                schedule["last_run"] = time.time()

        # Reschedule the next run
        self._start_timer(schedule_id)


crawl_scheduler = CrawlScheduler(job_manager)

"""Background job management for crawl, index, and embed operations."""
import threading
import queue
import uuid
import time

from db import get_connection
from crawler.manager import CrawlManager
from indexer.indexer import build_index
from ranker.pagerank import compute_pagerank
from rag.chunker import chunk_all_pages
from rag.embedder import embed_all_chunks


class JobManager:
    def __init__(self):
        self.jobs: dict[str, dict] = {}
        self.lock = threading.Lock()
        self.message_queue: queue.Queue = queue.Queue()
        self._stop_events: dict[str, threading.Event] = {}

    def get_jobs(self) -> list[dict]:
        with self.lock:
            return list(self.jobs.values())

    def _emit(self, msg: dict):
        self.message_queue.put(msg)

    def start_crawl(self, seed_urls: list[str], max_pages: int = 100, max_depth: int = 3) -> str:
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
                manager = CrawlManager(conn)
                if seed_urls:
                    manager.seed(seed_urls)

                def on_progress(data):
                    self._emit({"type": "crawl_progress", "job_id": job_id, "data": data})

                manager.crawl(
                    stop_event=stop_event,
                    max_pages_override=max_pages,
                    max_depth_override=max_depth,
                    progress_callback=on_progress,
                )
                conn.close()

                with self.lock:
                    self.jobs[job_id]["status"] = "completed"
                self._emit({"type": "crawl_complete", "job_id": job_id, "data": {"status": "completed"}})
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

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

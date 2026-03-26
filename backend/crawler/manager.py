import re
from urllib.parse import urlparse

import psycopg

from config import ALLOWED_DOMAINS, ALLOWED_PATH_PATTERNS, BLOCKED_DOMAINS, MAX_PAGES, MAX_DEPTH
from crawler.fetcher import Fetcher
from crawler.parser import parse_page
from indexer.indexer import index_page
from rag.chunker import chunk_page


# Titles that indicate error/placeholder pages
_BAD_TITLES = {
    "page not found", "404", "error", "not found", "access denied",
    "403 forbidden", "untitled", "redirect", "loading", "just a moment",
}

# Patterns in body_text that indicate a redirect or soft-404
_REDIRECT_PATTERNS = re.compile(
    r"(you are being redirected|this page has moved|click here if you are not redirected|"
    r"301 moved permanently|302 found|if you are not redirected)",
    re.IGNORECASE,
)


def is_quality_page(conn: psycopg.Connection, page_id: int, title: str, body_text: str, content_hash: str) -> bool:
    """Return True if the page is worth indexing. Logs reason when skipping."""
    title = title or ""
    body_text = body_text or ""

    # 1. Minimum content length (100 words)
    word_count = len(body_text.split())
    if word_count < 100:
        print(f"  [quality] skip page {page_id}: only {word_count} words (min 100)")
        return False

    # 2. Title quality
    if not title or title.lower().strip() in _BAD_TITLES:
        print(f"  [quality] skip page {page_id}: bad title '{title}'")
        return False

    # 3. Redirect detection
    if _REDIRECT_PATTERNS.search(body_text[:1000]):
        print(f"  [quality] skip page {page_id}: redirect/soft-404 detected")
        return False

    # 4. Content-hash dedup (different URL, same content)
    dup = conn.execute(
        "SELECT id FROM pages WHERE content_hash = %s AND id != %s LIMIT 1",
        (content_hash, page_id),
    ).fetchone()
    if dup:
        print(f"  [quality] skip page {page_id}: duplicate of page {dup[0]}")
        return False

    return True


class CrawlManager:
    def __init__(self, conn: psycopg.Connection, extra_domains: list[str] | None = None, restrict_domains: bool = True):
        self.conn = conn
        self.fetcher = Fetcher()
        self.restrict_domains = restrict_domains
        self.allowed_domains = set(ALLOWED_DOMAINS)
        if extra_domains:
            self.allowed_domains.update(extra_domains)

    def seed(self, urls: list[str], clear_queue: bool = False):
        """Add seed URLs to the crawl queue."""
        if clear_queue:
            self.conn.execute("DELETE FROM crawl_queue WHERE status = 'pending'")
            self.conn.commit()
            print("Cleared pending queue.")
        for url in urls:
            self.conn.execute(
                "INSERT INTO crawl_queue (url, depth) VALUES (%s, 0) ON CONFLICT (url) DO NOTHING",
                (url,),
            )
        self.conn.commit()
        print(f"Seeded {len(urls)} URLs.")

    def _is_in_scope(self, url: str) -> bool:
        """Check if URL belongs to an allowed domain and matches allowed paths."""
        parsed = urlparse(url)
        domain = parsed.netloc
        path = parsed.path

        # Block spam domains
        if domain in BLOCKED_DOMAINS:
            return False

        # If domain restriction is off, allow everything (except blocked)
        if not self.restrict_domains:
            return True

        # Must be in allowed domains
        if domain not in self.allowed_domains:
            return False

        # Must match at least one allowed path pattern
        for pattern in ALLOWED_PATH_PATTERNS:
            if pattern in path:
                return True

        return False

    def _get_next_url(self) -> tuple[str, int] | None:
        """Pop the next pending URL from the queue."""
        row = self.conn.execute(
            "SELECT id, url, depth FROM crawl_queue WHERE status = 'pending' ORDER BY id LIMIT 1"
        ).fetchone()
        if row is None:
            return None
        queue_id, url, depth = row
        self.conn.execute(
            "UPDATE crawl_queue SET status = 'crawling' WHERE id = %s", (queue_id,)
        )
        self.conn.commit()
        return url, depth

    def _count_crawled(self) -> int:
        row = self.conn.execute(
            "SELECT COUNT(*) FROM pages"
        ).fetchone()
        return row[0]

    def _page_already_crawled(self, url: str) -> bool:
        row = self.conn.execute(
            "SELECT 1 FROM pages WHERE url = %s", (url,)
        ).fetchone()
        return row is not None

    def _store_page(self, url: str, status_code: int, parsed: dict) -> int:
        """Store a crawled page and return its ID."""
        row = self.conn.execute(
            """INSERT INTO pages (url, domain, title, body_text, status_code, content_hash)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (url) DO NOTHING
               RETURNING id""",
            (
                url,
                urlparse(url).netloc,
                parsed["title"],
                parsed["body_text"],
                status_code,
                parsed["content_hash"],
            ),
        ).fetchone()
        if row is None:
            row = self.conn.execute(
                "SELECT id FROM pages WHERE url = %s", (url,)
            ).fetchone()
        return row[0]

    def _store_links_and_enqueue(self, source_id: int, links: set[str], depth: int):
        """Store links and add in-scope ones to crawl queue."""
        for link_url in links:
            # Store the link relationship
            self.conn.execute(
                """INSERT INTO links (source_id, target_url)
                   VALUES (%s, %s) ON CONFLICT DO NOTHING""",
                (source_id, link_url),
            )

            # Enqueue if in scope and within depth limit
            if self._is_in_scope(link_url) and depth + 1 <= MAX_DEPTH:
                self.conn.execute(
                    """INSERT INTO crawl_queue (url, depth)
                       VALUES (%s, %s) ON CONFLICT (url) DO NOTHING""",
                    (link_url, depth + 1),
                )

    def _mark_queue_status(self, url: str, status: str):
        self.conn.execute(
            "UPDATE crawl_queue SET status = %s WHERE url = %s",
            (status, url),
        )
        self.conn.commit()

    def _count_pending(self) -> int:
        row = self.conn.execute(
            "SELECT COUNT(*) FROM crawl_queue WHERE status = 'pending'"
        ).fetchone()
        return row[0]

    def crawl(self, stop_event=None, max_pages_override=None, max_depth_override=None, progress_callback=None):
        """Main crawl loop — BFS through the queue until limits are hit.

        max_pages is the number of NEW pages to crawl this session (not total in DB).
        """
        max_pages = max_pages_override or MAX_PAGES
        max_depth = max_depth_override or MAX_DEPTH
        pages_this_session = 0
        print(f"Starting crawl (max {max_pages} new pages, max depth {max_depth})...")
        print(f"Domains: {', '.join(self.allowed_domains) if self.restrict_domains else 'ALL (unrestricted)'}")

        while True:
            # Check stop signal
            if stop_event and stop_event.is_set():
                print("\nCrawl stopped by user.")
                break

            if pages_this_session >= max_pages:
                print(f"\nReached page limit ({max_pages}). Stopping.")
                break

            next_item = self._get_next_url()
            if next_item is None:
                print("\nQueue empty. Stopping.")
                break

            url, depth = next_item

            if depth > max_depth:
                self._mark_queue_status(url, "skipped")
                continue

            if self._page_already_crawled(url):
                self._mark_queue_status(url, "skipped")
                continue

            # Fetch
            pages_this_session += 1
            domain = urlparse(url).netloc
            print(f"[{pages_this_session}/{max_pages}] depth={depth} [{domain}] {url}")
            response = self.fetcher.fetch(url)

            if response is None:
                self._mark_queue_status(url, "failed")
                if progress_callback:
                    progress_callback({
                        "pages_crawled": pages_this_session,
                        "max_pages": max_pages,
                        "queue_size": self._count_pending(),
                        "current_url": url,
                        "title": "",
                        "text_length": 0,
                        "links_found": 0,
                        "status_code": 0,
                        "status": "failed",
                    })
                continue

            # Parse
            parsed = parse_page(url, response.text)
            body_len = len(parsed["body_text"])
            links_count = len(parsed["links"])

            # Detect JS-rendered pages (empty body, no links)
            status = "ok"
            if body_len < 500 and links_count == 0:
                status = "js_only"
                print(f"  Warning: {url} returned minimal content ({body_len} chars, 0 links) — likely JS-rendered")

            # Store page
            page_id = self._store_page(url, response.status_code, parsed)

            # Store links and enqueue new URLs (even for low-quality pages — links still matter for PageRank)
            self._store_links_and_enqueue(page_id, parsed["links"], depth)

            # Quality gate — only index pages worth searching
            if is_quality_page(self.conn, page_id, parsed["title"], parsed["body_text"], parsed["content_hash"]):
                index_page(self.conn, page_id, parsed["title"], parsed["body_text"])
                chunk_page(self.conn, page_id, parsed["title"], parsed["body_text"])
            else:
                status = "low_quality"

            # Mark as crawled
            self._mark_queue_status(url, "crawled")
            self.conn.commit()

            # Report progress
            if progress_callback:
                progress_callback({
                    "pages_crawled": pages_this_session,
                    "max_pages": max_pages,
                    "queue_size": self._count_pending(),
                    "current_url": url,
                    "title": parsed["title"][:80] or "(JS-rendered — no content)",
                    "text_length": body_len,
                    "links_found": links_count,
                    "status_code": response.status_code,
                    "status": status,
                })

        self.fetcher.close()
        total = self._count_crawled()
        print(f"\nCrawl complete. {total} pages stored ({pages_this_session} new this session).")

from urllib.parse import urlparse

import psycopg

from config import ALLOWED_DOMAINS, MAX_PAGES, MAX_DEPTH
from crawler.fetcher import Fetcher
from crawler.parser import parse_page


class CrawlManager:
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn
        self.fetcher = Fetcher()

    def seed(self, urls: list[str]):
        """Add seed URLs to the crawl queue."""
        for url in urls:
            self.conn.execute(
                "INSERT INTO crawl_queue (url, depth) VALUES (%s, 0) ON CONFLICT (url) DO NOTHING",
                (url,),
            )
        self.conn.commit()
        print(f"Seeded {len(urls)} URLs.")

    def _is_in_scope(self, url: str) -> bool:
        """Check if URL belongs to an allowed domain."""
        domain = urlparse(url).netloc
        return domain in ALLOWED_DOMAINS

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
            # Already existed
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

    def crawl(self):
        """Main crawl loop — BFS through the queue until limits are hit."""
        print(f"Starting crawl (max {MAX_PAGES} pages, max depth {MAX_DEPTH})...")

        while True:
            crawled_count = self._count_crawled()
            if crawled_count >= MAX_PAGES:
                print(f"\nReached page limit ({MAX_PAGES}). Stopping.")
                break

            next_item = self._get_next_url()
            if next_item is None:
                print("\nQueue empty. Stopping.")
                break

            url, depth = next_item

            if self._page_already_crawled(url):
                self._mark_queue_status(url, "skipped")
                continue

            # Fetch
            print(f"[{crawled_count + 1}/{MAX_PAGES}] depth={depth} {url}")
            response = self.fetcher.fetch(url)

            if response is None:
                self._mark_queue_status(url, "failed")
                continue

            # Parse
            parsed = parse_page(url, response.text)

            # Store page
            page_id = self._store_page(url, response.status_code, parsed)

            # Store links and enqueue new URLs
            self._store_links_and_enqueue(page_id, parsed["links"], depth)

            # Mark as crawled
            self._mark_queue_status(url, "crawled")
            self.conn.commit()

        self.fetcher.close()
        final_count = self._count_crawled()
        print(f"\nCrawl complete. {final_count} pages stored.")

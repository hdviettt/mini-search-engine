import logging
import re
from urllib.parse import urlparse

import psycopg

from config import (
    ALLOWED_DOMAINS,
    ALLOWED_PATH_PATTERNS,
    BLOCKED_DOMAINS,
    MAX_DEPTH,
    MAX_PAGES,
    WIKIPEDIA_FOOTBALL_KEYWORDS,
)
from crawler.fetcher import Fetcher, is_safe_url
from crawler.parser import parse_page
from indexer.indexer import index_page
from rag.chunker import chunk_page

log = logging.getLogger(__name__)


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

# Wikipedia namespaces that are not articles. A namespace is the prefix before
# the first colon in a /wiki/ title — "Help:Category", "File:Commons-logo.svg".
# Articles never carry one, so this is an exact, cheap test rather than a
# keyword guess. Talk variants ("Category talk:") are covered by the space
# check below.
_WIKIPEDIA_META_NAMESPACES = frozenset({
    "help", "wikipedia", "file", "category", "template", "portal", "draft",
    "special", "talk", "user", "mediawiki", "module", "book", "timedtext",
    "image", "wikt", "wp",
})


# Article-namespace pages that are citation plumbing. Every reference list on
# Wikipedia links to these, so they collect in-degree the same way the meta
# namespaces did and float to the top of PageRank — after the namespace fix the
# five most authoritative pages in the index were Digital object identifier,
# ISBN, ISSN, Wayback Machine and OCLC, with "Association football" sixth.
#
# They are real articles, so the namespace test cannot catch them; they are also
# never a plausible result for a football query. Matched on exact title, not a
# substring, so "ISBN" does not take "List of ISBN agencies" with it.
_WIKIPEDIA_CITATION_PAGES = frozenset({
    "digital object identifier", "doi (identifier)", "isbn", "isbn (identifier)",
    "issn", "issn (identifier)", "oclc", "oclc (identifier)", "lccn",
    "lccn (identifier)", "pmid", "pmid (identifier)", "pmc", "pmc (identifier)",
    "bibcode", "bibcode (identifier)", "s2cid", "s2cid (identifier)",
    "arxiv", "arxiv (identifier)", "jstor", "jstor (identifier)",
    "wayback machine", "internet archive", "google books", "hdl (identifier)",
    "wikidata", "wikimedia commons", "wikisource", "wikiquote",
})


def _is_wikipedia_citation_page(path: str) -> bool:
    """True for Wikipedia's citation-identifier articles (ISBN, DOI, JSTOR, …)."""
    title = path.split("/wiki/", 1)[-1]
    title = title.replace("_", " ").replace("%28", "(").replace("%29", ")").strip().lower()
    return title in _WIKIPEDIA_CITATION_PAGES


def _is_wikipedia_meta_page(path: str) -> bool:
    """True for non-article Wikipedia pages (Help:, File:, Category: and friends).

    These are linked from nearly every article, so leaving them in the crawl
    hands them enormous in-degree and lets them dominate PageRank. They are
    also never a useful search result for a football query.
    """
    title = path.split("/wiki/", 1)[-1]
    title = title.replace("%3A", ":").replace("%3a", ":")
    if ":" not in title:
        return False  # articles have no namespace prefix
    namespace = title.split(":", 1)[0].replace("_", " ").strip().lower()
    # "Category talk" and similar share the base namespace name.
    base = namespace.removesuffix(" talk").strip()
    return base in _WIKIPEDIA_META_NAMESPACES


def is_quality_page(conn: psycopg.Connection, page_id: int, title: str, body_text: str, content_hash: str) -> bool:
    """Return True if the page is worth indexing. Logs reason when skipping."""
    title = title or ""
    body_text = body_text or ""

    # 1. Minimum content length (100 words)
    word_count = len(body_text.split())
    if word_count < 100:
        log.debug("[quality] skip page %s: only %d words (min 100)", page_id, word_count)
        return False

    # 2. Title quality
    if not title or title.lower().strip() in _BAD_TITLES:
        log.debug("[quality] skip page %s: bad title %r", page_id, title)
        return False

    # 3. Redirect detection
    if _REDIRECT_PATTERNS.search(body_text[:1000]):
        log.debug("[quality] skip page %s: redirect/soft-404 detected", page_id)
        return False

    # 4. Content-hash dedup (different URL, same content)
    dup = conn.execute(
        "SELECT id FROM pages WHERE content_hash = %s AND id != %s LIMIT 1",
        (content_hash, page_id),
    ).fetchone()
    if dup:
        log.debug("[quality] skip page %s: duplicate of page %s", page_id, dup[0])
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
        """Add seed URLs to the crawl queue.

        Seeds go through the same gates as discovered links: they must resolve
        to a public address and fall inside the configured scope. Without this,
        a seed URL would be an unchecked path straight into the fetcher.
        """
        if clear_queue:
            self.conn.execute("DELETE FROM crawl_queue WHERE status = 'pending'")
            self.conn.commit()
            log.info("Cleared pending queue.")

        accepted = 0
        for url in urls:
            if not is_safe_url(url):
                log.warning("[seed] rejected non-public or unsupported URL: %s", url)
                continue
            if not self._is_in_scope(url, depth=0):
                log.warning("[seed] rejected out-of-scope URL: %s", url)
                continue
            self.conn.execute(
                "INSERT INTO crawl_queue (url, depth) VALUES (%s, 0) ON CONFLICT (url) DO NOTHING",
                (url,),
            )
            accepted += 1
        self.conn.commit()
        log.info("Seeded %d/%d URLs (%d rejected).", accepted, len(urls), len(urls) - accepted)

    def _is_in_scope(self, url: str, depth: int = 0) -> bool:
        """Check if URL belongs to an allowed domain and matches allowed paths.

        For Wikipedia, depth controls strictness:
        - depth ≤ 1: allow any /wiki/ page (direct links from football seeds are almost all football)
        - depth ≥ 2: require football keyword in URL path (prevents snowball into non-football topics)
        """
        parsed = urlparse(url)
        domain = parsed.netloc
        path = parsed.path

        # Block spam domains
        if domain in BLOCKED_DOMAINS:
            return False

        # If domain restriction is off, allow any *public* domain. Private and
        # link-local addresses are still blocked in crawler.fetcher.
        if not self.restrict_domains:
            return True

        # Must be in allowed domains
        if domain not in self.allowed_domains:
            return False

        # Wikipedia: depth-aware filtering
        if domain == "en.wikipedia.org":
            if "/wiki/" not in path:
                return False
            # Namespace check applies at every depth, including the seeds.
            #
            # The depth<=1 shortcut below used to admit any /wiki/ URL, which
            # let Help:, Wikipedia:, File: and Category: pages in — and every
            # article links to those, so they accumulated enormous in-degree
            # and took over PageRank. The top three pages by authority were
            # Help:Category, Wikipedia:Protection policy and File:Commons-logo.svg;
            # "Association football" ranked fourth. These are navigational
            # furniture, not content, and they are never a good search result.
            if _is_wikipedia_meta_page(path) or _is_wikipedia_citation_page(path):
                return False
            # Depth 0-1: trust links from curated seeds (player pages, etc.)
            if depth <= 1:
                return True
            # Depth 2+: require football keyword to prevent topic drift
            path_lower = path.lower()
            return any(kw.lower() in path_lower for kw in WIKIPEDIA_FOOTBALL_KEYWORDS)

        # Other domains: match against allowed path patterns
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
        row = self.conn.execute("SELECT COUNT(*) FROM pages").fetchone()
        return row[0]

    def _page_already_crawled(self, url: str) -> bool:
        row = self.conn.execute("SELECT 1 FROM pages WHERE url = %s", (url,)).fetchone()
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
            if self._is_in_scope(link_url, depth=depth + 1) and depth + 1 <= MAX_DEPTH:
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
        log.info("Starting crawl (max %d new pages, max depth %d)...", max_pages, max_depth)
        log.info(
            "Domains: %s",
            ", ".join(sorted(self.allowed_domains)) if self.restrict_domains else "ALL public (unrestricted)",
        )

        while True:
            # Check stop signal
            if stop_event and stop_event.is_set():
                log.info("Crawl stopped by user.")
                break

            if pages_this_session >= max_pages:
                log.info("Reached page limit (%d). Stopping.", max_pages)
                break

            next_item = self._get_next_url()
            if next_item is None:
                log.info("Queue empty. Stopping.")
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
            log.info("[%d/%d] depth=%d [%s] %s", pages_this_session, max_pages, depth, domain, url)
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
                log.warning(
                    "%s returned minimal content (%d chars, 0 links) — likely JS-rendered",
                    url, body_len,
                )

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
        log.info("Crawl complete. %d pages stored (%d new this session).", total, pages_this_session)

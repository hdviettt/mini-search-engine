import time
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx

from config import USER_AGENT, REQUEST_TIMEOUT, CRAWL_DELAY


class Fetcher:
    def __init__(self):
        self.client = httpx.Client(
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT,
            follow_redirects=True,
            max_redirects=5,
        )
        self._robots_cache: dict[str, RobotFileParser] = {}
        self._last_request_time: dict[str, float] = {}

    def _get_robots_parser(self, url: str) -> RobotFileParser:
        parsed = urlparse(url)
        domain = parsed.netloc
        if domain not in self._robots_cache:
            robots_url = f"{parsed.scheme}://{domain}/robots.txt"
            parser = RobotFileParser()
            parser.set_url(robots_url)
            try:
                # Fetch robots.txt with our User-Agent (urllib's default gets blocked by some sites)
                resp = self.client.get(robots_url)
                if resp.status_code == 200:
                    parser.parse(resp.text.splitlines())
                else:
                    # No robots.txt or error → allow everything
                    parser.allow_all = True
            except Exception:
                parser.allow_all = True
            self._robots_cache[domain] = parser
        return self._robots_cache[domain]

    def can_fetch(self, url: str) -> bool:
        parser = self._get_robots_parser(url)
        return parser.can_fetch(USER_AGENT, url)

    def _rate_limit(self, url: str):
        domain = urlparse(url).netloc
        last_time = self._last_request_time.get(domain, 0)
        elapsed = time.time() - last_time
        if elapsed < CRAWL_DELAY:
            time.sleep(CRAWL_DELAY - elapsed)
        self._last_request_time[domain] = time.time()

    def fetch(self, url: str) -> httpx.Response | None:
        if not self.can_fetch(url):
            return None

        self._rate_limit(url)

        try:
            response = self.client.get(url)
            content_type = response.headers.get("content-type", "")
            if "text/html" not in content_type:
                return None
            return response
        except (httpx.HTTPError, httpx.TimeoutException) as e:
            print(f"  Error fetching {url}: {e}")
            return None

    def close(self):
        self.client.close()

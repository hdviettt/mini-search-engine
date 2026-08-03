import ipaddress
import logging
import socket
import time
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx

from config import CRAWL_DELAY, REQUEST_TIMEOUT, USER_AGENT

log = logging.getLogger(__name__)

# Only these schemes are ever fetched. Blocks file://, ftp://, gopher://, etc.
ALLOWED_SCHEMES = frozenset({"http", "https"})

# Redirects are followed manually so every hop can be re-validated.
MAX_REDIRECTS = 5


def _is_public_ip(ip_str: str) -> bool:
    """True only for globally routable addresses.

    Rejects loopback (127.0.0.1, ::1), private ranges (10/8, 172.16/12,
    192.168/16, fc00::/7), link-local (169.254/16 — cloud metadata lives
    here), multicast, and reserved space.
    """
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def is_safe_url(url: str) -> bool:
    """Guard against SSRF: only public hosts over http(s) may be fetched.

    Every address the hostname resolves to must be public — a host with
    both a public and a private A record is rejected.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        return False

    host = parsed.hostname
    if not host:
        return False

    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
    except (socket.gaierror, UnicodeError, ValueError):
        return False

    if not infos:
        return False

    return all(_is_public_ip(info[4][0]) for info in infos)


class Fetcher:
    def __init__(self):
        self.client = httpx.Client(
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT,
            # Redirects are handled in fetch() so each hop passes is_safe_url().
            follow_redirects=False,
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
                resp = self.client.get(robots_url, follow_redirects=True)
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
        if not is_safe_url(url):
            log.warning("Blocked non-public or unsupported URL: %s", url)
            return None

        if not self.can_fetch(url):
            return None

        current = url
        try:
            for _ in range(MAX_REDIRECTS + 1):
                self._rate_limit(current)
                response = self.client.get(current)

                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        return None
                    # Resolve relative redirects, then re-validate the new target.
                    current = urljoin(current, location)
                    if not is_safe_url(current):
                        log.warning("Blocked redirect to non-public URL: %s", current)
                        return None
                    continue

                content_type = response.headers.get("content-type", "")
                if "text/html" not in content_type:
                    return None
                return response

            log.info("Too many redirects: %s", url)
            return None
        except (httpx.HTTPError, httpx.TimeoutException) as e:
            log.warning("Error fetching %s: %s", current, e)
            return None

    def close(self):
        self.client.close()

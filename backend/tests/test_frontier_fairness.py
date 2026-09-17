"""The crawl frontier rotates across domains instead of draining one.

Strict FIFO over the whole queue is what aged the corpus into Wikipedia. A
Wikipedia article carries 300 to 600 outgoing links and a news article carries
a handful, so within two levels the frontier is almost all Wikipedia, and FIFO
then guarantees it stays that way. Measured on production before the change:
188,121 pending URLs, of which a 60,000 sample held 59,965 Wikipedia, 21 ESPN,
7 Guardian and 7 BBC. BBC and ESPN were seed domains with one page each in the
whole index.
"""
from crawler.manager import CrawlManager


class FakeCursor:
    def __init__(self, row=None, rows=()):
        self._row, self._rows = row, rows

    def fetchone(self):
        return self._row

    def fetchall(self):
        return self._rows


class FakeQueue:
    """Just enough of a connection to drive _get_next_url.

    Holds (id, url, depth, domain) tuples and answers the two queries the
    frontier makes: the domain list, and the cheapest pending row for a domain.
    """

    def __init__(self, rows):
        self.rows = list(rows)
        self.popped = []

    def execute(self, sql, params=None):
        if "GROUP BY domain" in sql:
            return FakeCursor(rows=sorted({(r[3],) for r in self.rows}))
        if "AND domain = %s" in sql:
            cand = [r for r in self.rows if r[3] == params[0]]
            if not cand:
                return FakeCursor(None)
            best = min(cand, key=lambda r: (r[2], r[0]))
            return FakeCursor((best[0], best[1], best[2]))
        if "SET status = 'crawling'" in sql:
            qid = params[0]
            row = next(r for r in self.rows if r[0] == qid)
            self.rows.remove(row)
            self.popped.append(row)
            return FakeCursor(None)
        return FakeCursor(None)

    def commit(self):
        pass


def _manager(rows):
    m = CrawlManager.__new__(CrawlManager)
    m.conn = FakeQueue(rows)
    m._rr_index = 0
    m._domains_cache = None
    m._pops_since_refresh = 0
    return m


# The shape that broke it: one domain with a huge head start in insertion order.
LOPSIDED = (
    [(i, f"https://en.wikipedia.org/wiki/A{i}", 1, "en.wikipedia.org") for i in range(1, 51)]
    + [(90, "https://www.bbc.com/sport/football/x", 1, "www.bbc.com")]
    + [(91, "https://www.espn.com/soccer/y", 1, "www.espn.com")]
)


def test_starved_domains_are_reached_immediately():
    """Under FIFO these two sat behind 50 Wikipedia rows. They should come straight away."""
    m = _manager(LOPSIDED)
    seen = [m._get_next_url()[0] for _ in range(3)]
    hosts = {u.split("/")[2] for u in seen}
    assert "www.bbc.com" in hosts
    assert "www.espn.com" in hosts


def test_rotation_is_even_while_every_domain_has_work():
    """Note the fixture: every domain needs at least as many URLs as there are
    pops, otherwise this measures exhaustion rather than rotation."""
    rows = (
        [(i, f"https://en.wikipedia.org/wiki/A{i}", 1, "en.wikipedia.org") for i in range(1, 51)]
        + [(100 + i, f"https://www.bbc.com/sport/football/{i}", 1, "www.bbc.com") for i in range(3)]
        + [(200 + i, f"https://www.espn.com/soccer/{i}", 1, "www.espn.com") for i in range(3)]
    )
    m = _manager(rows)
    hosts = [m._get_next_url()[0].split("/")[2] for _ in range(6)]
    # Three domains, six pops: two each, and never the same one twice running.
    assert hosts.count("en.wikipedia.org") == 2
    assert hosts.count("www.bbc.com") == 2
    assert hosts.count("www.espn.com") == 2
    assert all(hosts[i] != hosts[i + 1] for i in range(len(hosts) - 1))


def test_exhausted_domains_are_skipped_not_fatal():
    """BBC and ESPN run dry after one page each; Wikipedia must keep going."""
    m = _manager(LOPSIDED)
    got = [m._get_next_url() for _ in range(12)]
    assert all(g is not None for g in got)
    hosts = [u.split("/")[2] for u, _ in got]
    assert hosts.count("www.bbc.com") == 1
    assert hosts.count("www.espn.com") == 1
    assert hosts.count("en.wikipedia.org") == 10


def test_shallower_urls_win_within_a_domain():
    rows = [
        (1, "https://www.bbc.com/sport/football/deep", 3, "www.bbc.com"),
        (2, "https://www.bbc.com/sport/football/shallow", 1, "www.bbc.com"),
    ]
    m = _manager(rows)
    url, depth = m._get_next_url()
    assert url.endswith("/shallow")
    assert depth == 1


def test_empty_frontier_returns_none():
    assert _manager([])._get_next_url() is None

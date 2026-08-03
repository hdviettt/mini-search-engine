"""Request bounds on operational endpoints.

Unbounded max_pages / iterations were a denial-of-service lever: one request
could pin the process for hours. The caps live on the Pydantic models, so
they are enforced before any handler code runs.
"""
import pytest
from pydantic import ValidationError

from api.playground import CrawlRequest, PageRankRequest, ScheduleRequest


def test_crawl_defaults_are_sane():
    req = CrawlRequest()
    assert req.max_pages <= 500
    assert req.max_depth <= 3
    assert req.restrict_domains is True


@pytest.mark.parametrize("payload", [
    {"max_pages": 999_999},
    {"max_pages": 0},
    {"max_depth": 99},
    {"max_depth": -1},
    {"seed_urls": ["https://example.com"] * 51},
    {"extra_domains": ["example.com"] * 21},
])
def test_crawl_rejects_out_of_range(payload):
    with pytest.raises(ValidationError):
        CrawlRequest(**payload)


@pytest.mark.parametrize("payload", [
    {"iterations": 10_000_000},
    {"iterations": 0},
    {"damping": 5.0},
    {"damping": 0.0},
    {"damping": 1.0},
])
def test_pagerank_rejects_out_of_range(payload):
    with pytest.raises(ValidationError):
        PageRankRequest(**payload)


@pytest.mark.parametrize("payload", [
    {"max_pages": 10_000},
    {"interval_hours": 0.001},
    {"interval_hours": 100_000},
])
def test_schedule_rejects_out_of_range(payload):
    with pytest.raises(ValidationError):
        ScheduleRequest(**payload)


def test_valid_requests_are_accepted():
    CrawlRequest(seed_urls=["https://en.wikipedia.org/wiki/Association_football"], max_pages=50, max_depth=2)
    PageRankRequest(damping=0.85, iterations=20)
    ScheduleRequest(max_pages=50, interval_hours=6.0)

"""Response schemas.

Endpoints declare these via `response_model` so /docs describes real shapes
instead of an untyped dict.
"""
from typing import Any

from pydantic import BaseModel, Field


class SearchResult(BaseModel):
    url: str
    title: str
    snippet: str
    bm25_score: float
    pagerank_score: float
    final_score: float
    rerank_score: float | None = None


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
    total_results: int
    page: int = 1
    per_page: int = 10
    time_ms: float
    sports: dict[str, Any] | None = None


class OverviewSource(BaseModel):
    index: int
    title: str
    url: str
    vector_score: float = 0.0
    keyword_score: float = 0.0


class OverviewResponse(BaseModel):
    query: str
    overview: str | None = None
    sources: list[OverviewSource] = Field(default_factory=list)
    trace: dict[str, Any] = Field(default_factory=dict)
    from_cache: bool = False


class ChatRequest(BaseModel):
    messages: list[dict]


class CrawlStats(BaseModel):
    pages_crawled: int
    pages_queued: int
    pages_failed: int
    total_terms: int
    total_postings: int

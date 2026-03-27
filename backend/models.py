from pydantic import BaseModel


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
    ai_overview: str | None
    total_results: int
    time_ms: float


class CrawlStats(BaseModel):
    pages_crawled: int
    pages_queued: int
    pages_failed: int
    total_terms: int
    total_postings: int

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  bm25_score: number;
  pagerank_score: number;
  final_score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total_results: number;
  time_ms: number;
}

export interface OverviewSource {
  index: number;
  title: string;
  url: string;
  vector_score: number;
  keyword_score: number;
}

export interface OverviewResponse {
  query: string;
  overview: string | null;
  sources: OverviewSource[];
}

export async function searchQuery(
  q: string,
  page: number = 1,
  perPage: number = 10
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q, page: String(page), per_page: String(perPage) });
  const res = await fetch(`${API_BASE}/api/search?${params}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function getOverview(q: string): Promise<OverviewResponse> {
  const params = new URLSearchParams({ q });
  const res = await fetch(`${API_BASE}/api/overview?${params}`);
  if (!res.ok) throw new Error("Overview failed");
  return res.json();
}

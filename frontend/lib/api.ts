import type { ExplainResponse, Stats, SearchParams } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

export async function searchExplain(q: string, params?: Partial<SearchParams>): Promise<ExplainResponse> {
  const res = await fetch(`${API_BASE}/api/search/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q, params }),
  });
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function getOverview(q: string): Promise<OverviewResponse> {
  const params = new URLSearchParams({ q });
  const res = await fetch(`${API_BASE}/api/overview?${params}`);
  if (!res.ok) throw new Error("Overview failed");
  return res.json();
}

export async function getStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/api/stats`);
  if (!res.ok) throw new Error("Stats failed");
  return res.json();
}

export async function startCrawl(seedUrls: string[], maxPages: number, maxDepth: number) {
  const res = await fetch(`${API_BASE}/api/crawl/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seed_urls: seedUrls, max_pages: maxPages, max_depth: maxDepth }),
  });
  return res.json();
}

export async function stopCrawl(jobId: string) {
  const res = await fetch(`${API_BASE}/api/crawl/stop?job_id=${jobId}`, { method: "POST" });
  return res.json();
}

export async function rebuildIndex() {
  const res = await fetch(`${API_BASE}/api/index/rebuild`, { method: "POST" });
  return res.json();
}

export async function rebuildEmbeddings() {
  const res = await fetch(`${API_BASE}/api/embedding/rebuild`, { method: "POST" });
  return res.json();
}

export function getWebSocketUrl(): string {
  const base = API_BASE.replace("http", "ws");
  return `${base}/ws/jobs`;
}

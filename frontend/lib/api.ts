import type { ExplainResponse, Stats, SearchParams } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface OverviewSource {
  index: number;
  title: string;
  url: string;
  vector_score: number;
  keyword_score: number;
}

export interface OverviewTrace {
  fanout?: { original: string; expanded: string[]; time_ms: number };
  retrieval?: { chunks_retrieved: number; chunks: { title: string; content_preview: string; vector_score: number; keyword_score: number; combined_score: number }[]; time_ms: number };
  synthesis?: { model: string; time_ms: number };
  total_ms?: number;
}

export interface OverviewResponse {
  query: string;
  overview: string | null;
  sources: OverviewSource[];
  trace: OverviewTrace;
  from_cache: boolean;
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

export function getOverviewStreamUrl(q: string): string {
  return `${API_BASE}/api/overview/stream?q=${encodeURIComponent(q)}`;
}

export async function getStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/api/stats`);
  if (!res.ok) throw new Error("Stats failed");
  return res.json();
}

export async function startCrawl(seedUrls: string[], maxPages: number, maxDepth: number, extraDomains: string[] = [], restrictDomains: boolean = true) {
  const res = await fetch(`${API_BASE}/api/crawl/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seed_urls: seedUrls, max_pages: maxPages, max_depth: maxDepth, extra_domains: extraDomains, restrict_domains: restrictDomains }),
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

// Parameter tuning
export async function recomputePageRank(damping: number, iterations: number) {
  const res = await fetch(`${API_BASE}/api/pagerank/recompute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ damping, iterations }),
  });
  return res.json();
}

// Scheduled crawls
export interface CrawlSchedule {
  id: string;
  seed_urls: string[];
  max_pages: number;
  interval_hours: number;
  enabled: boolean;
  last_run: string | null;
  next_run: string | null;
}

export async function createSchedule(seedUrls: string[], maxPages: number, intervalHours: number) {
  const res = await fetch(`${API_BASE}/api/crawl/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seed_urls: seedUrls, max_pages: maxPages, interval_hours: intervalHours }),
  });
  return res.json();
}

export async function listSchedules(): Promise<CrawlSchedule[]> {
  const res = await fetch(`${API_BASE}/api/crawl/schedules`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.schedules || [];
}

export async function deleteSchedule(scheduleId: string) {
  const res = await fetch(`${API_BASE}/api/crawl/schedule/${scheduleId}`, { method: "DELETE" });
  return res.json();
}

export async function toggleSchedule(scheduleId: string, enabled: boolean) {
  const res = await fetch(`${API_BASE}/api/crawl/schedule/${scheduleId}/toggle?enabled=${enabled}`, { method: "POST" });
  return res.json();
}

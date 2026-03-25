"use client";

import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface DashboardData {
  search: { total_queries: number; queries_today: number; avg_latency_ms: number; zero_result_queries_7d: number };
  popular_queries: { query: string; count: number; avg_results: number; avg_ms: number }[];
  recent_queries: { query: string; results: number; time_ms: number; at: string }[];
  corpus: { pages: number; terms: number; chunks: number; chunks_embedded: number };
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
      <div className="text-[12px] text-[var(--text-dim)] mb-1">{label}</div>
      <div className="text-[24px] font-bold text-[var(--text)]">{value}</div>
      {sub && <div className="text-[11px] text-[var(--text-dim)] mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/dashboard`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <div className="text-[var(--text-dim)]">Loading dashboard...</div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <div className="text-red-400">Failed to load dashboard</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-[var(--text-muted)] text-sm mt-1">Search engine health & analytics</p>
          </div>
          <a href="/" className="text-sm text-[var(--accent)] hover:underline">&larr; Back to search</a>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label="Total Queries" value={data.search.total_queries.toLocaleString()} />
          <StatCard label="Queries (24h)" value={data.search.queries_today} />
          <StatCard label="Avg Latency" value={`${data.search.avg_latency_ms.toFixed(0)}ms`} />
          <StatCard label="Zero Results (7d)" value={data.search.zero_result_queries_7d} />
        </div>

        {/* Corpus stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label="Pages Crawled" value={data.corpus.pages.toLocaleString()} />
          <StatCard label="Index Terms" value={data.corpus.terms.toLocaleString()} />
          <StatCard label="Chunks" value={data.corpus.chunks.toLocaleString()} />
          <StatCard label="Embedded" value={data.corpus.chunks_embedded.toLocaleString()} sub={`${((data.corpus.chunks_embedded / data.corpus.chunks) * 100).toFixed(0)}% coverage`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Popular queries */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
            <h2 className="text-[15px] font-semibold mb-4">Popular Queries (7d)</h2>
            {data.popular_queries.length === 0 ? (
              <p className="text-[var(--text-dim)] text-sm">No queries recorded yet</p>
            ) : (
              <div className="space-y-2">
                {data.popular_queries.map((q, i) => (
                  <div key={i} className="flex items-center gap-3 text-[13px]">
                    <span className="text-[var(--text-dim)] w-6 shrink-0 text-right">{q.count}x</span>
                    <span className="text-[var(--text)] flex-1 truncate">{q.query}</span>
                    <span className="text-[var(--text-dim)] shrink-0">{q.avg_results.toFixed(0)} results</span>
                    <span className="text-[var(--text-dim)] shrink-0 w-14 text-right">{q.avg_ms.toFixed(0)}ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent queries */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
            <h2 className="text-[15px] font-semibold mb-4">Recent Queries</h2>
            {data.recent_queries.length === 0 ? (
              <p className="text-[var(--text-dim)] text-sm">No queries recorded yet</p>
            ) : (
              <div className="space-y-2">
                {data.recent_queries.map((q, i) => (
                  <div key={i} className="flex items-center gap-3 text-[13px]">
                    <span className="text-[var(--text)] flex-1 truncate">{q.query}</span>
                    <span className={`shrink-0 ${q.results === 0 ? "text-red-400" : "text-[var(--text-dim)]"}`}>
                      {q.results} results
                    </span>
                    <span className="text-[var(--text-dim)] shrink-0 w-14 text-right">{q.time_ms.toFixed(0)}ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

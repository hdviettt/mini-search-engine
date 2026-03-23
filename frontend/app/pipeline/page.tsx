"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { searchExplain, getStats, getOverview } from "@/lib/api";
import type { OverviewSource } from "@/lib/api";
import type { ExplainResponse, Stats } from "@/lib/types";
import Link from "next/link";
import PipelineExplorer from "@/components/PipelineExplorer";

export default function PipelinePage() {
  return (
    <Suspense>
      <PipelineContent />
    </Suspense>
  );
}

function PipelineContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState<ExplainResponse | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  const [overviewText, setOverviewText] = useState("");
  const [overviewSources, setOverviewSources] = useState<OverviewSource[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);

  useEffect(() => { getStats().then(setStats).catch(() => {}); }, []);

  async function handleSearch(q: string) {
    if (!q.trim()) return;
    setQuery(q);
    setLoading(true);
    setData(null);
    setOverviewText("");
    setOverviewSources([]);
    try {
      const result = await searchExplain(q.trim());
      setData(result);
      if (result.total_results >= 3) {
        setOverviewLoading(true);
        getOverview(q.trim())
          .then((ov) => { setOverviewText(ov.overview || ""); setOverviewSources(ov.sources || []); })
          .catch(() => {})
          .finally(() => setOverviewLoading(false));
      }
    } catch { /* */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (initialQuery) handleSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="border-b border-[var(--border)] bg-[var(--bg-card)]">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Link href="/" className="text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </Link>
            <h1 className="text-lg font-semibold text-[var(--text)]">Search Pipeline</h1>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(new FormData(e.currentTarget).get("q") as string); }}>
            <input
              name="q" type="text" placeholder="Enter a query to trace the pipeline..."
              defaultValue={query} key={query} autoFocus
              className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-all"
            />
          </form>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block w-5 h-5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-dim)] mt-3">Running search pipeline...</p>
        </div>
      )}

      {!data && !loading && (
        <div className="text-center py-8">
          <p className="text-[var(--text-dim)] text-sm mb-4">Search to see the pipeline animate</p>
          <div className="flex flex-wrap justify-center gap-2">
            {["Messi", "Champions League", "World Cup"].map((q) => (
              <button key={q} onClick={() => handleSearch(q)}
                className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 cursor-pointer transition-colors">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <PipelineExplorer data={data} stats={stats} overviewText={overviewText} overviewSources={overviewSources} overviewLoading={overviewLoading} />
    </div>
  );
}

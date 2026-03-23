"use client";

import { useState, useCallback, memo } from "react";
import { useSearchEngine, type SearchEngineState } from "@/hooks/useSearchEngine";
import AIOverview from "@/components/AIOverview";
import PipelineExplorer from "@/components/PipelineExplorer";
import type { FlowPhase } from "@/components/canvas/types";

type View = "search" | "explore";

const PHASE_STEPS: { key: FlowPhase; label: string }[] = [
  { key: "tokenizing", label: "Tokenize" },
  { key: "indexLookup", label: "Lookup" },
  { key: "bm25", label: "Score" },
  { key: "combining", label: "Rank" },
  { key: "results", label: "Results" },
];

const PHASE_ORDER: FlowPhase[] = [
  "idle", "queryInput", "tokenizing", "indexLookup", "bm25",
  "pagerank", "combining", "results", "aiFanout", "aiRetrieval",
  "aiSynthesis", "aiComplete",
];

function phaseIndex(phase: FlowPhase) {
  return PHASE_ORDER.indexOf(phase);
}

const SUGGESTIONS = ["Messi", "Champions League", "World Cup", "Premier League", "Ronaldo"];

function urlBreadcrumb(url: string) {
  try {
    const u = new URL(url);
    const domain = u.hostname.replace("www.", "");
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return { domain, breadcrumb: "" };
    return { domain, breadcrumb: segments.map((s) => decodeURIComponent(s).replace(/_/g, " ")).join(" › ") };
  } catch {
    return { domain: url, breadcrumb: "" };
  }
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="flex bg-[var(--bg-elevated)] rounded-full p-0.5 text-[11px] sm:text-xs">
      {(["search", "explore"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-2.5 sm:px-3 py-1 rounded-full transition-all cursor-pointer capitalize ${
            view === v
              ? "bg-[var(--bg-card)] text-[var(--text)] shadow-sm font-medium"
              : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

const SerpSidePanel = memo(function SerpSidePanel({ engine, onToggleView, isExploring }: { engine: SearchEngineState; onToggleView: () => void; isExploring: boolean }) {
  if (!engine.searchData) return null;
  return (
    <div className="@container bg-[var(--bg)]">
      <div className="lg:overflow-y-auto lg:max-h-[calc(100vh-80px)]">
        {/* AI Overview — always mounted, hidden via CSS when exploring */}
        <div className={`px-4 sm:px-8 @lg:pl-[10%] @lg:pr-4 max-w-4xl pt-2 ${isExploring ? "invisible h-0 overflow-hidden" : ""}`}>
          <AIOverview text={engine.overviewText} sources={engine.overviewSources} loading={engine.overviewLoading} streaming={engine.overviewStreaming} />
        </div>

        {/* Results — shift right when pipeline overlays */}
        <div className={`px-4 py-2 space-y-4 transition-[padding-left] duration-500 ${
          isExploring ? "lg:pl-[67%] lg:pr-4 max-w-none" : "sm:px-8 @lg:pl-[10%] @lg:pr-4 max-w-3xl"
        }`}>
          <div className="text-[12px] @lg:text-[13px] text-[#70757a]">
            {engine.searchData.total_results} results ({(engine.searchData.time_ms / 1000).toFixed(2)}s)
          </div>
          {engine.searchData.results.map((r, i) => {
            const { domain, breadcrumb } = urlBreadcrumb(r.url);
            return (
              <div key={i} className="group">
                {/* Site info — favicon + domain + breadcrumb (Google style) */}
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center shrink-0">
                    <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" width={18} height={18} className="rounded-full" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] text-[var(--text)] truncate">{domain}</div>
                    {breadcrumb && <div className="text-[12px] text-[#70757a] truncate">{breadcrumb}</div>}
                  </div>
                </div>
                {/* Title */}
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="block">
                  <h3 className="text-[16px] sm:text-[18px] text-[#1a0dab] group-hover:underline leading-snug">{r.title}</h3>
                </a>
                {/* Snippet */}
                <p className="text-[13px] text-[#4d5156] leading-[1.5] line-clamp-2 sm:line-clamp-3 mt-0.5">{r.snippet}</p>
                {/* Score hints on hover */}
                <div className="hidden @lg:flex items-center gap-3 mt-1.5 h-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <span className="text-[10px] text-[#70757a] font-mono">BM25 {(r.bm25_score ?? 0).toFixed(1)}</span>
                  <span className="text-[10px] text-[#70757a] font-mono">PageRank {(r.pagerank_score ?? 0).toFixed(4)}</span>
                  <span className="text-[10px] text-[#1a73e8] font-mono">Score {(r.final_score ?? 0).toFixed(2)}</span>
                </div>
              </div>
            );
          })}

          <div className="pt-4 @lg:pt-6">
            <button onClick={onToggleView} className="inline-flex items-center gap-1.5 text-[11px] @lg:text-xs text-[#70757a] hover:text-[#1a73e8] transition-colors cursor-pointer">
              <span className="@lg:hidden">Explore pipeline</span>
              <span className="hidden @lg:inline">See how these results were computed</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default function Home() {
  const engine = useSearchEngine();
  const [view, setView] = useState<View>("search");
  const hasResults = engine.searchData !== null;
  const toggleView = useCallback(() => setView(v => v === "search" ? "explore" : "search"), []);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      {!hasResults ? (
        /* Hero state — centered */
        <div className="pt-[18vh] sm:pt-[25vh] pb-5 sm:pb-8">
          <div className="max-w-2xl mx-auto px-3 sm:px-4 text-center">
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[var(--text)] mb-5 sm:mb-8">Search Engine</h1>
            <p className="text-[var(--text-dim)] text-xs sm:text-sm -mt-4 sm:-mt-6 mb-5 sm:mb-8">
              Built from scratch — BM25, PageRank, and AI Overviews
            </p>
            <form onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q") as string; if (q.trim()) engine.handleSearch(q.trim()); }} className="relative">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-dim)]">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input name="q" type="text" placeholder="Search anything..." className="w-full pl-11 pr-4 py-3 sm:py-3.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-full text-[var(--text)] text-sm sm:text-base placeholder:text-[var(--text-dim)] focus:outline-none shadow-md hover:shadow-lg focus:shadow-lg transition-all" />
            </form>
            <div className="mt-3 sm:mt-5 flex flex-wrap justify-center gap-1.5 sm:gap-2">
              {SUGGESTIONS.map((q) => (
                <button key={q} onClick={() => engine.handleSearch(q)} className="text-xs sm:text-sm px-2.5 sm:px-4 py-1 sm:py-2 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer transition-all">
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Results state — dynamic island pill bar */
        <div className="sticky top-0 z-30 bg-[var(--bg)] pt-2 sm:pt-3 pb-2 sm:pb-3">
          <div className="max-w-3xl mx-auto px-3 sm:px-4">
            <form onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q") as string; if (q.trim()) engine.handleSearch(q.trim()); }}
              className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-full shadow-sm hover:shadow-md transition-shadow px-3 sm:px-4"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-dim)] shrink-0">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input name="q" type="text" defaultValue={engine.query} key={engine.query}
                className="flex-1 py-2 sm:py-2.5 bg-transparent text-[var(--text)] text-sm placeholder:text-[var(--text-dim)] focus:outline-none min-w-0" />
              <div className="shrink-0 border-l border-[var(--border)] pl-2 sm:pl-3 ml-1">
                <ViewToggle view={view} onChange={setView} />
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Content */}
      {hasResults && (
        <div className="relative">
          {/* SERP — always rendered, stays in place */}
          <div>
            <SerpSidePanel engine={engine} onToggleView={toggleView} isExploring={view === "explore"} />
          </div>

          {/* Pipeline — slides in from left as an overlay on desktop */}
          <div
            className={`lg:absolute lg:top-0 lg:left-0 lg:bottom-0 lg:w-[65%] lg:bg-[var(--bg)] lg:border-r lg:border-[var(--border)] lg:overflow-y-auto transition-transform duration-500 ease-in-out lg:z-10 ${
              view === "explore"
                ? "translate-x-0"
                : "max-h-0 lg:max-h-none lg:-translate-x-full lg:pointer-events-none overflow-hidden"
            }`}
          >
            <PipelineExplorer
              data={engine.searchData}
              stats={engine.stats}
              overviewText={engine.overviewText}
              overviewSources={engine.overviewSources}
              overviewLoading={engine.overviewLoading || engine.overviewStreaming}
            />
          </div>
        </div>
      )}

      {/* Mobile: floating "back to search" button when in explore mode */}
      {hasResults && view === "explore" && (
        <div className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
          <button
            onClick={() => setView("search")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--bg-card)] border border-[var(--border)] shadow-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back to results
          </button>
        </div>
      )}

      {/* Hero explore link */}
      {!hasResults && (
        <div className="text-center mt-5 sm:mt-8">
          <button onClick={() => setView("explore")} className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors cursor-pointer">
            Explore the search pipeline
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

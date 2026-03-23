"use client";

import { useState } from "react";
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

function SerpSidePanel({ engine, onToggleView }: { engine: SearchEngineState; onToggleView: () => void }) {
  if (!engine.searchData) return null;
  return (
    <div className="@container bg-[var(--bg)]">
      <div className="lg:overflow-y-auto lg:max-h-[calc(100vh-80px)]">
        {/* AI Overview — always use full component */}
        <div className="px-3 @lg:px-4 @lg:max-w-3xl @lg:mx-auto">
          <AIOverview text={engine.overviewText} sources={engine.overviewSources} loading={engine.overviewLoading} streaming={engine.overviewStreaming} />
        </div>

        {/* Results */}
        <div className="px-3 @lg:px-4 py-2 @lg:py-3 @lg:max-w-3xl @lg:mx-auto space-y-2.5 @lg:space-y-5">
          <div className="text-[10px] @lg:text-[13px] text-[var(--text-dim)]">
            {engine.searchData.total_results} results ({(engine.searchData.time_ms / 1000).toFixed(2)}s)
          </div>
          {engine.searchData.results.map((r, i) => {
            const { domain, breadcrumb } = urlBreadcrumb(r.url);
            return (
              <div key={i} className="group">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} alt="" width={14} height={14} className="rounded-sm shrink-0" />
                  <span className="text-[10px] @lg:text-sm text-[var(--text-muted)] truncate">{domain}</span>
                  {breadcrumb && <span className="text-xs text-[var(--text-dim)] truncate hidden @lg:inline">{breadcrumb}</span>}
                </div>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="block">
                  <h3 className="text-[13px] @lg:text-[18px] text-[var(--accent)] group-hover:underline leading-snug">{r.title}</h3>
                </a>
                <p className="text-[11px] @lg:text-[13px] text-[var(--text-muted)] leading-relaxed line-clamp-2 @lg:line-clamp-3 mt-0.5">{r.snippet}</p>
                <div className="hidden @lg:flex items-center gap-3 mt-1.5 h-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <span className="text-[10px] text-[var(--text-dim)] font-mono">BM25 {(r.bm25_score ?? 0).toFixed(1)}</span>
                  <span className="text-[10px] text-[var(--text-dim)] font-mono">PageRank {(r.pagerank_score ?? 0).toFixed(4)}</span>
                  <span className="text-[10px] text-[var(--accent)] font-mono">Score {(r.final_score ?? 0).toFixed(2)}</span>
                </div>
              </div>
            );
          })}

          <div className="pt-4 @lg:pt-6 text-center">
            <button onClick={onToggleView} className="inline-flex items-center gap-1.5 text-[11px] @lg:text-xs text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors cursor-pointer">
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
}

export default function Home() {
  const engine = useSearchEngine();
  const [view, setView] = useState<View>("search");
  const hasResults = engine.searchData !== null;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <div className={`transition-all duration-500 ${hasResults ? "sticky top-0 z-30 pt-3 sm:pt-4 pb-2 sm:pb-3 border-b border-[var(--border)] bg-[var(--bg-card)] shadow-sm" : "pt-[18vh] sm:pt-[25vh] pb-5 sm:pb-8"}`}>
        <div className={`mx-auto px-3 sm:px-4 ${hasResults ? "max-w-6xl" : "max-w-2xl"}`}>
          {/* Logo + toggle */}
          <div className={`transition-all duration-500 ${hasResults ? "mb-2 flex items-center gap-2" : "mb-5 sm:mb-8 text-center"}`}>
            <h1 className={`font-semibold tracking-tight text-[var(--text)] transition-all duration-500 ${hasResults ? "text-base sm:text-xl truncate" : "text-3xl sm:text-5xl"}`}>
              {hasResults ? <span className="hidden sm:inline">Search Engine</span> : "Search Engine"}
              {hasResults && <span className="sm:hidden">Search</span>}
            </h1>
            {!hasResults && (
              <p className="text-[var(--text-dim)] text-xs sm:text-sm mt-1 sm:mt-2">
                Built from scratch — BM25, PageRank, and AI Overviews
              </p>
            )}
            {hasResults && (
              <div className="ml-auto shrink-0">
                <ViewToggle view={view} onChange={setView} />
              </div>
            )}
          </div>

          {/* Search Bar */}
          <form onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q") as string; if (q.trim()) engine.handleSearch(q.trim()); }} className="relative">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)]">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              name="q" type="text" placeholder="Search anything..."
              defaultValue={engine.query} key={engine.query}
              className={`w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)] text-sm placeholder:text-[var(--text-dim)] focus:outline-none focus:shadow-md transition-all ${
                hasResults ? "rounded-full shadow-sm" : "rounded-full shadow-md hover:shadow-lg sm:py-3"
              }`}
            />
          </form>

          {/* Suggestions */}
          {!hasResults && (
            <div className="mt-3 sm:mt-5 flex flex-wrap justify-center gap-1.5 sm:gap-2">
              {SUGGESTIONS.map((q) => (
                <button key={q} onClick={() => engine.handleSearch(q)}
                  className="text-xs sm:text-sm px-2.5 sm:px-4 py-1 sm:py-2 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer transition-all">
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Pipeline progress */}
          {view === "search" && engine.phase !== "idle" && hasResults && (
            <div className="mt-1.5 flex items-center gap-1 text-[10px] sm:text-[11px] text-[var(--text-dim)] overflow-x-auto">
              {PHASE_STEPS.map((step, i) => {
                const stepIdx = PHASE_ORDER.indexOf(step.key);
                const currentIdx = phaseIndex(engine.phase);
                const isActive = stepIdx === currentIdx || (step.key === "combining" && engine.phase === "pagerank");
                const isComplete = currentIdx > stepIdx;
                return (
                  <span key={step.key} className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                    {i > 0 && <span className="text-[var(--border)]">›</span>}
                    <span className={`transition-colors duration-300 ${isComplete ? "text-[var(--accent)]" : isActive ? "text-[var(--accent)] font-medium" : ""}`}
                      style={isActive ? { animation: "pulse-dot 1s ease-in-out infinite" } : undefined}>
                      {step.label}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {hasResults && (
        <div
          className="lg:grid lg:overflow-hidden"
          style={{
            gridTemplateColumns: view === "explore" ? "65% 1fr" : "0% 1fr",
            transition: "grid-template-columns 500ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* Pipeline */}
          <div className={`overflow-hidden ${view === "explore" ? "block" : "hidden lg:block"}`}>
            <PipelineExplorer
              data={engine.searchData}
              stats={engine.stats}
              overviewText={engine.overviewText}
              overviewSources={engine.overviewSources}
              overviewLoading={engine.overviewLoading || engine.overviewStreaming}
            />
          </div>

          {/* SERP */}
          <div className={`lg:overflow-hidden lg:overflow-y-auto ${
            view === "explore" ? "hidden lg:block lg:border-l border-[var(--border)]" : "block"
          }`}>
            <SerpSidePanel engine={engine} onToggleView={() => setView(view === "search" ? "explore" : "search")} />
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

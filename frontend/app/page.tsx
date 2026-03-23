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
    return {
      domain,
      breadcrumb: segments.map((s) => decodeURIComponent(s).replace(/_/g, " ")).join(" › "),
    };
  } catch {
    return { domain: url, breadcrumb: "" };
  }
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="flex bg-[var(--bg-elevated)] rounded-full p-0.5 text-xs">
      <button
        onClick={() => onChange("search")}
        className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
          view === "search"
            ? "bg-[var(--bg-card)] text-[var(--text)] shadow-sm font-medium"
            : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
        }`}
      >
        Search
      </button>
      <button
        onClick={() => onChange("explore")}
        className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
          view === "explore"
            ? "bg-[var(--bg-card)] text-[var(--text)] shadow-sm font-medium"
            : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
        }`}
      >
        Explore
      </button>
    </div>
  );
}

function SerpSidePanel({ engine, onSwitchToSearch }: { engine: SearchEngineState; onSwitchToSearch: () => void }) {
  if (!engine.searchData) return null;
  return (
    <div className="border border-[var(--border)] rounded-xl bg-[var(--bg-card)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
        <span className="text-sm font-semibold text-[var(--text)] flex-1">Results</span>
        <button onClick={onSwitchToSearch} className="text-[10px] text-[var(--accent)] hover:underline cursor-pointer">
          Full view
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto">
        {/* Compact AI Overview */}
        {(engine.overviewLoading || engine.overviewStreaming || engine.overviewText) && (
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-1.5 mb-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2L13.09 8.26L18 6L14.74 10.91L21 12L14.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L9.26 13.09L3 12L9.26 10.91L6 6L10.91 8.26L12 2Z" fill="url(#spk)"/><defs><linearGradient id="spk" x1="3" y1="2" x2="21" y2="22"><stop stopColor="#4285f4"/><stop offset="0.5" stopColor="#9b72cb"/><stop offset="1" stopColor="#d96570"/></linearGradient></defs></svg>
              <span className="text-[10px] font-semibold text-[var(--text)]">AI Overview</span>
            </div>
            {engine.overviewLoading && !engine.overviewText ? (
              <div className="space-y-1.5">
                <div className="h-2.5 bg-[var(--score-bar-bg)] animate-pulse rounded w-full" />
                <div className="h-2.5 bg-[var(--score-bar-bg)] animate-pulse rounded w-[85%]" />
                <div className="h-2.5 bg-[var(--score-bar-bg)] animate-pulse rounded w-[60%]" />
              </div>
            ) : (
              <p className="text-[12px] leading-[1.6] text-[var(--text)] line-clamp-6">{engine.overviewText}</p>
            )}
          </div>
        )}

        {/* Compact results list */}
        <div className="px-4 py-3 space-y-3">
          <div className="text-[10px] text-[var(--text-dim)]">
            {engine.searchData.total_results} results · {engine.searchData.time_ms}ms
          </div>
          {engine.searchData.results.map((r, i) => {
            let domain = "";
            try { domain = new URL(r.url).hostname.replace("www.", ""); } catch { domain = r.url; }
            return (
              <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="block group">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} alt="" width={12} height={12} className="rounded-sm" />
                  <span className="text-[10px] text-[var(--text-dim)]">{domain}</span>
                </div>
                <div className="text-[13px] text-[var(--accent)] group-hover:underline leading-snug">{r.title}</div>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed line-clamp-2 mt-0.5">{r.snippet}</p>
              </a>
            );
          })}
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
      {/* Hero / Search Section */}
      <div className={`transition-all duration-500 ${hasResults ? "pt-5 pb-3 border-b border-[var(--border)] bg-[var(--bg-card)] shadow-sm" : "pt-[25vh] pb-8"}`}>
        <div className={`mx-auto px-4 ${hasResults ? "max-w-6xl" : "max-w-2xl"}`}>
          {/* Logo + toggle */}
          <div className={`transition-all duration-500 ${hasResults ? "mb-3 flex items-center gap-3" : "mb-8 text-center"}`}>
            <h1 className={`font-semibold tracking-tight text-[var(--text)] transition-all duration-500 ${hasResults ? "text-xl" : "text-4xl sm:text-5xl"}`}>
              Search Engine
            </h1>
            {!hasResults && (
              <p className="text-[var(--text-dim)] text-sm mt-2">
                Built from scratch — BM25, PageRank, and AI Overviews
              </p>
            )}
            {hasResults && (
              <div className="ml-auto">
                <ViewToggle view={view} onChange={setView} />
              </div>
            )}
          </div>

          {/* Search Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q") as string;
              if (q.trim()) engine.handleSearch(q.trim());
            }}
            className="relative"
          >
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)]"
            >
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              name="q"
              type="text"
              placeholder="Search anything..."
              defaultValue={engine.query}
              key={engine.query}
              autoFocus
              className={`w-full pl-10 pr-4 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)] text-[15px] placeholder:text-[var(--text-dim)] focus:outline-none focus:shadow-md transition-all ${
                hasResults ? "rounded-full shadow-sm hover:shadow-md" : "rounded-full shadow-md hover:shadow-lg py-3"
              }`}
            />
          </form>

          {/* Suggestions (hero state only) */}
          {!hasResults && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => engine.handleSearch(q)}
                  className="text-sm px-4 py-2 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 hover:shadow-sm cursor-pointer transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Pipeline Progress — the subtle hint (search view only) */}
          {view === "search" && engine.phase !== "idle" && hasResults && (
            <div className="mt-2 flex items-center gap-1 text-[11px] text-[var(--text-dim)]">
              {PHASE_STEPS.map((step, i) => {
                const stepIdx = PHASE_ORDER.indexOf(step.key);
                const currentIdx = phaseIndex(engine.phase);
                const isActive = stepIdx === currentIdx ||
                  (step.key === "combining" && engine.phase === "pagerank");
                const isComplete = currentIdx > stepIdx;
                return (
                  <span key={step.key} className="flex items-center gap-1">
                    {i > 0 && <span className="text-[var(--border)]">›</span>}
                    <span
                      className={`transition-colors duration-300 ${
                        isComplete ? "text-[var(--accent)]" : isActive ? "text-[var(--accent)] font-medium" : ""
                      }`}
                      style={isActive ? { animation: "pulse-dot 1s ease-in-out infinite" } : undefined}
                    >
                      {step.label}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Content — both views always mounted, animated with CSS transitions */}
      {hasResults && (
        <div className="flex overflow-hidden">
          {/* Pipeline Explorer — expands to ~65% */}
          <div className={`transition-all duration-500 ease-in-out overflow-hidden ${
            view === "explore" ? "w-[65%] shrink-0 opacity-100" : "w-0 shrink-0 opacity-0"
          }`}>
            <PipelineExplorer
              data={engine.searchData}
              stats={engine.stats}
              overviewText={engine.overviewText}
              overviewSources={engine.overviewSources}
              overviewLoading={engine.overviewLoading}
            />
          </div>

          {/* SERP — full width in search, compact 35% in explore */}
          <div className={`transition-all duration-500 ease-in-out overflow-hidden ${
            view === "search" ? "flex-1" : "flex-1 border-l border-[var(--border)]"
          }`}>
            {view === "search" ? (
              /* Full SERP */
              <div className="max-w-3xl mx-auto px-4 pt-4 pb-16">
                <div className="text-[13px] text-[var(--text-dim)] mb-4">
                  About {engine.searchData!.total_results} results ({(engine.searchData!.time_ms / 1000).toFixed(2)} seconds)
                </div>

                <AIOverview
                  text={engine.overviewText}
                  sources={engine.overviewSources}
                  loading={engine.overviewLoading}
                  streaming={engine.overviewStreaming}
                />

                <div className="space-y-6">
                  {engine.searchData!.results.map((r, i) => {
                    const { domain, breadcrumb } = urlBreadcrumb(r.url);
                    return (
                      <div key={i} className="group" style={{ animation: `fade-in 0.3s ease-out ${i * 0.05}s both` }}>
                        <div className="flex items-center gap-2 mb-1">
                          <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} alt="" width={16} height={16} className="rounded-full" />
                          <div className="min-w-0">
                            <div className="text-sm text-[var(--text-muted)] truncate">{domain}</div>
                            {breadcrumb && <div className="text-xs text-[var(--text-dim)] truncate">{breadcrumb}</div>}
                          </div>
                        </div>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="block">
                          <h3 className="text-[18px] text-[var(--accent)] group-hover:underline leading-snug mb-1">{r.title}</h3>
                        </a>
                        <p className="text-[13px] text-[var(--text-muted)] leading-[1.6] line-clamp-3">{r.snippet}</p>
                        <div className="flex items-center gap-3 mt-1.5 h-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <span className="text-[10px] text-[var(--text-dim)] font-mono">BM25 {(r.bm25_score ?? 0).toFixed(1)}</span>
                          <span className="text-[10px] text-[var(--text-dim)] font-mono">PageRank {(r.pagerank_score ?? 0).toFixed(4)}</span>
                          <span className="text-[10px] text-[var(--accent)] font-mono">Score {(r.final_score ?? 0).toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-8 text-center">
                  <button
                    onClick={() => setView("explore")}
                    className="inline-flex items-center gap-2 text-xs text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                  >
                    See how these results were computed
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              /* Compact SERP panel when exploring */
              <SerpSidePanel engine={engine} onSwitchToSearch={() => setView("search")} />
            )}
          </div>
        </div>
      )}

      {/* Hero explore link */}
      {!hasResults && (
        <div className="text-center mt-8">
          <button
            onClick={() => setView("explore")}
            className="inline-flex items-center gap-2 text-sm text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors cursor-pointer"
          >
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

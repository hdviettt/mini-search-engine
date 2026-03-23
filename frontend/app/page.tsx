"use client";

import { useSearchEngine } from "@/hooks/useSearchEngine";
import AIOverview from "@/components/AIOverview";
import Link from "next/link";
import type { FlowPhase } from "@/components/canvas/types";

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

export default function Home() {
  const engine = useSearchEngine();
  const hasResults = engine.searchData !== null;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Hero / Search Section */}
      <div className={`transition-all duration-500 ${hasResults ? "pt-8 pb-4" : "pt-[25vh] pb-8"}`}>
        <div className="max-w-2xl mx-auto px-4">
          {/* Logo */}
          <div className={`transition-all duration-500 ${hasResults ? "mb-4 flex items-center gap-3" : "mb-8 text-center"}`}>
            <h1 className={`font-semibold tracking-tight text-[var(--text)] transition-all duration-500 ${hasResults ? "text-xl" : "text-4xl sm:text-5xl"}`}>
              Search Engine
            </h1>
            {!hasResults && (
              <p className="text-[var(--text-dim)] text-sm mt-2">
                Built from scratch — BM25, PageRank, and AI Overviews
              </p>
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
            <input
              name="q"
              type="text"
              placeholder="Search anything..."
              defaultValue={engine.query}
              key={engine.query}
              autoFocus
              className="w-full px-4 py-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-[var(--text)] text-base placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 shadow-sm transition-all"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
          </form>

          {/* Suggestions (hero state only) */}
          {!hasResults && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => engine.handleSearch(q)}
                  className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 cursor-pointer transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Pipeline Progress — the subtle hint */}
          {engine.phase !== "idle" && (
            <div className="mt-3 flex items-center gap-1 text-[11px] text-[var(--text-dim)]">
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
                        isComplete
                          ? "text-[var(--accent)]"
                          : isActive
                            ? "text-[var(--accent)] font-medium"
                            : ""
                      }`}
                      style={isActive ? { animation: "pulse-dot 1s ease-in-out infinite" } : undefined}
                    >
                      {step.label}
                    </span>
                  </span>
                );
              })}
              {engine.searchData && phaseIndex(engine.phase) >= phaseIndex("results") && (
                <span className="ml-auto text-[var(--text-dim)] tabular-nums">
                  {engine.searchData.time_ms}ms
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Results Section */}
      {hasResults && (
        <div className="max-w-2xl mx-auto px-4 pb-16" style={{ animation: "fade-in 0.3s ease-out" }}>
          {/* AI Overview */}
          <AIOverview
            text={engine.overviewText}
            sources={engine.overviewSources}
            loading={engine.overviewLoading}
            streaming={engine.overviewStreaming}
          />

          {/* Results List */}
          <div className="space-y-5 mt-2">
            {engine.searchData!.results.map((r, i) => {
              let domain = "";
              try { domain = new URL(r.url).hostname; } catch { domain = r.url; }
              const path = r.url.replace(/https?:\/\/[^/]+/, "").slice(0, 60);

              return (
                <a
                  key={i}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                  style={{ animation: `fade-in 0.3s ease-out ${i * 0.05}s both` }}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs text-[var(--text-muted)]">{domain}</span>
                    <span className="text-[11px] text-[var(--text-dim)]">{path}</span>
                  </div>
                  <h3 className="text-base text-[var(--accent)] group-hover:underline leading-snug mb-0.5">
                    {r.title}
                  </h3>
                  <p className="text-sm text-[var(--text-muted)] leading-relaxed line-clamp-2">
                    {r.snippet}
                  </p>
                  {/* Subtle score hints */}
                  <div className="flex items-center gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="text-[10px] text-[var(--text-dim)] font-mono">
                      BM25 {(r.bm25_score ?? 0).toFixed(1)}
                    </span>
                    <span className="text-[10px] text-[var(--text-dim)] font-mono">
                      PR {(r.pagerank_score ?? 0).toFixed(4)}
                    </span>
                    <span className="text-[10px] text-[var(--accent)] font-mono">
                      Score {(r.final_score ?? 0).toFixed(2)}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>

          {/* Pipeline link */}
          <div className="mt-10 pt-6 border-t border-[var(--border)] text-center">
            <Link
              href={`/pipeline${engine.query ? `?q=${encodeURIComponent(engine.query)}` : ""}`}
              className="inline-flex items-center gap-2 text-sm text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
            >
              See how these results were computed
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      )}

      {/* Pipeline link (hero state) */}
      {!hasResults && (
        <div className="text-center mt-8">
          <Link
            href="/pipeline"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
          >
            Explore the search pipeline
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
}

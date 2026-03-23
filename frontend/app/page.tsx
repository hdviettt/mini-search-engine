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

export default function Home() {
  const engine = useSearchEngine();
  const hasResults = engine.searchData !== null;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Hero / Search Section */}
      <div className={`transition-all duration-500 ${hasResults ? "pt-5 pb-3 border-b border-[var(--border)] bg-[var(--bg-card)] shadow-sm" : "pt-[25vh] pb-8"}`}>
        <div className={`mx-auto px-4 ${hasResults ? "max-w-3xl" : "max-w-2xl"}`}>
          {/* Logo */}
          <div className={`transition-all duration-500 ${hasResults ? "mb-3 flex items-center gap-3" : "mb-8 text-center"}`}>
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

          {/* Pipeline Progress — the subtle hint */}
          {engine.phase !== "idle" && hasResults && (
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
            </div>
          )}
        </div>
      </div>

      {/* Results Section */}
      {hasResults && (
        <div className="max-w-3xl mx-auto px-4 pt-4 pb-16" style={{ animation: "fade-in 0.3s ease-out" }}>
          {/* Results count */}
          <div className="text-[13px] text-[var(--text-dim)] mb-4">
            About {engine.searchData!.total_results} results ({(engine.searchData!.time_ms / 1000).toFixed(2)} seconds)
          </div>

          {/* AI Overview */}
          <AIOverview
            text={engine.overviewText}
            sources={engine.overviewSources}
            loading={engine.overviewLoading}
            streaming={engine.overviewStreaming}
          />

          {/* Results List */}
          <div className="space-y-6">
            {engine.searchData!.results.map((r, i) => {
              const { domain, breadcrumb } = urlBreadcrumb(r.url);
              return (
                <div
                  key={i}
                  className="group"
                  style={{ animation: `fade-in 0.3s ease-out ${i * 0.05}s both` }}
                >
                  {/* URL line with favicon */}
                  <div className="flex items-center gap-2 mb-1">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                      alt=""
                      width={16}
                      height={16}
                      className="rounded-full"
                    />
                    <div className="min-w-0">
                      <div className="text-sm text-[var(--text-muted)] truncate">{domain}</div>
                      {breadcrumb && (
                        <div className="text-xs text-[var(--text-dim)] truncate">{breadcrumb}</div>
                      )}
                    </div>
                  </div>

                  {/* Title */}
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <h3 className="text-[18px] text-[var(--accent)] group-hover:underline leading-snug mb-1">
                      {r.title}
                    </h3>
                  </a>

                  {/* Snippet */}
                  <p className="text-[13px] text-[var(--text-muted)] leading-[1.6] line-clamp-3">
                    {r.snippet}
                  </p>

                  {/* Subtle score hints */}
                  <div className="flex items-center gap-3 mt-1.5 h-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="text-[10px] text-[var(--text-dim)] font-mono">
                      BM25 {(r.bm25_score ?? 0).toFixed(1)}
                    </span>
                    <span className="text-[10px] text-[var(--text-dim)] font-mono">
                      PageRank {(r.pagerank_score ?? 0).toFixed(4)}
                    </span>
                    <span className="text-[10px] text-[var(--accent)] font-mono">
                      Score {(r.final_score ?? 0).toFixed(2)}
                    </span>
                  </div>
                </div>
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

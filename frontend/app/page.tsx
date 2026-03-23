"use client";

import { useState, useCallback, useEffect, memo } from "react";
import { useSearchEngine, type SearchEngineState } from "@/hooks/useSearchEngine";
import AIOverview from "@/components/AIOverview";
import PipelineExplorer from "@/components/PipelineExplorer";
import type { FlowPhase } from "@/components/canvas/types";

type View = "search" | "explore";
type Theme = "light" | "dark";

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = saved || (prefersDark ? "dark" : "light");
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
      return next;
    });
  }, []);

  return [theme, toggle];
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="p-1.5 rounded-full text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
    >
      {theme === "light" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      )}
    </button>
  );
}

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
const PLACEHOLDERS = [
  "Search for players, teams, and tournaments...",
  "Who won the 2022 World Cup?",
  "Champions League top scorers",
  "Messi vs Ronaldo stats",
  "Premier League standings",
];

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
          type="button"
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
        {/* AI Overview — shifts right when pipeline overlays */}
        <div className={`pt-2 px-4 transition-[padding-left] duration-500 ${
          isExploring ? "lg:pl-[67%] lg:pr-4" : "sm:px-8 lg:pl-[152px] lg:pr-4 max-w-4xl"
        }`}>
          <AIOverview text={engine.overviewText} sources={engine.overviewSources} loading={engine.overviewLoading} streaming={engine.overviewStreaming} compact={isExploring} />
        </div>

        {/* Results — shifts right when pipeline overlays */}
        <div className={`px-4 py-2 space-y-4 transition-[padding-left] duration-500 ${
          isExploring ? "lg:pl-[67%] lg:pr-4 max-w-none" : "sm:px-8 lg:pl-[152px] lg:pr-4 max-w-3xl"
        }`}>
          <div className="text-[12px] @lg:text-[13px] text-[var(--meta)]">
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
                    {breadcrumb && <div className="text-[12px] text-[var(--meta)] truncate">{breadcrumb}</div>}
                  </div>
                </div>
                {/* Title */}
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="block">
                  <h3 className="text-[16px] sm:text-[18px] text-[var(--link-blue)] group-hover:underline leading-snug">{r.title}</h3>
                </a>
                {/* Snippet */}
                <p className="text-[13px] text-[var(--snippet)] leading-[1.5] line-clamp-2 sm:line-clamp-3 mt-0.5">{r.snippet}</p>
                {/* Score hints on hover */}
                <div className="hidden @lg:flex items-center gap-3 mt-1.5 h-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <span className="text-[10px] text-[var(--meta)] font-mono">BM25 {(r.bm25_score ?? 0).toFixed(1)}</span>
                  <span className="text-[10px] text-[var(--meta)] font-mono">PageRank {(r.pagerank_score ?? 0).toFixed(4)}</span>
                  <span className="text-[10px] text-[var(--accent)] font-mono">Score {(r.final_score ?? 0).toFixed(2)}</span>
                </div>
              </div>
            );
          })}

          <div className="pt-4 @lg:pt-6">
            <button onClick={onToggleView} className="inline-flex items-center gap-1.5 text-[11px] @lg:text-xs text-[var(--meta)] hover:text-[var(--accent)] transition-colors cursor-pointer">
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
  const [theme, toggleTheme] = useTheme();
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const hasResults = engine.searchData !== null;
  const toggleView = useCallback(() => setView(v => v === "search" ? "explore" : "search"), []);

  useEffect(() => {
    const timer = setInterval(() => setPlaceholderIdx(i => (i + 1) % PLACEHOLDERS.length), 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      {!hasResults ? (
        /* Hero state — clean, no shadows */
        <div className="min-h-screen flex flex-col items-center justify-center relative px-3 sm:px-4">
          {/* Theme toggle */}
          <div className="absolute top-4 right-4 z-10">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>

          <div className="max-w-2xl w-full text-center" style={{ animation: "fade-in 0.5s ease-out" }}>
            {/* Animated SVG football */}
            <div className="mb-5 sm:mb-6">
              <svg width="48" height="48" viewBox="0 0 48 48" className="mx-auto" style={{ animation: "ball-bounce 2s ease-in-out infinite" }}>
                <circle cx="24" cy="24" r="20" fill="none" stroke="var(--text)" strokeWidth="1.5" opacity="0.8" />
                <path d="M24 4 L30 16 L24 14 L18 16 Z" fill="var(--text)" opacity="0.12" />
                <path d="M44 24 L32 30 L34 24 L32 18 Z" fill="var(--text)" opacity="0.12" />
                <path d="M24 44 L18 32 L24 34 L30 32 Z" fill="var(--text)" opacity="0.12" />
                <path d="M4 24 L16 18 L14 24 L16 30 Z" fill="var(--text)" opacity="0.12" />
                <polygon points="20,10 28,10 32,17 28,23 20,23 16,17" fill="none" stroke="var(--text)" strokeWidth="1" opacity="0.3" />
                <polygon points="34,17 38,24 34,31 28,29 28,19" fill="none" stroke="var(--text)" strokeWidth="1" opacity="0.3" />
                <polygon points="28,35 20,35 16,31 20,25 28,25 32,31" fill="none" stroke="var(--text)" strokeWidth="1" opacity="0.3" />
                <polygon points="14,31 10,24 14,17 20,19 20,29" fill="none" stroke="var(--text)" strokeWidth="1" opacity="0.3" />
                <polygon points="20,10 16,17 20,23 28,23 32,17 28,10" fill="var(--text)" opacity="0.06" />
              </svg>
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[var(--text)] mb-2 sm:mb-3">
              Football Search
            </h1>
            <p className="text-[var(--text-dim)] text-sm sm:text-base mb-6 sm:mb-8 max-w-md mx-auto leading-relaxed">
              A search engine built from scratch — BM25, PageRank, and AI Overviews
            </p>

            {/* Search bar — no shadow */}
            <form onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q") as string; if (q.trim()) engine.handleSearch(q.trim()); }} className="relative">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-dim)]">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input name="q" type="text" placeholder={PLACEHOLDERS[placeholderIdx]}
                className="w-full pl-12 pr-4 py-3.5 sm:py-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl text-[var(--text)] text-sm sm:text-base placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]/40 transition-colors" />
            </form>

            {/* Suggestion chips */}
            <div className="mt-4 sm:mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((q, i) => (
                <button key={q} onClick={() => engine.handleSearch(q)}
                  className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 cursor-pointer transition-colors"
                  style={{ animation: `fade-in 0.4s ease-out ${0.2 + i * 0.06}s both` }}>
                  {q}
                </button>
              ))}
            </div>

            {/* Tech stack */}
            <div className="mt-10 sm:mt-12 flex justify-center gap-4 sm:gap-5">
              {["BM25", "PageRank", "AI Overviews", "Vector Search"].map((tech) => (
                <span key={tech} className="text-[10px] sm:text-xs font-mono text-[var(--text-dim)] opacity-30">{tech}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Results state — dynamic island pill bar */
        <div className="sticky top-0 z-30 bg-[var(--bg)] pt-2 sm:pt-3 pb-2 sm:pb-3">
          <div className="px-3 sm:px-4 lg:pl-[152px] lg:pr-4 max-w-4xl">
            <form onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q") as string; if (q.trim()) engine.handleSearch(q.trim()); }}
              className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-full shadow-sm hover:shadow-md transition-shadow px-3 sm:px-4"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-dim)] shrink-0">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input name="q" type="text" defaultValue={engine.query} key={engine.query}
                className="flex-1 py-2 sm:py-2.5 bg-transparent text-[var(--text)] text-sm placeholder:text-[var(--text-dim)] focus:outline-none min-w-0" />
              <div className="shrink-0 border-l border-[var(--border)] pl-2 sm:pl-3 ml-1 flex items-center gap-1">
                <ViewToggle view={view} onChange={setView} />
                <ThemeToggle theme={theme} onToggle={toggleTheme} />
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

    </div>
  );
}

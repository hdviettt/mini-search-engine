"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchEngine } from "@/hooks/useSearchEngine";
import AIOverview from "@/components/AIOverview";
import PipelineExplorer, { DetailPanel, type NodeId } from "@/components/PipelineExplorer";
import { getStats } from "@/lib/api";

type View = "search" | "explore";
type Theme = "light" | "dark";

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    const initial = saved || "dark";
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
      className="p-2 rounded-lg text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
    >
      {theme === "light" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      )}
    </button>
  );
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
    return { domain, breadcrumb: segments.map((s) => decodeURIComponent(s).replace(/_/g, " ")).join(" \u203A ") };
  } catch {
    return { domain: url, breadcrumb: "" };
  }
}

export default function Home() {
  const engine = useSearchEngine();
  const [view, setView] = useState<View>("search");
  const [theme, toggleTheme] = useTheme();
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const hasResults = engine.searchData !== null;

  useEffect(() => {
    const timer = setInterval(() => setPlaceholderIdx(i => (i + 1) % PLACEHOLDERS.length), 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {!hasResults ? (
        /* ═══════════════════ Hero ═══════════════════ */
        <div className="min-h-screen flex flex-col items-center justify-center relative px-4">
          <div className="absolute top-4 right-4 z-10">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>

          <div className="max-w-2xl w-full text-center" style={{ animation: "fade-in 0.5s ease-out" }}>
            <div className="mb-8">
              <img src="/ronaldo.svg" alt="Ronaldo SIU celebration" className="h-40 sm:h-52 mx-auto siu-entrance dark-svg-fix" draggable={false} />
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[var(--text)] mb-3">
              Football Search
            </h1>
            <p className="text-[var(--text-muted)] text-sm sm:text-[15px] mb-10 max-w-md mx-auto leading-relaxed">
              BM25 ranking, PageRank, and AI Overviews &mdash; built from scratch
            </p>

            <form onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q") as string;
              if (q.trim()) engine.handleSearch(q.trim());
            }} className="max-w-xl mx-auto">
              <div className="flex items-center bg-[var(--bg-card)] border border-[var(--border)] rounded-full px-4 hover:border-[var(--border-hover)] focus-within:border-[var(--accent)]/50 transition-all shadow-lg shadow-black/5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-dim)] shrink-0">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input name="q" type="text" placeholder={PLACEHOLDERS[placeholderIdx]}
                  className="flex-1 py-3.5 sm:py-4 px-3 bg-transparent text-[var(--text)] text-[15px] placeholder:text-[var(--text-dim)] focus:outline-none" />
              </div>
            </form>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((q, i) => (
                <button key={q} onClick={() => engine.handleSearch(q)}
                  className="text-[13px] px-4 py-2 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--chip-hover)] cursor-pointer transition-colors"
                  style={{ animation: `fade-in 0.4s ease-out ${0.2 + i * 0.06}s both` }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ═══════════════════ Results header ═══════════════════ */}
          <header className="sticky top-0 z-30 bg-[var(--bg)]/95 backdrop-blur-md border-b border-[var(--border)]">
            <div className="flex items-center gap-3 sm:gap-4 px-4 lg:px-6 py-2.5">
              {/* Logo */}
              <a href="/" className="text-[17px] font-bold text-[var(--text)] hover:text-[var(--accent)] transition-colors shrink-0 tracking-tight">
                FS
              </a>

              {/* Search bar */}
              <form onSubmit={(e) => {
                e.preventDefault();
                const q = new FormData(e.currentTarget).get("q") as string;
                if (q.trim()) engine.handleSearch(q.trim());
              }} className="flex-1 max-w-2xl">
                <div className="flex items-center bg-[var(--bg-card)] border border-[var(--border)] rounded-full px-3 hover:border-[var(--border-hover)] focus-within:border-[var(--accent)]/40 transition-colors">
                  <input name="q" type="text" defaultValue={engine.query} key={engine.query}
                    className="flex-1 py-2 px-2 bg-transparent text-[var(--text)] text-sm focus:outline-none min-w-0" />
                  <button type="button" onClick={() => {
                    const input = document.querySelector("header input[name='q']") as HTMLInputElement;
                    if (input) { input.value = ""; input.focus(); }
                  }} className="p-1 text-[var(--text-dim)] hover:text-[var(--text)] transition-colors cursor-pointer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                    </svg>
                  </button>
                  <button type="submit" className="p-1 text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors cursor-pointer">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                    </svg>
                  </button>
                </div>
              </form>

              {/* Right controls */}
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>

            {/* Tab nav */}
            <div className="flex items-center gap-1 px-4 lg:px-6 pb-2">
              {([
                { id: "search" as const, label: "All" },
                { id: "explore" as const, label: "Explore" },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setView(tab.id)}
                  className={`px-3.5 py-1.5 text-[13px] rounded-full transition-all cursor-pointer ${
                    view === tab.id
                      ? "bg-[var(--accent)] text-white font-medium"
                      : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </header>

          {/* ═══════════════════ Content ═══════════════════ */}
          {view === "search" ? (
            <main className="max-w-3xl px-4 lg:px-6 py-4 lg:pl-40">
              {/* AI Overview */}
              <AIOverview
                text={engine.overviewText}
                sources={engine.overviewSources}
                loading={engine.overviewLoading}
                streaming={engine.overviewStreaming}
                onSearch={engine.handleSearch}
                query={engine.query}
              />

              {/* Results meta */}
              <div className="text-[12px] text-[var(--meta)] mb-5">
                {engine.searchData!.total_results} results ({(engine.searchData!.time_ms / 1000).toFixed(2)}s)
              </div>

              {/* Results list */}
              <div className="space-y-6">
                {engine.searchData!.results.map((r, i) => {
                  const { domain, breadcrumb } = urlBreadcrumb(r.url);
                  return (
                    <article key={i} className="group">
                      {/* Site info */}
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <div className="w-7 h-7 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center shrink-0">
                          <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" width={18} height={18} className="rounded-full" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-[var(--text)] truncate">{domain}</div>
                          {breadcrumb && (
                            <div className="text-[12px] text-[var(--meta)] truncate">{domain} &rsaquo; {breadcrumb}</div>
                          )}
                        </div>
                      </div>
                      {/* Title */}
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="block">
                        <h3 className="text-[17px] text-[var(--link-blue)] group-hover:underline leading-snug">{r.title}</h3>
                      </a>
                      {/* Snippet */}
                      <p className="text-[13px] text-[var(--snippet)] leading-[1.58] line-clamp-3 mt-1">{r.snippet}</p>
                      {/* Score hints on hover */}
                      <div className="hidden sm:flex items-center gap-3 mt-1.5 h-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <span className="text-[10px] text-[var(--meta)] font-mono">BM25 {(r.bm25_score ?? 0).toFixed(1)}</span>
                        <span className="text-[10px] text-[var(--meta)] font-mono">PageRank {(r.pagerank_score ?? 0).toFixed(4)}</span>
                        <span className="text-[10px] text-[var(--accent)] font-mono">Score {(r.final_score ?? 0).toFixed(2)}</span>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Explore CTA */}
              <div className="pt-8 pb-10">
                <button onClick={() => setView("explore")} className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors cursor-pointer">
                  See how these results were computed
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              </div>
            </main>
          ) : (
            /* ═══════════════════ Explore view ═══════════════════ */
            <div className="lg:flex lg:h-[calc(100vh-96px)]">
              {/* Pipeline — left 65% */}
              <div className="lg:w-[65%] lg:border-r lg:border-[var(--border)] lg:overflow-y-auto">
                <PipelineExplorer
                  data={engine.searchData}
                  stats={engine.stats}
                  overviewText={engine.overviewText}
                  overviewSources={engine.overviewSources}
                  overviewLoading={engine.overviewLoading || engine.overviewStreaming}
                  overviewTrace={engine.overviewTrace}
                  selectedNode={selectedNode}
                  onNodeSelect={setSelectedNode}
                />
              </div>

              {/* Results sidebar — right 35% */}
              <div className="lg:w-[35%] lg:overflow-y-auto">
                {selectedNode && (
                  <div className="px-4 pt-3 pb-2 border-b border-[var(--border)]">
                    <DetailPanel
                      nodeId={selectedNode as NodeId}
                      data={engine.searchData!}
                      stats={engine.stats}
                      onClose={() => setSelectedNode(null)}
                      onRefreshStats={() => getStats().then(() => {}).catch(() => {})}
                      overviewText={engine.overviewText}
                      overviewSources={engine.overviewSources}
                      overviewLoading={engine.overviewLoading}
                      overviewTrace={engine.overviewTrace}
                    />
                  </div>
                )}
                <div className="px-4 py-3 space-y-4">
                  <div className="text-[12px] text-[var(--meta)]">
                    {engine.searchData!.total_results} results ({(engine.searchData!.time_ms / 1000).toFixed(2)}s)
                  </div>
                  {engine.searchData!.results.map((r, i) => {
                    const { domain } = urlBreadcrumb(r.url);
                    return (
                      <div key={i} className="group">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-6 h-6 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center shrink-0">
                            <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" width={14} height={14} className="rounded-full" />
                          </div>
                          <span className="text-[12px] font-medium text-[var(--text)] truncate">{domain}</span>
                        </div>
                        <a href={r.url} target="_blank" rel="noopener noreferrer">
                          <h3 className="text-[15px] text-[var(--link-blue)] group-hover:underline leading-snug">{r.title}</h3>
                        </a>
                        <p className="text-[12px] text-[var(--snippet)] leading-[1.5] line-clamp-2 mt-0.5">{r.snippet}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Mobile: floating back button in explore mode */}
          {view === "explore" && (
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
        </>
      )}
    </div>
  );
}

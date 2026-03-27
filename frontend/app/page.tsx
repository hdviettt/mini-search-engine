"use client";

import { useState, useCallback, useEffect, memo } from "react";
import { useSearchEngine, type SearchEngineState } from "@/hooks/useSearchEngine";
import AIOverview from "@/components/AIOverview";
import AIChat from "@/components/AIChat";
import MatchCard from "@/components/MatchCard";
import PipelineExplorer, { DetailPanel, type NodeId } from "@/components/PipelineExplorer";
import { getStats, getStatsHistory, type StatsHistory } from "@/lib/api";

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

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const tabs: { id: View; label: string }[] = [
    { id: "search", label: "All" },
    { id: "explore", label: "Explore" },
  ];
  return (
    <div className="flex bg-[var(--bg-elevated)] rounded-full p-0.5 text-sm">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`px-2.5 sm:px-3 py-1 rounded-full transition-all cursor-pointer ${
            view === t.id
              ? "bg-[var(--bg-card)] text-[var(--text)] shadow-sm font-medium"
              : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
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

/* ═══════════════════════════════════════════════════════════════
   SerpSidePanel — always rendered; shifts right when exploring
   ═══════════════════════════════════════════════════════════════ */
const SerpSidePanel = memo(function SerpSidePanel({
  engine, onToggleView, isExploring, selectedNode, onCloseNode,
}: {
  engine: SearchEngineState;
  onToggleView: () => void;
  isExploring: boolean;
  selectedNode: string | null;
  onCloseNode: () => void;
}) {
  const [chatFollowUp, setChatFollowUp] = useState<string | undefined>();
  const [aiChatActive, setAiChatActive] = useState(false);

  // Reset chat when query changes
  useEffect(() => { setChatFollowUp(undefined); setAiChatActive(false); }, [engine.query]);

  if (!engine.searchData) return null;

  const plExploring = isExploring ? "lg:pl-[67%] lg:pr-6" : "max-w-[692px] mx-auto";

  return (
    <div className="@container bg-[var(--bg)]">
      <div className={`px-4 transition-[padding-left] duration-500 ${plExploring}`}>
        {/* Node detail panel — sticky above results when exploring + node selected */}
        {isExploring && selectedNode && (
          <div className="hidden lg:block pt-3 pb-2 border-b border-[var(--border)]">
            <DetailPanel
              nodeId={selectedNode as NodeId}
              data={engine.searchData}
              stats={engine.stats}
              onClose={onCloseNode}
              onRefreshStats={() => getStats().then(() => {}).catch(() => {})}
              overviewText={engine.overviewText}
              overviewSources={engine.overviewSources}
              overviewLoading={engine.overviewLoading}
              overviewTrace={engine.overviewTrace}
            />
          </div>
        )}

        {/* Single content column — Google-style ~692px max width */}
        <div className="max-w-[692px]">
          {/* AI Overview / AI Chat Mode */}
          <div className="pt-2">
            {aiChatActive && engine.overviewText ? (
              <AIChat
                initialQuery={engine.query}
                initialOverview={engine.overviewText}
                initialSources={engine.overviewSources.map(s => ({ index: s.index, title: s.title, url: s.url }))}
                initialFollowUp={chatFollowUp}
                onClose={() => { setChatFollowUp(undefined); setAiChatActive(false); }}
              />
            ) : (
              <AIOverview
                text={engine.overviewText}
                sources={engine.overviewSources}
                loading={engine.overviewLoading}
                streaming={engine.overviewStreaming}
                compact={isExploring}
                onSearch={engine.handleSearch}
                query={engine.query}
                onEnterChat={(q) => { setChatFollowUp(q); setAiChatActive(true); }}
              />
            )}
          </div>

          {/* Sports card — live scores, fixtures, standings */}
          {engine.searchData?.sports && (
            <div>
              <MatchCard data={engine.searchData.sports} />
            </div>
          )}

          {/* Results */}
          <div className="py-4 space-y-8">
            <div className="text-[14px] text-[var(--meta)]">
              {engine.searchData.total_results} results ({(engine.searchData.time_ms / 1000).toFixed(2)}s)
            </div>
            {engine.searchData.results.map((r, i) => {
              const { domain, breadcrumb } = urlBreadcrumb(r.url);
              return (
                <article key={i} className="group">
                  {/* Site info — favicon + domain + breadcrumb */}
                  <div className="flex items-center gap-3.5 mb-2">
                    <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center shrink-0">
                      <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" width={24} height={24} className="rounded-full" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[16px] font-medium text-[var(--text)] truncate">{domain}</div>
                      {breadcrumb && <div className="text-[14px] text-[var(--meta)] truncate">{domain} &rsaquo; {breadcrumb}</div>}
                    </div>
                  </div>
                  {/* Title */}
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="block">
                    <h3 className="text-[22px] text-[var(--link-blue)] group-hover:underline leading-snug">{r.title}</h3>
                  </a>
                  {/* Snippet */}
                  <p className="text-[16px] text-[var(--snippet)] leading-[1.6] line-clamp-2 sm:line-clamp-3 mt-1">{r.snippet}</p>
                  {/* Score hints on hover */}
                  <div className="hidden @lg:flex items-center gap-3 mt-2 h-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="text-[11px] text-[var(--meta)] font-mono">BM25 {(r.bm25_score ?? 0).toFixed(1)}</span>
                    <span className="text-[11px] text-[var(--meta)] font-mono">PageRank {(r.pagerank_score ?? 0).toFixed(4)}</span>
                    <span className="text-[11px] text-[var(--accent)] font-mono">Score {(r.final_score ?? 0).toFixed(2)}</span>
                  </div>
                </article>
              );
            })}

            <div className="pt-4 @lg:pt-6">
              <button onClick={onToggleView} className="inline-flex items-center gap-1.5 text-sm text-[var(--meta)] hover:text-[var(--accent)] transition-colors cursor-pointer">
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
    </div>
  );
});

function HeroDashboard({ onSearch }: { onSearch: (q: string) => void }) {
  const [history, setHistory] = useState<StatsHistory | null>(null);
  const [currentStats, setCurrentStats] = useState<{ pages: number; terms: number; queries: number; avg_ms: number } | null>(null);
  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    getStatsHistory(30).then(setHistory).catch(() => {});
    fetch(`${API}/api/dashboard`)
      .then(r => r.json())
      .then(d => {
        if (!d.error) setCurrentStats({ pages: d.corpus?.pages || 0, terms: d.corpus?.terms || 0, queries: d.search?.total_queries || 0, avg_ms: d.search?.avg_latency_ms || 0 });
      })
      .catch(() => {});
  }, [API]);

  // Use snapshots for all charts (they have actual multi-point data)
  const snaps = history?.snapshots || [];
  const toPoints = (key: string) => snaps.map((s: Record<string, unknown>) => ({
    day: (s.time as string)?.slice(11, 16) || "", // "HH:MM"
    value: (s[key] as number) || 0,
  }));

  // Monochromatic — all use the same muted color
  const lineColor = "var(--text-dim)";

  const charts = [
    { title: "Pages Crawled", data: toPoints("pages"), current: currentStats?.pages, suffix: "" },
    { title: "Index Terms", data: toPoints("terms"), current: currentStats?.terms, suffix: "" },
    { title: "Search Queries", data: toPoints("queries"), current: currentStats?.queries, suffix: "" },
    { title: "Avg Latency", data: toPoints("avg_ms"), current: currentStats?.avg_ms ? Math.round(currentStats.avg_ms) : null, suffix: "ms" },
  ];

  return (
    <div className="w-full max-w-[640px]" style={{ animation: "fade-in 0.5s ease-out 0.15s both" }}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {charts.map((c, i) => {
          const hasData = c.data.length >= 2;
          const values = c.data.map(d => d.value);
          const displayValue = c.current != null ? c.current.toLocaleString() + c.suffix : "—";

          let sparkline = null;
          if (hasData) {
            const max = Math.max(...values, 1);
            const min = Math.min(...values, 0);
            const range = max - min || 1;
            const w = 200, h = 36;
            const pts = values.map((v, j) => `${(j / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(" ");
            sparkline = (
              <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[36px] mt-1.5 opacity-40" preserveAspectRatio="none">
                <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            );
          }

          return (
            <div key={i} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 pt-2.5 pb-1.5">
              <div className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider">{c.title}</div>
              <div className="text-[17px] font-semibold text-[var(--text)] tabular-nums leading-tight">{displayValue}</div>
              {sparkline || <div className="h-[36px] mt-1.5 rounded bg-[var(--bg-elevated)]" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Home
   ═══════════════════════════════════════════════════════════════ */
export default function Home() {
  const engine = useSearchEngine();
  const [view, setView] = useState<View>("search");
  const [theme, toggleTheme] = useTheme();
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const hasResults = engine.searchData !== null;
  const isSearching = engine.query !== "" && !hasResults;  // loading state: query set but no results yet
  const toggleView = useCallback(() => setView(v => v === "search" ? "explore" : "search"), []);

  useEffect(() => {
    const timer = setInterval(() => setPlaceholderIdx(i => (i + 1) % PLACEHOLDERS.length), 3000);
    return () => clearInterval(timer);
  }, []);

  const isHero = !hasResults && !isSearching;

  return (
    <div className={`bg-[var(--bg)] ${isHero ? "hero-lock h-full" : "lg:fixed lg:inset-0 lg:flex lg:flex-col min-h-screen"}`}>
      {/* ═══════════════════ Persistent header — always centered ═══════════════════ */}
      <div className={`shrink-0 ${isHero ? "" : "sticky top-0 z-30 bg-[var(--bg)]/95 backdrop-blur-md"} pt-2 sm:pt-3 pb-2 sm:pb-3`}>
        <div className="max-w-[640px] mx-auto flex items-center gap-2.5 px-4">
          <a href="/" className="text-[18px] font-bold text-[var(--text)] hover:text-[var(--accent)] transition-colors tracking-tight shrink-0">
            FS
          </a>

          <form onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q") as string; if (q.trim()) engine.handleSearch(q.trim()); }}
            className="flex-1 flex items-center gap-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-full hover:border-[var(--border-hover)] focus-within:border-[var(--text-dim)] transition-all px-3 sm:px-4"
          >
            <input name="q" type="text"
              defaultValue={hasResults || isSearching ? engine.query : undefined}
              key={hasResults || isSearching ? engine.query : "hero"}
              placeholder={isHero ? PLACEHOLDERS[placeholderIdx] : "Search..."}
              className="flex-1 py-2.5 bg-transparent text-[var(--text)] text-[15px] placeholder:text-[var(--text-dim)] focus:outline-none min-w-0" />
            {(hasResults || isSearching) && (
              <button type="button" onClick={() => { window.location.href = "/"; }}
                className="p-1 text-[var(--text-dim)] hover:text-[var(--text)] transition-colors cursor-pointer shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            )}
            <button type="submit" className="p-1 text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors cursor-pointer shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
            </button>
            {(hasResults || isSearching) && (
              <div className="shrink-0 border-l border-[var(--border)] pl-2 ml-1 flex items-center gap-1">
                <ViewToggle view={view} onChange={setView} />
              </div>
            )}
          </form>

          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </div>

      {/* ═══════════════════ Hero content ═══════════════════ */}
      {isHero && (
        <div className="flex flex-col items-center px-4 pt-6" style={{ animation: "content-in 0.3s ease-out" }}>
          {/* Suggestion chips */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {SUGGESTIONS.map((q) => (
              <button key={q} onClick={() => engine.handleSearch(q)}
                className="text-[12px] px-3 py-1 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--chip-hover)] cursor-pointer transition-colors">
                {q}
              </button>
            ))}
          </div>

          {/* Dashboard */}
          <HeroDashboard onSearch={engine.handleSearch} />
        </div>
      )}

      {/* ═══════════════════ Loading skeleton ═══════════════════ */}
      {isSearching && (
        <div className="max-w-[692px] mx-auto px-4 py-6" style={{ animation: "content-in 0.3s ease-out" }}>
          <div className="space-y-3 mb-8">
            <div className="h-4 bg-[var(--skeleton)] animate-pulse rounded-full w-32" />
            <div className="h-3 bg-[var(--skeleton)] animate-pulse rounded-full w-full" />
            <div className="h-3 bg-[var(--skeleton)] animate-pulse rounded-full w-[95%]" />
            <div className="h-3 bg-[var(--skeleton)] animate-pulse rounded-full w-[85%]" />
            <div className="h-3 bg-[var(--skeleton)] animate-pulse rounded-full w-[70%]" />
          </div>
          <div className="border-b border-[var(--separator)] mb-6" />
          {[1, 2, 3].map(i => (
            <div key={i} className="mb-6">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-full bg-[var(--skeleton)] animate-pulse" />
                <div className="h-3 bg-[var(--skeleton)] animate-pulse rounded-full w-32" />
              </div>
              <div className="h-4 bg-[var(--skeleton)] animate-pulse rounded-full w-3/4 mb-2" />
              <div className="h-3 bg-[var(--skeleton)] animate-pulse rounded-full w-full mb-1" />
              <div className="h-3 bg-[var(--skeleton)] animate-pulse rounded-full w-[90%]" />
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {hasResults && (
        <div className="relative lg:flex-1 lg:min-h-0" style={{ animation: "content-in 0.3s ease-out" }}>
          {/* SERP — always rendered on desktop; hidden on mobile when exploring */}
          <div className={`lg:h-full lg:overflow-y-auto lg:overscroll-contain ${view === "explore" ? "hidden lg:block" : ""}`}>
            <SerpSidePanel engine={engine} onToggleView={toggleView} isExploring={view === "explore"} selectedNode={selectedNode} onCloseNode={() => setSelectedNode(null)} />
          </div>

          {/* Pipeline — full-width on mobile when exploring; slide overlay on desktop */}
          <div
            className={`lg:absolute lg:top-0 lg:left-0 lg:h-full lg:w-[65%] lg:bg-[var(--bg)] lg:border-r lg:border-[var(--border)] lg:overflow-y-auto lg:overscroll-contain lg:z-10 ${
              view === "explore"
                ? "block lg:translate-x-0 lg:transition-transform lg:duration-500 lg:ease-in-out"
                : "hidden lg:block lg:-translate-x-full lg:pointer-events-none lg:invisible lg:transition-[transform,visibility] lg:duration-500 lg:ease-in-out"
            }`}
          >
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

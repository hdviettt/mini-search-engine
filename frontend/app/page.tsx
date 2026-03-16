"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import CanvasLayout from "@/components/canvas/CanvasLayout";
import DetailPanel from "@/components/canvas/DetailPanel";
import AIOverview from "@/components/AIOverview";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useResizable } from "@/hooks/useResizable";
import type { FlowPhase } from "@/components/canvas/types";
import { searchExplain, getStats, getOverviewStreamUrl } from "@/lib/api";
import type { OverviewSource, OverviewTrace } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import type { ExplainResponse, Stats, SearchParams, CrawlProgressData, IndexProgressData, EmbedProgressData } from "@/lib/types";

const DEFAULT_PARAMS: SearchParams = { bm25_k1: 1.2, bm25_b: 0.75, rank_alpha: 0.7 };

// Phase sequence for animating the search pipeline
const SEARCH_PHASES: { phase: FlowPhase; delay: number }[] = [
  { phase: "queryInput", delay: 0 },
  { phase: "tokenizing", delay: 300 },
  { phase: "indexLookup", delay: 550 },
  { phase: "bm25", delay: 800 },
  { phase: "pagerank", delay: 1100 },
  { phase: "combining", delay: 1400 },
  { phase: "results", delay: 1700 },
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [searchData, setSearchData] = useState<ExplainResponse | null>(null);
  const [phase, setPhase] = useState<FlowPhase>("idle");

  // AI Overview
  const [overviewText, setOverviewText] = useState("");
  const [overviewSources, setOverviewSources] = useState<OverviewSource[]>([]);
  const [overviewTrace, setOverviewTrace] = useState<OverviewTrace | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewStreaming, setOverviewStreaming] = useState(false);

  // UI
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [dockVisible, setDockVisible] = useState(false);

  // Jobs
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgressData | null>(null);
  const [indexProgress, setIndexProgress] = useState<IndexProgressData | null>(null);
  const [embedProgress, setEmbedProgress] = useState<EmbedProgressData | null>(null);
  const [logEntries, setLogEntries] = useState<string[]>([]);
  const [crawledPages, setCrawledPages] = useState<CrawlProgressData[]>([]);
  const [activeCrawlJobId, setActiveCrawlJobId] = useState<string | null>(null);
  const [buildComplete, setBuildComplete] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  const { lastMessage } = useWebSocket();
  const abortRef = useRef<AbortController | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { width: searchPanelWidth, onMouseDown: onSearchResize } = useResizable({ initial: 480, min: 280, max: 700, direction: "left" });

  useEffect(() => { getStats().then(setStats).catch(() => {}); }, []);

  // WebSocket handler
  useEffect(() => {
    if (!lastMessage) return;
    const { type, data } = lastMessage;
    if (type === "crawl_progress") {
      const d = data as CrawlProgressData;
      setCrawlProgress(d);
      setCrawledPages((prev) => [...prev.slice(-100), d]);
      setLogEntries((prev) => [...prev.slice(-200), `[${d.pages_crawled}/${d.max_pages}] ${d.status === "ok" ? "OK" : "FAIL"} ${d.title || d.current_url}`]);
    } else if (type === "crawl_complete") {
      const d = data as Record<string, unknown>;
      if (d.status === "failed") {
        setBuildError((d.error as string) || "Crawl failed");
      }
      setLogEntries((prev) => [...prev, "Crawl complete."]);
      setCrawlProgress(null);
      getStats().then(setStats);
    } else if (type === "index_progress") {
      const d = data as IndexProgressData;
      setIndexProgress(d);
      // Refresh stats every 100 pages to keep store nodes up to date
      if (d.pages_done % 100 === 0) getStats().then(setStats);
    } else if (type === "index_complete") {
      setIndexProgress(null);
      getStats().then(setStats);
    } else if (type === "embed_progress") {
      const d = data as EmbedProgressData;
      setEmbedProgress(d);
      // Refresh stats every 200 chunks
      if (d.chunks_done % 200 === 0) getStats().then(setStats);
    } else if (type === "embed_complete") {
      setEmbedProgress(null);
      getStats().then(setStats);
    } else if (type === "build_complete") {
      getStats().then(setStats);
      setBuildComplete(true);
      setBuildError(null);
      setTimeout(() => setBuildComplete(false), 10000);
    }
  }, [lastMessage]);

  // Stream AI overview
  const streamOverview = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setOverviewText("");
    setOverviewSources([]);
    setOverviewTrace(null);
    setOverviewLoading(true);
    setOverviewStreaming(false);

    try {
      const response = await fetch(getOverviewStreamUrl(q), { signal: controller.signal });
      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      const traceData: OverviewTrace = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.type === "sources") {
              setOverviewSources(msg.sources);
              setOverviewLoading(false);
            } else if (msg.type === "trace") {
              if (msg.step === "fanout") { traceData.fanout = msg.data; setPhase("aiFanout"); }
              if (msg.step === "retrieval") { traceData.retrieval = msg.data; setPhase("aiRetrieval"); }
              if (msg.step === "synthesis") { traceData.synthesis = msg.data; setPhase("aiSynthesis"); }
              setOverviewTrace({ ...traceData });
            } else if (msg.type === "token") {
              setOverviewLoading(false);
              setOverviewStreaming(true);
              setOverviewText((prev) => prev + msg.content);
            } else if (msg.type === "text") {
              setOverviewLoading(false);
              setOverviewText(msg.content);
            } else if (msg.type === "done") {
              setOverviewStreaming(false);
              setPhase("aiComplete");
              if (msg.total_ms) {
                traceData.total_ms = msg.total_ms;
                setOverviewTrace({ ...traceData });
              }
            }
          } catch { /* */ }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    } finally {
      setOverviewLoading(false);
      setOverviewStreaming(false);
    }
  }, []);

  // Main search handler
  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    setPhase("idle");
    setSelectedNode(null);

    // Clear old timers
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    // Reset AI overview
    setOverviewText("");
    setOverviewSources([]);
    setOverviewTrace(null);

    try {
      // Fetch results
      const data = await searchExplain(q, DEFAULT_PARAMS);
      setSearchData(data);
      setDockVisible(true);

      // Animate phases sequentially
      for (const { phase: p, delay } of SEARCH_PHASES) {
        const timer = setTimeout(() => setPhase(p), delay);
        timersRef.current.push(timer);
      }

      // Start AI overview stream after search animation
      if (data.total_results >= 3) {
        const timer = setTimeout(() => streamOverview(q), 2100);
        timersRef.current.push(timer);
      }
    } catch { /* */ }
  }, [streamOverview]);

  return (
    <ErrorBoundary>
    <div className="flex w-screen h-screen overflow-hidden bg-[var(--bg)]">
      {/* LEFT: Canvas — takes remaining space */}
      <div className="flex-1 h-full relative min-w-0">
        <CanvasLayout
          onSearch={handleSearch}
          query={query}
          phase={phase}
          stats={stats}
          searchData={searchData}
          overviewText={overviewText}
          overviewTrace={overviewTrace}
          onNodeClick={setSelectedNode}
          crawlProgress={crawlProgress}
          indexProgress={indexProgress}
          embedProgress={embedProgress}
        />
        {/* Node detail — left slide-out panel over canvas */}
        <DetailPanel
          nodeId={selectedNode}
          onClose={() => setSelectedNode(null)}
          trace={searchData?.pipeline || null}
          overviewTrace={overviewTrace}
          crawlProgress={crawlProgress}
          indexProgress={indexProgress}
          embedProgress={embedProgress}
          logEntries={logEntries}
          crawledPages={crawledPages}
          activeCrawlJobId={activeCrawlJobId}
          onCrawlStarted={(id) => { setCrawledPages([]); setActiveCrawlJobId(id); }}
          searchData={searchData}
          overviewText={overviewText}
          buildComplete={buildComplete}
          buildError={buildError}
        />
      </div>

      {/* RIGHT: Search + Results (collapsible) */}
      <div className={`h-full bg-[var(--bg)] flex shrink-0 relative ${panelOpen ? "" : "w-8"}`} style={panelOpen ? { width: searchPanelWidth } : undefined}>
        {/* Resize handle */}
        {panelOpen && (
          <div
            onMouseDown={onSearchResize}
            className="w-1 h-full cursor-col-resize hover:bg-[var(--accent)]/30 active:bg-[var(--accent)]/50 transition-colors shrink-0"
          />
        )}
        {!panelOpen ? (
          <button
            onClick={() => setPanelOpen(true)}
            className="h-full w-full flex items-center justify-center cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors border-l border-[var(--border)]"
          >
            <span className="text-[10px] text-[var(--text-dim)] font-mono" style={{ writingMode: "vertical-rl" }}>search panel</span>
          </button>
        ) : (
          <div className="flex-1 flex flex-col min-w-0 border-l border-[var(--border)]">
        {/* Search bar — prominent, centered */}
        <div className="px-5 pt-5 pb-3 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = (e.target as HTMLFormElement).querySelector("input") as HTMLInputElement;
              const q = input.value.trim();
              if (q) handleSearch(q);
            }}
            className="flex gap-2 items-center"
          >
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="text-[var(--text-dim)] hover:text-[var(--accent)] cursor-pointer text-lg px-1 shrink-0"
              title="Collapse panel"
            >
              &rsaquo;
            </button>
            <div className="flex-1 flex items-center bg-[var(--bg-card)] border border-[var(--border)] focus-within:border-[var(--accent)]/50 transition-colors">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-[var(--text-dim)] ml-3 shrink-0">
                <circle cx="9" cy="9" r="6" />
                <line x1="13.5" y1="13.5" x2="18" y2="18" />
              </svg>
              <input
                type="text"
                defaultValue={query}
                placeholder="Search football..."
                className="flex-1 bg-transparent px-3 py-2.5 text-[14px] text-[var(--text)] placeholder-[var(--text-dim)] outline-none"
              />
            </div>
            <button
              type="submit"
              className="bg-[var(--accent)] hover:brightness-90 text-white px-6 py-2.5 text-[13px] font-medium cursor-pointer transition-colors"
            >
              Search
            </button>
          </form>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {!searchData ? (
            <div className="flex flex-col items-center justify-center h-full px-6">
              <div className="text-[40px] font-bold text-[var(--accent)] opacity-20 mb-4 font-mono">search</div>
              <p className="text-[var(--text-dim)] text-sm mb-6 text-center">Try a query to see the search pipeline in action</p>
              <div className="flex flex-wrap justify-center gap-2">
                {["Messi", "Champions League", "World Cup", "Premier League", "Ronaldo"].map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSearch(q)}
                    className="text-[12px] px-4 py-2 border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 cursor-pointer transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="px-5 py-3">
              <div className="text-[12px] text-[var(--text-dim)] mb-4">
                About {searchData.total_results} results ({(searchData.time_ms ?? 0).toFixed(0)}ms)
              </div>

              <AIOverview text={overviewText} sources={overviewSources} loading={overviewLoading} streaming={overviewStreaming} />

              <div className="space-y-5">
                {searchData.results.map((r, i) => {
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
                    >
                      {/* URL breadcrumb */}
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[12px] text-[var(--text-muted)]">{domain}</span>
                        <span className="text-[11px] text-[var(--text-dim)]">{path}</span>
                      </div>
                      {/* Title */}
                      <h3 className="text-[16px] text-[var(--accent)] group-hover:underline leading-snug mb-1">
                        {r.title}
                      </h3>
                      {/* Snippet */}
                      <p className="text-[13px] text-[var(--text-muted)] leading-relaxed line-clamp-2">{r.snippet}</p>
                      {/* Score pills */}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] px-2 py-0.5 bg-[var(--bg-elevated)] text-[var(--text-dim)] font-mono">BM25 {(r.bm25_score ?? 0).toFixed(1)}</span>
                        <span className="text-[10px] px-2 py-0.5 bg-[var(--bg-elevated)] text-[var(--text-dim)] font-mono">PR {(r.pagerank_score ?? 0).toFixed(4)}</span>
                        <span className="text-[10px] px-2 py-0.5 bg-[var(--accent-muted)] text-[var(--accent)] font-mono">Score {(r.final_score ?? 0).toFixed(2)}</span>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        </div>
        )}
      </div>
    </div>
    </ErrorBoundary>
  );
}

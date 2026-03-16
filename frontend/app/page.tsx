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
        {/* Search bar */}
        <div className="p-3 border-b border-[var(--border)] shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = (e.target as HTMLFormElement).querySelector("input") as HTMLInputElement;
              const q = input.value.trim();
              if (q) handleSearch(q);
            }}
            className="flex gap-2"
          >
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="text-[var(--text-dim)] hover:text-[var(--accent)] cursor-pointer text-lg px-1 shrink-0"
              title="Collapse panel"
            >
              &rsaquo;
            </button>
            <input
              type="text"
              defaultValue={query}
              placeholder="> search football..."
              className="flex-1 bg-[var(--bg-card)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--accent)]/50 font-mono"
            />
            <button
              type="submit"
              className="bg-[var(--accent)] hover:brightness-90 text-white px-5 py-2 text-sm font-medium cursor-pointer transition-colors"
            >
              Search
            </button>
          </form>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {!searchData ? (
            <div className="flex flex-col items-center justify-center h-full px-6">
              <p className="text-[var(--text-dim)] text-sm mb-4 text-center font-mono">try a search to see the pipeline in action</p>
              <div className="flex flex-wrap justify-center gap-2">
                {["Messi", "Champions League", "World Cup", "Premier League", "Ronaldo"].map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSearch(q)}
                    className="text-[11px] px-3 py-1.5 border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 cursor-pointer transition-colors font-mono"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm text-[var(--text-muted)]">
                  {searchData.total_results} results in {(searchData.time_ms ?? 0).toFixed(0)}ms
                </span>
                <span className="text-[10px] text-[var(--text-dim)]">for &ldquo;{query}&rdquo;</span>
              </div>

              <AIOverview text={overviewText} sources={overviewSources} loading={overviewLoading} streaming={overviewStreaming} />

              <div className="space-y-2">
                {searchData.results.map((r, i) => (
                  <a
                    key={i}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-[var(--text-dim)]">#{i + 1}</span>
                      <span className="text-xs text-[var(--text)] group-hover:text-[var(--accent)] group-hover:underline truncate">{r.title}</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-dim)] line-clamp-2 leading-relaxed">{r.snippet}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[9px] text-[var(--text-dim)]">
                      <span>BM25: {r.bm25_score}</span>
                      <span>PR: {r.pagerank_score}</span>
                      <span>= {r.final_score}</span>
                    </div>
                  </a>
                ))}
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

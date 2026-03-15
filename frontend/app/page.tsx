"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import SearchBar from "@/components/SearchBar";
import AIOverview from "@/components/AIOverview";
import ResultCard from "@/components/ResultCard";
import PlaygroundPanel from "@/components/playground/PlaygroundPanel";
import StatsRibbon from "@/components/playground/StatsRibbon";
import { searchExplain, getOverview, getStats, OverviewSource } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import type { ExplainResponse, Stats, SearchParams, PipelineTrace, CrawlProgressData, IndexProgressData, EmbedProgressData } from "@/lib/types";

const DEFAULT_PARAMS: SearchParams = { bm25_k1: 1.2, bm25_b: 0.75, rank_alpha: 0.7 };

export default function Home() {
  const [view, setView] = useState<"home" | "results">("home");
  const [query, setQuery] = useState("");
  const [searchData, setSearchData] = useState<ExplainResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [overview, setOverview] = useState<string | null>(null);
  const [overviewSources, setOverviewSources] = useState<OverviewSource[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // Playground state
  const [stats, setStats] = useState<Stats | null>(null);
  const [params, setParams] = useState<SearchParams>(DEFAULT_PARAMS);
  const [trace, setTrace] = useState<PipelineTrace | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // Job state
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgressData | null>(null);
  const [indexProgress, setIndexProgress] = useState<IndexProgressData | null>(null);
  const [embedProgress, setEmbedProgress] = useState<EmbedProgressData | null>(null);
  const [logEntries, setLogEntries] = useState<string[]>([]);
  const [activeCrawlJobId, setActiveCrawlJobId] = useState<string | null>(null);

  // WebSocket
  const { lastMessage } = useWebSocket();

  // Debounce timer for param changes
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load stats on mount
  useEffect(() => {
    getStats().then(setStats).catch(() => {});
  }, []);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;
    const { type, data } = lastMessage;

    if (type === "crawl_progress") {
      const d = data as CrawlProgressData;
      setCrawlProgress(d);
      setLogEntries((prev) => [
        ...prev.slice(-200),
        `[${d.pages_crawled}/${d.max_pages}] ${d.status === "ok" ? "OK" : "FAIL"} ${d.title || d.current_url} (${d.text_length} chars, ${d.links_found} links)`,
      ]);
    } else if (type === "crawl_complete") {
      setLogEntries((prev) => [...prev, "Crawl complete."]);
      setCrawlProgress(null);
      getStats().then(setStats);
    } else if (type === "index_progress") {
      const d = data as IndexProgressData;
      setIndexProgress(d);
      setLogEntries((prev) => [
        ...prev.slice(-200),
        `Index: ${d.pages_done}/${d.pages_total} | ${d.unique_terms} terms | "${d.title}"`,
      ]);
    } else if (type === "index_complete") {
      setLogEntries((prev) => [...prev, "Index + PageRank complete."]);
      setIndexProgress(null);
      getStats().then(setStats);
    } else if (type === "embed_progress") {
      const d = data as EmbedProgressData;
      setEmbedProgress(d);
    } else if (type === "embed_complete") {
      setLogEntries((prev) => [...prev, "Embedding complete."]);
      setEmbedProgress(null);
      getStats().then(setStats);
    }
  }, [lastMessage]);

  const runSearch = useCallback(async (q: string, p: SearchParams) => {
    setSearching(true);
    setOverview(null);
    setOverviewSources([]);
    setOverviewLoading(false);

    try {
      const data = await searchExplain(q, p);
      setSearchData(data);
      setTrace(data.pipeline);
      setSearching(false);

      // Fetch AI Overview async
      if (data.total_results >= 3) {
        setOverviewLoading(true);
        try {
          const ov = await getOverview(q);
          setOverview(ov.overview);
          setOverviewSources(ov.sources || []);
        } catch {
          // Silent fail
        } finally {
          setOverviewLoading(false);
        }
      }
    } catch {
      setSearching(false);
    }
  }, []);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    setView("results");
    runSearch(q, params);
  }, [params, runSearch]);

  const handleParamsChange = useCallback((newParams: SearchParams) => {
    setParams(newParams);
    if (query) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => runSearch(query, newParams), 300);
    }
  }, [query, runSearch]);

  const goHome = () => {
    setView("home");
    setQuery("");
    setSearchData(null);
    setTrace(null);
    setOverview(null);
    setOverviewSources([]);
  };

  // Home view
  if (view === "home") {
    return (
      <div className="min-h-screen">
        <StatsRibbon stats={stats} />
        <div className="flex flex-col items-center justify-center px-4" style={{ minHeight: "calc(100vh - 30px)" }}>
          <h1 className="text-5xl font-bold text-rose-500 mb-2">VietSearch</h1>
          <p className="text-gray-500 mb-8 text-sm">Football search engine playground</p>
          <SearchBar onSearch={handleSearch} />
          <div className="mt-8 flex gap-3 text-xs text-gray-600">
            <span>BM25 + PageRank + Vector Search</span>
            <span>·</span>
            <span>AI Overviews via Groq</span>
            <span>·</span>
            <span>Interactive Pipeline</span>
          </div>
        </div>
      </div>
    );
  }

  // Results view
  const maxBm25 = searchData ? Math.max(...searchData.results.map((r) => r.bm25_score), 0) : 0;
  const maxPr = searchData ? Math.max(...searchData.results.map((r) => r.pagerank_score), 0) : 0;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0a0a1a]/95 backdrop-blur border-b border-[#1a1a3a] px-4 py-3">
        <div className="flex items-center gap-4 max-w-full">
          <h1
            onClick={goHome}
            className="text-xl font-bold text-rose-500 cursor-pointer hover:text-rose-400 shrink-0"
          >
            VietSearch
          </h1>
          <SearchBar initialQuery={query} onSearch={handleSearch} compact />
        </div>
      </header>
      <StatsRibbon stats={stats} />

      {/* Main + Panel */}
      <div className="flex">
        {/* Main column */}
        <main className="flex-1 max-w-3xl mx-auto px-4 py-6 min-w-0">
          {searching ? (
            <div className="text-gray-500 text-center mt-12">Searching...</div>
          ) : searchData && searchData.total_results === 0 ? (
            <div className="text-gray-500 text-center mt-12">
              No results found for &ldquo;{query}&rdquo;
            </div>
          ) : searchData ? (
            <>
              <div className="text-sm text-gray-600 mb-4">
                {searchData.total_results} results in {searchData.time_ms.toFixed(1)}ms
              </div>

              <AIOverview overview={overview} sources={overviewSources} loading={overviewLoading} />

              {searchData.results.map((result, i) => (
                <ResultCard key={i} result={result} maxBm25={maxBm25} maxPr={maxPr} />
              ))}
            </>
          ) : null}
        </main>

        {/* Playground Panel */}
        <PlaygroundPanel
          trace={trace}
          params={params}
          onParamsChange={handleParamsChange}
          crawlProgress={crawlProgress}
          indexProgress={indexProgress}
          embedProgress={embedProgress}
          logEntries={logEntries}
          activeCrawlJobId={activeCrawlJobId}
          onCrawlStarted={setActiveCrawlJobId}
          collapsed={panelCollapsed}
          onToggle={() => setPanelCollapsed(!panelCollapsed)}
        />
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import SearchBar from "@/components/SearchBar";
import AIOverview from "@/components/AIOverview";
import ResultCard from "@/components/ResultCard";
import QueryFlow from "@/components/playground/QueryFlow";
import AIOverviewFlow from "@/components/playground/AIOverviewFlow";
import PageJourney from "@/components/playground/PageJourney";
import StatsRibbon from "@/components/playground/StatsRibbon";
import OperationsTab from "@/components/playground/OperationsTab";
import GroundedData from "@/components/playground/GroundedData";
import type { ActiveStep } from "@/components/playground/GroundedData";
import { searchExplain, getStats, getOverviewStreamUrl, OverviewSource, OverviewTrace } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import type { ExplainResponse, Stats, SearchParams, PipelineTrace, CrawlProgressData, IndexProgressData, EmbedProgressData } from "@/lib/types";

const DEFAULT_PARAMS: SearchParams = { bm25_k1: 1.2, bm25_b: 0.75, rank_alpha: 0.7 };

export default function Home() {
  const [query, setQuery] = useState("");
  const [searchData, setSearchData] = useState<ExplainResponse | null>(null);
  const [searching, setSearching] = useState(false);

  const [overviewText, setOverviewText] = useState("");
  const [overviewSources, setOverviewSources] = useState<OverviewSource[]>([]);
  const [overviewTrace, setOverviewTrace] = useState<OverviewTrace | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewStreaming, setOverviewStreaming] = useState(false);

  const [stats, setStats] = useState<Stats | null>(null);
  const [params] = useState<SearchParams>(DEFAULT_PARAMS);
  const [trace, setTrace] = useState<PipelineTrace | null>(null);
  const [expandedPageId, setExpandedPageId] = useState<number | null>(null);
  const [activeStep, setActiveStep] = useState<ActiveStep>(null);

  const [rightTab, setRightTab] = useState<"pipeline" | "ops">("pipeline");

  const [crawlProgress, setCrawlProgress] = useState<CrawlProgressData | null>(null);
  const [indexProgress, setIndexProgress] = useState<IndexProgressData | null>(null);
  const [embedProgress, setEmbedProgress] = useState<EmbedProgressData | null>(null);
  const [logEntries, setLogEntries] = useState<string[]>([]);
  const [activeCrawlJobId, setActiveCrawlJobId] = useState<string | null>(null);

  const { lastMessage } = useWebSocket();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { getStats().then(setStats).catch(() => {}); }, []);

  useEffect(() => {
    if (!lastMessage) return;
    const { type, data } = lastMessage;
    if (type === "crawl_progress") {
      const d = data as CrawlProgressData;
      setCrawlProgress(d);
      setLogEntries((prev) => [...prev.slice(-200), `[${d.pages_crawled}/${d.max_pages}] ${d.status === "ok" ? "OK" : "FAIL"} ${d.title || d.current_url}`]);
    } else if (type === "crawl_complete") {
      setLogEntries((prev) => [...prev, "Crawl complete."]);
      setCrawlProgress(null);
      getStats().then(setStats);
    } else if (type === "index_progress") {
      const d = data as IndexProgressData;
      setIndexProgress(d);
      setLogEntries((prev) => [...prev.slice(-200), `Index: ${d.pages_done}/${d.pages_total} | ${d.unique_terms} terms`]);
    } else if (type === "index_complete") {
      setLogEntries((prev) => [...prev, "Index complete."]);
      setIndexProgress(null);
      getStats().then(setStats);
    } else if (type === "embed_progress") { setEmbedProgress(data as EmbedProgressData); }
    else if (type === "embed_complete") {
      setLogEntries((prev) => [...prev, "Embedding complete."]);
      setEmbedProgress(null);
      getStats().then(setStats);
    }
  }, [lastMessage]);

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
              if (msg.step === "fanout") traceData.fanout = msg.data;
              if (msg.step === "retrieval") traceData.retrieval = msg.data;
              if (msg.step === "synthesis") traceData.synthesis = msg.data;
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

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    setSearching(true);
    setExpandedPageId(null);
    setOverviewText("");
    setOverviewSources([]);
    setOverviewTrace(null);
    setActiveStep(null);

    try {
      const data = await searchExplain(q, params);
      setSearchData(data);
      setTrace(data.pipeline);
      setSearching(false);
      setRightTab("pipeline");

      if (data.total_results >= 3) {
        streamOverview(q);
      }
    } catch { setSearching(false); }
  }, [params, streamOverview]);

  const maxBm25 = searchData ? Math.max(...searchData.results.map((r) => r.bm25_score), 0) : 0;
  const maxPr = searchData ? Math.max(...searchData.results.map((r) => r.pagerank_score), 0) : 0;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-[#0a0a1a]/95 backdrop-blur border-b border-[#1a1a3a]">
        <StatsRibbon stats={stats} />
      </header>

      <div className="flex flex-1">
        {/* LEFT: Search */}
        <div className="flex-1 min-w-0 border-r border-[#1a1a3a]">
          <div className="p-4 border-b border-[#1a1a3a]">
            <div className="flex items-center gap-3 mb-3">
              <h1 className="text-xl font-bold text-rose-500">VietSearch</h1>
              <span className="text-[10px] text-gray-600 px-2 py-0.5 border border-[#1a1a3a] rounded-full">playground</span>
            </div>
            <SearchBar onSearch={handleSearch} initialQuery={query} compact />
          </div>

          <div className="p-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 130px)" }}>
            {!searchData && !searching && (
              <div className="text-center mt-16">
                <div className="text-3xl text-rose-500 font-bold mb-2">VietSearch</div>
                <p className="text-gray-600 text-sm mb-6">Search football. See how it works.</p>
                <div className="flex flex-wrap justify-center gap-2 text-[10px] text-gray-700">
                  {["Messi", "Champions League", "World Cup 2022", "Premier League", "Ronaldo transfer"].map((q) => (
                    <button key={q} onClick={() => handleSearch(q)} className="px-3 py-1 border border-[#1a1a3a] rounded-full hover:border-rose-500/30 hover:text-gray-400 cursor-pointer transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {searching && <div className="text-gray-500 text-center mt-12">Searching...</div>}

            {searchData && !searching && (
              <>
                <div className="text-sm text-gray-600 mb-3">
                  {searchData.total_results} results in {searchData.time_ms.toFixed(1)}ms
                </div>

                <AIOverview text={overviewText} sources={overviewSources} loading={overviewLoading} streaming={overviewStreaming} />

                {searchData.results.map((result, i) => {
                  const pageId = searchData.pipeline?.bm25_scoring.top_scores.find(
                    (s) => s.title === result.title
                  )?.page_id;
                  return (
                    <div key={i}>
                      <ResultCard
                        result={result} rank={i + 1} maxBm25={maxBm25} maxPr={maxPr}
                        isExpanded={expandedPageId === pageId}
                        onToggleJourney={() => { if (pageId) setExpandedPageId(expandedPageId === pageId ? null : pageId); }}
                      />
                      {expandedPageId === pageId && pageId && (
                        <PageJourney pageId={pageId} onClose={() => setExpandedPageId(null)} />
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* RIGHT: Playground */}
        <div className="w-[520px] shrink-0 bg-[#08081a] flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-[#1a1a3a] shrink-0">
            {([
              { key: "pipeline" as const, label: "Pipeline + Data" },
              { key: "ops" as const, label: "Operations" },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setRightTab(tab.key)}
                className={`flex-1 text-[11px] py-2 font-medium cursor-pointer transition-colors ${
                  rightTab === tab.key ? "text-rose-400 border-b-2 border-rose-500" : "text-gray-600 hover:text-gray-400"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {rightTab === "pipeline" && (
              <div className="flex h-full">
                {/* Pipeline column */}
                <div className="flex-1 p-2 overflow-y-auto border-r border-[#1a1a3a]">
                  {!trace && !overviewLoading && !overviewTrace ? (
                    <div className="text-[10px] text-gray-700 text-center py-8">
                      Search something to see the pipeline.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <AIOverviewFlow trace={overviewTrace} loading={overviewLoading || overviewStreaming} activeStep={activeStep} onHoverStep={setActiveStep} />
                      <QueryFlow trace={trace} query={query} activeStep={activeStep} onHoverStep={setActiveStep} />
                    </div>
                  )}
                </div>

                {/* Grounded data column */}
                <div className="w-[220px] shrink-0 overflow-y-auto bg-[#060614]">
                  <GroundedData activeStep={activeStep} trace={trace} overviewTrace={overviewTrace} />
                </div>
              </div>
            )}

            {rightTab === "ops" && (
              <OperationsTab
                crawlProgress={crawlProgress} indexProgress={indexProgress} embedProgress={embedProgress}
                logEntries={logEntries} activeCrawlJobId={activeCrawlJobId} onCrawlStarted={setActiveCrawlJobId}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

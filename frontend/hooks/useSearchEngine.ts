"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { FlowPhase } from "@/components/canvas/types";
import { searchExplain, getStats, getOverviewStreamUrl } from "@/lib/api";
import type { OverviewSource, OverviewTrace } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import type {
  ExplainResponse,
  Stats,
  SearchParams,
  CrawlProgressData,
  IndexProgressData,
  EmbedProgressData,
} from "@/lib/types";

const DEFAULT_PARAMS: SearchParams = { bm25_k1: 1.2, bm25_b: 0.75, rank_alpha: 0.7 };

const SEARCH_PHASES: { phase: FlowPhase; delay: number }[] = [
  { phase: "queryInput", delay: 0 },
  { phase: "tokenizing", delay: 300 },
  { phase: "indexLookup", delay: 550 },
  { phase: "bm25", delay: 800 },
  { phase: "pagerank", delay: 1100 },
  { phase: "combining", delay: 1400 },
  { phase: "results", delay: 1700 },
];

export interface SearchEngineState {
  query: string;
  searchData: ExplainResponse | null;
  phase: FlowPhase;
  overviewText: string;
  overviewSources: OverviewSource[];
  overviewTrace: OverviewTrace | null;
  overviewLoading: boolean;
  overviewStreaming: boolean;
  stats: Stats | null;
  crawlProgress: CrawlProgressData | null;
  indexProgress: IndexProgressData | null;
  embedProgress: EmbedProgressData | null;
  logEntries: string[];
  crawledPages: CrawlProgressData[];
  activeCrawlJobId: string | null;
  buildComplete: boolean;
  buildError: string | null;
  handleSearch: (q: string) => void;
  onCrawlStarted: (id: string) => void;
}

export function useSearchEngine(): SearchEngineState {
  const [query, setQuery] = useState("");
  const [searchData, setSearchData] = useState<ExplainResponse | null>(null);
  const [phase, setPhase] = useState<FlowPhase>("idle");

  // AI Overview
  const [overviewText, setOverviewText] = useState("");
  const [overviewSources, setOverviewSources] = useState<OverviewSource[]>([]);
  const [overviewTrace, setOverviewTrace] = useState<OverviewTrace | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewStreaming, setOverviewStreaming] = useState(false);

  // System
  const [stats, setStats] = useState<Stats | null>(null);

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

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
  }, []);

  // WebSocket handler
  useEffect(() => {
    if (!lastMessage) return;
    const { type, data } = lastMessage;
    if (type === "crawl_progress") {
      const d = data as CrawlProgressData;
      setCrawlProgress(d);
      setCrawledPages((prev) => [...prev.slice(-100), d]);
      setLogEntries((prev) => [
        ...prev.slice(-200),
        `[${d.pages_crawled}/${d.max_pages}] ${d.status === "ok" ? "OK" : "FAIL"} ${d.title || d.current_url}`,
      ]);
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
      if (d.pages_done % 100 === 0) getStats().then(setStats);
    } else if (type === "index_complete") {
      setIndexProgress(null);
      getStats().then(setStats);
    } else if (type === "embed_progress") {
      const d = data as EmbedProgressData;
      setEmbedProgress(d);
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
              if (msg.step === "fanout") {
                traceData.fanout = msg.data;
                setPhase("aiFanout");
              }
              if (msg.step === "retrieval") {
                traceData.retrieval = msg.data;
                setPhase("aiRetrieval");
              }
              if (msg.step === "synthesis") {
                traceData.synthesis = msg.data;
                setPhase("aiSynthesis");
              }
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
          } catch {
            /* */
          }
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
  const handleSearch = useCallback(
    async (q: string) => {
      setQuery(q);
      setPhase("idle");

      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];

      setOverviewText("");
      setOverviewSources([]);
      setOverviewTrace(null);

      try {
        const data = await searchExplain(q, DEFAULT_PARAMS);
        setSearchData(data);

        for (const { phase: p, delay } of SEARCH_PHASES) {
          const timer = setTimeout(() => setPhase(p), delay);
          timersRef.current.push(timer);
        }

        if (data.total_results >= 3) {
          const timer = setTimeout(() => streamOverview(q), 2100);
          timersRef.current.push(timer);
        }
      } catch {
        /* */
      }
    },
    [streamOverview],
  );

  const onCrawlStarted = useCallback((id: string) => {
    setCrawledPages([]);
    setActiveCrawlJobId(id);
  }, []);

  return {
    query,
    searchData,
    phase,
    overviewText,
    overviewSources,
    overviewTrace,
    overviewLoading,
    overviewStreaming,
    stats,
    crawlProgress,
    indexProgress,
    embedProgress,
    logEntries,
    crawledPages,
    activeCrawlJobId,
    buildComplete,
    buildError,
    handleSearch,
    onCrawlStarted,
  };
}

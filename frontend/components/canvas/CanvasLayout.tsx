"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CanvasLegend from "./CanvasLegend";
import ThemeToggle from "./ThemeToggle";
import NodeIcon from "./NodeIcon";
import { phaseEdgeMap, phaseNodeMap, phaseStoreMap } from "./nodeDefinitions";
import type { FlowPhase } from "./types";
import type { ExplainResponse, Stats, CrawlProgressData, IndexProgressData, EmbedProgressData } from "@/lib/types";
import type { OverviewTrace } from "@/lib/api";

/* ================================================================
   Types
   ================================================================ */

interface CanvasLayoutProps {
  onSearch: (query: string) => void;
  query: string;
  phase: FlowPhase;
  stats: Stats | null;
  searchData: ExplainResponse | null;
  overviewText: string;
  overviewTrace: OverviewTrace | null;
  onNodeClick: (nodeId: string) => void;
  crawlProgress: CrawlProgressData | null;
  indexProgress: IndexProgressData | null;
  embedProgress: EmbedProgressData | null;
}

interface StatEntry { label: string; value: string }

interface SystemNodeState {
  label: string;
  icon: string;
  description: string;
  color: string;
  stats: StatEntry[];
  status: "idle" | "running" | "ready";
  progress: { done: number; total: number; label?: string } | null;
}

interface StoreNodeState {
  label: string;
  icon: string;
  description: string;
  color: string;
  stats: StatEntry[];
  active: boolean;
}

interface PipelineNodeState {
  label: string;
  icon: string;
  description: string;
  color: string;
  timeMs: number | null;
  summary: string | null;
  state: "idle" | "active" | "completed";
}

interface OutputNodeState {
  type: "results" | "ai_overview";
  label: string;
  color: string;
  content: unknown;
  state: "idle" | "active" | "completed";
}

/* ================================================================
   Edge definitions (source → target with type)
   ================================================================ */

interface EdgeDef {
  id: string;
  from: string;
  to: string;
  type: "build" | "write" | "query" | "bridge";
}

const EDGES: EdgeDef[] = [
  // BUILD
  { id: "b-crawler-pages", from: "crawler", to: "pages_db", type: "write" },
  { id: "b-pages-indexer", from: "pages_db", to: "indexer", type: "build" },
  { id: "b-pages-pr", from: "pages_db", to: "pr_compute", type: "build" },
  { id: "b-pages-chunker", from: "pages_db", to: "chunker", type: "build" },
  { id: "b-indexer-index", from: "indexer", to: "inverted_index", type: "write" },
  { id: "b-pr-scores", from: "pr_compute", to: "pr_scores", type: "write" },
  { id: "b-chunker-embedder", from: "chunker", to: "embedder", type: "build" },
  { id: "b-embedder-vectors", from: "embedder", to: "vector_store", type: "write" },
  // BRIDGE (store → query)
  { id: "q-store-lookup", from: "inverted_index", to: "index_lookup", type: "bridge" },
  { id: "q-scores-prlookup", from: "pr_scores", to: "pr_lookup", type: "bridge" },
  { id: "q-vectors-vsearch", from: "vector_store", to: "vector_search", type: "bridge" },
  // SEARCH PATH
  { id: "q-input-tokenize", from: "query_input", to: "tokenize", type: "query" },
  { id: "q-token-lookup", from: "tokenize", to: "index_lookup", type: "query" },
  { id: "q-lookup-bm25", from: "index_lookup", to: "bm25", type: "query" },
  { id: "q-token-prlookup", from: "tokenize", to: "pr_lookup", type: "query" },
  { id: "q-bm25-combine", from: "bm25", to: "combine", type: "query" },
  { id: "q-prlookup-combine", from: "pr_lookup", to: "combine", type: "query" },
  { id: "q-combine-results", from: "combine", to: "results", type: "query" },
  // AI PATH
  { id: "q-input-fanout", from: "query_input", to: "fanout", type: "query" },
  { id: "q-input-embed", from: "query_input", to: "embed_query", type: "query" },
  { id: "q-fanout-vsearch", from: "fanout", to: "vector_search", type: "query" },
  { id: "q-embed-vsearch", from: "embed_query", to: "vector_search", type: "query" },
  { id: "q-vsearch-llm", from: "vector_search", to: "llm", type: "query" },
  { id: "q-llm-ai", from: "llm", to: "ai_overview", type: "query" },
];

/* ================================================================
   Phase order
   ================================================================ */

const PHASE_ORDER: FlowPhase[] = [
  "queryInput", "tokenizing", "indexLookup", "bm25", "pagerank",
  "combining", "results", "aiFanout", "aiEmbedding", "aiRetrieval",
  "aiSynthesis", "aiComplete",
];

/* ================================================================
   Component
   ================================================================ */

export default function CanvasLayout({
  onSearch, query, phase, stats, searchData, overviewText, overviewTrace, onNodeClick,
  crawlProgress, indexProgress, embedProgress,
}: CanvasLayoutProps) {

  /* ---- refs for measuring node positions ---- */
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [positions, setPositions] = useState<Record<string, DOMRect>>({});
  const rafRef = useRef<number>(0);

  const setNodeRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    nodeRefs.current[id] = el;
  }, []);

  /* Recalculate positions whenever layout might have changed */
  const recalcPositions = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const newPos: Record<string, DOMRect> = {};
    for (const [id, el] of Object.entries(nodeRefs.current)) {
      if (el) {
        const r = el.getBoundingClientRect();
        // Make positions relative to container
        newPos[id] = new DOMRect(r.x - cRect.x, r.y - cRect.y, r.width, r.height);
      }
    }
    setPositions(newPos);
  }, []);

  useEffect(() => {
    // Initial measurement after mount
    const timer = setTimeout(recalcPositions, 50);
    // Also on resize
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(recalcPositions);
    });
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", recalcPositions);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      window.removeEventListener("resize", recalcPositions);
    };
  }, [recalcPositions]);

  // Recalc when stats or progress changes (nodes may resize)
  useEffect(() => {
    const timer = setTimeout(recalcPositions, 30);
    return () => clearTimeout(timer);
  }, [stats, crawlProgress, indexProgress, embedProgress, searchData, overviewTrace, overviewText, phase, recalcPositions]);

  /* ---- Derive system node states ---- */
  const systemNodes = useMemo((): Record<string, SystemNodeState> => {
    const base: Record<string, SystemNodeState> = {
      crawler: { label: "Crawler", icon: "crawler", description: "Fetches pages via BFS", color: "emerald", stats: [], status: "ready", progress: null },
      indexer: { label: "Indexer", icon: "indexer", description: "Builds inverted index", color: "blue", stats: [], status: "ready", progress: null },
      pr_compute: { label: "PageRank", icon: "pagerank", description: "Link-based authority score", color: "indigo", stats: [], status: "ready", progress: null },
      chunker: { label: "Chunker", icon: "chunker", description: "~300 tokens @ sentence boundaries", color: "violet", stats: [], status: "ready", progress: null },
      embedder: { label: "Embedder", icon: "embedder", description: "512-dim vectors (Voyage)", color: "purple", stats: [], status: "ready", progress: null },
    };
    // Apply stats
    if (stats) {
      base.crawler.stats = [{ label: "Pages", value: stats.pages_crawled.toLocaleString() }];
      base.indexer.stats = [{ label: "Terms", value: stats.total_terms.toLocaleString() }];
      base.chunker.stats = [{ label: "Chunks", value: stats.total_chunks.toLocaleString() }];
      base.embedder.stats = [{ label: "Vectors", value: stats.chunks_embedded.toLocaleString() }];
    }
    // Apply progress
    if (crawlProgress) {
      base.crawler.status = "running";
      base.crawler.progress = { done: crawlProgress.pages_crawled, total: crawlProgress.max_pages, label: crawlProgress.title || crawlProgress.current_url };
    }
    if (indexProgress) {
      base.indexer.status = "running";
      base.indexer.progress = { done: indexProgress.pages_done, total: indexProgress.pages_total, label: `${indexProgress.unique_terms.toLocaleString()} terms` };
      if (indexProgress.phase === "pagerank") {
        base.pr_compute.status = "running";
      }
    }
    if (embedProgress) {
      if (embedProgress.chunks_done === 0) {
        base.chunker.status = "running";
      } else {
        base.embedder.status = "running";
        base.embedder.progress = { done: embedProgress.chunks_done, total: embedProgress.chunks_total, label: embedProgress.current_chunk_preview?.slice(0, 40) };
      }
    }
    return base;
  }, [stats, crawlProgress, indexProgress, embedProgress]);

  /* ---- Derive store node states ---- */
  const storeNodes = useMemo((): Record<string, StoreNodeState> => {
    const base: Record<string, StoreNodeState> = {
      pages_db: { label: "Pages DB", icon: "database", description: "Crawled pages", color: "emerald", stats: [], active: false },
      inverted_index: { label: "Inverted Index", icon: "inverted_index", description: "term -> [docs...]", color: "blue", stats: [], active: false },
      pr_scores: { label: "PR Scores", icon: "scores", description: "Authority per page", color: "indigo", stats: [], active: false },
      vector_store: { label: "Vector Store", icon: "vector_store", description: "Chunk embeddings", color: "purple", stats: [], active: false },
    };
    if (stats) {
      base.pages_db.stats = [{ label: "Rows", value: stats.pages_crawled.toLocaleString() }];
      base.inverted_index.stats = [
        { label: "Terms", value: stats.total_terms.toLocaleString() },
        { label: "Postings", value: stats.total_postings.toLocaleString() },
      ];
      base.pr_scores.stats = [{ label: "Pages", value: stats.pages_crawled.toLocaleString() }];
      base.vector_store.stats = [{ label: "Vectors", value: stats.chunks_embedded.toLocaleString() }];
    }
    // Build-time writes
    if (crawlProgress) base.pages_db.active = true;
    if (indexProgress) {
      base.inverted_index.active = true;
      if (indexProgress.phase === "pagerank") base.pr_scores.active = true;
    }
    if (embedProgress) base.vector_store.active = true;
    // Query-time reads
    const activeStores = phase !== "idle" ? (phaseStoreMap[phase] || []) : [];
    for (const s of activeStores) {
      if (base[s]) base[s].active = true;
    }
    return base;
  }, [stats, crawlProgress, indexProgress, embedProgress, phase]);

  /* ---- Derive pipeline node states ---- */
  const pipelineNodes = useMemo((): Record<string, PipelineNodeState> => {
    const base: Record<string, PipelineNodeState> = {
      query_input: { label: "Search Query", icon: "query", description: "User enters a query", color: "amber", timeMs: null, summary: null, state: "idle" },
      tokenize: { label: "Tokenize", icon: "tokenize", description: "Query -> tokens", color: "amber", timeMs: null, summary: null, state: "idle" },
      index_lookup: { label: "Index Lookup", icon: "inverted_index", description: "Term -> doc list", color: "amber", timeMs: null, summary: null, state: "idle" },
      bm25: { label: "BM25 Scoring", icon: "bm25", description: "TF x IDF x length", color: "amber", timeMs: null, summary: null, state: "idle" },
      pr_lookup: { label: "PR Lookup", icon: "pagerank", description: "Fetch scores", color: "amber", timeMs: null, summary: null, state: "idle" },
      combine: { label: "Combine", icon: "combine", description: "a*BM25 + (1-a)*PR", color: "amber", timeMs: null, summary: null, state: "idle" },
      fanout: { label: "Fan-out", icon: "fanout", description: "Expand via LLM", color: "amber", timeMs: null, summary: null, state: "idle" },
      embed_query: { label: "Embed Query", icon: "embedder", description: "Query -> vector", color: "amber", timeMs: null, summary: null, state: "idle" },
      vector_search: { label: "Vector Search", icon: "retriever", description: "Cosine similarity", color: "amber", timeMs: null, summary: null, state: "idle" },
      llm: { label: "LLM Synthesis", icon: "llm", description: "Groq - Llama 3.3 70B", color: "amber", timeMs: null, summary: null, state: "idle" },
    };
    // Fill trace data
    if (searchData?.pipeline) {
      const t = searchData.pipeline;
      base.query_input.summary = `"${searchData.query}"`;
      base.tokenize.timeMs = t.tokenization.time_ms;
      base.tokenize.summary = `[${t.tokenization.tokens.join(", ")}]`;
      base.index_lookup.timeMs = t.index_lookup.time_ms;
      base.index_lookup.summary = `${Object.keys(t.index_lookup.terms_found).length} terms found`;
      base.bm25.timeMs = t.bm25_scoring.time_ms;
      base.bm25.summary = `${t.bm25_scoring.total_matched} docs scored`;
      base.pr_lookup.timeMs = t.pagerank.time_ms;
      base.pr_lookup.summary = `Top: ${t.pagerank.top_scores[0]?.title.replace(" - Wikipedia", "").slice(0, 20) || ""}`;
      base.combine.timeMs = t.combination.time_ms;
      base.combine.summary = t.combination.formula;
    }
    if (overviewTrace?.fanout) {
      base.fanout.timeMs = overviewTrace.fanout.time_ms;
      base.fanout.summary = `${overviewTrace.fanout.expanded.length} queries`;
    }
    if (overviewTrace?.retrieval) {
      base.vector_search.timeMs = overviewTrace.retrieval.time_ms;
      base.vector_search.summary = `${overviewTrace.retrieval.chunks_retrieved} chunks`;
    }
    if (overviewTrace?.synthesis) {
      base.llm.timeMs = overviewTrace.synthesis.time_ms;
      base.llm.summary = overviewTrace.synthesis.model;
    }
    // Apply phase-based state
    if (phase !== "idle") {
      const currentIdx = PHASE_ORDER.indexOf(phase);
      const activeNode = phaseNodeMap[phase];
      const completedNodes = new Set<string>();
      for (let i = 0; i < currentIdx; i++) {
        const n = phaseNodeMap[PHASE_ORDER[i]];
        if (n) completedNodes.add(n);
      }
      for (const id of Object.keys(base)) {
        if (id === activeNode) base[id].state = "active";
        else if (completedNodes.has(id)) base[id].state = "completed";
      }
    }
    return base;
  }, [searchData, overviewTrace, phase]);

  /* ---- Derive output node states ---- */
  const outputNodes = useMemo((): Record<string, OutputNodeState> => {
    const base: Record<string, OutputNodeState> = {
      results: { type: "results", label: "Ranked Results", color: "amber", content: null, state: "idle" },
      ai_overview: { type: "ai_overview", label: "AI Overview", color: "amber", content: null, state: "idle" },
    };
    if (searchData) {
      base.results.content = searchData.results.map((r) => ({ title: r.title, score: r.final_score }));
    }
    if (overviewText) {
      base.ai_overview.content = overviewText;
    }
    // Apply phase state
    if (phase !== "idle") {
      const currentIdx = PHASE_ORDER.indexOf(phase);
      const activeNode = phaseNodeMap[phase];
      const completedNodes = new Set<string>();
      for (let i = 0; i < currentIdx; i++) {
        const n = phaseNodeMap[PHASE_ORDER[i]];
        if (n) completedNodes.add(n);
      }
      for (const id of Object.keys(base)) {
        if (id === activeNode) base[id].state = "active";
        else if (completedNodes.has(id)) base[id].state = "completed";
      }
    }
    return base;
  }, [searchData, overviewText, phase]);

  /* ---- Derive edge states ---- */
  const edgeStates = useMemo(() => {
    const activeEdges = new Set<string>();
    const completedEdges = new Set<string>();
    const activeBuildEdges = new Set<string>();

    // Build-time active edges
    if (crawlProgress) activeBuildEdges.add("b-crawler-pages");
    if (indexProgress) {
      activeBuildEdges.add("b-pages-indexer");
      activeBuildEdges.add("b-indexer-index");
      if (indexProgress.phase === "pagerank") {
        activeBuildEdges.add("b-pages-pr");
        activeBuildEdges.add("b-pr-scores");
      }
    }
    if (embedProgress) {
      if (embedProgress.chunks_done === 0) {
        activeBuildEdges.add("b-pages-chunker");
        activeBuildEdges.add("b-chunker-embedder");
      } else {
        activeBuildEdges.add("b-chunker-embedder");
        activeBuildEdges.add("b-embedder-vectors");
      }
    }

    // Query-time active/completed edges
    if (phase !== "idle") {
      const currentIdx = PHASE_ORDER.indexOf(phase);
      for (const eid of (phaseEdgeMap[phase] || [])) activeEdges.add(eid);
      for (let i = 0; i < currentIdx; i++) {
        for (const eid of (phaseEdgeMap[PHASE_ORDER[i]] || [])) completedEdges.add(eid);
      }
    }

    return { activeEdges, completedEdges, activeBuildEdges };
  }, [phase, crawlProgress, indexProgress, embedProgress]);

  /* ---- Get anchor points for an edge ---- */
  const getEdgePoints = useCallback((fromId: string, toId: string): { x1: number; y1: number; x2: number; y2: number } | null => {
    const fromRect = positions[fromId];
    const toRect = positions[toId];
    if (!fromRect || !toRect) return null;

    const fromCx = fromRect.x + fromRect.width / 2;
    const fromBottom = fromRect.y + fromRect.height;
    const toCx = toRect.x + toRect.width / 2;
    const toTop = toRect.y;

    return { x1: fromCx, y1: fromBottom, x2: toCx, y2: toTop };
  }, [positions]);

  /* ---- Render helpers ---- */

  const renderSystemNode = (id: string, data: SystemNodeState) => {
    const isRunning = data.status === "running";
    const pct = data.progress ? Math.round((data.progress.done / Math.max(data.progress.total, 1)) * 100) : 0;
    return (
      <div
        key={id}
        ref={setNodeRef(id)}
        onClick={() => onNodeClick(id)}
        className={`arch-node arch-system cursor-pointer transition-colors group ${
          isRunning ? "border-[var(--accent)]" : "border-[var(--border)] hover:border-[var(--accent)]/40"
        }`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <NodeIcon icon={data.icon} color={data.color} />
          <span className="text-xs font-medium text-[var(--text)]">{data.label}</span>
          <div className={`w-1.5 h-1.5 ml-auto ${
            data.status === "running" ? "bg-[var(--accent)] animate-pulse" :
            data.status === "ready" ? "bg-emerald-500" : "bg-[var(--text-dim)]"
          }`} />
        </div>
        <p className="text-[10px] text-[var(--text-dim)] leading-tight mb-1">{data.description}</p>
        {isRunning && data.progress && (
          <div className="mb-1">
            <div className="flex items-center justify-between text-[9px] mb-0.5">
              <span className="text-[var(--accent)] font-mono">{data.progress.done}/{data.progress.total}</span>
              <span className="text-[var(--text-dim)]">{pct}%</span>
            </div>
            <div className="w-full h-1.5 bg-[var(--score-bar-bg)]">
              <div className="h-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            {data.progress.label && (
              <div className="text-[8px] text-[var(--text-dim)] mt-0.5 truncate">{data.progress.label}</div>
            )}
          </div>
        )}
        {data.stats.length > 0 && (
          <div className="space-y-0.5 border-t border-[var(--border)] pt-1 mt-1">
            {data.stats.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--text-dim)]">{s.label}</span>
                <span className="text-[var(--text-muted)] font-mono">{s.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderStoreNode = (id: string, data: StoreNodeState) => {
    const active = data.active;
    return (
      <div
        key={id}
        ref={setNodeRef(id)}
        onClick={() => onNodeClick(id)}
        className="arch-node arch-store cursor-pointer group relative"
        style={{ width: 140, minHeight: 80 }}
      >
        <svg viewBox="0 0 140 80" className="absolute inset-0 w-full" style={{ height: 80 }}>
          <path
            d="M 8 16 L 8 60 Q 8 72 70 72 Q 132 72 132 60 L 132 16"
            fill={active ? "var(--store-fill-active)" : "var(--store-fill)"}
            stroke={active ? "var(--accent)" : "var(--cylinder-stroke)"}
            strokeWidth="1"
            strokeDasharray={active ? "none" : "4,3"}
          />
          <ellipse
            cx="70" cy="16" rx="62" ry="11"
            fill={active ? "var(--store-top-active)" : "var(--store-top)"}
            stroke={active ? "var(--accent)" : "var(--cylinder-stroke)"}
            strokeWidth="1"
            strokeDasharray={active ? "none" : "4,3"}
          />
        </svg>
        <div className="relative z-10 px-4 pt-5 pb-1 text-center">
          <div className="text-[11px] font-medium text-[var(--text-muted)] mb-0.5">{data.label}</div>
          <div className="text-[9px] text-[var(--text-dim)]">{data.description}</div>
          {data.stats.length > 0 && (
            <div className="mt-1 space-y-0">
              {data.stats.map((s, i) => (
                <div key={i} className="text-[9px] text-[var(--text-muted)] font-mono">
                  {s.label}: {s.value}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPipelineNode = (id: string, data: PipelineNodeState) => {
    const isActive = data.state === "active";
    const isCompleted = data.state === "completed";
    const isQuery = data.icon === "query";

    if (isQuery) {
      return (
        <div
          key={id}
          ref={setNodeRef(id)}
          onClick={() => onNodeClick(id)}
          className="arch-node arch-query-input cursor-pointer group relative"
          style={{ width: 160, height: 50 }}
        >
          <svg viewBox="0 0 160 50" className="absolute inset-0 w-full h-full">
            <polygon
              points="16,0 144,0 160,25 144,50 16,50 0,25"
              fill={isCompleted ? "var(--accent-muted)" : "var(--bg-card)"}
              stroke={isActive || isCompleted ? "var(--accent)" : "var(--border-hover)"}
              strokeWidth="1"
              strokeOpacity={isCompleted ? 0.4 : 1}
            />
          </svg>
          <div className="relative z-10 flex flex-col items-center justify-center h-full">
            <span className="text-[11px] font-medium text-[var(--text)]">{data.label}</span>
            {data.summary ? (
              <span className="text-[9px] text-[var(--text-muted)] font-mono truncate max-w-[140px]">{data.summary}</span>
            ) : (
              <span className="text-[9px] text-[var(--text-dim)]">{data.description}</span>
            )}
          </div>
        </div>
      );
    }

    return (
      <div
        key={id}
        ref={setNodeRef(id)}
        onClick={() => onNodeClick(id)}
        className={`arch-node arch-pipeline cursor-pointer transition-colors flex ${
          isActive ? "bg-[var(--accent-muted)]" : isCompleted ? "bg-[var(--bg-card)]" : "bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)]"
        }`}
        style={{ width: 160 }}
      >
        <div className={`w-[3px] shrink-0 ${
          isActive || isCompleted ? "bg-[var(--accent)]" : "bg-[var(--border)]"
        }`} />
        <div className="flex-1 p-2 border-t border-r border-b" style={{
          borderColor: isActive || isCompleted ? "var(--accent)" : "var(--border)",
          opacity: isCompleted ? 0.7 : 1,
        }}>
          <div className="flex items-center gap-1.5 mb-0.5">
            <NodeIcon icon={data.icon} color={data.color} />
            <span className="text-[11px] font-medium text-[var(--text)]">{data.label}</span>
            {data.timeMs != null && (
              <span className={`text-[9px] ml-auto font-mono ${isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                {data.timeMs.toFixed(1)}ms
              </span>
            )}
          </div>
          {data.summary ? (
            <p className="text-[9px] text-[var(--text-muted)] leading-tight truncate">{data.summary}</p>
          ) : (
            <p className="text-[9px] text-[var(--text-dim)] leading-tight">{data.description}</p>
          )}
        </div>
      </div>
    );
  };

  const renderOutputNode = (id: string, data: OutputNodeState) => {
    const isResults = data.type === "results";
    const isActive = data.state === "active";
    const isCompleted = data.state === "completed";
    return (
      <div
        key={id}
        ref={setNodeRef(id)}
        onClick={() => onNodeClick(id)}
        className={`arch-node arch-output cursor-pointer transition-colors ${
          isActive ? "bg-[var(--accent-muted)]" : isCompleted ? "bg-[var(--bg-card)]" : "bg-[var(--bg-card)] hover:border-[var(--text-dim)]"
        }`}
        style={{
          width: 180,
          borderWidth: 2,
          borderStyle: "solid",
          borderColor: isActive || isCompleted ? "var(--accent)" : "var(--border-hover)",
          opacity: isCompleted ? 0.7 : 1,
          outline: isActive || isCompleted ? "2px solid var(--node-glow)" : "2px solid var(--border)",
          outlineOffset: "3px",
          padding: "10px",
        }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <NodeIcon icon={isResults ? "results" : "ai_overview"} color="amber" />
          <span className="text-[11px] font-medium text-[var(--text)]">{data.label}</span>
        </div>
        {data.state === "idle" && (
          <p className="text-[9px] text-[var(--text-dim)]">
            {isResults ? "Search to see ranked results" : "AI-generated summary"}
          </p>
        )}
        {isResults && Array.isArray(data.content) ? (
          <div className="space-y-0.5">
            {(data.content as { title: string; score: number }[]).slice(0, 3).map((r, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[9px]">
                <span className="text-[var(--text-dim)]">#{i + 1}</span>
                <span className="text-[var(--text-muted)] truncate flex-1">{(r.title || "").replace(" - Wikipedia", "")}</span>
                <span className="text-[var(--accent)] opacity-60 font-mono">{(r.score ?? 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        ) : null}
        {!isResults && data.content != null ? (
          <p className="text-[9px] text-[var(--text-muted)] leading-relaxed line-clamp-2">
            {String(data.content)}
          </p>
        ) : null}
      </div>
    );
  };

  /* ---- Render edge SVG ---- */
  const renderEdges = () => {
    return EDGES.map((edge) => {
      const pts = getEdgePoints(edge.from, edge.to);
      if (!pts) return null;

      const isActive = edgeStates.activeEdges.has(edge.id) || edgeStates.activeBuildEdges.has(edge.id);
      const isCompleted = edgeStates.completedEdges.has(edge.id);

      let strokeColor = "var(--edge-color)";
      let strokeWidth = 1;
      let dashArray = "none";
      let opacity = 1;
      let animated = false;

      if (isActive) {
        strokeColor = "var(--accent)";
        strokeWidth = 2;
        animated = true;
      } else if (isCompleted) {
        strokeColor = "var(--accent)";
        strokeWidth = 1.5;
        opacity = 0.4;
      } else {
        switch (edge.type) {
          case "write":
            dashArray = "4,4";
            break;
          case "bridge":
            dashArray = "6,4";
            opacity = 0.5;
            break;
          case "query":
            strokeColor = "var(--edge-query)";
            break;
          case "build":
            break;
        }
      }

      // Simple path with a curve
      const dx = pts.x2 - pts.x1;
      const dy = pts.y2 - pts.y1;
      const midY = pts.y1 + dy * 0.5;

      // Use a simple cubic bezier for smooth routing
      const path = `M ${pts.x1} ${pts.y1} C ${pts.x1} ${midY}, ${pts.x2} ${midY}, ${pts.x2} ${pts.y2}`;

      return (
        <path
          key={edge.id}
          d={path}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray}
          opacity={opacity}
          className={animated ? "arch-edge-animated" : ""}
        />
      );
    });
  };

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="w-full h-full bg-[var(--bg)] relative overflow-auto" ref={containerRef}>
      {/* SVG overlay for edges */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1, minWidth: 900, minHeight: 700 }}>
        {renderEdges()}
      </svg>

      {/* Layout container */}
      <div className="relative flex gap-4 p-6 min-w-[900px]" style={{ zIndex: 2 }}>

        {/* ============ BUILD PANEL (left) ============ */}
        <div className="arch-panel flex-1 min-w-[380px] max-w-[440px]">
          <div className="arch-panel-header">BUILD (offline)</div>
          <div className="flex flex-col items-center gap-0 pt-2 pb-4 px-4">

            {/* Row 1: Crawler */}
            <div className="flex justify-center w-full">
              {renderSystemNode("crawler", systemNodes.crawler)}
            </div>

            {/* spacer */}
            <div className="h-6" />

            {/* Row 2: Pages DB */}
            <div className="flex justify-center w-full">
              {renderStoreNode("pages_db", storeNodes.pages_db)}
            </div>

            {/* spacer */}
            <div className="h-6" />

            {/* Row 3: Indexer | PageRank | Chunker */}
            <div className="flex justify-center gap-3 w-full">
              {renderSystemNode("indexer", systemNodes.indexer)}
              {renderSystemNode("pr_compute", systemNodes.pr_compute)}
              {renderSystemNode("chunker", systemNodes.chunker)}
            </div>

            {/* spacer */}
            <div className="h-6" />

            {/* Row 4: Embedder (aligned under chunker) */}
            <div className="flex justify-end w-full" style={{ paddingRight: "12px" }}>
              {renderSystemNode("embedder", systemNodes.embedder)}
            </div>

            {/* spacer + store divider */}
            <div className="w-full my-4 border-t border-dashed border-[var(--border)]" />
            <div className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider mb-3 self-start font-mono">Data Stores</div>

            {/* Row 5: Stores */}
            <div className="flex justify-center gap-3 w-full">
              {renderStoreNode("inverted_index", storeNodes.inverted_index)}
              {renderStoreNode("pr_scores", storeNodes.pr_scores)}
              {renderStoreNode("vector_store", storeNodes.vector_store)}
            </div>
          </div>
        </div>

        {/* ============ QUERY PANEL (right) ============ */}
        <div className="arch-panel flex-[1.3] min-w-[440px]">
          <div className="arch-panel-header">QUERY (per search)</div>
          <div className="flex flex-col items-center gap-0 pt-2 pb-4 px-4">

            {/* Row 1: Search Query (centered) */}
            <div className="flex justify-center w-full">
              {renderPipelineNode("query_input", pipelineNodes.query_input)}
            </div>

            {/* spacer */}
            <div className="h-5" />

            {/* Path labels */}
            <div className="flex w-full">
              <div className="flex-1">
                <div className="text-[10px] text-[var(--accent)] uppercase tracking-wider font-mono opacity-60 mb-2 pl-2">&gt; Search Path</div>
              </div>
              <div className="flex-1">
                <div className="text-[10px] text-[var(--accent)] uppercase tracking-wider font-mono opacity-60 mb-2 pl-2">&gt; AI Overview Path</div>
              </div>
            </div>

            {/* Row 2: Tokenize | Fan-out + Embed Query */}
            <div className="flex w-full gap-3">
              <div className="flex-1 flex justify-center">
                {renderPipelineNode("tokenize", pipelineNodes.tokenize)}
              </div>
              <div className="flex-1 flex justify-center gap-3">
                {renderPipelineNode("fanout", pipelineNodes.fanout)}
                {renderPipelineNode("embed_query", pipelineNodes.embed_query)}
              </div>
            </div>

            {/* spacer */}
            <div className="h-6" />

            {/* Row 3: Index Lookup | Vector Search */}
            <div className="flex w-full gap-3">
              <div className="flex-1 flex justify-center">
                {renderPipelineNode("index_lookup", pipelineNodes.index_lookup)}
              </div>
              <div className="flex-1 flex justify-center">
                {renderPipelineNode("vector_search", pipelineNodes.vector_search)}
              </div>
            </div>

            {/* spacer */}
            <div className="h-6" />

            {/* Row 4: BM25 + PR Lookup | LLM */}
            <div className="flex w-full gap-3">
              <div className="flex-1 flex justify-center gap-3">
                {renderPipelineNode("bm25", pipelineNodes.bm25)}
                {renderPipelineNode("pr_lookup", pipelineNodes.pr_lookup)}
              </div>
              <div className="flex-1 flex justify-center">
                {renderPipelineNode("llm", pipelineNodes.llm)}
              </div>
            </div>

            {/* spacer */}
            <div className="h-6" />

            {/* Row 5: Combine | AI Overview */}
            <div className="flex w-full gap-3">
              <div className="flex-1 flex justify-center">
                {renderPipelineNode("combine", pipelineNodes.combine)}
              </div>
              <div className="flex-1 flex justify-center">
                {renderOutputNode("ai_overview", outputNodes.ai_overview)}
              </div>
            </div>

            {/* spacer */}
            <div className="h-6" />

            {/* Row 6: Results */}
            <div className="flex w-full gap-3">
              <div className="flex-1 flex justify-center">
                {renderOutputNode("results", outputNodes.results)}
              </div>
              <div className="flex-1" />
            </div>
          </div>
        </div>
      </div>

      <CanvasLegend />
      <ThemeToggle />
    </div>
  );
}

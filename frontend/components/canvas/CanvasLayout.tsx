"use client";

import { useMemo } from "react";
import CanvasLegend from "./CanvasLegend";
import ThemeToggle from "./ThemeToggle";
import NodeIcon from "./NodeIcon";
import { phaseNodeMap, phaseStoreMap } from "./nodeDefinitions";
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

/* ================================================================
   Phase order for determining completed nodes
   ================================================================ */

const PHASE_ORDER: FlowPhase[] = [
  "queryInput", "tokenizing", "indexLookup", "bm25", "pagerank",
  "combining", "results", "aiFanout", "aiEmbedding", "aiRetrieval",
  "aiSynthesis", "aiComplete",
];

/* ================================================================
   Connector — vertical line between rows
   ================================================================ */
function Connector({ active, dashed, className }: { active?: boolean; dashed?: boolean; className?: string }) {
  return (
    <div className={`flex justify-center ${className || ""}`}>
      <div
        className={`w-px h-5 ${active ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
        style={dashed ? { backgroundImage: `repeating-linear-gradient(to bottom, var(${active ? "--accent" : "--border"}) 0, var(${active ? "--accent" : "--border"}) 3px, transparent 3px, transparent 6px)`, backgroundColor: "transparent" } : undefined}
      />
    </div>
  );
}

function ForkConnector({ count, active }: { count: number; active?: boolean }) {
  const color = active ? "var(--accent)" : "var(--border)";
  return (
    <div className="flex justify-center">
      <div className="relative" style={{ width: "80%", height: 20 }}>
        {/* Vertical line down from center */}
        <div className="absolute left-1/2 top-0 w-px h-2" style={{ backgroundColor: color }} />
        {/* Horizontal bar */}
        <div className="absolute top-2 left-0 right-0 h-px" style={{ backgroundColor: color }} />
        {/* Vertical lines down to each child */}
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="absolute top-2 w-px h-3" style={{ backgroundColor: color, left: `${(i / (count - 1)) * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   Component
   ================================================================ */

export default function CanvasLayout({
  onSearch, query, phase, stats, searchData, overviewText, overviewTrace, onNodeClick,
  crawlProgress, indexProgress, embedProgress,
}: CanvasLayoutProps) {

  /* ---- Derive node states ---- */
  const nodeState = useMemo(() => {
    // Which pipeline nodes are active/completed
    const activeNode = phase !== "idle" ? phaseNodeMap[phase] : null;
    const completedNodes = new Set<string>();
    if (phase !== "idle") {
      const idx = PHASE_ORDER.indexOf(phase);
      for (let i = 0; i < idx; i++) {
        const n = phaseNodeMap[PHASE_ORDER[i]];
        if (n) completedNodes.add(n);
      }
    }
    // Active stores
    const activeStores = new Set<string>(phase !== "idle" ? (phaseStoreMap[phase] || []) : []);
    if (crawlProgress) activeStores.add("pages_db");
    if (indexProgress) { activeStores.add("inverted_index"); if (indexProgress.phase === "pagerank") activeStores.add("pr_scores"); }
    if (embedProgress) activeStores.add("vector_store");

    return { activeNode, completedNodes, activeStores };
  }, [phase, crawlProgress, indexProgress, embedProgress]);

  /* ---- Pipeline node data from trace ---- */
  const trace = searchData?.pipeline;
  const pData: Record<string, { timeMs?: number; summary?: string }> = {};
  if (trace) {
    pData.query_input = { summary: `"${searchData.query}"` };
    pData.tokenize = { timeMs: trace.tokenization.time_ms, summary: `[${trace.tokenization.tokens.join(", ")}]` };
    pData.index_lookup = { timeMs: trace.index_lookup.time_ms, summary: `${Object.keys(trace.index_lookup.terms_found).length} terms` };
    pData.bm25 = { timeMs: trace.bm25_scoring.time_ms, summary: `${trace.bm25_scoring.total_matched} docs` };
    pData.pr_lookup = { timeMs: trace.pagerank.time_ms };
    pData.combine = { timeMs: trace.combination.time_ms, summary: trace.combination.formula };
  }
  if (overviewTrace?.fanout) pData.fanout = { timeMs: overviewTrace.fanout.time_ms, summary: `${overviewTrace.fanout.expanded.length} queries` };
  if (overviewTrace?.retrieval) pData.vector_search = { timeMs: overviewTrace.retrieval.time_ms, summary: `${overviewTrace.retrieval.chunks_retrieved} chunks` };
  if (overviewTrace?.synthesis) pData.llm = { timeMs: overviewTrace.synthesis.time_ms, summary: overviewTrace.synthesis.model };

  /* ---- Render helpers ---- */
  const nodeClass = (id: string) => {
    if (nodeState.activeNode === id) return "arch-active";
    if (nodeState.completedNodes.has(id)) return "arch-completed";
    return "";
  };

  const sysNode = (id: string, icon: string, color: string, label: string, desc: string, statsList: StatEntry[], progress?: { done: number; total: number; label?: string } | null, running?: boolean) => (
    <div onClick={() => onNodeClick(id)} className={`arch-system cursor-pointer ${running ? "border-[var(--accent)]" : ""}`}>
      <div className="flex items-center gap-2 mb-1">
        <NodeIcon icon={icon} color={color} />
        <span className="text-[11px] font-medium text-[var(--text)]">{label}</span>
        <div className={`w-1.5 h-1.5 ml-auto ${running ? "bg-[var(--accent)] animate-pulse" : "bg-emerald-500"}`} />
      </div>
      <p className="text-[9px] text-[var(--text-dim)] leading-tight mb-1">{desc}</p>
      {running && progress && (
        <div className="mb-1">
          <div className="flex justify-between text-[9px] mb-0.5">
            <span className="text-[var(--accent)] font-mono">{progress.done}/{progress.total}</span>
            <span className="text-[var(--text-dim)]">{Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%</span>
          </div>
          <div className="w-full h-1 bg-[var(--score-bar-bg)]"><div className="h-full bg-[var(--accent)]" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} /></div>
          {progress.label && <div className="text-[8px] text-[var(--text-dim)] mt-0.5 truncate">{progress.label}</div>}
        </div>
      )}
      {statsList.length > 0 && (
        <div className="flex justify-between text-[9px] border-t border-[var(--border)] pt-1 mt-1">
          {statsList.map((s, i) => <span key={i} className="text-[var(--text-muted)] font-mono">{s.label} {s.value}</span>)}
        </div>
      )}
    </div>
  );

  const storeNode = (id: string, label: string, desc: string, statsList: StatEntry[]) => {
    const active = nodeState.activeStores.has(id);
    return (
      <div onClick={() => onNodeClick(id)} className={`arch-store cursor-pointer ${active ? "arch-store-active" : ""}`}>
        <div className="text-[10px] font-medium text-[var(--text-muted)] mb-0.5">{label}</div>
        <div className="text-[8px] text-[var(--text-dim)]">{desc}</div>
        {statsList.map((s, i) => <div key={i} className="text-[8px] text-[var(--text-muted)] font-mono">{s.label}: {s.value}</div>)}
      </div>
    );
  };

  const pipNode = (id: string, icon: string, color: string, label: string, desc: string) => {
    const nc = nodeClass(id);
    const d = pData[id];
    return (
      <div onClick={() => onNodeClick(id)} className={`arch-pipeline cursor-pointer ${nc}`}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <NodeIcon icon={icon} color={color} />
          <span className="text-[10px] font-medium text-[var(--text)]">{label}</span>
          {d?.timeMs != null && <span className="text-[8px] ml-auto font-mono text-[var(--text-muted)]">{d.timeMs.toFixed(0)}ms</span>}
        </div>
        <p className="text-[8px] text-[var(--text-dim)] leading-tight truncate">{d?.summary || desc}</p>
      </div>
    );
  };

  const outNode = (id: string, label: string, defaultText: string, content: unknown) => {
    const nc = nodeClass(id);
    return (
      <div onClick={() => onNodeClick(id)} className={`arch-output cursor-pointer ${nc}`}>
        <div className="flex items-center gap-1.5 mb-1">
          <NodeIcon icon={id === "results" ? "results" : "ai_overview"} color="amber" />
          <span className="text-[10px] font-medium text-[var(--text)]">{label}</span>
        </div>
        {content ? (
          <p className="text-[8px] text-[var(--text-muted)] leading-tight line-clamp-2">{typeof content === "string" ? content.slice(0, 80) : `${(content as Array<unknown>).length} results`}</p>
        ) : (
          <p className="text-[8px] text-[var(--text-dim)]">{defaultText}</p>
        )}
      </div>
    );
  };

  // Stats
  const s = stats;
  const crawlerStats: StatEntry[] = s ? [{ label: "Pages", value: s.pages_crawled.toLocaleString() }] : [];
  const indexerStats: StatEntry[] = s ? [{ label: "Terms", value: s.total_terms.toLocaleString() }] : [];
  const chunkerStats: StatEntry[] = s ? [{ label: "Chunks", value: s.total_chunks.toLocaleString() }] : [];
  const embedderStats: StatEntry[] = s ? [{ label: "Vectors", value: s.chunks_embedded.toLocaleString() }] : [];

  const buildActive = !!(crawlProgress || indexProgress || embedProgress);

  return (
    <div className="w-full h-full bg-[var(--bg)] overflow-auto">
      <div className="flex gap-3 p-4 min-h-full">

        {/* ============ BUILD PANEL ============ */}
        <div className="arch-panel w-[360px] shrink-0">
          <div className="arch-panel-header">BUILD (offline)</div>
          <div className="p-4 space-y-0">

            {/* Crawler */}
            <div className="flex justify-center">
              {sysNode("crawler", "crawler", "emerald", "Crawler", "Fetches pages via BFS", crawlerStats,
                crawlProgress ? { done: crawlProgress.pages_crawled, total: crawlProgress.max_pages, label: crawlProgress.title || crawlProgress.current_url } : null,
                !!crawlProgress)}
            </div>
            <Connector active={!!crawlProgress} dashed />

            {/* Pages DB */}
            <div className="flex justify-center">
              {storeNode("pages_db", "Pages DB", "Crawled pages", s ? [{ label: "Rows", value: s.pages_crawled.toLocaleString() }] : [])}
            </div>

            <ForkConnector count={3} active={buildActive} />

            {/* Indexer | PageRank | Chunker */}
            <div className="grid grid-cols-3 gap-2">
              {sysNode("indexer", "indexer", "blue", "Indexer", "Builds inverted index", indexerStats,
                indexProgress ? { done: indexProgress.pages_done, total: indexProgress.pages_total, label: `${indexProgress.unique_terms.toLocaleString()} terms` } : null,
                !!indexProgress && indexProgress.phase !== "pagerank")}
              {sysNode("pr_compute", "pagerank", "indigo", "PageRank", "Link authority", [],
                null, indexProgress?.phase === "pagerank")}
              {sysNode("chunker", "chunker", "violet", "Chunker", "~300 token chunks", chunkerStats,
                null, !!(embedProgress && embedProgress.chunks_done === 0))}
            </div>

            {/* Embedder — right-aligned under Chunker */}
            <div className="flex justify-end pr-1">
              <Connector active={!!(embedProgress && embedProgress.chunks_done > 0)} />
            </div>
            <div className="flex justify-end">
              {sysNode("embedder", "embedder", "purple", "Embedder", "512-dim (Voyage)", embedderStats,
                embedProgress && embedProgress.chunks_done > 0 ? { done: embedProgress.chunks_done, total: embedProgress.chunks_total } : null,
                !!(embedProgress && embedProgress.chunks_done > 0))}
            </div>

            {/* Store divider */}
            <div className="border-t border-dashed border-[var(--border)] my-4" />
            <div className="text-[9px] text-[var(--text-dim)] uppercase tracking-wider font-mono mb-2">Data Stores</div>

            {/* Stores row — connected to processors above */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Connector active={!!indexProgress} dashed />
                {storeNode("inverted_index", "Inverted Index", "term → docs", s ? [{ label: "Terms", value: s.total_terms.toLocaleString() }] : [])}
              </div>
              <div>
                <Connector active={indexProgress?.phase === "pagerank"} dashed />
                {storeNode("pr_scores", "PR Scores", "Authority/page", s ? [{ label: "Pages", value: s.pages_crawled.toLocaleString() }] : [])}
              </div>
              <div>
                <Connector active={!!embedProgress} dashed />
                {storeNode("vector_store", "Vector Store", "Chunk embeddings", s ? [{ label: "Vectors", value: s.chunks_embedded.toLocaleString() }] : [])}
              </div>
            </div>
          </div>
        </div>

        {/* ============ QUERY PANEL ============ */}
        <div className="arch-panel flex-1">
          <div className="arch-panel-header">QUERY (per search)</div>
          <div className="p-4 space-y-0">

            {/* Search Query */}
            <div className="flex justify-center">
              {pipNode("query_input", "query", "amber", "Search Query", "User enters a query")}
            </div>

            {/* Fork into two paths */}
            <div className="grid grid-cols-2 gap-4 mt-1">
              {/* SEARCH PATH */}
              <div>
                <div className="text-[9px] text-[var(--accent)] uppercase tracking-wider font-mono opacity-60 mb-2 text-center">&gt; Search Path</div>
                <div className="space-y-0">
                  {pipNode("tokenize", "tokenize", "amber", "Tokenize", "Query → tokens")}
                  <Connector active={nodeState.completedNodes.has("tokenize") || nodeState.activeNode === "index_lookup"} />
                  {pipNode("index_lookup", "inverted_index", "amber", "Index Lookup", "Term → doc list")}
                  <Connector active={nodeState.completedNodes.has("index_lookup") || nodeState.activeNode === "bm25"} />
                  <div className="grid grid-cols-2 gap-2">
                    {pipNode("bm25", "bm25", "amber", "BM25", "TF × IDF × length")}
                    {pipNode("pr_lookup", "pagerank", "amber", "PR Lookup", "Fetch scores")}
                  </div>
                  <Connector active={nodeState.completedNodes.has("bm25") || nodeState.activeNode === "combine"} />
                  {pipNode("combine", "combine", "amber", "Combine", "α×BM25 + (1-α)×PR")}
                  <Connector active={nodeState.completedNodes.has("combine") || nodeState.activeNode === "results"} />
                  {outNode("results", "Ranked Results", "Search to see results", searchData ? searchData.results : null)}
                </div>
              </div>

              {/* AI OVERVIEW PATH */}
              <div>
                <div className="text-[9px] text-[var(--accent)] uppercase tracking-wider font-mono opacity-60 mb-2 text-center">&gt; AI Overview Path</div>
                <div className="space-y-0">
                  <div className="grid grid-cols-2 gap-2">
                    {pipNode("fanout", "fanout", "amber", "Fan-out", "Expand via LLM")}
                    {pipNode("embed_query", "embedder", "amber", "Embed Query", "Query → vector")}
                  </div>
                  <Connector active={nodeState.completedNodes.has("fanout") || nodeState.activeNode === "vector_search"} />
                  {pipNode("vector_search", "retriever", "amber", "Vector Search", "Cosine similarity")}
                  <Connector active={nodeState.completedNodes.has("vector_search") || nodeState.activeNode === "llm"} />
                  {pipNode("llm", "llm", "amber", "LLM Synthesis", "Groq — Llama 3.3 70B")}
                  <Connector active={nodeState.completedNodes.has("llm") || nodeState.activeNode === "ai_overview"} />
                  {outNode("ai_overview", "AI Overview", "AI-generated summary", overviewText || null)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ThemeToggle />
    </div>
  );
}

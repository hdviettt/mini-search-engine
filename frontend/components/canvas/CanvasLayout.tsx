"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import SystemNode from "./nodes/SystemNode";
import PipelineNode from "./nodes/PipelineNode";
import OutputNode from "./nodes/OutputNode";
import StoreNode from "./nodes/StoreNode";
import LabelNode from "./nodes/LabelNode";
import CanvasLegend from "./CanvasLegend";
import ThemeToggle from "./ThemeToggle";
import GuidedTour from "./GuidedTour";
import { initialNodes, initialEdges, phaseEdgeMap, phaseNodeMap, phaseStoreMap } from "./nodeDefinitions";
import type { FlowPhase, PipelineNodeData, OutputNodeData, SystemNodeData } from "./types";
import type { ExplainResponse, Stats, PipelineTrace, CrawlProgressData, IndexProgressData, EmbedProgressData } from "@/lib/types";
import type { OverviewTrace } from "@/lib/api";

const nodeTypes: NodeTypes = {
  system: SystemNode,
  pipeline: PipelineNode,
  output: OutputNode,
  store: StoreNode,
  label: LabelNode,
};

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

export default function CanvasLayout({
  onSearch, query, phase, stats, searchData, overviewText, overviewTrace, onNodeClick,
  crawlProgress, indexProgress, embedProgress,
}: CanvasLayoutProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [tourActive, setTourActive] = useState(false);

  // Auto-start tour for first-time visitors
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("tour-seen")) {
      const timer = setTimeout(() => setTourActive(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Update system nodes with stats
  useEffect(() => {
    if (!stats) return;
    setNodes((nds) =>
      nds.map((n) => {
        // Build zone stats
        if (n.id === "crawler") return { ...n, data: { ...n.data, stats: [{ label: "Pages", value: stats.pages_crawled.toLocaleString() }] } };
        if (n.id === "indexer") return { ...n, data: { ...n.data, stats: [{ label: "Terms", value: stats.total_terms.toLocaleString() }] } };
        if (n.id === "chunker") return { ...n, data: { ...n.data, stats: [{ label: "Chunks", value: stats.total_chunks.toLocaleString() }] } };
        if (n.id === "embedder") return { ...n, data: { ...n.data, stats: [{ label: "Vectors", value: stats.chunks_embedded.toLocaleString() }] } };
        // Store stats
        if (n.id === "pages_db") return { ...n, data: { ...n.data, stats: [{ label: "Rows", value: stats.pages_crawled.toLocaleString() }] } };
        if (n.id === "inverted_index") return { ...n, data: { ...n.data, stats: [
          { label: "Terms", value: stats.total_terms.toLocaleString() },
          { label: "Postings", value: stats.total_postings.toLocaleString() },
        ] } };
        if (n.id === "pr_scores") return { ...n, data: { ...n.data, stats: [{ label: "Pages", value: stats.pages_crawled.toLocaleString() }] } };
        if (n.id === "vector_store") return { ...n, data: { ...n.data, stats: [{ label: "Vectors", value: stats.chunks_embedded.toLocaleString() }] } };
        return n;
      })
    );
  }, [stats, setNodes]);

  // Update system nodes during jobs
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === "crawler" && n.type === "system") {
          if (crawlProgress) {
            return { ...n, data: { ...n.data, status: "running", progress: { done: crawlProgress.pages_crawled, total: crawlProgress.max_pages, label: crawlProgress.title || crawlProgress.current_url } } };
          }
          return { ...n, data: { ...n.data, status: "ready", progress: null } };
        }
        if (n.id === "indexer" && n.type === "system") {
          if (indexProgress) {
            return { ...n, data: { ...n.data, status: "running", progress: { done: indexProgress.pages_done, total: indexProgress.pages_total, label: `${indexProgress.unique_terms.toLocaleString()} terms` } } };
          }
          return { ...n, data: { ...n.data, status: "ready", progress: null } };
        }
        if (n.id === "pr_compute" && n.type === "system") {
          if (indexProgress?.phase === "pagerank") {
            return { ...n, data: { ...n.data, status: "running", progress: null } };
          }
          return { ...n, data: { ...n.data, status: "ready", progress: null } };
        }
        if (n.id === "chunker" && n.type === "system") {
          if (embedProgress && embedProgress.chunks_done === 0) {
            return { ...n, data: { ...n.data, status: "running", progress: null } };
          }
          return { ...n, data: { ...n.data, status: "ready", progress: null } };
        }
        if (n.id === "embedder" && n.type === "system") {
          if (embedProgress && embedProgress.chunks_done > 0) {
            return { ...n, data: { ...n.data, status: "running", progress: { done: embedProgress.chunks_done, total: embedProgress.chunks_total, label: embedProgress.current_chunk_preview?.slice(0, 40) } } };
          }
          return { ...n, data: { ...n.data, status: "ready", progress: null } };
        }
        // Store highlighting handled by phase effect below
        return n;
      })
    );
  }, [crawlProgress, indexProgress, embedProgress, setNodes]);

  // Update pipeline nodes with trace data (data only — state managed by phase animation)
  useEffect(() => {
    if (!searchData?.pipeline) return;
    const t = searchData.pipeline;

    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === "query_input" && n.type === "pipeline") {
          return { ...n, data: { ...n.data, summary: `"${searchData.query}"` } };
        }
        if (n.id === "tokenize" && n.type === "pipeline") {
          return { ...n, data: { ...n.data, timeMs: t.tokenization.time_ms,
            summary: `[${t.tokenization.tokens.join(", ")}]` } };
        }
        if (n.id === "index_lookup" && n.type === "pipeline") {
          return { ...n, data: { ...n.data, timeMs: t.index_lookup.time_ms,
            summary: `${Object.keys(t.index_lookup.terms_found).length} terms found` } };
        }
        if (n.id === "bm25" && n.type === "pipeline") {
          return { ...n, data: { ...n.data, timeMs: t.bm25_scoring.time_ms,
            summary: `${t.bm25_scoring.total_matched} docs scored` } };
        }
        if (n.id === "pr_lookup" && n.type === "pipeline") {
          return { ...n, data: { ...n.data, timeMs: t.pagerank.time_ms,
            summary: `Top: ${t.pagerank.top_scores[0]?.title.replace(" - Wikipedia", "").slice(0, 20) || ""}` } };
        }
        if (n.id === "combine" && n.type === "pipeline") {
          return { ...n, data: { ...n.data, timeMs: t.combination.time_ms,
            summary: t.combination.formula } };
        }
        if (n.id === "results" && n.type === "output") {
          return { ...n, data: { ...n.data,
            content: searchData.results.map((r) => ({ title: r.title, score: r.final_score })) } };
        }
        return n;
      })
    );
  }, [searchData, setNodes]);

  // Update AI overview nodes with trace data (data only — state managed by phase animation)
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === "fanout" && n.type === "pipeline" && overviewTrace?.fanout) {
          return { ...n, data: { ...n.data, timeMs: overviewTrace.fanout.time_ms,
            summary: `${overviewTrace.fanout.expanded.length} queries` } };
        }
        if (n.id === "vector_search" && n.type === "pipeline" && overviewTrace?.retrieval) {
          return { ...n, data: { ...n.data, timeMs: overviewTrace.retrieval.time_ms,
            summary: `${overviewTrace.retrieval.chunks_retrieved} chunks` } };
        }
        if (n.id === "llm" && n.type === "pipeline" && overviewTrace?.synthesis) {
          return { ...n, data: { ...n.data, timeMs: overviewTrace.synthesis.time_ms,
            summary: overviewTrace.synthesis.model } };
        }
        if (n.id === "ai_overview" && n.type === "output") {
          if (overviewText) {
            return { ...n, data: { ...n.data, content: overviewText } };
          }
        }
        return n;
      })
    );
  }, [overviewTrace, overviewText, setNodes]);

  // Ordered list of all phases — used to determine which nodes are "completed"
  const PHASE_ORDER = ["queryInput", "tokenizing", "indexLookup", "bm25", "pagerank", "combining", "results", "aiFanout", "aiEmbedding", "aiRetrieval", "aiSynthesis", "aiComplete"];

  // Animate edges, nodes, and stores based on current phase
  useEffect(() => {
    // Always update stores (build + query), even when idle
    // Collect active + completed stores from all phases up to current
    const allActiveStores = new Set<string>();
    if (phase !== "idle") {
      const currentIdx = PHASE_ORDER.indexOf(phase);
      // Current phase stores
      for (const s of (phaseStoreMap[phase] || [])) allActiveStores.add(s);
      // Completed phase stores stay lit
      for (let i = 0; i < currentIdx; i++) {
        for (const s of (phaseStoreMap[PHASE_ORDER[i]] || [])) allActiveStores.add(s);
      }
    }
    // Build-time stores
    if (crawlProgress) allActiveStores.add("pages_db");
    if (indexProgress) { allActiveStores.add("inverted_index"); if (indexProgress.phase === "pagerank") allActiveStores.add("pr_scores"); }
    if (embedProgress) allActiveStores.add("vector_store");

    setNodes((nds) =>
      nds.map((n) => {
        if (n.type !== "store") return n;
        return { ...n, data: { ...n.data, active: allActiveStores.has(n.id) } };
      })
    );

    if (phase === "idle") return;

    const currentIdx = PHASE_ORDER.indexOf(phase);
    const activeNode = phaseNodeMap[phase];

    // Collect completed nodes from prior phases
    const completedNodes = new Set<string>();
    for (let i = 0; i < currentIdx; i++) {
      const node = phaseNodeMap[PHASE_ORDER[i]];
      if (node) completedNodes.add(node);
    }

    // Edges stay static — no animation, no glow. Status shown via node dots only.

    setNodes((nds) =>
      nds.map((n) => {
        if (n.type === "pipeline" || n.type === "output") {
          if (n.id === activeNode) {
            return { ...n, data: { ...n.data, state: "active" } };
          }
          if (completedNodes.has(n.id)) {
            return { ...n, data: { ...n.data, state: "completed" } };
          }
        }
        // Stores handled above
        return n;
      })
    );
  }, [phase, crawlProgress, indexProgress, embedProgress, setNodes]);

  // Reset pipeline nodes on new search
  useEffect(() => {
    if (phase === "idle") return;
    if (phase === "queryInput") {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.type === "pipeline") return { ...n, data: { ...n.data, state: "idle", timeMs: null, summary: null } };
          if (n.type === "output") return { ...n, data: { ...n.data, state: "idle", content: null } };
          if (n.type === "store") return { ...n, data: { ...n.data, active: false } };
          return n;
        })
      );
    }
  }, [phase, setNodes]);

  // Animate build edges during live operations
  useEffect(() => {
    const activeEdges = new Set<string>();
    if (crawlProgress) activeEdges.add("b-crawler-pages");
    if (indexProgress) {
      activeEdges.add("b-pages-indexer");
      activeEdges.add("b-indexer-index");
      if (indexProgress.phase === "pagerank") {
        activeEdges.add("b-pages-pr");
        activeEdges.add("b-pr-scores");
      }
    }
    if (embedProgress) {
      activeEdges.add("b-pages-chunker");
      activeEdges.add("b-chunker-embedder");
      if (embedProgress.chunks_done > 0) activeEdges.add("b-embedder-vectors");
    }
    setEdges((eds) =>
      eds.map((e) => {
        if (!e.id.startsWith("b-")) return e;
        if (activeEdges.has(e.id)) {
          return { ...e, className: "edge-active-build", style: { stroke: "var(--accent)", strokeWidth: 1.5, strokeDasharray: "6,4" } };
        }
        const original = initialEdges.find((oe) => oe.id === e.id);
        return original ? { ...e, className: undefined, style: original.style } : e;
      })
    );
  }, [crawlProgress, indexProgress, embedProgress, setEdges]);

  const handleTourComplete = useCallback(() => {
    setTourActive(false);
    localStorage.setItem("tour-seen", "true");
  }, []);

  const handleNodeClick = useCallback((_: unknown, node: { id: string }) => {
    onNodeClick(node.id);
  }, [onNodeClick]);

  const statsForOverlay = stats ? {
    pages: stats.pages_crawled,
    terms: stats.total_terms,
    chunks: stats.total_chunks,
  } : null;

  return (
    <div className="w-full h-full bg-[var(--bg)] relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        className="!bg-[var(--bg)]"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={0.8} color="var(--dot-color)" />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === "group" || node.type === "label") return "transparent";
            if (node.type === "store" || node.type === "output") return "var(--accent)";
            return "var(--text-dim)";
          }}
          maskColor="var(--minimap-mask)"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          pannable
          zoomable
        />
        {tourActive && <GuidedTour onComplete={handleTourComplete} />}
      </ReactFlow>
      <CanvasLegend />
      <ThemeToggle />
      <button
        onClick={() => setTourActive(true)}
        className="absolute top-3 left-[48px] z-10 w-8 h-8 flex items-center justify-center bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 cursor-pointer transition-colors text-[13px] font-mono"
        title="Restart guided tour"
      >
        ?
      </button>
    </div>
  );
}

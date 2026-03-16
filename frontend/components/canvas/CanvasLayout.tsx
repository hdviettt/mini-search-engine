"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
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

  // Update system nodes + store nodes + build edges during jobs
  useEffect(() => {
    // Determine which build edges should be active
    const activeBuildEdges: string[] = [];
    const writingStores: string[] = [];

    if (crawlProgress) {
      activeBuildEdges.push("b-crawler-pages");
      writingStores.push("pages_db");
    }
    if (indexProgress) {
      activeBuildEdges.push("b-pages-indexer", "b-indexer-index");
      writingStores.push("inverted_index");
      if (indexProgress.phase === "pagerank") {
        activeBuildEdges.push("b-pages-pr", "b-pr-scores");
        writingStores.push("pr_scores");
      }
    }
    if (embedProgress) {
      if (embedProgress.chunks_done === 0) {
        // Chunking phase
        activeBuildEdges.push("b-pages-chunker", "b-chunker-embedder");
        writingStores.push("vector_store");
      } else {
        // Embedding phase
        activeBuildEdges.push("b-chunker-embedder", "b-embedder-vectors");
        writingStores.push("vector_store");
      }
    }

    // Animate build edges
    setEdges((eds) =>
      eds.map((e) => {
        if (!e.id.startsWith("b-")) return e;
        const isActive = activeBuildEdges.includes(e.id);
        // Determine if this is a "write" edge (dashed by default) or "read" edge (solid by default)
        const isWriteEdge = ["b-crawler-pages", "b-indexer-index", "b-pr-scores", "b-embedder-vectors"].includes(e.id);
        return {
          ...e,
          animated: isActive,
          style: isActive
            ? { stroke: "var(--accent)", strokeWidth: 2 }
            : isWriteEdge
              ? { strokeDasharray: "4,4", stroke: "var(--edge-color)", strokeWidth: 1 }
              : { stroke: "var(--edge-color)", strokeWidth: 1 },
        };
      })
    );

    // Update system nodes + store writing state
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
  }, [crawlProgress, indexProgress, embedProgress, setNodes, setEdges]);

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
    const activeEdges = phaseEdgeMap[phase] || [];
    const activeStores = phaseStoreMap[phase] || [];

    // Collect all completed nodes and edges from prior phases
    const completedNodes = new Set<string>();
    const completedEdges = new Set<string>();
    for (let i = 0; i < currentIdx; i++) {
      const p = PHASE_ORDER[i];
      const node = phaseNodeMap[p];
      if (node) completedNodes.add(node);
      for (const e of (phaseEdgeMap[p] || [])) completedEdges.add(e);
    }

    setEdges((eds) =>
      eds.map((e) => {
        const isBuildEdge = e.id.startsWith("b-");
        const isBridgeEdge = ["q-store-lookup", "q-scores-prlookup", "q-vectors-vsearch"].includes(e.id);
        const isActive = activeEdges.includes(e.id);
        const isCompleted = completedEdges.has(e.id);
        const isWriteEdge = ["b-crawler-pages", "b-indexer-index", "b-pr-scores", "b-embedder-vectors"].includes(e.id);
        return {
          ...e,
          animated: isActive,
          style: isActive
            ? { stroke: "var(--accent)", strokeWidth: 2, opacity: 1 }
            : isCompleted
              ? { stroke: "var(--accent)", strokeWidth: 1.5, opacity: 0.4 }
              : isBridgeEdge
                ? { strokeDasharray: "6,4", stroke: "var(--edge-color)", strokeWidth: 1, opacity: 0.5 }
                : isBuildEdge
                  ? isWriteEdge
                    ? { strokeDasharray: "4,4", stroke: "var(--edge-color)", strokeWidth: 1 }
                    : { stroke: "var(--edge-color)", strokeWidth: 1 }
                  : { stroke: "var(--edge-query)", strokeWidth: 1 },
        };
      })
    );

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
  }, [phase, crawlProgress, indexProgress, embedProgress, setEdges, setNodes]);

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
      </ReactFlow>
      <CanvasLegend />
      <ThemeToggle />
    </div>
  );
}

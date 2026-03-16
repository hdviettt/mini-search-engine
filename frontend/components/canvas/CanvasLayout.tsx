"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
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
import type { ExplainResponse, Stats, PipelineTrace } from "@/lib/types";
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
}

export default function CanvasLayout({
  onSearch, query, phase, stats, searchData, overviewText, overviewTrace, onNodeClick,
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

  // Update pipeline nodes with trace data
  useEffect(() => {
    if (!searchData?.pipeline) return;
    const t = searchData.pipeline;

    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === "query_input" && n.type === "pipeline") {
          return { ...n, data: { ...n.data, state: "completed",
            summary: `"${searchData.query}"` } };
        }
        if (n.id === "tokenize" && n.type === "pipeline") {
          return { ...n, data: { ...n.data, state: "completed", timeMs: t.tokenization.time_ms,
            summary: `[${t.tokenization.tokens.join(", ")}]` } };
        }
        if (n.id === "bm25" && n.type === "pipeline") {
          return { ...n, data: { ...n.data, state: "completed", timeMs: t.bm25_scoring.time_ms,
            summary: `${t.bm25_scoring.total_matched} docs scored` } };
        }
        if (n.id === "pr_lookup" && n.type === "pipeline") {
          return { ...n, data: { ...n.data, state: "completed", timeMs: t.pagerank.time_ms,
            summary: `Top: ${t.pagerank.top_scores[0]?.title.replace(" - Wikipedia", "").slice(0, 20) || ""}` } };
        }
        if (n.id === "combine" && n.type === "pipeline") {
          return { ...n, data: { ...n.data, state: "completed", timeMs: t.combination.time_ms,
            summary: t.combination.formula } };
        }
        if (n.id === "results" && n.type === "output") {
          return { ...n, data: { ...n.data, state: "completed",
            content: searchData.results.map((r) => ({ title: r.title, score: r.final_score })) } };
        }
        return n;
      })
    );
  }, [searchData, setNodes]);

  // Update AI overview nodes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === "fanout" && n.type === "pipeline" && overviewTrace?.fanout) {
          return { ...n, data: { ...n.data, state: "completed", timeMs: overviewTrace.fanout.time_ms,
            summary: `${overviewTrace.fanout.expanded.length} queries` } };
        }
        if (n.id === "vector_search" && n.type === "pipeline" && overviewTrace?.retrieval) {
          return { ...n, data: { ...n.data, state: "completed", timeMs: overviewTrace.retrieval.time_ms,
            summary: `${overviewTrace.retrieval.chunks_retrieved} chunks` } };
        }
        if (n.id === "llm" && n.type === "pipeline" && overviewTrace?.synthesis) {
          return { ...n, data: { ...n.data, state: "completed", timeMs: overviewTrace.synthesis.time_ms,
            summary: overviewTrace.synthesis.model } };
        }
        if (n.id === "ai_overview" && n.type === "output") {
          if (overviewText) {
            return { ...n, data: { ...n.data, state: "completed", content: overviewText } };
          }
        }
        return n;
      })
    );
  }, [overviewTrace, overviewText, setNodes]);

  // Animate edges based on phase
  useEffect(() => {
    const activeEdges = phaseEdgeMap[phase] || [];
    setEdges((eds) =>
      eds.map((e) => {
        const isBuildEdge = e.id.startsWith("b-");
        const isActive = activeEdges.includes(e.id);
        return {
          ...e,
          animated: isActive,
          style: isActive
            ? { stroke: "var(--accent)", strokeWidth: 2 }
            : isBuildEdge
              ? { strokeDasharray: "4,4", stroke: "var(--edge-color)", strokeWidth: 1 }
              : { stroke: "var(--edge-query)", strokeWidth: 1 },
        };
      })
    );

    // Glow active node + highlight stores being read
    const activeNode = phaseNodeMap[phase];
    const activeStores = phaseStoreMap[phase] || [];
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === activeNode && (n.type === "pipeline" || n.type === "output")) {
          return { ...n, data: { ...n.data, state: "active" } };
        }
        if (n.type === "store") {
          return { ...n, data: { ...n.data, reading: activeStores.includes(n.id) } };
        }
        return n;
      })
    );
  }, [phase, setEdges, setNodes]);

  // Reset pipeline nodes on new search
  useEffect(() => {
    if (phase === "idle") return;
    if (phase === "tokenizing") {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.type === "pipeline") return { ...n, data: { ...n.data, state: "idle", timeMs: null, summary: null } };
          if (n.type === "output") return { ...n, data: { ...n.data, state: "idle", content: null } };
          if (n.type === "store") return { ...n, data: { ...n.data, reading: false } };
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
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="!bg-[var(--bg)]"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={0.8} color="var(--dot-color)" />
        <Controls className="!bg-[var(--bg-card)] !border-[var(--border)] [&>button]:!bg-[var(--bg-card)] [&>button]:!border-[var(--border)] [&>button]:!text-[var(--text-dim)] [&>button:hover]:!bg-[var(--bg-elevated)]" />
        <MiniMap
          nodeColor="var(--border)"
          maskColor="var(--minimap-mask)"
          className="!bg-[var(--bg-card)] !border-[var(--border)]"
        />
      </ReactFlow>
      <CanvasLegend />
      <ThemeToggle />
    </div>
  );
}

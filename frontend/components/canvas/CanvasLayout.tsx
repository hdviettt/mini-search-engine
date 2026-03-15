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
import SearchOverlay from "./SearchOverlay";
import { initialNodes, initialEdges, phaseEdgeMap, phaseNodeMap } from "./nodeDefinitions";
import type { FlowPhase, PipelineNodeData, OutputNodeData, SystemNodeData } from "./types";
import type { ExplainResponse, Stats, PipelineTrace } from "@/lib/types";
import type { OverviewTrace } from "@/lib/api";

const nodeTypes: NodeTypes = {
  system: SystemNode,
  pipeline: PipelineNode,
  output: OutputNode,
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
        if (n.id === "crawler") {
          return { ...n, data: { ...n.data, stats: [{ label: "Pages", value: stats.pages_crawled.toLocaleString() }] } };
        }
        if (n.id === "indexer") {
          return { ...n, data: { ...n.data, stats: [
            { label: "Terms", value: stats.total_terms.toLocaleString() },
            { label: "Postings", value: stats.total_postings.toLocaleString() },
          ] } };
        }
        if (n.id === "chunker") {
          return { ...n, data: { ...n.data, stats: [{ label: "Chunks", value: stats.total_chunks.toLocaleString() }] } };
        }
        if (n.id === "embedder") {
          return { ...n, data: { ...n.data, stats: [{ label: "Embedded", value: stats.chunks_embedded.toLocaleString() }] } };
        }
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
        if (n.id === "bm25" && n.type === "pipeline") {
          return { ...n, data: { ...n.data, state: "completed", timeMs: t.bm25_scoring.time_ms,
            summary: `${t.bm25_scoring.total_matched} docs matched (k1=${t.bm25_scoring.params.k1})` } };
        }
        if (n.id === "pagerank" && n.type === "pipeline") {
          return { ...n, data: { ...n.data, state: "completed", timeMs: t.pagerank.time_ms,
            summary: `Top: ${t.pagerank.top_scores[0]?.title.replace(" - Wikipedia", "").slice(0, 25) || ""}` } };
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
        if (n.id === "retriever" && n.type === "pipeline" && overviewTrace?.retrieval) {
          return { ...n, data: { ...n.data, state: "completed", timeMs: overviewTrace.retrieval.time_ms,
            summary: `${overviewTrace.retrieval.chunks_retrieved} chunks retrieved` } };
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
      eds.map((e) => ({
        ...e,
        animated: activeEdges.includes(e.id),
        style: activeEdges.includes(e.id)
          ? { stroke: "#e88a1a", strokeWidth: 2 }
          : { stroke: "#222", strokeWidth: 1 },
      }))
    );

    // Glow active node
    const activeNode = phaseNodeMap[phase];
    if (activeNode) {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === activeNode && (n.type === "pipeline" || n.type === "output")) {
            return { ...n, data: { ...n.data, state: "active" } };
          }
          return n;
        })
      );
    }
  }, [phase, setEdges, setNodes]);

  // Reset pipeline nodes on new search
  useEffect(() => {
    if (phase === "idle") return;
    if (phase === "tokenizing") {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.type === "pipeline") return { ...n, data: { ...n.data, state: "idle", timeMs: null, summary: null } };
          if (n.type === "output") return { ...n, data: { ...n.data, state: "idle", content: null } };
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
    <div className="w-full h-full bg-[#0d0d0d]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="!bg-[#0d0d0d]"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={0.8} color="#1a1a1a" />
        <Controls className="!bg-[#111] !border-[#222] [&>button]:!bg-[#111] [&>button]:!border-[#222] [&>button]:!text-[#555] [&>button:hover]:!bg-[#1a1a1a]" />
        <MiniMap
          nodeColor="#222"
          maskColor="rgba(13, 13, 13, 0.85)"
          className="!bg-[#111] !border-[#222]"
        />
      </ReactFlow>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import SystemNode from "./nodes/SystemNode";
import PipelineNode from "./nodes/PipelineNode";
import OutputNode from "./nodes/OutputNode";
import StoreNode from "./nodes/StoreNode";
import LabelNode from "./nodes/LabelNode";
import AnimatedEdge from "./edges/AnimatedEdge";
import CanvasLegend from "./CanvasLegend";
import ThemeToggle from "./ThemeToggle";
import GuidedTour from "./GuidedTour";
import SearchOverlay from "./SearchOverlay";
import BottomPanel from "./BottomPanel";
import {
  initialNodes,
  initialEdges,
  phaseEdgeMap,
  phaseNodeMap,
  phaseStoreMap,
} from "./nodeDefinitions";
import type { FlowPhase } from "./types";
import type {
  ExplainResponse,
  Stats,
  CrawlProgressData,
  IndexProgressData,
  EmbedProgressData,
} from "@/lib/types";
import type { OverviewTrace, OverviewSource } from "@/lib/api";

const nodeTypes: NodeTypes = {
  system: SystemNode,
  pipeline: PipelineNode,
  output: OutputNode,
  store: StoreNode,
  label: LabelNode,
};

const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge,
};

interface CanvasLayoutProps {
  onSearch: (query: string) => void;
  query: string;
  phase: FlowPhase;
  stats: Stats | null;
  searchData: ExplainResponse | null;
  overviewText: string;
  overviewSources: OverviewSource[];
  overviewLoading: boolean;
  overviewStreaming: boolean;
  overviewTrace: OverviewTrace | null;
  crawlProgress: CrawlProgressData | null;
  indexProgress: IndexProgressData | null;
  embedProgress: EmbedProgressData | null;
  logEntries: string[];
  crawledPages: CrawlProgressData[];
  activeCrawlJobId: string | null;
  onCrawlStarted: (id: string) => void;
  buildComplete: boolean;
  buildError: string | null;
}

export default function CanvasLayout({
  onSearch,
  query,
  phase,
  stats,
  searchData,
  overviewText,
  overviewSources,
  overviewLoading,
  overviewStreaming,
  overviewTrace,
  crawlProgress,
  indexProgress,
  embedProgress,
  logEntries,
  crawledPages,
  activeCrawlJobId,
  onCrawlStarted,
  buildComplete,
  buildError,
}: CanvasLayoutProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [tourActive, setTourActive] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Auto-start tour for first-time visitors
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("tour-seen")) {
      const timer = setTimeout(() => setTourActive(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Deselect node on new search
  useEffect(() => {
    if (phase === "queryInput") {
      setSelectedNode(null);
    }
  }, [phase]);

  // Update system nodes with stats
  useEffect(() => {
    if (!stats) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === "crawler")
          return {
            ...n,
            data: {
              ...n.data,
              stats: [{ label: "Pages", value: stats.pages_crawled.toLocaleString() }],
            },
          };
        if (n.id === "indexer")
          return {
            ...n,
            data: {
              ...n.data,
              stats: [{ label: "Terms", value: stats.total_terms.toLocaleString() }],
            },
          };
        if (n.id === "chunker")
          return {
            ...n,
            data: {
              ...n.data,
              stats: [{ label: "Chunks", value: stats.total_chunks.toLocaleString() }],
            },
          };
        if (n.id === "embedder")
          return {
            ...n,
            data: {
              ...n.data,
              stats: [{ label: "Vectors", value: stats.chunks_embedded.toLocaleString() }],
            },
          };
        if (n.id === "pages_db")
          return {
            ...n,
            data: {
              ...n.data,
              stats: [{ label: "Rows", value: stats.pages_crawled.toLocaleString() }],
            },
          };
        if (n.id === "inverted_index")
          return {
            ...n,
            data: {
              ...n.data,
              stats: [
                { label: "Terms", value: stats.total_terms.toLocaleString() },
                { label: "Postings", value: stats.total_postings.toLocaleString() },
              ],
            },
          };
        if (n.id === "pr_scores")
          return {
            ...n,
            data: {
              ...n.data,
              stats: [{ label: "Pages", value: stats.pages_crawled.toLocaleString() }],
            },
          };
        if (n.id === "vector_store")
          return {
            ...n,
            data: {
              ...n.data,
              stats: [{ label: "Vectors", value: stats.chunks_embedded.toLocaleString() }],
            },
          };
        return n;
      }),
    );
  }, [stats, setNodes]);

  // Update system nodes during jobs
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === "crawler" && n.type === "system") {
          if (crawlProgress) {
            return {
              ...n,
              data: {
                ...n.data,
                status: "running",
                progress: {
                  done: crawlProgress.pages_crawled,
                  total: crawlProgress.max_pages,
                  label: crawlProgress.title || crawlProgress.current_url,
                },
              },
            };
          }
          return { ...n, data: { ...n.data, status: "ready", progress: null } };
        }
        if (n.id === "indexer" && n.type === "system") {
          if (indexProgress) {
            return {
              ...n,
              data: {
                ...n.data,
                status: "running",
                progress: {
                  done: indexProgress.pages_done,
                  total: indexProgress.pages_total,
                  label: `${indexProgress.unique_terms.toLocaleString()} terms`,
                },
              },
            };
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
            return {
              ...n,
              data: {
                ...n.data,
                status: "running",
                progress: {
                  done: embedProgress.chunks_done,
                  total: embedProgress.chunks_total,
                  label: embedProgress.current_chunk_preview?.slice(0, 40),
                },
              },
            };
          }
          return { ...n, data: { ...n.data, status: "ready", progress: null } };
        }
        return n;
      }),
    );
  }, [crawlProgress, indexProgress, embedProgress, setNodes]);

  // Update pipeline nodes with trace data
  useEffect(() => {
    if (!searchData?.pipeline) return;
    const t = searchData.pipeline;

    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === "query_input" && n.type === "pipeline") {
          return { ...n, data: { ...n.data, summary: `"${searchData.query}"` } };
        }
        if (n.id === "tokenize" && n.type === "pipeline") {
          return {
            ...n,
            data: {
              ...n.data,
              timeMs: t.tokenization.time_ms,
              summary: `[${t.tokenization.tokens.join(", ")}]`,
            },
          };
        }
        if (n.id === "index_lookup" && n.type === "pipeline") {
          return {
            ...n,
            data: {
              ...n.data,
              timeMs: t.index_lookup.time_ms,
              summary: `${Object.keys(t.index_lookup.terms_found).length} terms found`,
            },
          };
        }
        if (n.id === "bm25" && n.type === "pipeline") {
          return {
            ...n,
            data: {
              ...n.data,
              timeMs: t.bm25_scoring.time_ms,
              summary: `${t.bm25_scoring.total_matched} docs scored`,
            },
          };
        }
        if (n.id === "pr_lookup" && n.type === "pipeline") {
          return {
            ...n,
            data: {
              ...n.data,
              timeMs: t.pagerank.time_ms,
              summary: `Top: ${t.pagerank.top_scores[0]?.title.replace(" - Wikipedia", "").slice(0, 20) || ""}`,
            },
          };
        }
        if (n.id === "combine" && n.type === "pipeline") {
          return {
            ...n,
            data: {
              ...n.data,
              timeMs: t.combination.time_ms,
              summary: t.combination.formula,
            },
          };
        }
        if (n.id === "results" && n.type === "output") {
          return {
            ...n,
            data: {
              ...n.data,
              content: searchData.results.map((r) => ({
                title: r.title,
                score: r.final_score,
              })),
            },
          };
        }
        return n;
      }),
    );
  }, [searchData, setNodes]);

  // Update AI overview nodes with trace data
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === "fanout" && n.type === "pipeline" && overviewTrace?.fanout) {
          return {
            ...n,
            data: {
              ...n.data,
              timeMs: overviewTrace.fanout.time_ms,
              summary: `${overviewTrace.fanout.expanded.length} queries`,
            },
          };
        }
        if (n.id === "vector_search" && n.type === "pipeline" && overviewTrace?.retrieval) {
          return {
            ...n,
            data: {
              ...n.data,
              timeMs: overviewTrace.retrieval.time_ms,
              summary: `${overviewTrace.retrieval.chunks_retrieved} chunks`,
            },
          };
        }
        if (n.id === "llm" && n.type === "pipeline" && overviewTrace?.synthesis) {
          return {
            ...n,
            data: {
              ...n.data,
              timeMs: overviewTrace.synthesis.time_ms,
              summary: overviewTrace.synthesis.model,
            },
          };
        }
        if (n.id === "ai_overview" && n.type === "output") {
          if (overviewText) {
            return { ...n, data: { ...n.data, content: overviewText } };
          }
        }
        return n;
      }),
    );
  }, [overviewTrace, overviewText, setNodes]);

  // Ordered list of all phases
  const PHASE_ORDER = useMemo(
    () => [
      "queryInput",
      "tokenizing",
      "indexLookup",
      "bm25",
      "pagerank",
      "combining",
      "results",
      "aiFanout",
      "aiEmbedding",
      "aiRetrieval",
      "aiSynthesis",
      "aiComplete",
    ],
    [],
  );

  // Animate nodes and stores based on current phase
  useEffect(() => {
    const allActiveStores = new Set<string>();
    if (phase !== "idle") {
      const currentIdx = PHASE_ORDER.indexOf(phase);
      for (const s of phaseStoreMap[phase] || []) allActiveStores.add(s);
      for (let i = 0; i < currentIdx; i++) {
        for (const s of phaseStoreMap[PHASE_ORDER[i]] || []) allActiveStores.add(s);
      }
    }
    if (crawlProgress) allActiveStores.add("pages_db");
    if (indexProgress) {
      allActiveStores.add("inverted_index");
      if (indexProgress.phase === "pagerank") allActiveStores.add("pr_scores");
    }
    if (embedProgress) allActiveStores.add("vector_store");

    setNodes((nds) =>
      nds.map((n) => {
        if (n.type !== "store") return n;
        return { ...n, data: { ...n.data, active: allActiveStores.has(n.id) } };
      }),
    );

    if (phase === "idle") return;

    const currentIdx = PHASE_ORDER.indexOf(phase);
    const activeNode = phaseNodeMap[phase];

    const completedNodes = new Set<string>();
    for (let i = 0; i < currentIdx; i++) {
      const node = phaseNodeMap[PHASE_ORDER[i]];
      if (node) completedNodes.add(node);
    }

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
        return n;
      }),
    );
  }, [phase, crawlProgress, indexProgress, embedProgress, setNodes, PHASE_ORDER]);

  // Animate query edges based on current phase
  useEffect(() => {
    if (phase === "idle") {
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id.startsWith("q-")) return { ...e, data: { ...e.data, animated: false } };
          return e;
        }),
      );
      return;
    }

    const currentIdx = PHASE_ORDER.indexOf(phase);
    const activeEdges = new Set<string>();

    for (let i = 0; i <= currentIdx; i++) {
      for (const edgeId of phaseEdgeMap[PHASE_ORDER[i]] || []) {
        activeEdges.add(edgeId);
      }
    }

    setEdges((eds) =>
      eds.map((e) => {
        if (e.id.startsWith("q-")) {
          return { ...e, data: { ...e.data, animated: activeEdges.has(e.id) } };
        }
        return e;
      }),
    );
  }, [phase, setEdges, PHASE_ORDER]);

  // Animate build edges during live operations
  useEffect(() => {
    const activeBuildEdges = new Set<string>();
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
      activeBuildEdges.add("b-pages-chunker");
      activeBuildEdges.add("b-chunker-embedder");
      if (embedProgress.chunks_done > 0) activeBuildEdges.add("b-embedder-vectors");
    }

    setEdges((eds) =>
      eds.map((e) => {
        if (e.id.startsWith("b-")) {
          return { ...e, data: { ...e.data, animated: activeBuildEdges.has(e.id) } };
        }
        return e;
      }),
    );
  }, [crawlProgress, indexProgress, embedProgress, setEdges]);

  // Reset pipeline nodes + edges on new search
  useEffect(() => {
    if (phase === "idle") return;
    if (phase === "queryInput") {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.type === "pipeline")
            return { ...n, data: { ...n.data, state: "idle", timeMs: null, summary: null } };
          if (n.type === "output")
            return { ...n, data: { ...n.data, state: "idle", content: null } };
          if (n.type === "store") return { ...n, data: { ...n.data, active: false } };
          return n;
        }),
      );
      setEdges((eds) => eds.map((e) => ({ ...e, data: { ...e.data, animated: false } })));
    }
  }, [phase, setNodes, setEdges]);

  const handleTourComplete = useCallback(() => {
    setTourActive(false);
    localStorage.setItem("tour-seen", "true");
  }, []);

  const handleNodeClick = useCallback((_: unknown, node: { id: string }) => {
    setSelectedNode(node.id);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const statsForOverlay = stats
    ? {
        pages: stats.pages_crawled,
        terms: stats.total_terms,
        chunks: stats.total_chunks,
      }
    : null;

  return (
    <div className="flex flex-col w-full h-full bg-[var(--bg)]">
      {/* Canvas area */}
      <div className="flex-1 relative min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
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
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={0.8}
            color="var(--dot-color)"
          />
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

        {/* Floating search bar */}
        <SearchOverlay onSearch={onSearch} query={query} stats={statsForOverlay} />

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

      {/* Bottom panel */}
      <BottomPanel
        selectedNode={selectedNode}
        onNodeClose={() => setSelectedNode(null)}
        query={query}
        searchData={searchData}
        onSearch={onSearch}
        overviewText={overviewText}
        overviewSources={overviewSources}
        overviewLoading={overviewLoading}
        overviewStreaming={overviewStreaming}
        overviewTrace={overviewTrace}
        trace={searchData?.pipeline || null}
        crawlProgress={crawlProgress}
        indexProgress={indexProgress}
        embedProgress={embedProgress}
        logEntries={logEntries}
        crawledPages={crawledPages}
        activeCrawlJobId={activeCrawlJobId}
        onCrawlStarted={onCrawlStarted}
        buildComplete={buildComplete}
        buildError={buildError}
      />
    </div>
  );
}

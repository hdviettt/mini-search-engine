"use client";

import GroundedData from "@/components/playground/GroundedData";
import type { ActiveStep } from "@/components/playground/GroundedData";
import OperationsTab from "@/components/playground/OperationsTab";
import type { PipelineTrace } from "@/lib/types";
import type { OverviewTrace } from "@/lib/api";

// Map node IDs to ActiveStep for GroundedData
const nodeToStep: Record<string, ActiveStep> = {
  indexer: "index",
  inverted_index: "index",
  bm25: "bm25",
  pr_lookup: "pagerank",
  pr_scores: "pagerank",
  combine: "combine",
  fanout: "ai_fanout",
  vector_search: "ai_retrieval",
  vector_store: "ai_retrieval",
  llm: "ai_synthesis",
  ai_overview: "ai_synthesis",
  tokenize: "tokenize",
};

interface DetailPanelProps {
  nodeId: string | null;
  onClose: () => void;
  trace: PipelineTrace | null;
  overviewTrace: OverviewTrace | null;
  crawlProgress: unknown;
  indexProgress: unknown;
  embedProgress: unknown;
  logEntries: string[];
  activeCrawlJobId: string | null;
  onCrawlStarted: (id: string) => void;
}

export default function DetailPanel({
  nodeId, onClose, trace, overviewTrace,
  crawlProgress, indexProgress, embedProgress, logEntries, activeCrawlJobId, onCrawlStarted,
}: DetailPanelProps) {
  if (!nodeId) return null;

  const isOpsNode = ["crawler", "chunker", "embedder", "pages_db", "pr_compute"].includes(nodeId);
  const step = nodeToStep[nodeId] || null;

  return (
    <div className="fixed right-0 top-0 h-screen w-[400px] bg-[#0d0d0d] border-l border-[#222] z-50 flex flex-col animate-in slide-in-from-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#222]">
        <span className="text-sm font-medium text-[#ccc] capitalize">{nodeId.replace("_", " ")}</span>
        <button onClick={onClose} className="text-[#555] hover:text-[#e88a1a] cursor-pointer text-lg">&times;</button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isOpsNode ? (
          <OperationsTab
            crawlProgress={crawlProgress as never}
            indexProgress={indexProgress as never}
            embedProgress={embedProgress as never}
            logEntries={logEntries}
            activeCrawlJobId={activeCrawlJobId}
            onCrawlStarted={onCrawlStarted}
          />
        ) : step ? (
          <GroundedData activeStep={step} trace={trace} overviewTrace={overviewTrace} />
        ) : (
          <div className="p-4 text-xs text-gray-600 text-center">
            {nodeId === "results" ? "Click a result in the bottom dock to see its page journey." : "Search to see data for this node."}
          </div>
        )}
      </div>
    </div>
  );
}

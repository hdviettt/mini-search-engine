"use client";

import { useEffect, useState } from "react";
import GroundedData from "@/components/playground/GroundedData";
import type { ActiveStep } from "@/components/playground/GroundedData";
import OperationsTab from "@/components/playground/OperationsTab";
import type { PipelineTrace } from "@/lib/types";
import type { OverviewTrace } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const nodeToStep: Record<string, ActiveStep> = {
  indexer: "index",
  bm25: "bm25",
  pr_lookup: "pagerank",
  combine: "combine",
  fanout: "ai_fanout",
  vector_search: "ai_retrieval",
  llm: "ai_synthesis",
  ai_overview: "ai_synthesis",
  tokenize: "tokenize",
  query_input: "tokenize",
  embed_query: "ai_retrieval",
};

// Store nodes fetch data from explore API
const storeEndpoints: Record<string, string> = {
  pages_db: "/api/explore/pages?limit=8",
  inverted_index: "/api/explore/index?limit=15",
  pr_scores: "/api/explore/pagerank?limit=10",
  vector_store: "/api/explore/chunks?limit=6",
};

function StorePreview({ nodeId }: { nodeId: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const endpoint = storeEndpoints[nodeId];
    if (!endpoint) return;
    setLoading(true);
    fetch(`${API_BASE}${endpoint}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [nodeId]);

  if (loading) return <div className="p-3 text-[10px] text-[#555]">Loading...</div>;
  if (!data) return null;

  // Pages DB
  if (nodeId === "pages_db") {
    const pages = (data as { pages: { id: number; title: string; domain: string; text_length: number; outlinks: number; status_code: number }[] }).pages || [];
    return (
      <div className="p-3 space-y-1">
        {pages.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-[10px] py-1 border-b border-dashed border-[#1a1a1a]">
            <span className="text-[#444] w-5">#{p.id}</span>
            <span className={`w-1.5 h-1.5 ${p.status_code === 200 ? "bg-green-600" : "bg-red-600"}`} />
            <span className="text-[#888] truncate flex-1">{(p.title || "").replace(" - Wikipedia", "").slice(0, 35)}</span>
            <span className="text-[#444]">{(p.text_length / 1000).toFixed(0)}K</span>
          </div>
        ))}
      </div>
    );
  }

  // Inverted Index
  if (nodeId === "inverted_index") {
    const terms = (data as { terms: { term: string; doc_freq: number; total_freq: number }[] }).terms || [];
    const maxDf = terms[0]?.doc_freq || 1;
    return (
      <div className="p-3 space-y-0.5">
        {terms.map((t) => (
          <div key={t.term} className="flex items-center gap-2 text-[10px] py-0.5">
            <span className="font-mono text-[#e88a1a] w-20 truncate">{t.term}</span>
            <div className="flex-1 h-1 bg-[#1a1a1a]">
              <div className="h-full bg-[#e88a1a]/30" style={{ width: `${(t.doc_freq / maxDf) * 100}%` }} />
            </div>
            <span className="text-[#555] w-8 text-right">{t.doc_freq}</span>
          </div>
        ))}
      </div>
    );
  }

  // PageRank Scores
  if (nodeId === "pr_scores") {
    const pages = (data as { pages: { title: string; score: number; inlinks: number }[] }).pages || [];
    const maxScore = pages[0]?.score || 1;
    return (
      <div className="p-3 space-y-1">
        {pages.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px] py-0.5">
            <span className="text-[#444] w-4">#{i + 1}</span>
            <span className="text-[#888] truncate flex-1">{(p.title || "").replace(" - Wikipedia", "").slice(0, 25)}</span>
            <div className="w-12 h-1 bg-[#1a1a1a]">
              <div className="h-full bg-[#e88a1a]/40" style={{ width: `${(p.score / maxScore) * 100}%` }} />
            </div>
            <span className="text-[#555] w-5 text-right">{p.inlinks}</span>
          </div>
        ))}
      </div>
    );
  }

  // Vector Store (chunks)
  if (nodeId === "vector_store") {
    const chunks = (data as { chunks: { id: number; page_id: number; chunk_idx: number; content: string; has_embedding: boolean; title: string }[] }).chunks || [];
    return (
      <div className="p-3 space-y-1.5">
        {chunks.map((c) => (
          <div key={c.id} className="p-2 border border-dashed border-[#1a1a1a] text-[10px]">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[#444]">p{c.page_id}:c{c.chunk_idx}</span>
              <span className={`w-1.5 h-1.5 ${c.has_embedding ? "bg-[#e88a1a]" : "bg-[#333]"}`} />
              <span className="text-[#666] truncate">{(c.title || "").replace(" - Wikipedia", "").slice(0, 20)}</span>
            </div>
            <div className="text-[9px] text-[#555] line-clamp-2">{c.content}</div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

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

  const isOpsNode = ["crawler", "chunker", "embedder", "pr_compute"].includes(nodeId);
  const isStoreNode = !!storeEndpoints[nodeId];
  const step = nodeToStep[nodeId] || null;

  const nodeLabel = nodeId.replace(/_/g, " ");

  return (
    <div className="border-t border-[#222] bg-[#0d0d0d]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a1a1a]">
        <span className="text-[11px] font-medium text-[#888] uppercase tracking-wider">{nodeLabel}</span>
        <button onClick={onClose} className="text-[#555] hover:text-[#e88a1a] cursor-pointer text-sm">&times;</button>
      </div>

      {/* Content */}
      <div className="max-h-[250px] overflow-y-auto">
        {isStoreNode ? (
          <StorePreview nodeId={nodeId} />
        ) : isOpsNode ? (
          <OperationsTab
            crawlProgress={crawlProgress as never}
            indexProgress={indexProgress as never}
            embedProgress={embedProgress as never}
            logEntries={logEntries}
            activeCrawlJobId={activeCrawlJobId}
            onCrawlStarted={onCrawlStarted}
          />
        ) : step && (trace || overviewTrace) ? (
          <GroundedData activeStep={step} trace={trace} overviewTrace={overviewTrace} />
        ) : (
          <div className="p-4 text-[10px] text-[#444] text-center">
            Search to see data for this step.
          </div>
        )}
      </div>
    </div>
  );
}

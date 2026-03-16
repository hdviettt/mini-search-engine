"use client";

import { useEffect, useState } from "react";
import GroundedData from "@/components/playground/GroundedData";
import type { ActiveStep } from "@/components/playground/GroundedData";
import OperationsTab from "@/components/playground/OperationsTab";
import PageRankTuning from "./PageRankTuning";
import CrawlSchedulePanel from "./CrawlSchedulePanel";
import { useResizable } from "@/hooks/useResizable";
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
  chunker_preview: "/api/explore/chunks?limit=5",
  embedder_preview: "/api/explore/chunks?limit=5",
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

  if (loading) return <div className="p-3 text-[10px] text-[var(--text-dim)]">Loading...</div>;
  if (!data) return null;

  // Pages DB
  if (nodeId === "pages_db") {
    const pages = (data as { pages: { id: number; title: string; domain: string; text_length: number; outlinks: number; status_code: number }[] }).pages || [];
    return (
      <div className="p-3 space-y-1">
        {pages.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-[10px] py-1 border-b border-dashed border-[var(--border)]">
            <span className="text-[var(--text-dim)] w-5">#{p.id}</span>
            <span className={`w-1.5 h-1.5 ${p.status_code === 200 ? "bg-green-600" : "bg-red-600"}`} />
            <span className="text-[var(--text-muted)] truncate flex-1">{(p.title || "").replace(" - Wikipedia", "").slice(0, 35)}</span>
            <span className="text-[var(--text-dim)]">{(p.text_length / 1000).toFixed(0)}K</span>
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
            <span className="font-mono text-[var(--accent)] w-20 truncate">{t.term}</span>
            <div className="flex-1 h-1 bg-[var(--score-bar-bg)]">
              <div className="h-full bg-[var(--accent)]/30" style={{ width: `${(t.doc_freq / maxDf) * 100}%` }} />
            </div>
            <span className="text-[var(--text-dim)] w-8 text-right">{t.doc_freq}</span>
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
            <span className="text-[var(--text-dim)] w-4">#{i + 1}</span>
            <span className="text-[var(--text-muted)] truncate flex-1">{(p.title || "").replace(" - Wikipedia", "").slice(0, 25)}</span>
            <div className="w-12 h-1 bg-[var(--score-bar-bg)]">
              <div className="h-full bg-[var(--accent)]/40" style={{ width: `${(p.score / maxScore) * 100}%` }} />
            </div>
            <span className="text-[var(--text-dim)] w-5 text-right">{p.inlinks}</span>
          </div>
        ))}
      </div>
    );
  }

  // Vector Store / Chunker / Embedder — all use chunks endpoint but show differently
  if (nodeId === "vector_store" || nodeId === "chunker_preview" || nodeId === "embedder_preview") {
    const chunks = (data as { chunks: { id: number; page_id: number; chunk_idx: number; content: string; has_embedding: boolean; title: string }[] }).chunks || [];

    if (nodeId === "chunker_preview") {
      // Chunker: focus on how pages are split into chunks
      return (
        <div className="p-3">
          <div className="text-[10px] text-[var(--text-muted)] mb-2">Pages are split at paragraph/sentence boundaries into ~300-token chunks:</div>
          <div className="space-y-1.5">
            {chunks.map((c) => (
              <div key={c.id} className="p-2 bg-[var(--bg-card)] border border-[var(--border)] text-[10px]">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[var(--accent)]">chunk {c.chunk_idx}</span>
                  <span className="text-[var(--border-hover)]">|</span>
                  <span className="text-[var(--text-dim)] truncate">{(c.title || "").replace(" - Wikipedia", "")}</span>
                </div>
                <div className="text-[9px] text-[var(--text-muted)] leading-relaxed">{c.content}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (nodeId === "embedder_preview") {
      // Embedder: focus on embedding status
      const embedded = chunks.filter((c) => c.has_embedding).length;
      return (
        <div className="p-3">
          <div className="text-[10px] text-[var(--text-muted)] mb-2">Each chunk is converted to a 768-dim vector for similarity search:</div>
          <div className="flex items-center gap-2 text-[10px] mb-2 p-2 border border-dashed border-[var(--border)]">
            <span className="text-[var(--accent)] font-mono">{embedded}/{chunks.length}</span>
            <span className="text-[var(--text-dim)]">chunks in sample have embeddings</span>
          </div>
          <div className="space-y-1">
            {chunks.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-[10px] py-1 border-b border-dashed border-[var(--border)]">
                <span className={`w-2 h-2 ${c.has_embedding ? "bg-[var(--accent)]" : "bg-[var(--border-hover)]"}`} />
                <span className="text-[var(--text-dim)]">p{c.page_id}:c{c.chunk_idx}</span>
                <span className="text-[var(--text-dim)] truncate flex-1">{c.content.slice(0, 50)}...</span>
                <span className="text-[9px] text-[var(--border-hover)]">{c.has_embedding ? "768-dim" : "pending"}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Default vector store view
    return (
      <div className="p-3 space-y-1.5">
        {chunks.map((c) => (
          <div key={c.id} className="p-2 border border-dashed border-[var(--border)] text-[10px]">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[var(--text-dim)]">p{c.page_id}:c{c.chunk_idx}</span>
              <span className={`w-1.5 h-1.5 ${c.has_embedding ? "bg-[var(--accent)]" : "bg-[var(--border-hover)]"}`} />
              <span className="text-[var(--text-muted)] truncate">{(c.title || "").replace(" - Wikipedia", "").slice(0, 20)}</span>
            </div>
            <div className="text-[9px] text-[var(--text-dim)] line-clamp-2">{c.content}</div>
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
  const { width, onMouseDown } = useResizable({ initial: 340, min: 260, max: 600, direction: "right" });

  if (!nodeId) return null;

  // Build nodes map to their related store for preview
  const buildToStore: Record<string, string> = {
    indexer: "inverted_index",
    pr_compute: "pr_scores",
    chunker: "chunker_preview",
    embedder: "embedder_preview",
  };

  const isOpsNode = nodeId === "crawler";
  const isPRNode = nodeId === "pr_compute";
  const storeId = buildToStore[nodeId] || null;
  const isStoreNode = !!storeEndpoints[nodeId];
  const step = nodeToStep[nodeId] || null;

  const nodeLabel = nodeId.replace(/_/g, " ");

  return (
    <div className="absolute top-0 left-0 bottom-0 z-20 bg-[var(--bg)] border-r border-[var(--border)] animate-slide-left flex" style={{ width }}>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] shrink-0">
          <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">{nodeLabel}</span>
          <button onClick={onClose} className="text-[var(--text-dim)] hover:text-[var(--accent)] cursor-pointer text-sm">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1">
        {isStoreNode ? (
          <StorePreview nodeId={nodeId} />
        ) : isPRNode ? (
          <>
            <StorePreview nodeId="pr_scores" />
            <PageRankTuning />
          </>
        ) : storeId ? (
          <StorePreview nodeId={storeId} />
        ) : isOpsNode ? (
          <>
            <OperationsTab
              crawlProgress={crawlProgress as never}
              indexProgress={indexProgress as never}
              embedProgress={embedProgress as never}
              logEntries={logEntries}
              activeCrawlJobId={activeCrawlJobId}
              onCrawlStarted={onCrawlStarted}
            />
            <CrawlSchedulePanel />
          </>
        ) : step && (trace || overviewTrace) ? (
          <GroundedData activeStep={step} trace={trace} overviewTrace={overviewTrace} />
        ) : (
          <div className="p-4 text-[10px] text-[var(--text-dim)] text-center">
            Search to see data for this step.
          </div>
        )}
        </div>
      </div>
      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        className="w-1 h-full cursor-col-resize hover:bg-[var(--accent)]/30 active:bg-[var(--accent)]/50 transition-colors shrink-0"
      />
    </div>
  );
}

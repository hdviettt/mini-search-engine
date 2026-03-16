"use client";

import { useEffect, useState } from "react";
import GroundedData from "@/components/playground/GroundedData";
import type { ActiveStep } from "@/components/playground/GroundedData";
import OperationsTab from "@/components/playground/OperationsTab";
import PageRankTuning from "./PageRankTuning";
import CrawlSchedulePanel from "./CrawlSchedulePanel";
import { useResizable } from "@/hooks/useResizable";
import type { PipelineTrace, ExplainResponse, CrawlProgressData } from "@/lib/types";
import type { OverviewTrace } from "@/lib/api";
import { rebuildIndex, rebuildEmbeddings } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const nodeToStep: Record<string, ActiveStep> = {
  query_input: "query_input",
  tokenize: "tokenize",
  indexer: "index",
  bm25: "bm25",
  pr_lookup: "pagerank",
  combine: "combine",
  fanout: "ai_fanout",
  embed_query: "embed_query",
  vector_search: "ai_retrieval",
  llm: "llm",
  ai_overview: "ai_synthesis",
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

// Educational intros for store nodes
const storeIntros: Record<string, string> = {
  pages_db: "Raw HTML pages stored after crawling. Each page is parsed for title, text, and outgoing links.",
  inverted_index: "Maps each unique term to the list of documents containing it. This is what makes keyword search fast — O(1) lookup per term.",
  pr_scores: "Authority scores computed from the link graph. Pages that are linked to by many other pages score higher.",
  vector_store: "Chunks of text with their 512-dimensional embedding vectors, enabling semantic similarity search.",
  chunker_preview: "Pages are split at sentence boundaries into ~300-token chunks. Smaller chunks give the embedding model focused context.",
  embedder_preview: "Each chunk is converted into a 512-dim dense vector using a sentence-transformer model. Similar meanings map to nearby vectors.",
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
    const total = (data as { total?: number }).total || pages.length;
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-3 text-[9px] text-[var(--text-dim)] pb-1.5 border-b border-dashed border-[var(--border)]">
          <span>{total.toLocaleString()} pages total</span>
        </div>
        <div className="space-y-1.5">
          {pages.map((p) => (
            <div key={p.id} className="border border-[var(--border)] p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 ${p.status_code === 200 ? "bg-emerald-500" : "bg-red-500"}`} title={`HTTP ${p.status_code}`} />
                <span className="text-[10px] text-[var(--text-muted)] truncate flex-1">{(p.title || "Untitled").replace(" - Wikipedia", "")}</span>
                <span className="text-[9px] text-[var(--text-dim)] font-mono">#{p.id}</span>
              </div>
              <div className="flex items-center gap-3 text-[9px] pl-4">
                <span className="text-[var(--text-dim)]">
                  <span className="text-[var(--text-muted)] font-mono">{(p.text_length / 1000).toFixed(0)}K</span> chars
                </span>
                <span className="text-[var(--text-dim)]">
                  <span className="text-[var(--text-muted)] font-mono">{p.outlinks}</span> outlinks
                </span>
                <span className="text-[var(--text-dim)] truncate">{p.domain}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Inverted Index
  if (nodeId === "inverted_index") {
    const terms = (data as { terms: { term: string; doc_freq: number; total_freq: number; sample_docs?: { id: number; title: string; freq: number }[] }[] }).terms || [];
    const totalDocs = (data as { total_docs?: number }).total_docs || 0;
    return (
      <div className="p-3 space-y-2.5">
        {totalDocs > 0 && (
          <div className="text-[9px] text-[var(--text-dim)] pb-1 border-b border-dashed border-[var(--border)]">
            Corpus: {totalDocs.toLocaleString()} documents indexed
          </div>
        )}
        {terms.map((t) => (
          <div key={t.term} className="border border-[var(--border)] p-2">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-[var(--accent)] text-[11px] font-medium">&quot;{t.term}&quot;</span>
              <span className="text-[9px] text-[var(--text-dim)] ml-auto">
                in <span className="text-[var(--text-muted)] font-mono">{t.doc_freq}</span> docs
                {totalDocs > 0 && <span className="text-[var(--text-dim)]"> ({((t.doc_freq / totalDocs) * 100).toFixed(1)}%)</span>}
              </span>
            </div>
            {t.sample_docs && t.sample_docs.length > 0 && (
              <div className="space-y-0.5 pl-2 border-l-2 border-[var(--accent)]/20">
                {t.sample_docs.map((d) => (
                  <div key={d.id} className="flex items-center gap-1.5 text-[9px]">
                    <span className="text-[var(--text-dim)] font-mono w-7">d{d.id}</span>
                    <span className="text-[var(--text-muted)] truncate flex-1">{d.title.replace(" - Wikipedia", "")}</span>
                    <span className="text-[var(--text-dim)] font-mono">&times;{d.freq}</span>
                  </div>
                ))}
                {t.doc_freq > 4 && (
                  <div className="text-[8px] text-[var(--text-dim)]">...and {t.doc_freq - 4} more docs</div>
                )}
              </div>
            )}
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
      <div className="p-3 space-y-2">
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 text-[9px] text-[var(--text-dim)] pb-1 border-b border-dashed border-[var(--border)]">
          <span></span>
          <span>Page</span>
          <span className="text-right">Score</span>
          <span className="text-right">Inlinks</span>
        </div>
        <div className="space-y-1.5">
          {pages.map((p, i) => (
            <div key={i} className="border border-[var(--border)] p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[var(--accent)] font-mono text-[10px] w-4">#{i + 1}</span>
                <span className="text-[10px] text-[var(--text-muted)] truncate flex-1">{(p.title || "").replace(" - Wikipedia", "")}</span>
              </div>
              <div className="flex items-center gap-2 pl-6">
                <div className="flex-1 h-1.5 bg-[var(--score-bar-bg)]">
                  <div className="h-full bg-[var(--accent)]/40" style={{ width: `${(p.score / maxScore) * 100}%` }} />
                </div>
                <span className="text-[9px] text-[var(--accent)] font-mono w-16 text-right">{(p.score ?? 0).toFixed(6)}</span>
              </div>
              <div className="flex items-center gap-1 pl-6 mt-0.5 text-[9px] text-[var(--text-dim)]">
                <span className="text-[var(--text-muted)] font-mono">{p.inlinks}</span>
                <span>pages link here</span>
                <span className="text-[var(--text-dim)]">&rarr;</span>
                <span>votes for authority</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Vector Store / Chunker / Embedder — all use chunks endpoint but show differently
  if (nodeId === "vector_store" || nodeId === "chunker_preview" || nodeId === "embedder_preview") {
    const chunks = (data as { chunks: { id: number; page_id: number; chunk_idx: number; content: string; has_embedding: boolean; title: string }[] }).chunks || [];

    if (nodeId === "chunker_preview") {
      // Group chunks by page to show the splitting
      const byPage: Record<number, typeof chunks> = {};
      for (const c of chunks) {
        (byPage[c.page_id] ||= []).push(c);
      }
      return (
        <div className="p-3 space-y-3">
          {Object.entries(byPage).map(([pageId, pageChunks]) => (
            <div key={pageId} className="border border-[var(--border)] p-2">
              <div className="flex items-center gap-2 text-[10px] mb-2 pb-1 border-b border-dashed border-[var(--border)]">
                <span className="text-[var(--text-dim)] font-mono">page {pageId}</span>
                <span className="text-[var(--text-muted)] truncate flex-1">{(pageChunks[0]?.title || "").replace(" - Wikipedia", "")}</span>
                <span className="text-[9px] text-[var(--text-dim)]">&rarr; {pageChunks.length} chunks</span>
              </div>
              <div className="space-y-1">
                {pageChunks.map((c) => (
                  <div key={c.id} className="pl-2 border-l-2 border-[var(--accent)]/20">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[9px] text-[var(--accent)] font-mono">chunk {c.chunk_idx}</span>
                      <span className="text-[8px] text-[var(--text-dim)]">{c.content.split(/\s+/).length} words</span>
                    </div>
                    <div className="text-[9px] text-[var(--text-muted)] leading-relaxed line-clamp-3">{c.content}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (nodeId === "embedder_preview") {
      const embedded = chunks.filter((c) => c.has_embedding).length;
      return (
        <div className="p-3 space-y-2">
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div className="p-1.5 border border-[var(--border)] text-center">
              <div className="text-[var(--accent)] font-mono text-[12px]">{embedded}</div>
              <div className="text-[8px] text-[var(--text-dim)]">embedded</div>
            </div>
            <div className="p-1.5 border border-[var(--border)] text-center">
              <div className="text-[var(--text-muted)] font-mono text-[12px]">{chunks.length - embedded}</div>
              <div className="text-[8px] text-[var(--text-dim)]">pending</div>
            </div>
          </div>
          <div className="space-y-1.5">
            {chunks.map((c) => (
              <div key={c.id} className="border border-[var(--border)] p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 ${c.has_embedding ? "bg-[var(--accent)]" : "bg-[var(--border-hover)]"}`} />
                  <span className="text-[9px] text-[var(--text-dim)] font-mono">page {c.page_id} &rarr; chunk {c.chunk_idx}</span>
                  <span className="text-[8px] text-[var(--text-dim)] ml-auto">{c.has_embedding ? "512-dim vector" : "not yet embedded"}</span>
                </div>
                <div className="text-[9px] text-[var(--text-muted)] leading-relaxed line-clamp-2 pl-4">{c.content}</div>
                {c.has_embedding && (
                  <div className="pl-4 mt-1 text-[8px] text-[var(--text-dim)] font-mono">
                    text &rarr; [0.023, -0.148, 0.067, ... ] &times; 512 dims
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Default vector store view
    const embeddedCount = chunks.filter((c) => c.has_embedding).length;
    return (
      <div className="p-3 space-y-2">
        <div className="text-[9px] text-[var(--text-dim)] pb-1 border-b border-dashed border-[var(--border)]">
          {embeddedCount}/{chunks.length} chunks in sample have vectors
        </div>
        <div className="space-y-1.5">
          {chunks.map((c) => (
            <div key={c.id} className="border border-[var(--border)] p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 ${c.has_embedding ? "bg-[var(--accent)]" : "bg-[var(--border-hover)]"}`} />
                <span className="text-[10px] text-[var(--text-muted)] truncate flex-1">{(c.title || "").replace(" - Wikipedia", "")}</span>
                <span className="text-[9px] text-[var(--text-dim)] font-mono">p{c.page_id}:c{c.chunk_idx}</span>
              </div>
              <div className="text-[9px] text-[var(--text-dim)] leading-relaxed line-clamp-2 pl-4 mb-1">{c.content}</div>
              <div className="pl-4 text-[8px] text-[var(--text-dim)]">
                {c.has_embedding
                  ? <span className="font-mono">text &rarr; float[512] &rarr; stored for cosine similarity search</span>
                  : <span>awaiting embedding</span>
                }
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function StoreIntro({ nodeId }: { nodeId: string }) {
  const intro = storeIntros[nodeId];
  if (!intro) return null;
  return (
    <div className="px-3 pt-3 pb-0">
      <div className="text-[10px] text-[var(--text-dim)] leading-relaxed">{intro}</div>
    </div>
  );
}

function RebuildButton({ label, activeLabel, onRebuild }: { label: string; activeLabel: string; onRebuild: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleClick = async () => {
    setBusy(true);
    setResult(null);
    try {
      await onRebuild();
      setResult("Started successfully");
    } catch {
      setResult("Failed to start");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-3 pb-2">
      <button
        onClick={handleClick}
        disabled={busy}
        className="w-full py-1.5 text-[10px] font-mono border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent-muted)] disabled:opacity-50 cursor-pointer transition-colors"
      >
        {busy ? activeLabel : label}
      </button>
      {result && <div className="text-[9px] text-[var(--text-muted)] text-center mt-1">{result}</div>}
    </div>
  );
}

function ResultsView({ searchData }: { searchData: ExplainResponse | null }) {
  if (!searchData) {
    return (
      <div className="p-3">
        <div className="text-[10px] text-[var(--accent)] font-medium mb-1">Ranked Results</div>
        <div className="text-[10px] text-[var(--text-dim)] leading-relaxed mb-2">
          The final output after combining BM25 relevance with PageRank authority. Each result carries a composite score.
        </div>
        <div className="text-[10px] text-[var(--text-dim)] text-center py-2">Search to see results.</div>
      </div>
    );
  }

  const maxFinal = searchData.results[0]?.final_score || 1;
  const alpha = searchData.params_used.rank_alpha;

  return (
    <div className="p-3 space-y-2">
      <div className="text-[10px] text-[var(--accent)] font-medium">Ranked Results</div>
      <div className="text-[10px] text-[var(--text-dim)] leading-relaxed">
        Final ranking: {Math.round(alpha * 100)}% BM25 relevance + {Math.round((1 - alpha) * 100)}% PageRank authority.
      </div>
      <div className="text-[9px] text-[var(--text-dim)] pb-1 border-b border-dashed border-[var(--border)]">
        {searchData.total_results} results in {(searchData.time_ms ?? 0).toFixed(0)}ms for &ldquo;{searchData.query}&rdquo;
      </div>
      <div className="space-y-1.5">
        {searchData.results.slice(0, 8).map((r, i) => (
          <div key={i} className="border border-[var(--border)] p-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[var(--accent)] font-mono text-[10px] w-4">#{i + 1}</span>
              <span className="text-[10px] text-[var(--text-muted)] truncate flex-1">{r.title.replace(" - Wikipedia", "")}</span>
            </div>
            <div className="text-[9px] text-[var(--text-dim)] line-clamp-1 pl-6 mb-1.5">{r.snippet}</div>
            <div className="pl-6 space-y-0.5">
              <div className="flex items-center gap-2 text-[9px]">
                <span className="text-[var(--text-dim)] w-10">BM25</span>
                <div className="flex-1 h-1 bg-[var(--score-bar-bg)]">
                  <div className="h-full bg-[var(--accent)]/40" style={{ width: `${(r.bm25_score / (searchData.results[0]?.bm25_score || 1)) * 100}%` }} />
                </div>
                <span className="text-[var(--accent)] font-mono w-10 text-right">{(r.bm25_score ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2 text-[9px]">
                <span className="text-[var(--text-dim)] w-10">PR</span>
                <div className="flex-1 h-1 bg-[var(--score-bar-bg)]">
                  <div className="h-full bg-indigo-500/40" style={{ width: `${((r.pagerank_score ?? 0) / (searchData.results[0]?.pagerank_score || 0.001)) * 100}%` }} />
                </div>
                <span className="text-[var(--text-muted)] font-mono w-10 text-right">{(r.pagerank_score ?? 0).toFixed(4)}</span>
              </div>
              <div className="flex items-center gap-2 text-[9px] pt-0.5 border-t border-dashed border-[var(--border)]">
                <span className="text-[var(--text-dim)] w-10">Final</span>
                <div className="flex-1 h-1.5 bg-[var(--score-bar-bg)]">
                  <div className="h-full bg-[var(--accent)]/60" style={{ width: `${((r.final_score ?? 0) / maxFinal) * 100}%` }} />
                </div>
                <span className="text-[var(--accent)] font-mono font-medium w-10 text-right">{(r.final_score ?? 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AIOverviewView({ overviewText, overviewTrace }: { overviewText: string; overviewTrace: OverviewTrace | null }) {
  return (
    <div className="p-3 space-y-2">
      <div className="text-[10px] text-[var(--accent)] font-medium">AI Overview</div>
      <div className="text-[10px] text-[var(--text-dim)] leading-relaxed">
        AI-generated answer synthesized from retrieved chunks, with source citations.
      </div>
      {overviewText ? (
        <>
          <div className="p-2.5 bg-[var(--bg-card)] border border-[var(--border)] text-[10px] text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
            {overviewText}
          </div>
          {overviewTrace && (
            <div className="border border-[var(--border)] p-2 space-y-1.5">
              <div className="text-[9px] text-[var(--text-dim)] uppercase tracking-wider">Pipeline Trace</div>
              {overviewTrace.fanout && (
                <div className="flex items-center gap-2 text-[9px]">
                  <span className="text-[var(--text-dim)] w-16">Fan-out</span>
                  <span className="text-[var(--text-muted)]">{overviewTrace.fanout.expanded.length} queries</span>
                  <span className="text-[var(--text-dim)] font-mono ml-auto">{overviewTrace.fanout.time_ms?.toFixed(0)}ms</span>
                </div>
              )}
              {overviewTrace.retrieval && (
                <div className="flex items-center gap-2 text-[9px]">
                  <span className="text-[var(--text-dim)] w-16">Retrieval</span>
                  <span className="text-[var(--text-muted)]">{overviewTrace.retrieval.chunks_retrieved} chunks</span>
                  <span className="text-[var(--text-dim)] font-mono ml-auto">{overviewTrace.retrieval.time_ms?.toFixed(0)}ms</span>
                </div>
              )}
              {overviewTrace.synthesis && (
                <div className="flex items-center gap-2 text-[9px]">
                  <span className="text-[var(--text-dim)] w-16">Synthesis</span>
                  <span className="text-[var(--accent)] font-mono">{overviewTrace.synthesis.model}</span>
                  <span className="text-[var(--text-dim)] font-mono ml-auto">{overviewTrace.synthesis.time_ms?.toFixed(0)}ms</span>
                </div>
              )}
              {overviewTrace.total_ms && (
                <div className="flex items-center gap-2 text-[9px] pt-1 border-t border-dashed border-[var(--border)]">
                  <span className="text-[var(--text-dim)] w-16">Total</span>
                  <span className="text-[var(--accent)] font-mono ml-auto">{overviewTrace.total_ms?.toFixed(0)}ms</span>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-[10px] text-[var(--text-dim)] text-center py-2">Search to see AI overview.</div>
      )}
    </div>
  );
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
  crawledPages: CrawlProgressData[];
  activeCrawlJobId: string | null;
  onCrawlStarted: (id: string) => void;
  searchData: ExplainResponse | null;
  overviewText: string;
}

export default function DetailPanel({
  nodeId, onClose, trace, overviewTrace,
  crawlProgress, indexProgress, embedProgress, logEntries, crawledPages, activeCrawlJobId, onCrawlStarted,
  searchData, overviewText,
}: DetailPanelProps) {
  const { width, onMouseDown } = useResizable({ initial: 340, min: 260, max: 600, direction: "right" });

  if (!nodeId) return null;

  // Build nodes map to their related store for preview
  const buildToStore: Record<string, string> = {
    indexer: "inverted_index",
    chunker: "chunker_preview",
    embedder: "embedder_preview",
  };

  const isOpsNode = nodeId === "crawler";
  const isPRNode = nodeId === "pr_compute";
  const isResultsNode = nodeId === "results";
  const isAIOverviewNode = nodeId === "ai_overview";
  const storeId = buildToStore[nodeId] || null;
  const isStoreNode = !!storeEndpoints[nodeId];
  const step = nodeToStep[nodeId] || null;

  const nodeLabel = nodeId.replace(/_/g, " ");

  // Educational intros for build-zone nodes
  const buildIntros: Record<string, string> = {
    crawler: "Breadth-first crawler that starts from seed URLs and follows outgoing links up to a configured depth and page limit.",
    indexer: "Reads crawled pages and builds an inverted index: a mapping from every unique term to the documents that contain it. This is what makes keyword search instantaneous.",
    pr_compute: "PageRank iteratively distributes authority through the link graph. Pages linked by many high-authority pages score highest.",
    chunker: "Splits full-page text into ~300-token chunks at sentence boundaries. Smaller chunks give the embedding model more focused context for similarity search.",
    embedder: "Converts each text chunk into a 512-dimensional dense vector using a sentence-transformer model. Similar meanings map to nearby points in vector space.",
  };

  const renderContent = () => {
    // Results output node
    if (isResultsNode) {
      return <ResultsView searchData={searchData} />;
    }

    // AI Overview output node
    if (isAIOverviewNode) {
      return <AIOverviewView overviewText={overviewText} overviewTrace={overviewTrace} />;
    }

    // Store nodes — show intro + data preview
    if (isStoreNode) {
      return (
        <>
          <StoreIntro nodeId={nodeId} />
          <StorePreview nodeId={nodeId} />
        </>
      );
    }

    // PageRank compute — intro + scores + tuning
    if (isPRNode) {
      return (
        <>
          <div className="px-3 pt-3 pb-0">
            <div className="text-[10px] text-[var(--text-dim)] leading-relaxed">{buildIntros.pr_compute}</div>
            <div className="text-[9px] text-[var(--text-dim)] mt-1 p-1 border-l-2 border-[var(--accent)]/30 font-mono">
              Damping factor (d): probability a random surfer follows a link vs. jumping to a random page.
            </div>
          </div>
          <StoreIntro nodeId="pr_scores" />
          <StorePreview nodeId="pr_scores" />
          <PageRankTuning />
        </>
      );
    }

    // Indexer — intro + inverted_index preview + rebuild button
    if (nodeId === "indexer") {
      return (
        <>
          <div className="px-3 pt-3 pb-0">
            <div className="text-[10px] text-[var(--text-dim)] leading-relaxed">{buildIntros.indexer}</div>
          </div>
          <StoreIntro nodeId="inverted_index" />
          <StorePreview nodeId="inverted_index" />
          <RebuildButton label="Rebuild Index" activeLabel="Building..." onRebuild={async () => { await rebuildIndex(); }} />
        </>
      );
    }

    // Chunker — intro + chunk preview
    if (storeId === "chunker_preview") {
      return (
        <>
          <div className="px-3 pt-3 pb-0">
            <div className="text-[10px] text-[var(--text-dim)] leading-relaxed">{buildIntros.chunker}</div>
            <div className="text-[9px] text-[var(--text-dim)] mt-1 p-1 border-l-2 border-[var(--accent)]/30">
              ~300 tokens keeps each chunk within the embedding model&apos;s sweet spot for semantic accuracy.
            </div>
          </div>
          <StorePreview nodeId={storeId} />
        </>
      );
    }

    // Embedder — intro + embed preview + rebuild button
    if (storeId === "embedder_preview") {
      return (
        <>
          <div className="px-3 pt-3 pb-0">
            <div className="text-[10px] text-[var(--text-dim)] leading-relaxed">{buildIntros.embedder}</div>
            <div className="p-1.5 mt-1 border border-dashed border-[var(--border)] text-[9px] text-[var(--text-dim)]">
              <div>Model: <span className="text-[var(--accent)] font-mono">voyage-3-lite</span></div>
              <div>Dims: <span className="text-[var(--accent)] font-mono">512</span> | Similarity: <span className="font-mono">cosine</span></div>
            </div>
          </div>
          <StorePreview nodeId={storeId} />
          <RebuildButton label="Rebuild Embeddings" activeLabel="Embedding..." onRebuild={async () => { await rebuildEmbeddings(); }} />
        </>
      );
    }

    // Crawler — intro + ops + schedule
    if (isOpsNode) {
      return (
        <>
          <div className="px-3 pt-3 pb-1">
            <div className="text-[10px] text-[var(--text-dim)] leading-relaxed">{buildIntros.crawler}</div>
          </div>
          <OperationsTab
            crawlProgress={crawlProgress as never}
            indexProgress={indexProgress as never}
            embedProgress={embedProgress as never}
            logEntries={logEntries}
            crawledPages={crawledPages}
            activeCrawlJobId={activeCrawlJobId}
            onCrawlStarted={onCrawlStarted}
          />
          <CrawlSchedulePanel />
        </>
      );
    }

    // Pipeline nodes — GroundedData
    if (step && (trace || overviewTrace)) {
      return <GroundedData activeStep={step} trace={trace} overviewTrace={overviewTrace} overviewText={overviewText} />;
    }

    // Pipeline node but no data yet
    if (step) {
      return <GroundedData activeStep={step} trace={null} overviewTrace={null} overviewText="" />;
    }

    return (
      <div className="p-4 text-[10px] text-[var(--text-dim)] text-center">
        Search to see data for this step.
      </div>
    );
  };

  return (
    <div className="absolute top-0 left-0 bottom-0 z-20 bg-[var(--bg)] border-r border-[var(--border)] animate-slide-left flex" style={{ width }}>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] shrink-0">
          <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">{nodeLabel}</span>
          <button onClick={onClose} className="text-[var(--text-dim)] hover:text-[var(--accent)] cursor-pointer text-sm">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {renderContent()}
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

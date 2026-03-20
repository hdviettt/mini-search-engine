"use client";

import { useEffect, useState } from "react";
import AIOverview from "@/components/AIOverview";
import GroundedData from "@/components/playground/GroundedData";
import type { ActiveStep } from "@/components/playground/GroundedData";
import OperationsTab from "@/components/playground/OperationsTab";
import PageRankTuning from "./PageRankTuning";
import CrawlSchedulePanel from "./CrawlSchedulePanel";
import { useResizableVertical } from "@/hooks/useResizableVertical";
import type {
  PipelineTrace,
  ExplainResponse,
  CrawlProgressData,
  IndexProgressData,
  EmbedProgressData,
} from "@/lib/types";
import type { OverviewTrace, OverviewSource } from "@/lib/api";
import { rebuildIndex, rebuildEmbeddings } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ===================== constants ===================== */

const nodeToStep: Record<string, ActiveStep> = {
  query_input: "query_input",
  tokenize: "tokenize",
  index_lookup: "index_lookup",
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

const storeEndpoints: Record<string, string> = {
  pages_db: "/api/explore/pages?limit=8",
  inverted_index: "/api/explore/index?limit=15",
  pr_scores: "/api/explore/pagerank?limit=10",
  vector_store: "/api/explore/chunks?limit=6",
  chunker_preview: "/api/explore/chunks?limit=5",
  embedder_preview: "/api/explore/chunks?limit=5",
};

const storeIntros: Record<string, string> = {
  pages_db:
    "Raw HTML pages stored after crawling. Each page is parsed for title, text, and outgoing links.",
  inverted_index:
    "Maps each unique term to the list of documents containing it. This is what makes keyword search fast \u2014 O(1) lookup per term.",
  pr_scores:
    "Authority scores computed from the link graph. Pages that are linked to by many other pages score higher.",
  vector_store:
    "Chunks of text with their 512-dimensional embedding vectors, enabling semantic similarity search.",
  chunker_preview:
    "Pages are split at sentence boundaries into ~300-token chunks. Smaller chunks give the embedding model focused context.",
  embedder_preview:
    "Each chunk is converted into a 512-dim dense vector using a sentence-transformer model. Similar meanings map to nearby vectors.",
};

const buildIntros: Record<string, string> = {
  crawler:
    "Breadth-first crawler that starts from seed URLs and follows outgoing links up to a configured depth and page limit.",
  indexer:
    "Reads crawled pages and builds an inverted index: a mapping from every unique term to the documents that contain it.",
  pr_compute:
    "PageRank iteratively distributes authority through the link graph. Pages linked by many high-authority pages score highest.",
  chunker:
    "Splits full-page text into ~300-token chunks at sentence boundaries. Smaller chunks give the embedding model more focused context.",
  embedder:
    "Converts each text chunk into a 512-dimensional dense vector using a sentence-transformer model.",
};

const buildToStore: Record<string, string> = {
  indexer: "inverted_index",
  chunker: "chunker_preview",
  embedder: "embedder_preview",
};

/* ===================== helper components ===================== */

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

  if (loading)
    return <div className="p-3 text-[10px] text-[var(--text-dim)]">Loading...</div>;
  if (!data) return null;

  if (nodeId === "pages_db") {
    const pages = (
      data as {
        pages: {
          id: number;
          title: string;
          domain: string;
          text_length: number;
          outlinks: number;
          status_code: number;
        }[];
      }
    ).pages || [];
    const total = (data as { total?: number }).total || pages.length;
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-3 text-[10px] text-[var(--text-dim)] pb-1.5 border-b border-dashed border-[var(--border)]">
          <span>{total.toLocaleString()} pages total</span>
        </div>
        <div className="space-y-1.5">
          {pages.map((p) => (
            <div key={p.id} className="border border-[var(--border)] p-2">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`w-2 h-2 ${p.status_code === 200 ? "bg-emerald-500" : "bg-red-500"}`}
                  title={`HTTP ${p.status_code}`}
                />
                <span className="text-[10px] text-[var(--text-muted)] truncate flex-1">
                  {(p.title || "Untitled").replace(" - Wikipedia", "")}
                </span>
                <span className="text-[10px] text-[var(--text-dim)] font-mono">#{p.id}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] pl-4">
                <span className="text-[var(--text-dim)]">
                  <span className="text-[var(--text-muted)] font-mono">
                    {(p.text_length / 1000).toFixed(0)}K
                  </span>{" "}
                  chars
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

  if (nodeId === "inverted_index") {
    const terms = (
      data as {
        terms: {
          term: string;
          doc_freq: number;
          total_freq: number;
          sample_docs?: { id: number; title: string; freq: number }[];
        }[];
      }
    ).terms || [];
    const totalDocs = (data as { total_docs?: number }).total_docs || 0;
    return (
      <div className="p-3 space-y-2.5">
        {totalDocs > 0 && (
          <div className="text-[10px] text-[var(--text-dim)] pb-1 border-b border-dashed border-[var(--border)]">
            Corpus: {totalDocs.toLocaleString()} documents indexed
          </div>
        )}
        {terms.map((t) => (
          <div key={t.term} className="border border-[var(--border)] p-2">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-[var(--accent)] text-[11px] font-medium">
                &quot;{t.term}&quot;
              </span>
              <span className="text-[10px] text-[var(--text-dim)] ml-auto">
                in <span className="text-[var(--text-muted)] font-mono">{t.doc_freq}</span> docs
                {totalDocs > 0 && (
                  <span className="text-[var(--text-dim)]">
                    {" "}
                    ({((t.doc_freq / totalDocs) * 100).toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
            {t.sample_docs && t.sample_docs.length > 0 && (
              <div className="space-y-0.5 pl-2 border-l-2 border-[var(--accent)]/20">
                {t.sample_docs.map((d) => (
                  <div key={d.id} className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-[var(--text-dim)] font-mono w-7">d{d.id}</span>
                    <span className="text-[var(--text-muted)] truncate flex-1">
                      {d.title.replace(" - Wikipedia", "")}
                    </span>
                    <span className="text-[var(--text-dim)] font-mono">&times;{d.freq}</span>
                  </div>
                ))}
                {t.doc_freq > 4 && (
                  <div className="text-[10px] text-[var(--text-dim)]">
                    ...and {t.doc_freq - 4} more docs
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (nodeId === "pr_scores") {
    const pages = (
      data as { pages: { title: string; score: number; inlinks: number }[] }
    ).pages || [];
    const maxScore = pages[0]?.score || 1;
    return (
      <div className="p-3 space-y-2">
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 text-[10px] text-[var(--text-dim)] pb-1 border-b border-dashed border-[var(--border)]">
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
                <span className="text-[10px] text-[var(--text-muted)] truncate flex-1">
                  {(p.title || "").replace(" - Wikipedia", "")}
                </span>
              </div>
              <div className="flex items-center gap-2 pl-6">
                <div className="flex-1 h-1.5 bg-[var(--score-bar-bg)]">
                  <div
                    className="h-full bg-[var(--accent)]/40"
                    style={{ width: `${(p.score / maxScore) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-[var(--accent)] font-mono w-16 text-right">
                  {(p.score ?? 0).toFixed(6)}
                </span>
              </div>
              <div className="flex items-center gap-1 pl-6 mt-0.5 text-[10px] text-[var(--text-dim)]">
                <span className="text-[var(--text-muted)] font-mono">{p.inlinks}</span>
                <span>pages link here</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (
    nodeId === "vector_store" ||
    nodeId === "chunker_preview" ||
    nodeId === "embedder_preview"
  ) {
    const chunks = (
      data as {
        chunks: {
          id: number;
          page_id: number;
          chunk_idx: number;
          content: string;
          has_embedding: boolean;
          title: string;
        }[];
      }
    ).chunks || [];

    if (nodeId === "chunker_preview") {
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
                <span className="text-[var(--text-muted)] truncate flex-1">
                  {(pageChunks[0]?.title || "").replace(" - Wikipedia", "")}
                </span>
                <span className="text-[10px] text-[var(--text-dim)]">
                  &rarr; {pageChunks.length} chunks
                </span>
              </div>
              <div className="space-y-1">
                {pageChunks.map((c) => (
                  <div key={c.id} className="pl-2 border-l-2 border-[var(--accent)]/20">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] text-[var(--accent)] font-mono">
                        chunk {c.chunk_idx}
                      </span>
                      <span className="text-[10px] text-[var(--text-dim)]">
                        {c.content.split(/\s+/).length} words
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] leading-relaxed line-clamp-3">
                      {c.content}
                    </div>
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
              <div className="text-[10px] text-[var(--text-dim)]">embedded</div>
            </div>
            <div className="p-1.5 border border-[var(--border)] text-center">
              <div className="text-[var(--text-muted)] font-mono text-[12px]">
                {chunks.length - embedded}
              </div>
              <div className="text-[10px] text-[var(--text-dim)]">pending</div>
            </div>
          </div>
          <div className="space-y-1.5">
            {chunks.map((c) => (
              <div key={c.id} className="border border-[var(--border)] p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`w-2 h-2 ${c.has_embedding ? "bg-[var(--accent)]" : "bg-[var(--border-hover)]"}`}
                  />
                  <span className="text-[10px] text-[var(--text-dim)] font-mono">
                    page {c.page_id} &rarr; chunk {c.chunk_idx}
                  </span>
                  <span className="text-[10px] text-[var(--text-dim)] ml-auto">
                    {c.has_embedding ? "512-dim vector" : "not yet embedded"}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)] leading-relaxed line-clamp-2 pl-4">
                  {c.content}
                </div>
                {c.has_embedding && (
                  <div className="pl-4 mt-1 text-[10px] text-[var(--text-dim)] font-mono">
                    text &rarr; [0.023, -0.148, 0.067, ... ] &times; 512 dims
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    const embeddedCount = chunks.filter((c) => c.has_embedding).length;
    return (
      <div className="p-3 space-y-2">
        <div className="text-[10px] text-[var(--text-dim)] pb-1 border-b border-dashed border-[var(--border)]">
          {embeddedCount}/{chunks.length} chunks in sample have vectors
        </div>
        <div className="space-y-1.5">
          {chunks.map((c) => (
            <div key={c.id} className="border border-[var(--border)] p-2">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`w-2 h-2 ${c.has_embedding ? "bg-[var(--accent)]" : "bg-[var(--border-hover)]"}`}
                />
                <span className="text-[10px] text-[var(--text-muted)] truncate flex-1">
                  {(c.title || "").replace(" - Wikipedia", "")}
                </span>
                <span className="text-[10px] text-[var(--text-dim)] font-mono">
                  p{c.page_id}:c{c.chunk_idx}
                </span>
              </div>
              <div className="text-[10px] text-[var(--text-dim)] leading-relaxed line-clamp-2 pl-4 mb-1">
                {c.content}
              </div>
              <div className="pl-4 text-[10px] text-[var(--text-dim)]">
                {c.has_embedding ? (
                  <span className="font-mono">
                    text &rarr; float[512] &rarr; stored for cosine similarity search
                  </span>
                ) : (
                  <span>awaiting embedding</span>
                )}
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

function ProgressIndicator({
  done,
  total,
  label,
}: {
  done: number;
  total: number;
  label?: string;
}) {
  const pct = Math.round((done / Math.max(total, 1)) * 100);
  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-[var(--accent)] font-mono font-medium">
          {done.toLocaleString()}/{total.toLocaleString()}
        </span>
        <span className="text-[var(--text-dim)]">{pct}%</span>
      </div>
      <div className="w-full h-2 bg-[var(--score-bar-bg)]">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {label && <div className="text-[10px] text-[var(--text-dim)] truncate">{label}</div>}
    </div>
  );
}

function RebuildButton({
  label,
  activeLabel,
  onRebuild,
}: {
  label: string;
  activeLabel: string;
  onRebuild: () => Promise<void>;
}) {
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
      {result && (
        <div className="text-[10px] text-[var(--text-muted)] text-center mt-1">{result}</div>
      )}
    </div>
  );
}

function ResultsView({ searchData }: { searchData: ExplainResponse | null }) {
  if (!searchData) {
    return (
      <div className="p-3">
        <div className="text-[10px] text-[var(--accent)] font-medium mb-1">Ranked Results</div>
        <div className="text-[10px] text-[var(--text-dim)] leading-relaxed mb-2">
          The final output after combining BM25 relevance with PageRank authority. Each result
          carries a composite score.
        </div>
        <div className="text-[10px] text-[var(--text-dim)] text-center py-2">
          Search to see results.
        </div>
      </div>
    );
  }

  const maxFinal = searchData.results[0]?.final_score || 1;
  const alpha = searchData.params_used.rank_alpha;

  return (
    <div className="p-3 space-y-2">
      <div className="text-[10px] text-[var(--accent)] font-medium">Ranked Results</div>
      <div className="text-[10px] text-[var(--text-dim)] leading-relaxed">
        Final ranking: {Math.round(alpha * 100)}% BM25 relevance +{" "}
        {Math.round((1 - alpha) * 100)}% PageRank authority.
      </div>
      <div className="text-[10px] text-[var(--text-dim)] pb-1 border-b border-dashed border-[var(--border)]">
        {searchData.total_results} results in {(searchData.time_ms ?? 0).toFixed(0)}ms for &ldquo;
        {searchData.query}&rdquo;
      </div>
      <div className="space-y-1.5">
        {searchData.results.slice(0, 8).map((r, i) => (
          <div key={i} className="border border-[var(--border)] p-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[var(--accent)] font-mono text-[10px] w-4">#{i + 1}</span>
              <span className="text-[10px] text-[var(--text-muted)] truncate flex-1">
                {r.title.replace(" - Wikipedia", "")}
              </span>
            </div>
            <div className="text-[10px] text-[var(--text-dim)] line-clamp-1 pl-6 mb-1.5">
              {r.snippet}
            </div>
            <div className="pl-6 space-y-0.5">
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-[var(--text-dim)] w-10">BM25</span>
                <div className="flex-1 h-1 bg-[var(--score-bar-bg)]">
                  <div
                    className="h-full bg-[var(--accent)]/40"
                    style={{
                      width: `${(r.bm25_score / (searchData.results[0]?.bm25_score || 1)) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-[var(--accent)] font-mono w-10 text-right">
                  {(r.bm25_score ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-[var(--text-dim)] w-10">PR</span>
                <div className="flex-1 h-1 bg-[var(--score-bar-bg)]">
                  <div
                    className="h-full bg-indigo-500/40"
                    style={{
                      width: `${((r.pagerank_score ?? 0) / (searchData.results[0]?.pagerank_score || 0.001)) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-[var(--text-muted)] font-mono w-10 text-right">
                  {(r.pagerank_score ?? 0).toFixed(4)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] pt-0.5 border-t border-dashed border-[var(--border)]">
                <span className="text-[var(--text-dim)] w-10">Final</span>
                <div className="flex-1 h-1.5 bg-[var(--score-bar-bg)]">
                  <div
                    className="h-full bg-[var(--accent)]/60"
                    style={{ width: `${((r.final_score ?? 0) / maxFinal) * 100}%` }}
                  />
                </div>
                <span className="text-[var(--accent)] font-mono font-medium w-10 text-right">
                  {(r.final_score ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AIOverviewView({
  overviewText,
  overviewTrace,
}: {
  overviewText: string;
  overviewTrace: OverviewTrace | null;
}) {
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
              <div className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider">
                Pipeline Trace
              </div>
              {overviewTrace.fanout && (
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-[var(--text-dim)] w-16">Fan-out</span>
                  <span className="text-[var(--text-muted)]">
                    {overviewTrace.fanout.expanded.length} queries
                  </span>
                  <span className="text-[var(--text-dim)] font-mono ml-auto">
                    {overviewTrace.fanout.time_ms?.toFixed(0)}ms
                  </span>
                </div>
              )}
              {overviewTrace.retrieval && (
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-[var(--text-dim)] w-16">Retrieval</span>
                  <span className="text-[var(--text-muted)]">
                    {overviewTrace.retrieval.chunks_retrieved} chunks
                  </span>
                  <span className="text-[var(--text-dim)] font-mono ml-auto">
                    {overviewTrace.retrieval.time_ms?.toFixed(0)}ms
                  </span>
                </div>
              )}
              {overviewTrace.synthesis && (
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-[var(--text-dim)] w-16">Synthesis</span>
                  <span className="text-[var(--accent)] font-mono">
                    {overviewTrace.synthesis.model}
                  </span>
                  <span className="text-[var(--text-dim)] font-mono ml-auto">
                    {overviewTrace.synthesis.time_ms?.toFixed(0)}ms
                  </span>
                </div>
              )}
              {overviewTrace.total_ms && (
                <div className="flex items-center gap-2 text-[10px] pt-1 border-t border-dashed border-[var(--border)]">
                  <span className="text-[var(--text-dim)] w-16">Total</span>
                  <span className="text-[var(--accent)] font-mono ml-auto">
                    {overviewTrace.total_ms?.toFixed(0)}ms
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-[10px] text-[var(--text-dim)] text-center py-2">
          Search to see AI overview.
        </div>
      )}
    </div>
  );
}

/* ===================== node content ===================== */

interface NodeContentProps {
  nodeId: string;
  trace: PipelineTrace | null;
  overviewTrace: OverviewTrace | null;
  overviewText: string;
  crawlProgress: CrawlProgressData | null;
  indexProgress: IndexProgressData | null;
  embedProgress: EmbedProgressData | null;
  logEntries: string[];
  crawledPages: CrawlProgressData[];
  activeCrawlJobId: string | null;
  onCrawlStarted: (id: string) => void;
  searchData: ExplainResponse | null;
  buildComplete: boolean;
  buildError: string | null;
}

function NodeContent({
  nodeId,
  trace,
  overviewTrace,
  overviewText,
  crawlProgress,
  indexProgress,
  embedProgress,
  logEntries,
  crawledPages,
  activeCrawlJobId,
  onCrawlStarted,
  searchData,
  buildComplete,
  buildError,
}: NodeContentProps) {
  const isOpsNode = nodeId === "crawler";
  const isPRNode = nodeId === "pr_compute";
  const isResultsNode = nodeId === "results";
  const isAIOverviewNode = nodeId === "ai_overview";
  const storeId = buildToStore[nodeId] || null;
  const isStoreNode = !!storeEndpoints[nodeId];
  const step = nodeToStep[nodeId] || null;

  if (isResultsNode) return <ResultsView searchData={searchData} />;

  if (isAIOverviewNode)
    return <AIOverviewView overviewText={overviewText} overviewTrace={overviewTrace} />;

  if (isStoreNode) {
    return (
      <>
        <StoreIntro nodeId={nodeId} />
        <StorePreview nodeId={nodeId} />
      </>
    );
  }

  if (isPRNode) {
    const prRunning = indexProgress?.phase === "pagerank";
    return (
      <>
        <div className="px-3 pt-3 pb-0">
          <div className="text-[10px] text-[var(--text-dim)] leading-relaxed">
            {buildIntros.pr_compute}
          </div>
          <div className="text-[10px] text-[var(--text-dim)] mt-1 p-1 border-l-2 border-[var(--accent)]/30 font-mono">
            Damping factor (d): probability a random surfer follows a link vs. jumping to a random
            page.
          </div>
        </div>
        {prRunning ? (
          <div className="px-3 py-2">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="w-2 h-2 bg-[var(--accent)] animate-pulse" />
              <span className="text-[var(--accent)] font-medium">Computing PageRank...</span>
            </div>
            <div className="text-[10px] text-[var(--text-dim)] mt-1">
              Iterating over link graph to distribute authority scores.
            </div>
          </div>
        ) : (
          <>
            <StoreIntro nodeId="pr_scores" />
            <StorePreview nodeId="pr_scores" />
          </>
        )}
        <PageRankTuning />
      </>
    );
  }

  if (nodeId === "indexer") {
    return (
      <>
        <div className="px-3 pt-3 pb-0">
          <div className="text-[10px] text-[var(--text-dim)] leading-relaxed">
            {buildIntros.indexer}
          </div>
        </div>
        {indexProgress ? (
          <div className="px-3 py-2">
            <div className="text-[11px] text-[var(--accent)] font-medium mb-1">
              Indexing in progress...
            </div>
            <div className="text-[10px] text-[var(--text-dim)] mb-2">{indexProgress.phase}</div>
            <ProgressIndicator
              done={indexProgress.pages_done}
              total={indexProgress.pages_total}
              label={`${indexProgress.unique_terms.toLocaleString()} unique terms found`}
            />
          </div>
        ) : (
          <>
            <StoreIntro nodeId="inverted_index" />
            <StorePreview nodeId="inverted_index" />
          </>
        )}
        <RebuildButton
          label="Rebuild Index"
          activeLabel="Building..."
          onRebuild={async () => {
            await rebuildIndex();
          }}
        />
      </>
    );
  }

  if (storeId === "chunker_preview") {
    const chunking = embedProgress && embedProgress.chunks_done === 0;
    return (
      <>
        <div className="px-3 pt-3 pb-0">
          <div className="text-[10px] text-[var(--text-dim)] leading-relaxed">
            {buildIntros.chunker}
          </div>
          <div className="text-[10px] text-[var(--text-dim)] mt-1 p-1 border-l-2 border-[var(--accent)]/30">
            ~300 tokens keeps each chunk within the embedding model&apos;s sweet spot for semantic
            accuracy.
          </div>
        </div>
        {chunking ? (
          <div className="px-3 py-2">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="w-2 h-2 bg-[var(--accent)] animate-pulse" />
              <span className="text-[var(--accent)] font-medium">
                Splitting pages into chunks...
              </span>
            </div>
            <div className="text-[10px] text-[var(--text-dim)] mt-1">
              Breaking text at sentence boundaries into ~300-token segments.
            </div>
          </div>
        ) : (
          <StorePreview nodeId={storeId} />
        )}
      </>
    );
  }

  if (storeId === "embedder_preview") {
    return (
      <>
        <div className="px-3 pt-3 pb-0">
          <div className="text-[10px] text-[var(--text-dim)] leading-relaxed">
            {buildIntros.embedder}
          </div>
          <div className="p-1.5 mt-1 border border-dashed border-[var(--border)] text-[10px] text-[var(--text-dim)]">
            <div>
              Model: <span className="text-[var(--accent)] font-mono">voyage-3-lite</span>
            </div>
            <div>
              Dims: <span className="text-[var(--accent)] font-mono">512</span> | Similarity:{" "}
              <span className="font-mono">cosine</span>
            </div>
          </div>
        </div>
        {embedProgress ? (
          <div className="px-3 py-2">
            <div className="text-[11px] text-[var(--accent)] font-medium mb-1">
              {embedProgress.chunks_done === 0 ? "Chunking pages..." : "Embedding chunks..."}
            </div>
            <ProgressIndicator
              done={embedProgress.chunks_done}
              total={embedProgress.chunks_total}
              label={embedProgress.current_chunk_preview?.slice(0, 60)}
            />
          </div>
        ) : (
          <StorePreview nodeId={storeId} />
        )}
        <RebuildButton
          label="Rebuild Embeddings"
          activeLabel="Embedding..."
          onRebuild={async () => {
            await rebuildEmbeddings();
          }}
        />
      </>
    );
  }

  if (isOpsNode) {
    return (
      <>
        <div className="px-3 pt-3 pb-1">
          <div className="text-[10px] text-[var(--text-dim)] leading-relaxed">
            {buildIntros.crawler}
          </div>
        </div>
        <OperationsTab
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
        <CrawlSchedulePanel />
      </>
    );
  }

  if (step && (trace || overviewTrace)) {
    return (
      <GroundedData
        activeStep={step}
        trace={trace}
        overviewTrace={overviewTrace}
        overviewText={overviewText}
      />
    );
  }

  if (step) {
    return (
      <GroundedData activeStep={step} trace={null} overviewTrace={null} overviewText="" />
    );
  }

  return (
    <div className="p-4 text-[10px] text-[var(--text-dim)] text-center">
      Search to see data for this step.
    </div>
  );
}

/* ===================== main panel ===================== */

interface BottomPanelProps {
  selectedNode: string | null;
  onNodeClose: () => void;
  query: string;
  searchData: ExplainResponse | null;
  onSearch: (query: string) => void;
  overviewText: string;
  overviewSources: OverviewSource[];
  overviewLoading: boolean;
  overviewStreaming: boolean;
  overviewTrace: OverviewTrace | null;
  trace: PipelineTrace | null;
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

export default function BottomPanel({
  selectedNode,
  onNodeClose,
  searchData,
  onSearch,
  overviewText,
  overviewSources,
  overviewLoading,
  overviewStreaming,
  overviewTrace,
  trace,
  crawlProgress,
  indexProgress,
  embedProgress,
  logEntries,
  crawledPages,
  activeCrawlJobId,
  onCrawlStarted,
  buildComplete,
  buildError,
}: BottomPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"results" | "node">("results");
  const { height, onMouseDown } = useResizableVertical({ initial: 300, min: 200, max: 600 });

  // Auto-expand + switch to results on search
  useEffect(() => {
    if (searchData) {
      setExpanded(true);
      setActiveTab("results");
    }
  }, [searchData]);

  // Auto-switch to node tab on node click
  useEffect(() => {
    if (selectedNode) {
      setExpanded(true);
      setActiveTab("node");
    }
  }, [selectedNode]);

  // If node deselected while on node tab, switch to results
  useEffect(() => {
    if (!selectedNode && activeTab === "node") {
      setActiveTab("results");
    }
  }, [selectedNode, activeTab]);

  const nodeLabel = selectedNode?.replace(/_/g, " ") || "";

  return (
    <div
      className="shrink-0 bg-[var(--bg)] border-t border-[var(--border)] flex flex-col"
      style={{ height: expanded ? height : 36 }}
    >
      {/* Drag handle */}
      {expanded && (
        <div
          onMouseDown={onMouseDown}
          className="h-1 cursor-row-resize hover:bg-[var(--accent)]/30 active:bg-[var(--accent)]/50 transition-colors shrink-0"
        />
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 h-[35px] shrink-0 select-none">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-[var(--text-dim)] hover:text-[var(--accent)] cursor-pointer px-1 font-mono"
        >
          {expanded ? "\u25BC" : "\u25B2"}
        </button>

        <button
          onClick={() => {
            setActiveTab("results");
            setExpanded(true);
          }}
          className={`text-[11px] px-3 py-1 cursor-pointer transition-colors font-mono ${
            activeTab === "results"
              ? "text-[var(--accent)] border-b border-[var(--accent)]"
              : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
          }`}
        >
          Results{searchData ? ` (${searchData.total_results})` : ""}
        </button>

        {selectedNode && (
          <button
            onClick={() => {
              setActiveTab("node");
              setExpanded(true);
            }}
            className={`text-[11px] px-3 py-1 cursor-pointer transition-colors font-mono uppercase ${
              activeTab === "node"
                ? "text-[var(--accent)] border-b border-[var(--accent)]"
                : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
            }`}
          >
            {nodeLabel}
          </button>
        )}

        {selectedNode && activeTab === "node" && (
          <button
            onClick={onNodeClose}
            className="text-[var(--text-dim)] hover:text-[var(--accent)] cursor-pointer text-sm ml-auto"
          >
            &times;
          </button>
        )}

        {!selectedNode && searchData && (
          <span className="text-[10px] text-[var(--text-dim)] ml-auto font-mono">
            {(searchData.time_ms ?? 0).toFixed(0)}ms
          </span>
        )}
      </div>

      {/* Content */}
      {expanded && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {activeTab === "results" ? (
            searchData ? (
              <div className="p-4 max-w-5xl">
                <AIOverview
                  text={overviewText}
                  sources={overviewSources}
                  loading={overviewLoading}
                  streaming={overviewStreaming}
                />
                <div className="space-y-4">
                  {searchData.results.map((r, i) => {
                    let domain = "";
                    try {
                      domain = new URL(r.url).hostname;
                    } catch {
                      domain = r.url;
                    }
                    const path = r.url.replace(/https?:\/\/[^/]+/, "").slice(0, 60);
                    return (
                      <a
                        key={i}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[12px] text-[var(--text-muted)]">{domain}</span>
                          <span className="text-[11px] text-[var(--text-dim)]">{path}</span>
                        </div>
                        <h3 className="text-[15px] text-[var(--accent)] group-hover:underline leading-snug mb-1">
                          {r.title}
                        </h3>
                        <p className="text-[13px] text-[var(--text-muted)] leading-relaxed line-clamp-2">
                          {r.snippet}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] px-2 py-0.5 bg-[var(--bg-elevated)] text-[var(--text-dim)] font-mono">
                            BM25 {(r.bm25_score ?? 0).toFixed(1)}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 bg-[var(--bg-elevated)] text-[var(--text-dim)] font-mono">
                            PR {(r.pagerank_score ?? 0).toFixed(4)}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 bg-[var(--accent-muted)] text-[var(--accent)] font-mono">
                            Score {(r.final_score ?? 0).toFixed(2)}
                          </span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
                <div className="text-[32px] font-bold text-[var(--accent)] opacity-15 mb-3 font-mono">
                  search
                </div>
                <p className="text-[var(--text-dim)] text-[12px] mb-4">
                  Try a query to see the search pipeline in action
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {["Messi", "Champions League", "World Cup", "Premier League", "Ronaldo"].map(
                    (q) => (
                      <button
                        key={q}
                        onClick={() => onSearch(q)}
                        className="text-[11px] px-3 py-1.5 border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 cursor-pointer transition-colors"
                      >
                        {q}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )
          ) : selectedNode ? (
            <NodeContent
              nodeId={selectedNode}
              trace={trace}
              overviewTrace={overviewTrace}
              overviewText={overviewText}
              crawlProgress={crawlProgress}
              indexProgress={indexProgress}
              embedProgress={embedProgress}
              logEntries={logEntries}
              crawledPages={crawledPages}
              activeCrawlJobId={activeCrawlJobId}
              onCrawlStarted={onCrawlStarted}
              searchData={searchData}
              buildComplete={buildComplete}
              buildError={buildError}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

"use client";

import { PipelineTrace } from "@/lib/types";
import { OverviewTrace } from "@/lib/api";

type ActiveStep = null | "tokenize" | "index" | "bm25" | "pagerank" | "combine" | "ai_fanout" | "ai_retrieval" | "ai_synthesis" | "query_input" | "embed_query" | "llm";

interface GroundedDataProps {
  activeStep: ActiveStep;
  trace: PipelineTrace | null;
  overviewTrace: OverviewTrace | null;
}

function Intro({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-[var(--text-dim)] leading-relaxed mb-2 px-0.5">
      {children}
    </div>
  );
}

export default function GroundedData({ activeStep, trace, overviewTrace }: GroundedDataProps) {
  if (!activeStep) {
    return (
      <div className="flex items-center justify-center h-full text-[10px] text-[var(--text-dim)] px-3 text-center">
        Hover a pipeline step to see the underlying data it uses.
      </div>
    );
  }

  // Query Input
  if (activeStep === "query_input") {
    return (
      <div className="p-2 space-y-2">
        <div className="text-[10px] text-[var(--accent)] font-medium">Search Query</div>
        <Intro>Natural language input &mdash; both the search path and AI overview path begin here.</Intro>
        {trace ? (
          <div className="p-2 bg-[var(--bg-card)] border border-[var(--border)] font-mono text-[10px] text-[var(--text-muted)]">
            &quot;{trace.tokenization.input}&quot;
          </div>
        ) : (
          <div className="text-[10px] text-[var(--text-dim)] text-center py-2">Search to see query data.</div>
        )}
      </div>
    );
  }

  // Tokenize
  if (activeStep === "tokenize" && trace) {
    const t = trace.tokenization;
    return (
      <div className="p-2 space-y-2">
        <div className="text-[10px] text-[var(--accent)] font-medium">Tokenizer Output</div>
        <Intro>Breaks raw text into searchable terms. Normalization ensures &quot;FIFA&quot; and &quot;fifa&quot; match the same index entries.</Intro>
        <div className="text-[9px] text-[var(--text-dim)] font-mono px-1 py-1 border-l-2 border-[var(--accent)]/30">
          1. lowercase &rarr; 2. clean &rarr; 3. split &rarr; 4. remove stopwords
        </div>
        <div className="p-1.5 bg-[var(--bg-card)] text-[10px] font-mono text-[var(--text-muted)]">
          &quot;{t.input}&quot;
        </div>
        <div className="text-[10px] text-[var(--text-dim)]">&darr; becomes &darr;</div>
        <div className="flex flex-wrap gap-1">
          {t.tokens.map((tok, i) => (
            <span key={i} className="px-1.5 py-0.5 bg-[var(--accent-muted)] text-[var(--accent)] text-[10px] font-mono border border-[var(--accent)]/20">{tok}</span>
          ))}
        </div>
        <div className="text-[9px] text-[var(--text-dim)]">{t.tokens.length} tokens</div>
        {t.stopwords_removed.length > 0 && (
          <div className="text-[10px] text-[var(--text-dim)]">
            Removed: {t.stopwords_removed.map((w, i) => (
              <span key={i} className="line-through text-[var(--text-dim)] mx-0.5">{w}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Index Lookup
  if (activeStep === "index" && trace) {
    const t = trace.index_lookup;
    return (
      <div className="p-2 space-y-2">
        <div className="text-[10px] text-[var(--accent)] font-medium">Inverted Index Lookup</div>
        <Intro>Each token is looked up in the inverted index to find which documents contain it and how rare it is (IDF).</Intro>
        <div className="text-[10px] text-[var(--text-dim)]">
          {t.corpus_stats.total_docs.toLocaleString()} docs indexed, avg {Math.round(t.corpus_stats.avg_doc_length)} tokens/doc
        </div>
        <div className="space-y-1.5">
          {Object.entries(t.terms_found).map(([term, info]) => (
            <div key={term} className="p-1.5 bg-[var(--accent-muted)] border border-[var(--accent)]/20">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[var(--accent)] text-[11px]">{term}</span>
                <span className="text-[10px] text-[var(--text-dim)]">id:{info.term_id}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-1 bg-[var(--score-bar-bg)] overflow-hidden">
                  <div className="h-full bg-[var(--accent)]/40" style={{ width: `${Math.min((info.doc_freq / t.corpus_stats.total_docs) * 100 * 5, 100)}%` }} />
                </div>
                <span className="text-[9px] text-[var(--text-dim)]">{info.doc_freq} docs</span>
                <span className="text-[9px] text-[var(--text-dim)]">IDF: {info.idf}</span>
              </div>
            </div>
          ))}
        </div>
        {t.terms_missing.length > 0 && (
          <div className="p-1.5 bg-yellow-500/5 border border-yellow-500/20 text-[10px] text-yellow-500">
            Not in index: {t.terms_missing.join(", ")}
          </div>
        )}
      </div>
    );
  }

  // BM25
  if (activeStep === "bm25" && trace) {
    const t = trace.bm25_scoring;
    const maxScore = t.top_scores[0]?.score || 1;
    return (
      <div className="p-2 space-y-2">
        <div className="text-[10px] text-[var(--accent)] font-medium">BM25 Scored Pages</div>
        <Intro>BM25: relevance scoring using term frequency, rarity, and document length. The classic ranking function behind most search engines.</Intro>
        <div className="space-y-1 mb-2">
          <div className="flex items-center gap-2 text-[9px] p-1 border border-dashed border-[var(--border)]">
            <span className="text-[var(--accent)] font-mono w-6">k1={t.params.k1}</span>
            <span className="text-[var(--text-dim)]">Term frequency saturation &mdash; higher = repeated terms matter more</span>
          </div>
          <div className="flex items-center gap-2 text-[9px] p-1 border border-dashed border-[var(--border)]">
            <span className="text-[var(--accent)] font-mono w-6">b={t.params.b}</span>
            <span className="text-[var(--text-dim)]">Length normalization &mdash; higher = longer docs penalized more</span>
          </div>
        </div>
        <div className="text-[10px] text-[var(--text-dim)]">{t.total_matched} pages matched</div>
        <div className="space-y-0.5">
          {t.top_scores.slice(0, 8).map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 py-0.5 px-1 hover:bg-[var(--accent-muted)]">
              <span className="text-[9px] text-[var(--text-dim)] w-3">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-[var(--text-muted)] truncate">{s.title.replace(" - Wikipedia", "")}</div>
                <div className="h-1 bg-[var(--score-bar-bg)] overflow-hidden mt-0.5">
                  <div className="h-full bg-[var(--accent)]/50" style={{ width: `${(s.score / maxScore) * 100}%` }} />
                </div>
              </div>
              <span className="text-[10px] font-mono text-[var(--accent)] w-8 text-right">{s.score.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // PageRank Lookup
  if (activeStep === "pagerank" && trace) {
    const t = trace.pagerank;
    const maxScore = t.top_scores[0]?.score || 1;
    return (
      <div className="p-2 space-y-2">
        <div className="text-[10px] text-[var(--accent)] font-medium">PageRank Lookup</div>
        <Intro>For each BM25 result, fetch its PageRank authority score. Pages linked to by many others score higher.</Intro>
        <div className="text-[10px] text-[var(--text-dim)]">Authority from link graph (d={t.damping})</div>
        <div className="space-y-0.5">
          {t.top_scores.slice(0, 8).map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 py-0.5 px-1 hover:bg-[var(--accent-muted)]">
              <span className="text-[9px] text-[var(--text-dim)] w-3">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-[var(--text-muted)] truncate">{s.title.replace(" - Wikipedia", "")}</div>
                <div className="h-1 bg-[var(--score-bar-bg)] overflow-hidden mt-0.5">
                  <div className="h-full bg-indigo-500/50" style={{ width: `${(s.score / maxScore) * 100}%` }} />
                </div>
              </div>
              <span className="text-[10px] font-mono text-[var(--accent)] w-14 text-right">{s.score.toFixed(6)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Combine
  if (activeStep === "combine" && trace) {
    const t = trace.combination;
    const alpha = t.alpha;
    return (
      <div className="p-2 space-y-2">
        <div className="text-[10px] text-[var(--accent)] font-medium">Combined Rankings</div>
        <Intro>Merges relevance (BM25) with authority (PageRank) into a single final score.</Intro>
        <div className="p-1.5 border border-dashed border-[var(--border)] text-[9px] text-[var(--text-dim)] font-mono">
          {t.formula}
        </div>
        <div className="text-[10px] text-[var(--text-muted)]">
          &alpha;={alpha} means {Math.round(alpha * 100)}% relevance + {Math.round((1 - alpha) * 100)}% authority
        </div>
        <div className="space-y-0.5">
          {t.rank_changes.slice(0, 8).map((rc, i) => {
            const changed = rc.bm25_rank !== rc.final_rank;
            return (
              <div key={i} className={`flex items-center gap-1.5 py-1 px-1.5 ${changed ? "bg-[var(--accent-muted)] border border-[var(--accent)]/15" : ""}`}>
                <span className="text-[10px] text-[var(--accent)] w-4">#{rc.final_rank}</span>
                <span className="text-[10px] text-[var(--text-muted)] truncate flex-1">{rc.title.replace(" - Wikipedia", "")}</span>
                {changed ? (
                  <span className="text-[9px] text-[var(--accent)]">&larr; was #{rc.bm25_rank}</span>
                ) : (
                  <span className="text-[9px] text-[var(--text-dim)]">same</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // AI Fan-out
  if (activeStep === "ai_fanout" && overviewTrace?.fanout) {
    const f = overviewTrace.fanout;
    return (
      <div className="p-2 space-y-2">
        <div className="text-[10px] text-[var(--accent)] font-medium">Query Fan-out</div>
        <Intro>LLM rewrites your query into alternative phrasings for broader retrieval. This captures synonyms and related concepts the original query might miss.</Intro>
        <div className="space-y-1">
          {f.expanded.map((q, i) => (
            <div key={i} className={`p-1.5 text-[10px] font-mono ${i === 0 ? "bg-[var(--accent-muted)] border border-[var(--accent)]/20 text-[var(--accent)]" : "bg-[var(--bg-card)] text-[var(--text-dim)]"}`}>
              {i === 0 && <span className="text-[8px] text-[var(--accent)] block mb-0.5">ORIGINAL</span>}
              {i > 0 && <span className="text-[8px] text-[var(--text-dim)] block mb-0.5">GENERATED</span>}
              {q}
            </div>
          ))}
        </div>
        {f.time_ms && (
          <div className="text-[9px] text-[var(--text-dim)]">Fan-out took {f.time_ms.toFixed(0)}ms</div>
        )}
      </div>
    );
  }

  // Embed Query
  if (activeStep === "embed_query") {
    return (
      <div className="p-2 space-y-2">
        <div className="text-[10px] text-[var(--accent)] font-medium">Query Embedding</div>
        <Intro>The query text is converted into a 768-dimensional vector using the same embedding model as the stored chunks, so they can be compared by cosine similarity.</Intro>
        <div className="p-2 border border-dashed border-[var(--border)] space-y-1.5">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-[var(--text-dim)]">Model:</span>
            <span className="text-[var(--accent)] font-mono">all-MiniLM-L6-v2</span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-[var(--text-dim)]">Dimensions:</span>
            <span className="text-[var(--accent)] font-mono">768</span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-[var(--text-dim)]">Similarity:</span>
            <span className="text-[var(--text-muted)] font-mono">cosine</span>
          </div>
        </div>
        <div className="text-[9px] text-[var(--text-dim)]">
          Query text &rarr; dense vector &rarr; nearest-neighbor search against chunk embeddings
        </div>
      </div>
    );
  }

  // Vector Search / AI Retrieval
  if (activeStep === "ai_retrieval" && overviewTrace?.retrieval) {
    const r = overviewTrace.retrieval;
    const maxCombined = Math.max(...r.chunks.map((c) => c.combined_score || 0), 0.01);
    return (
      <div className="p-2 space-y-2">
        <div className="text-[10px] text-[var(--accent)] font-medium">Retrieved Chunks</div>
        <Intro>Hybrid retrieval: 60% vector similarity (semantic meaning) + 40% keyword overlap (exact terms) for comprehensive recall.</Intro>
        <div className="text-[9px] text-[var(--text-dim)] pb-1 border-b border-dashed border-[var(--border)]">
          {r.chunks_retrieved} chunks retrieved{r.time_ms ? ` in ${r.time_ms.toFixed(0)}ms` : ""}
        </div>
        <div className="space-y-1.5">
          {r.chunks.slice(0, 5).map((c, i) => (
            <div key={i} className="border border-[var(--border)] p-2">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[9px] text-[var(--accent)] font-mono">[{i + 1}]</span>
                <span className="text-[10px] text-[var(--text-muted)] truncate flex-1">{c.title.replace(" - Wikipedia", "")}</span>
              </div>
              <div className="text-[9px] text-[var(--text-dim)] leading-relaxed line-clamp-2 pl-4 mb-1.5">{c.content_preview}</div>
              <div className="pl-4 space-y-0.5">
                <div className="flex items-center gap-2 text-[8px]">
                  <span className="text-[var(--text-dim)] w-12">semantic</span>
                  <div className="flex-1 h-1 bg-[var(--score-bar-bg)]">
                    <div className="h-full bg-[var(--accent)]/40" style={{ width: `${(c.vector_score || 0) * 100}%` }} />
                  </div>
                  <span className="text-[var(--accent)] font-mono w-8 text-right">{(c.vector_score || 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 text-[8px]">
                  <span className="text-[var(--text-dim)] w-12">keyword</span>
                  <div className="flex-1 h-1 bg-[var(--score-bar-bg)]">
                    <div className="h-full bg-indigo-500/40" style={{ width: `${(c.keyword_score || 0) * 100}%` }} />
                  </div>
                  <span className="text-[var(--text-muted)] font-mono w-8 text-right">{(c.keyword_score || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // LLM Synthesis
  if (activeStep === "llm" || activeStep === "ai_synthesis") {
    if (overviewTrace?.synthesis) {
      return (
        <div className="p-2 space-y-2">
          <div className="text-[10px] text-[var(--accent)] font-medium">LLM Synthesis</div>
          <Intro>The language model reads retrieved chunks and generates a concise answer with inline source citations [1], [2], etc.</Intro>
          <div className="border border-[var(--border)] p-2 space-y-1.5">
            <div className="text-[9px] text-[var(--text-dim)] uppercase tracking-wider mb-1">Configuration</div>
            <div className="flex items-center gap-2 text-[9px]">
              <span className="text-[var(--text-dim)] w-16">Model</span>
              <span className="text-[var(--accent)] font-mono">{overviewTrace.synthesis.model}</span>
            </div>
            <div className="flex items-center gap-2 text-[9px]">
              <span className="text-[var(--text-dim)] w-16">Task</span>
              <span className="text-[var(--text-muted)]">Summarize top chunks into 2-3 sentences</span>
            </div>
            <div className="flex items-center gap-2 text-[9px]">
              <span className="text-[var(--text-dim)] w-16">Time</span>
              <span className="text-[var(--text-muted)] font-mono">{overviewTrace.synthesis.time_ms.toFixed(0)}ms</span>
            </div>
          </div>
          <div className="text-[9px] text-[var(--text-dim)] font-mono p-1 border-l-2 border-[var(--accent)]/30">
            retrieved chunks &rarr; system prompt &rarr; LLM &rarr; cited summary
          </div>
          {overviewTrace.total_ms && (
            <div className="text-[9px] text-[var(--text-dim)]">Total AI pipeline: {overviewTrace.total_ms.toFixed(0)}ms</div>
          )}
        </div>
      );
    }
    return (
      <div className="p-2 space-y-2">
        <div className="text-[10px] text-[var(--accent)] font-medium">LLM Synthesis</div>
        <Intro>The language model reads retrieved chunks and generates a concise answer with source citations.</Intro>
        <div className="text-[10px] text-[var(--text-dim)] text-center py-2">Search to see synthesis data.</div>
      </div>
    );
  }

  return null;
}

export type { ActiveStep };

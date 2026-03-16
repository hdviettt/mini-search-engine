"use client";

import { PipelineTrace } from "@/lib/types";
import { OverviewTrace } from "@/lib/api";

type ActiveStep = null | "tokenize" | "index" | "bm25" | "pagerank" | "combine" | "ai_fanout" | "ai_retrieval" | "ai_synthesis";

interface GroundedDataProps {
  activeStep: ActiveStep;
  trace: PipelineTrace | null;
  overviewTrace: OverviewTrace | null;
}

export default function GroundedData({ activeStep, trace, overviewTrace }: GroundedDataProps) {
  if (!activeStep) {
    return (
      <div className="flex items-center justify-center h-full text-[10px] text-[var(--text-dim)] px-3 text-center">
        Hover a pipeline step to see the underlying data it uses.
      </div>
    );
  }

  // Tokenize
  if (activeStep === "tokenize" && trace) {
    const t = trace.tokenization;
    return (
      <div className="p-2 space-y-2">
        <div className="text-[10px] text-[var(--accent)] font-medium">Tokenizer Output</div>
        <div className="text-[10px] text-[var(--text-dim)] mb-1">Input text is lowercased, cleaned, and split. Stopwords are removed.</div>
        <div className="p-1.5 bg-[var(--bg-card)] text-[10px] font-mono text-[var(--text-muted)]">
          &quot;{t.input}&quot;
        </div>
        <div className="text-[10px] text-[var(--text-dim)]">&darr; becomes &darr;</div>
        <div className="flex flex-wrap gap-1">
          {t.tokens.map((tok, i) => (
            <span key={i} className="px-1.5 py-0.5 bg-[var(--accent-muted)] text-[var(--accent)] text-[10px] font-mono border border-[var(--accent)]/20">{tok}</span>
          ))}
        </div>
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
        <div className="text-[10px] text-[var(--accent)] font-medium">Inverted Index</div>
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
        <div className="text-[10px] text-[var(--text-dim)]">
          k1={t.params.k1} b={t.params.b} | {t.total_matched} pages matched
        </div>
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

  // PageRank
  if (activeStep === "pagerank" && trace) {
    const t = trace.pagerank;
    const maxScore = t.top_scores[0]?.score || 1;
    return (
      <div className="p-2 space-y-2">
        <div className="text-[10px] text-[var(--accent)] font-medium">PageRank Scores</div>
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
    return (
      <div className="p-2 space-y-2">
        <div className="text-[10px] text-[var(--accent)] font-medium">Combined Rankings</div>
        <div className="text-[10px] text-[var(--text-dim)]">{t.formula}</div>
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
        <div className="text-[10px] text-[var(--text-dim)]">LLM generates alternative queries for broader retrieval</div>
        <div className="space-y-1">
          {f.expanded.map((q, i) => (
            <div key={i} className={`p-1.5 text-[10px] font-mono ${i === 0 ? "bg-[var(--accent-muted)] border border-[var(--accent)]/20 text-[var(--accent)]" : "bg-[var(--bg-card)] text-[var(--text-dim)]"}`}>
              {i === 0 && <span className="text-[8px] text-[var(--accent)] block mb-0.5">ORIGINAL</span>}
              {i > 0 && <span className="text-[8px] text-[var(--text-dim)] block mb-0.5">GENERATED</span>}
              {q}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // AI Retrieval
  if (activeStep === "ai_retrieval" && overviewTrace?.retrieval) {
    const r = overviewTrace.retrieval;
    return (
      <div className="p-2 space-y-2">
        <div className="text-[10px] text-[var(--accent)] font-medium">Retrieved Chunks</div>
        <div className="text-[10px] text-[var(--text-dim)]">{r.chunks_retrieved} chunks via vector + keyword search</div>
        <div className="space-y-1">
          {r.chunks.slice(0, 4).map((c, i) => (
            <div key={i} className="p-1.5 bg-[var(--accent-muted)] border border-[var(--accent)]/15">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[9px] text-[var(--accent)]">[{i + 1}]</span>
                <span className="text-[10px] text-[var(--text-muted)] truncate">{c.title.replace(" - Wikipedia", "")}</span>
              </div>
              <div className="text-[9px] text-[var(--text-dim)] line-clamp-2">{c.content_preview}</div>
              <div className="flex gap-2 mt-0.5 text-[8px] text-[var(--text-dim)]">
                <span>vec: {c.vector_score}</span>
                <span>kw: {c.keyword_score}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // AI Synthesis
  if (activeStep === "ai_synthesis" && overviewTrace?.synthesis) {
    return (
      <div className="p-2 space-y-2">
        <div className="text-[10px] text-[var(--accent)] font-medium">LLM Synthesis</div>
        <div className="text-[10px] text-[var(--text-dim)]">Model: {overviewTrace.synthesis.model}</div>
        <div className="p-2 bg-[var(--bg-card)] text-[10px] text-[var(--text-dim)] leading-relaxed">
          The model reads the retrieved chunks and generates a concise 2-3 sentence summary with source citations [1], [2], etc.
        </div>
      </div>
    );
  }

  return null;
}

export type { ActiveStep };

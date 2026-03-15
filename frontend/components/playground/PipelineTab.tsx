"use client";

import { PipelineTrace } from "@/lib/types";
import PipelineStep from "./PipelineStep";

export default function PipelineTab({ trace }: { trace: PipelineTrace | null }) {
  if (!trace) {
    return <div className="p-4 text-sm text-gray-600 text-center">Search something to see the pipeline trace.</div>;
  }

  const t = trace;
  const totalMs = Object.values(t).reduce((sum, step) => sum + (step?.time_ms || 0), 0);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pipeline</span>
        <span className="text-xs text-gray-500">{totalMs.toFixed(1)}ms total</span>
      </div>

      {/* Step 1: Tokenization */}
      <PipelineStep
        index={1}
        name="Tokenize"
        timeMs={t.tokenization.time_ms}
        summary={`"${t.tokenization.input}" → ${t.tokenization.tokens.length} tokens`}
      >
        <div className="flex flex-wrap gap-1">
          {t.tokenization.tokens.map((tok, i) => (
            <span key={i} className="px-1.5 py-0.5 bg-rose-500/10 text-rose-400 rounded text-[11px]">{tok}</span>
          ))}
        </div>
        {t.tokenization.stopwords_removed.length > 0 && (
          <div className="mt-1 text-gray-600">
            Removed: {t.tokenization.stopwords_removed.join(", ")}
          </div>
        )}
      </PipelineStep>

      {/* Step 2: Index Lookup */}
      <PipelineStep
        index={2}
        name="Index Lookup"
        timeMs={t.index_lookup.time_ms}
        summary={`${Object.keys(t.index_lookup.terms_found).length} terms found | ${t.index_lookup.corpus_stats.total_docs.toLocaleString()} docs`}
      >
        {Object.entries(t.index_lookup.terms_found).map(([term, info]) => (
          <div key={term} className="flex items-center gap-2">
            <span className="text-rose-400 font-mono">{term}</span>
            <span className="text-gray-600">in {info.doc_freq} docs</span>
            <span className="text-gray-600">IDF: {info.idf}</span>
          </div>
        ))}
        {t.index_lookup.terms_missing.length > 0 && (
          <div className="text-yellow-600">Missing: {t.index_lookup.terms_missing.join(", ")}</div>
        )}
      </PipelineStep>

      {/* Step 3: BM25 Scoring */}
      <PipelineStep
        index={3}
        name="BM25 Scoring"
        timeMs={t.bm25_scoring.time_ms}
        summary={`k1=${t.bm25_scoring.params.k1} b=${t.bm25_scoring.params.b} | ${t.bm25_scoring.total_matched} docs matched`}
      >
        {t.bm25_scoring.top_scores.slice(0, 5).map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-gray-500 w-4">#{i + 1}</span>
            <span className="flex-1 truncate">{s.title}</span>
            <span className="text-rose-400 font-mono">{s.score}</span>
          </div>
        ))}
      </PipelineStep>

      {/* Step 4: PageRank */}
      <PipelineStep
        index={4}
        name="PageRank"
        timeMs={t.pagerank.time_ms}
        summary={`d=${t.pagerank.damping} | top authority pages`}
      >
        {t.pagerank.top_scores.slice(0, 5).map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-gray-500 w-4">#{i + 1}</span>
            <span className="flex-1 truncate">{s.title}</span>
            <span className="text-indigo-400 font-mono">{s.score}</span>
          </div>
        ))}
      </PipelineStep>

      {/* Step 5: Combination */}
      <PipelineStep
        index={5}
        name="Score Combination"
        timeMs={t.combination.time_ms}
        summary={`${t.combination.formula}`}
      >
        {t.combination.rank_changes.slice(0, 5).map((rc, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-gray-500 w-4">#{rc.final_rank}</span>
            <span className="flex-1 truncate">{rc.title}</span>
            {rc.bm25_rank !== rc.final_rank && (
              <span className="text-yellow-500 text-[10px]">was #{rc.bm25_rank}</span>
            )}
          </div>
        ))}
      </PipelineStep>

      {/* Step 6: Snippets */}
      <PipelineStep
        index={6}
        name="Snippet Generation"
        timeMs={t.snippet_generation.time_ms}
        summary={`${t.snippet_generation.results_count} snippets`}
      >
        <div className="text-gray-600">Generated context-aware snippets for top results.</div>
      </PipelineStep>
    </div>
  );
}

"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { searchExplain } from "@/lib/api";
import type { ExplainResponse, PipelineTrace } from "@/lib/types";
import Link from "next/link";

type StepStatus = "waiting" | "active" | "done";

const STEP_DELAY = 400; // ms between each step animation

function useAnimatedSteps(trace: PipelineTrace | null) {
  const [activeStep, setActiveStep] = useState(-1);
  const prevTrace = useRef<PipelineTrace | null>(null);

  useEffect(() => {
    if (!trace || trace === prevTrace.current) return;
    prevTrace.current = trace;
    setActiveStep(-1);

    const steps = 6;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < steps; i++) {
      timers.push(setTimeout(() => setActiveStep(i), STEP_DELAY * (i + 1)));
    }
    return () => timers.forEach(clearTimeout);
  }, [trace]);

  return activeStep;
}

function StepConnector({ status }: { status: StepStatus }) {
  return (
    <div className="flex justify-center py-1">
      <div className={`w-px h-6 transition-colors duration-300 ${
        status === "done" ? "bg-[var(--accent)]" : "bg-[var(--border)]"
      }`} />
    </div>
  );
}

function StepCard({
  step,
  title,
  icon,
  status,
  timeMs,
  children,
}: {
  step: number;
  title: string;
  icon: string;
  status: StepStatus;
  timeMs?: number;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-all duration-500 ${
        status === "waiting"
          ? "border-[var(--border)] opacity-40"
          : status === "active"
            ? "border-[var(--accent)] shadow-md shadow-[var(--accent)]/5"
            : "border-[var(--border)] opacity-100"
      }`}
      style={status !== "waiting" ? { animation: "slide-up 0.4s ease-out" } : undefined}
    >
      <button
        onClick={() => status !== "waiting" && setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          status !== "waiting" ? "cursor-pointer hover:bg-[var(--bg-elevated)]" : "cursor-default"
        }`}
      >
        <div className={`flex items-center justify-center w-7 h-7 rounded-full text-sm shrink-0 transition-colors duration-300 ${
          status === "done"
            ? "bg-[var(--accent)] text-white"
            : status === "active"
              ? "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]"
              : "bg-[var(--bg-elevated)] text-[var(--text-dim)]"
        }`}>
          {status === "done" ? "✓" : icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${
              status === "waiting" ? "text-[var(--text-dim)]" : "text-[var(--text)]"
            }`}>
              {step}. {title}
            </span>
            {status === "active" && (
              <span className="text-[10px] text-[var(--accent)] font-medium" style={{ animation: "pulse-dot 1s ease-in-out infinite" }}>
                processing
              </span>
            )}
          </div>
          {timeMs !== undefined && status === "done" && (
            <span className="text-[11px] text-[var(--text-dim)] font-mono">{timeMs.toFixed(1)}ms</span>
          )}
        </div>
        {status !== "waiting" && (
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`text-[var(--text-dim)] transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>

      {expanded && status !== "waiting" && (
        <div className="px-4 pb-4 border-t border-[var(--border)] pt-3" style={{ animation: "fade-in 0.2s ease-out" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function TokenizationStep({ trace }: { trace: PipelineTrace }) {
  const t = trace.tokenization;
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[11px] text-[var(--text-dim)] uppercase tracking-wide mb-1">Input</div>
        <div className="text-sm text-[var(--text-muted)] font-mono bg-[var(--bg-elevated)] px-3 py-2 rounded">
          &quot;{t.input}&quot;
        </div>
      </div>
      <div>
        <div className="text-[11px] text-[var(--text-dim)] uppercase tracking-wide mb-1">Tokens</div>
        <div className="flex flex-wrap gap-1.5">
          {t.tokens.map((tok, i) => (
            <span key={i} className="text-sm font-mono px-2 py-0.5 bg-[var(--accent)]/8 text-[var(--accent)] rounded border border-[var(--accent)]/15">
              {tok}
            </span>
          ))}
        </div>
      </div>
      {t.stopwords_removed.length > 0 && (
        <div>
          <div className="text-[11px] text-[var(--text-dim)] uppercase tracking-wide mb-1">Stopwords removed</div>
          <div className="flex flex-wrap gap-1.5">
            {t.stopwords_removed.map((w, i) => (
              <span key={i} className="text-sm font-mono px-2 py-0.5 bg-red-50 text-red-400 rounded line-through">
                {w}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IndexLookupStep({ trace }: { trace: PipelineTrace }) {
  const t = trace.index_lookup;
  const terms = Object.entries(t.terms_found);
  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        {terms.map(([term, info]) => (
          <div key={term} className="flex items-center gap-3 bg-[var(--bg-elevated)] px-3 py-2 rounded">
            <span className="font-mono text-sm text-[var(--accent)] font-medium">&quot;{term}&quot;</span>
            <span className="text-[var(--text-dim)]">&rarr;</span>
            <span className="text-sm text-[var(--text-muted)]">{info.doc_freq} docs</span>
            <span className="text-[11px] text-[var(--text-dim)] font-mono ml-auto">IDF: {info.idf.toFixed(2)}</span>
          </div>
        ))}
        {t.terms_missing.length > 0 && t.terms_missing.map((term) => (
          <div key={term} className="flex items-center gap-3 bg-red-50 px-3 py-2 rounded">
            <span className="font-mono text-sm text-red-400">&quot;{term}&quot;</span>
            <span className="text-[11px] text-red-300">not found</span>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-[var(--text-dim)]">
        Corpus: {t.corpus_stats.total_docs.toLocaleString()} docs, avg length {t.corpus_stats.avg_doc_length.toFixed(0)} tokens
      </div>
    </div>
  );
}

function BM25Step({ trace }: { trace: PipelineTrace }) {
  const t = trace.bm25_scoring;
  const maxScore = t.top_scores[0]?.score ?? 1;
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-[var(--text-dim)]">
        k1={t.params.k1}, b={t.params.b} — {t.total_matched} documents matched
      </div>
      <div className="space-y-1.5">
        {t.top_scores.slice(0, 8).map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-dim)] w-4 text-right shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-[var(--text)] truncate">{s.title || `Page ${s.page_id}`}</div>
              <div className="h-1.5 bg-[var(--bg-elevated)] rounded-full mt-0.5 overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] rounded-full transition-all duration-700"
                  style={{ width: `${(s.score / maxScore) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-[11px] font-mono text-[var(--text-dim)] shrink-0 w-10 text-right">
              {s.score.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PageRankStep({ trace }: { trace: PipelineTrace }) {
  const t = trace.pagerank;
  const maxScore = t.top_scores[0]?.score ?? 1;
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-[var(--text-dim)]">
        Damping factor: {t.damping}
      </div>
      <div className="space-y-1.5">
        {t.top_scores.slice(0, 8).map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-dim)] w-4 text-right shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-[var(--text)] truncate">{s.title || `Page ${s.page_id}`}</div>
              <div className="h-1.5 bg-[var(--bg-elevated)] rounded-full mt-0.5 overflow-hidden">
                <div
                  className="h-full bg-[var(--accent-secondary)] rounded-full transition-all duration-700"
                  style={{ width: `${(s.score / maxScore) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-[11px] font-mono text-[var(--text-dim)] shrink-0 w-14 text-right">
              {s.score.toFixed(6)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CombineStep({ trace }: { trace: PipelineTrace }) {
  const t = trace.combination;
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-[var(--text-dim)]">
        &alpha; = {t.alpha} &mdash; {t.formula}
      </div>
      {t.rank_changes.length > 0 && (
        <div>
          <div className="text-[11px] text-[var(--text-dim)] uppercase tracking-wide mb-1.5">Rank changes</div>
          <div className="space-y-1">
            {t.rank_changes.slice(0, 8).map((rc, i) => {
              const bm25Rank = typeof rc.bm25_rank === "number" ? rc.bm25_rank : 99;
              const delta = bm25Rank - rc.final_rank;
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-[var(--text)] truncate flex-1 min-w-0">{rc.title}</span>
                  <span className="text-[11px] font-mono text-[var(--text-dim)] shrink-0">
                    #{typeof rc.bm25_rank === "number" ? rc.bm25_rank : "—"}
                  </span>
                  <span className="text-[var(--text-dim)]">&rarr;</span>
                  <span className="text-[11px] font-mono text-[var(--text)] shrink-0">
                    #{rc.final_rank}
                  </span>
                  {delta !== 0 && (
                    <span className={`text-[10px] font-mono shrink-0 ${delta > 0 ? "text-green-500" : "text-red-400"}`}>
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsStep({ data }: { data: ExplainResponse }) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-[var(--text-dim)]">
        {data.total_results} results in {data.time_ms}ms &mdash; showing top {data.results.length}
      </div>
      <div className="space-y-2">
        {data.results.slice(0, 5).map((r, i) => (
          <a
            key={i}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-[var(--bg-elevated)] rounded px-3 py-2 hover:bg-[var(--border)]/30 transition-colors group"
          >
            <div className="text-sm text-[var(--accent)] group-hover:underline truncate">{r.title}</div>
            <div className="text-[11px] text-[var(--text-dim)] truncate mt-0.5">{r.url}</div>
            <div className="flex gap-3 mt-1 text-[10px] font-mono text-[var(--text-dim)]">
              <span>BM25 {r.bm25_score.toFixed(2)}</span>
              <span>PR {r.pagerank_score.toFixed(6)}</span>
              <span className="text-[var(--accent)]">Final {r.final_score.toFixed(2)}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense>
      <PipelineContent />
    </Suspense>
  );
}

function PipelineContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState<ExplainResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const activeStep = useAnimatedSteps(data?.pipeline ?? null);

  function getStatus(step: number): StepStatus {
    if (activeStep < step) return "waiting";
    if (activeStep === step) return "active";
    return "done";
  }

  async function handleSearch(q: string) {
    if (!q.trim()) return;
    setQuery(q);
    setLoading(true);
    setData(null);
    try {
      const result = await searchExplain(q.trim());
      setData(result);
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  }

  // Auto-search if query param provided
  useEffect(() => {
    if (initialQuery) handleSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trace = data?.pipeline ?? null;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-card)]">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Link href="/" className="text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </Link>
            <h1 className="text-lg font-semibold text-[var(--text)]">Search Pipeline</h1>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q") as string;
              handleSearch(q);
            }}
          >
            <input
              name="q"
              type="text"
              placeholder="Enter a query to trace the pipeline..."
              defaultValue={query}
              key={query}
              autoFocus
              className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-all"
            />
          </form>
        </div>
      </div>

      {/* Pipeline Steps */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {loading && !data && (
          <div className="text-center py-12">
            <div className="inline-block w-5 h-5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
            <p className="text-sm text-[var(--text-dim)] mt-3">Running search pipeline...</p>
          </div>
        )}

        {!data && !loading && (
          <div className="text-center py-16">
            <div className="text-4xl mb-4 opacity-20">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-[var(--text-dim)]">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <p className="text-[var(--text-dim)] text-sm mb-4">
              Search for something to see every step of the pipeline
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {["Messi", "Champions League", "World Cup"].map((q) => (
                <button
                  key={q}
                  onClick={() => handleSearch(q)}
                  className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 cursor-pointer transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {trace && data && (
          <div>
            <StepCard step={1} title="Tokenization" icon="T" status={getStatus(0)} timeMs={trace.tokenization.time_ms}>
              <TokenizationStep trace={trace} />
            </StepCard>

            <StepConnector status={getStatus(0)} />

            <StepCard step={2} title="Index Lookup" icon="I" status={getStatus(1)} timeMs={trace.index_lookup.time_ms}>
              <IndexLookupStep trace={trace} />
            </StepCard>

            <StepConnector status={getStatus(1)} />

            <StepCard step={3} title="BM25 Scoring" icon="B" status={getStatus(2)} timeMs={trace.bm25_scoring.time_ms}>
              <BM25Step trace={trace} />
            </StepCard>

            <StepConnector status={getStatus(2)} />

            <StepCard step={4} title="PageRank" icon="P" status={getStatus(3)} timeMs={trace.pagerank.time_ms}>
              <PageRankStep trace={trace} />
            </StepCard>

            <StepConnector status={getStatus(3)} />

            <StepCard step={5} title="Score Combination" icon="C" status={getStatus(4)} timeMs={trace.combination.time_ms}>
              <CombineStep trace={trace} />
            </StepCard>

            <StepConnector status={getStatus(4)} />

            <StepCard step={6} title="Final Results" icon="R" status={getStatus(5)} timeMs={data.time_ms}>
              <ResultsStep data={data} />
            </StepCard>

            {/* Total time */}
            {activeStep >= 5 && (
              <div className="mt-6 text-center" style={{ animation: "fade-in 0.4s ease-out" }}>
                <span className="text-sm text-[var(--text-dim)]">
                  Total pipeline: <span className="font-mono text-[var(--accent)]">{data.time_ms}ms</span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

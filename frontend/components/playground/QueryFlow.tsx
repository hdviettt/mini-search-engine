"use client";

import { PipelineTrace } from "@/lib/types";
import type { ActiveStep } from "./GroundedData";

interface QueryFlowProps {
  trace: PipelineTrace | null;
  query: string;
  activeStep: ActiveStep;
  onHoverStep: (step: ActiveStep) => void;
}

export default function QueryFlow({ trace, query, activeStep, onHoverStep }: QueryFlowProps) {
  if (!trace) return null;

  const t = trace;
  const totalMs = Object.values(t).reduce((sum, step) => sum + (step?.time_ms || 0), 0);

  const steps: { id: ActiveStep; label: string; color: string; time: number; summary: string }[] = [
    { id: "tokenize", label: "Tokenize", color: "bg-emerald-500", time: t.tokenization.time_ms,
      summary: `"${query}" → [${t.tokenization.tokens.join(", ")}]` },
    { id: "index", label: "Index Lookup", color: "bg-blue-500", time: t.index_lookup.time_ms,
      summary: `${Object.keys(t.index_lookup.terms_found).length} terms found in ${t.index_lookup.corpus_stats.total_docs} docs` },
    { id: "bm25", label: `BM25`, color: "bg-rose-500", time: t.bm25_scoring.time_ms,
      summary: `${t.bm25_scoring.total_matched} docs scored (k1=${t.bm25_scoring.params.k1}, b=${t.bm25_scoring.params.b})` },
    { id: "pagerank", label: "PageRank", color: "bg-indigo-500", time: t.pagerank.time_ms,
      summary: `Authority scores (d=${t.pagerank.damping})` },
    { id: "combine", label: "Combine", color: "bg-amber-500", time: t.combination.time_ms,
      summary: t.combination.formula },
  ];

  return (
    <div className="border border-[#1a1a3a] rounded-lg overflow-hidden bg-[#0a0a18]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a1a3a]">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Search Pipeline</span>
        <span className="text-[10px] text-gray-700">{totalMs.toFixed(0)}ms</span>
      </div>
      <div className="p-2">
        {steps.map((step, i) => {
          const isActive = activeStep === step.id;
          const timeColor = step.time < 5 ? "text-emerald-600" : step.time < 50 ? "text-yellow-600" : "text-rose-600";
          return (
            <div
              key={step.id}
              className={`flex gap-2 py-1.5 px-1.5 rounded cursor-pointer transition-colors ${isActive ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"}`}
              onMouseEnter={() => onHoverStep(step.id)}
              onMouseLeave={() => onHoverStep(null)}
            >
              <div className="flex flex-col items-center shrink-0 w-4">
                <div className={`w-2.5 h-2.5 rounded-full ${step.color} ${isActive ? "ring-2 ring-white/10" : ""}`} />
                {i < steps.length - 1 && <div className="w-px flex-1 bg-[#2a2a4a] mt-0.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-gray-300">{step.label}</span>
                  <span className={`text-[9px] ${timeColor}`}>{step.time.toFixed(1)}ms</span>
                </div>
                <div className="text-[10px] text-gray-600 truncate">{step.summary}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

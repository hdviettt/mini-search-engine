"use client";

import { OverviewTrace } from "@/lib/api";
import type { ActiveStep } from "./GroundedData";

interface AIOverviewFlowProps {
  trace: OverviewTrace | null;
  loading: boolean;
  activeStep: ActiveStep;
  onHoverStep: (step: ActiveStep) => void;
}

export default function AIOverviewFlow({ trace, loading, activeStep, onHoverStep }: AIOverviewFlowProps) {
  const hasData = trace && (trace.fanout || trace.retrieval || trace.synthesis);

  if (!loading && !hasData) return null;

  if (loading && !hasData) {
    return (
      <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg)] mb-2">
        <div className="px-3 py-1.5 border-b border-[var(--border)]">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">AI Overview Pipeline</span>
        </div>
        <div className="p-2 space-y-1.5">
          <div className="h-3 bg-[var(--border)] rounded animate-pulse w-3/4" />
          <div className="h-3 bg-[var(--border)] rounded animate-pulse w-1/2" />
        </div>
      </div>
    );
  }

  if (!hasData) return null;

  const allSteps: { id: ActiveStep; label: string; color: string; time: number | null; summary: string; show: boolean }[] = [
    { id: "ai_fanout" as ActiveStep, label: "Fan-out", color: "bg-amber-500", time: trace?.fanout?.time_ms ?? null,
      summary: trace?.fanout ? `${trace.fanout.expanded.length} queries` : "", show: !!trace?.fanout },
    { id: "ai_retrieval" as ActiveStep, label: "Hybrid Retrieval", color: "bg-purple-500", time: trace?.retrieval?.time_ms ?? null,
      summary: trace?.retrieval ? `${trace.retrieval.chunks_retrieved} chunks (vector + keyword)` : "", show: !!trace?.retrieval },
    { id: "ai_synthesis" as ActiveStep, label: "LLM Synthesis", color: "bg-emerald-500", time: trace?.synthesis?.time_ms ?? null,
      summary: trace?.synthesis ? trace.synthesis.model : "generating...", show: !!trace?.synthesis || loading },
  ];
  const steps = allSteps.filter((s) => s.show);

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg)] mb-2">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)]">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">AI Overview Pipeline</span>
        {trace?.total_ms && <span className="text-[10px] text-gray-700">{trace.total_ms}ms</span>}
      </div>
      <div className="p-2">
        {steps.map((step, i) => {
          const isActive = activeStep === step.id;
          return (
            <div
              key={step.id}
              className={`flex gap-2 py-1.5 px-1.5 rounded cursor-pointer transition-colors ${isActive ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"}`}
              onMouseEnter={() => onHoverStep(step.id)}
              onMouseLeave={() => onHoverStep(null)}
            >
              <div className="flex flex-col items-center shrink-0 w-4">
                <div className={`w-2.5 h-2.5 rounded-full ${step.color} ${isActive ? "ring-2 ring-white/10" : ""} ${!step.time && loading ? "animate-pulse" : ""}`} />
                {i < steps.length - 1 && <div className="w-px flex-1 bg-[var(--border)] mt-0.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-gray-300">{step.label}</span>
                  {step.time !== null && (
                    <span className={`text-[9px] ${step.time < 5 ? "text-emerald-600" : step.time < 50 ? "text-yellow-600" : "text-rose-600"}`}>
                      {step.time.toFixed(0)}ms
                    </span>
                  )}
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

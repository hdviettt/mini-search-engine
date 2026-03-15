"use client";

import { useState } from "react";

interface PipelineStepProps {
  index: number;
  name: string;
  timeMs: number;
  summary: string;
  children: React.ReactNode;
}

export default function PipelineStep({ index, name, timeMs, summary, children }: PipelineStepProps) {
  const [expanded, setExpanded] = useState(false);

  const timeColor = timeMs < 5 ? "text-emerald-500" : timeMs < 50 ? "text-yellow-500" : "text-rose-500";
  const barColor = timeMs < 5 ? "bg-emerald-500" : timeMs < 50 ? "bg-yellow-500" : "bg-rose-500";

  return (
    <div className="relative pl-6 pb-4">
      {/* Vertical connector line */}
      <div className="absolute left-[9px] top-0 bottom-0 w-px bg-[#2a2a4a]" />

      {/* Step dot */}
      <div className={`absolute left-[4px] top-1 w-3 h-3 rounded-full border-2 border-[#0a0a1a] ${barColor}`} />

      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{index}.</span>
          <span className="text-sm font-medium text-gray-300 group-hover:text-gray-200">{name}</span>
          <span className={`text-xs ${timeColor} ml-auto`}>{timeMs.toFixed(1)}ms</span>
          <span className="text-xs text-gray-600">{expanded ? "−" : "+"}</span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5">{summary}</div>
      </button>

      {expanded && (
        <div className="mt-2 pl-4 border-l border-[#2a2a4a] text-xs text-gray-400 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
}

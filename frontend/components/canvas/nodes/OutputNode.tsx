"use client";

import { Handle, Position } from "@xyflow/react";
import NodeIcon from "../NodeIcon";
import type { OutputNodeData } from "../types";

export default function OutputNode({ data }: { data: OutputNodeData }) {
  const isResults = data.type === "results";
  const isCompleted = data.state === "completed";
  const isActive = data.state === "active";

  return (
    <div className={`w-[220px] p-3 cursor-pointer transition-colors
      ${isActive ? "bg-[#e88a1a]/5 border-2 border-[#e88a1a]/40" :
        isCompleted ? "bg-[#111] border border-[#e88a1a]/20" :
        "bg-[#111] border border-[#222] hover:border-[#333]"}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#333] !border-[#111] !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-1.5">
        <NodeIcon icon={isResults ? "results" : "ai_overview"} color="amber" />
        <span className="text-[11px] font-medium text-[#ccc]">{data.label}</span>
      </div>

      {data.state === "idle" && (
        <p className="text-[10px] text-[#444]">
          {isResults ? "Search to see ranked results" : "AI-generated summary with citations"}
        </p>
      )}

      {isResults && data.content && (
        <div className="space-y-1">
          {(data.content as { title: string; score: number }[]).slice(0, 4).map((r, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px]">
              <span className="text-[#555]">#{i + 1}</span>
              <span className="text-[#888] truncate flex-1">{r.title.replace(" - Wikipedia", "")}</span>
              <span className="text-[#e88a1a]/60 font-mono">{r.score.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {!isResults && data.content && (
        <p className="text-[10px] text-[#888] leading-relaxed line-clamp-3">
          {data.content as string}
        </p>
      )}
    </div>
  );
}

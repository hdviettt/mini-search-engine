"use client";

import { Handle, Position } from "@xyflow/react";
import NodeIcon from "../NodeIcon";
import type { OutputNodeData } from "../types";

// Output nodes use a double border (flowchart "terminator" style)
export default function OutputNode({ data }: { data: OutputNodeData }) {
  const isResults = data.type === "results";
  const isCompleted = data.state === "completed";
  const isActive = data.state === "active";

  return (
    <div className={`w-[210px] p-3 cursor-pointer transition-colors
      border-2 ${
        isActive ? "bg-[#e88a1a]/5 border-[#e88a1a]/50" :
        isCompleted ? "bg-[#111] border-[#e88a1a]/30" :
        "bg-[#111] border-[#333] hover:border-[#444]"
      }`}
      style={{ outline: isCompleted || isActive ? "2px solid rgba(232,138,26,0.1)" : "2px solid #1a1a1a", outlineOffset: "3px" }}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#333] !border-[#111] !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-1.5">
        <NodeIcon icon={isResults ? "results" : "ai_overview"} color="amber" />
        <span className="text-[11px] font-medium text-[#ccc]">{data.label}</span>
      </div>

      {data.state === "idle" && (
        <p className="text-[9px] text-[#444]">
          {isResults ? "Search to see ranked results" : "AI-generated summary"}
        </p>
      )}

      {isResults && data.content != null ? (
        <div className="space-y-0.5">
          {(data.content as { title: string; score: number }[]).slice(0, 3).map((r, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[9px]">
              <span className="text-[#555]">#{i + 1}</span>
              <span className="text-[#888] truncate flex-1">{r.title.replace(" - Wikipedia", "")}</span>
              <span className="text-[#e88a1a]/60 font-mono">{r.score.toFixed(2)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {!isResults && data.content != null ? (
        <p className="text-[9px] text-[#888] leading-relaxed line-clamp-2">
          {String(data.content)}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { Handle, Position } from "@xyflow/react";
import NodeIcon from "../NodeIcon";
import type { PipelineNodeData } from "../types";

export default function PipelineNode({ data }: { data: PipelineNodeData }) {
  const isActive = data.state === "active";
  const isCompleted = data.state === "completed";
  const isQuery = data.icon === "query";

  // Query input node gets a distinct rhombus-like shape
  if (isQuery) {
    return (
      <div className={`relative cursor-pointer group`} style={{ width: 170, height: 60 }}>
        <Handle type="source" position={Position.Bottom} className="!bg-[#333] !border-[#111] !w-2 !h-2" />
        <svg viewBox="0 0 170 60" className="absolute inset-0 w-full h-full">
          <polygon
            points="20,0 150,0 170,30 150,60 20,60 0,30"
            fill={isCompleted ? "rgba(232,138,26,0.08)" : "#111"}
            stroke={isActive ? "#e88a1a" : isCompleted ? "rgba(232,138,26,0.4)" : "#333"}
            strokeWidth="1"
          />
        </svg>
        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          <span className="text-[11px] font-medium text-[#ccc]">{data.label}</span>
          {data.summary ? (
            <span className="text-[9px] text-[#999] font-mono">{data.summary}</span>
          ) : (
            <span className="text-[9px] text-[#444]">{data.description}</span>
          )}
        </div>
      </div>
    );
  }

  // Regular pipeline nodes get a colored left accent
  return (
    <div className={`flex w-[170px] cursor-pointer transition-colors
      ${isActive ? "bg-[#e88a1a]/5" : isCompleted ? "bg-[#111]" : "bg-[#111] hover:bg-[#141414]"}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#333] !border-[#111] !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-[#333] !border-[#111] !w-2 !h-2" />

      {/* Left accent bar */}
      <div className={`w-[3px] shrink-0 ${
        isActive ? "bg-[#e88a1a]" : isCompleted ? "bg-[#666]" : "bg-[#222]"
      }`} />

      {/* Content */}
      <div className={`flex-1 p-2.5 border-t border-r border-b ${
        isActive ? "border-[#e88a1a]/30" : isCompleted ? "border-[#333]" : "border-[#222]"
      }`}>
        <div className="flex items-center gap-2 mb-0.5">
          <NodeIcon icon={data.icon} color={data.color} />
          <span className="text-[11px] font-medium text-[#ccc]">{data.label}</span>
          {data.timeMs !== null && (
            <span className={`text-[9px] ml-auto font-mono ${isActive ? "text-[#e88a1a]" : "text-[#888]"}`}>
              {data.timeMs.toFixed(1)}ms
            </span>
          )}
        </div>
        {data.summary ? (
          <p className="text-[9px] text-[#888] leading-tight">{data.summary}</p>
        ) : (
          <p className="text-[9px] text-[#444] leading-tight">{data.description}</p>
        )}
      </div>
    </div>
  );
}

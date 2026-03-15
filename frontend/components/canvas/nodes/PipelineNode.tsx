"use client";

import { Handle, Position } from "@xyflow/react";
import NodeIcon from "../NodeIcon";
import type { PipelineNodeData } from "../types";

export default function PipelineNode({ data }: { data: PipelineNodeData }) {
  const isActive = data.state === "active";
  const isCompleted = data.state === "completed";

  return (
    <div className={`w-[175px] p-3 cursor-pointer transition-colors
      ${isActive ? "bg-[#e88a1a]/5 border-2 border-[#e88a1a]/50" :
        isCompleted ? "bg-[#111] border border-[#e88a1a]/30" :
        "bg-[#111] border border-[#222] hover:border-[#333]"}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#333] !border-[#111] !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-[#333] !border-[#111] !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-1">
        <NodeIcon icon={data.icon} color={data.color} />
        <span className="text-[11px] font-medium text-[#ccc]">{data.label}</span>
        {data.timeMs !== null && (
          <span className="text-[9px] ml-auto font-mono text-[#e88a1a]">
            {data.timeMs.toFixed(1)}ms
          </span>
        )}
      </div>

      {data.summary ? (
        <p className="text-[10px] text-[#888] leading-tight">{data.summary}</p>
      ) : (
        <p className="text-[10px] text-[#444] leading-tight">{data.description}</p>
      )}
    </div>
  );
}

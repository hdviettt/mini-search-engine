"use client";

import { Handle, Position } from "@xyflow/react";
import NodeIcon from "../NodeIcon";
import type { SystemNodeData } from "../types";

const dotColor: Record<string, string> = {
  idle: "bg-[#555]",
  running: "bg-[#e88a1a] animate-pulse",
  ready: "bg-emerald-500",
};

export default function SystemNode({ data }: { data: SystemNodeData }) {
  return (
    <div className="w-[190px] bg-[#111] border border-[#222] p-3 cursor-pointer transition-colors hover:border-[#e88a1a]/40 group">
      <Handle type="target" position={Position.Top} className="!bg-[#333] !border-[#111] !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-[#333] !border-[#111] !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-1.5">
        <NodeIcon icon={data.icon} color={data.color} />
        <span className="text-xs font-medium text-[#ccc]">{data.label}</span>
        <div className={`w-1.5 h-1.5 ml-auto ${dotColor[data.status]}`} />
      </div>

      <p className="text-[10px] text-[#555] leading-tight mb-2">{data.description}</p>

      {data.stats.length > 0 && (
        <div className="space-y-0.5 border-t border-[#222] pt-1.5 mt-1.5">
          {data.stats.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-[10px]">
              <span className="text-[#555]">{s.label}</span>
              <span className="text-[#888] font-mono">{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

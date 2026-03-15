"use client";

import { Handle, Position } from "@xyflow/react";
import NodeIcon from "../NodeIcon";
import type { StoreNodeData } from "../types";

export default function StoreNode({ data }: { data: StoreNodeData }) {
  return (
    <div className={`w-[170px] p-3 cursor-pointer transition-colors border ${
      data.reading
        ? "bg-[#e88a1a]/5 border-[#e88a1a]/40 border-dashed"
        : "bg-[#0d0d0d] border-[#333] border-dashed hover:border-[#e88a1a]/30"
    }`}>
      <Handle type="target" position={Position.Top} className="!bg-[#333] !border-[#111] !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-[#333] !border-[#111] !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-1.5">
        <NodeIcon icon={data.icon} color={data.color} />
        <span className="text-[11px] font-medium text-[#aaa]">{data.label}</span>
      </div>

      <p className="text-[10px] text-[#555] leading-tight mb-1.5">{data.description}</p>

      {data.stats.length > 0 && (
        <div className="space-y-0.5 border-t border-dashed border-[#222] pt-1.5">
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

"use client";

import { Handle, Position } from "@xyflow/react";
import type { StoreNodeData } from "../types";

// Database cylinder shape using SVG
export default function StoreNode({ data }: { data: StoreNodeData }) {
  const active = data.reading;

  return (
    <div className="relative cursor-pointer group" style={{ width: 160, height: 100 }}>
      <Handle type="target" position={Position.Top} className="!bg-[#333] !border-[#111] !w-2 !h-2" style={{ top: -4 }} />
      <Handle type="source" position={Position.Bottom} className="!bg-[#333] !border-[#111] !w-2 !h-2" style={{ bottom: -4 }} />

      {/* Cylinder SVG */}
      <svg viewBox="0 0 160 100" className="absolute inset-0 w-full h-full">
        {/* Body */}
        <path
          d="M 10 20 L 10 75 Q 10 90 80 90 Q 150 90 150 75 L 150 20"
          fill={active ? "rgba(232,138,26,0.06)" : "#111"}
          stroke={active ? "#e88a1a" : "#333"}
          strokeWidth="1"
          strokeDasharray={active ? "none" : "4,3"}
        />
        {/* Top ellipse */}
        <ellipse
          cx="80" cy="20" rx="70" ry="14"
          fill={active ? "rgba(232,138,26,0.08)" : "#161616"}
          stroke={active ? "#e88a1a" : "#333"}
          strokeWidth="1"
          strokeDasharray={active ? "none" : "4,3"}
        />
      </svg>

      {/* Content overlay */}
      <div className="relative z-10 px-5 pt-6 pb-2 text-center">
        <div className="text-[11px] font-medium text-[#aaa] mb-0.5">{data.label}</div>
        <div className="text-[9px] text-[#555]">{data.description}</div>
        {data.stats.length > 0 && (
          <div className="mt-1 space-y-0">
            {data.stats.map((s, i) => (
              <div key={i} className="text-[9px] text-[#666] font-mono">
                {s.label}: {s.value}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { Handle, Position } from "@xyflow/react";
import type { StoreNodeData } from "../types";

export default function StoreNode({ data }: { data: StoreNodeData }) {
  const active = data.reading;

  return (
    <div className="relative cursor-pointer group" style={{ width: 160, height: 100 }}>
      <Handle type="target" position={Position.Top} className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2" style={{ top: -4 }} />
      <Handle type="source" position={Position.Bottom} className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2" style={{ bottom: -4 }} />

      <svg viewBox="0 0 160 100" className="absolute inset-0 w-full h-full">
        <path
          d="M 10 20 L 10 75 Q 10 90 80 90 Q 150 90 150 75 L 150 20"
          fill={active ? "var(--store-fill-active)" : "var(--store-fill)"}
          stroke={active ? "var(--accent)" : "var(--cylinder-stroke)"}
          strokeWidth="1"
          strokeDasharray={active ? "none" : "4,3"}
        />
        <ellipse
          cx="80" cy="20" rx="70" ry="14"
          fill={active ? "var(--store-top-active)" : "var(--store-top)"}
          stroke={active ? "var(--accent)" : "var(--cylinder-stroke)"}
          strokeWidth="1"
          strokeDasharray={active ? "none" : "4,3"}
        />
      </svg>

      <div className="relative z-10 px-5 pt-6 pb-2 text-center">
        <div className="text-[11px] font-medium text-[var(--text-muted)] mb-0.5">{data.label}</div>
        <div className="text-[9px] text-[var(--text-dim)]">{data.description}</div>
        {data.stats.length > 0 && (
          <div className="mt-1 space-y-0">
            {data.stats.map((s, i) => (
              <div key={i} className="text-[9px] text-[var(--text-muted)] font-mono">
                {s.label}: {s.value}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

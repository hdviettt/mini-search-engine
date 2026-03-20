"use client";

import { Handle, Position } from "@xyflow/react";
import type { StoreNodeData } from "../types";

export default function StoreNode({ data }: { data: StoreNodeData }) {
  const active = data.active;

  return (
    <div className="relative cursor-pointer group" style={{ width: 160, height: 100 }}>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2"
        style={{ top: -4 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2"
        style={{ bottom: -4 }}
      />

      <svg
        viewBox="0 0 160 100"
        className="absolute inset-0 w-full h-full transition-[filter] duration-300"
        style={active ? { filter: "drop-shadow(0 0 8px var(--accent))" } : undefined}
      >
        <path
          d="M 10 20 L 10 75 Q 10 90 80 90 Q 150 90 150 75 L 150 20"
          fill={active ? "var(--store-fill-active)" : "var(--store-fill)"}
          stroke="var(--cylinder-stroke)"
          strokeWidth="1"
          strokeDasharray="4,3"
          className="transition-[fill] duration-300"
        />
        <ellipse
          cx="80"
          cy="20"
          rx="70"
          ry="14"
          fill={active ? "var(--store-top-active)" : "var(--store-top)"}
          stroke="var(--cylinder-stroke)"
          strokeWidth="1"
          strokeDasharray="4,3"
          className="transition-[fill] duration-300"
        />
      </svg>

      <div className="relative z-10 px-5 pt-5 pb-2 text-center">
        <div className="flex items-center justify-center gap-1.5 mb-0.5">
          <span className="text-[12px] font-medium text-[var(--text-muted)]">{data.label}</span>
          <div
            className={`w-1.5 h-1.5 ${active ? "bg-[var(--accent)] animate-pulse" : "bg-[var(--text-dim)]"}`}
          />
        </div>
        <div className="text-[10px] text-[var(--text-dim)]">{data.description}</div>
        {data.stats.length > 0 && (
          <div className="mt-1 space-y-0">
            {data.stats.map((s, i) => (
              <div key={i} className="text-[10px] text-[var(--text-muted)] font-mono">
                {s.label}: {s.value}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

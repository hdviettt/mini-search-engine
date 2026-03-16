"use client";

import { Handle, Position } from "@xyflow/react";
import NodeIcon from "../NodeIcon";
import type { SystemNodeData } from "../types";

const dotColor: Record<string, string> = {
  idle: "bg-[var(--text-dim)]",
  running: "bg-[var(--accent)] animate-pulse",
  ready: "bg-emerald-500",
};

export default function SystemNode({ data }: { data: SystemNodeData }) {
  const isRunning = data.status === "running";
  const pct = data.progress ? Math.round((data.progress.done / Math.max(data.progress.total, 1)) * 100) : 0;

  return (
    <div className={`w-[190px] bg-[var(--bg-card)] border p-3 cursor-pointer transition-colors group ${
      isRunning ? "border-[var(--accent)]" : "border-[var(--border)] hover:border-[var(--accent)]/40"
    }`}>
      <Handle type="target" position={Position.Top} className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-1.5">
        <NodeIcon icon={data.icon} color={data.color} />
        <span className="text-xs font-medium text-[var(--text)]">{data.label}</span>
        <div className={`w-1.5 h-1.5 ml-auto ${dotColor[data.status]}`} />
      </div>

      <p className="text-[10px] text-[var(--text-dim)] leading-tight mb-2">{data.description}</p>

      {/* Progress bar when running */}
      {isRunning && data.progress && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-[9px] mb-0.5">
            <span className="text-[var(--accent)] font-mono">{data.progress.done}/{data.progress.total}</span>
            <span className="text-[var(--text-dim)]">{pct}%</span>
          </div>
          <div className="w-full h-1.5 bg-[var(--score-bar-bg)]">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          {data.progress.label && (
            <div className="text-[8px] text-[var(--text-dim)] mt-0.5 truncate">{data.progress.label}</div>
          )}
        </div>
      )}

      {data.stats.length > 0 && (
        <div className="space-y-0.5 border-t border-[var(--border)] pt-1.5 mt-1.5">
          {data.stats.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-[10px]">
              <span className="text-[var(--text-dim)]">{s.label}</span>
              <span className="text-[var(--text-muted)] font-mono">{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

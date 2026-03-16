"use client";

import { Handle, Position } from "@xyflow/react";
import NodeIcon from "../NodeIcon";
import type { SystemNodeData } from "../types";

export default function SystemNode({ data }: { data: SystemNodeData }) {
  const isRunning = data.status === "running";
  const pct = data.progress ? Math.round((data.progress.done / Math.max(data.progress.total, 1)) * 100) : 0;

  return (
    <div className="flex w-[170px] cursor-pointer bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] transition-colors">
      <Handle type="target" position={Position.Top} className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2" />

      <div className="w-[3px] shrink-0 bg-[var(--border)]" />

      <div className="flex-1 p-2.5 border-t border-r border-b border-[var(--border)]">
        <div className="flex items-center gap-2 mb-0.5">
          <NodeIcon icon={data.icon} color={data.color} />
          <span className="text-[11px] font-medium text-[var(--text)]">{data.label}</span>
          <div className={`w-1.5 h-1.5 ml-auto ${
            isRunning ? "bg-[var(--accent)] animate-pulse" :
            data.status === "ready" ? "bg-emerald-500" : "bg-[var(--text-dim)]"
          }`} />
        </div>

        <p className="text-[9px] text-[var(--text-dim)] leading-tight">{data.description}</p>

        {/* Progress bar when running */}
        {isRunning && data.progress && (
          <div className="mt-1.5">
            <div className="flex items-center justify-between text-[9px] mb-0.5">
              <span className="text-[var(--accent)] font-mono">{data.progress.done}/{data.progress.total}</span>
              <span className="text-[var(--text-dim)]">{pct}%</span>
            </div>
            <div className="w-full h-1 bg-[var(--score-bar-bg)]">
              <div className="h-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            {data.progress.label && (
              <div className="text-[8px] text-[var(--text-dim)] mt-0.5 truncate">{data.progress.label}</div>
            )}
          </div>
        )}

        {data.stats.length > 0 && (
          <div className="space-y-0.5 border-t border-[var(--border)] pt-1 mt-1.5">
            {data.stats.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--text-dim)]">{s.label}</span>
                <span className="text-[var(--text-muted)] font-mono">{s.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

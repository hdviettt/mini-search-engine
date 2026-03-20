"use client";

import { Handle, Position } from "@xyflow/react";
import NodeIcon from "../NodeIcon";
import type { PipelineNodeData } from "../types";

const stateDot: Record<string, string> = {
  idle: "bg-[var(--text-dim)]",
  active: "bg-[var(--accent)] animate-pulse",
  completed: "bg-emerald-500",
};

export default function PipelineNode({ data }: { data: PipelineNodeData }) {
  const isActive = data.state === "active";
  const isQuery = data.icon === "query";

  if (isQuery) {
    return (
      <div className="relative cursor-pointer group" style={{ width: 170, height: 60 }}>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2"
        />
        <svg viewBox="0 0 170 60" className="absolute inset-0 w-full h-full">
          <polygon
            points="20,0 150,0 170,30 150,60 20,60 0,30"
            fill="var(--bg-card)"
            stroke={isActive ? "var(--accent)" : "var(--border-hover)"}
            strokeWidth={isActive ? "2" : "1"}
          />
        </svg>
        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          <span className="text-[12px] font-medium text-[var(--text)]">{data.label}</span>
          {data.summary ? (
            <span className="text-[10px] text-[var(--text-muted)] font-mono truncate max-w-[140px]">
              {data.summary}
            </span>
          ) : (
            <span className="text-[10px] text-[var(--text-dim)]">{data.description}</span>
          )}
        </div>
      </div>
    );
  }

  // Path-based accent color
  const isAI = data.path === "ai";
  const accentGradient =
    isActive && isAI
      ? "bg-gradient-to-r from-violet-500/[0.02] to-transparent"
      : isActive
        ? "bg-gradient-to-r from-amber-500/[0.02] to-transparent"
        : "";

  return (
    <div
      className={`flex w-[170px] cursor-pointer bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] transition-colors ${accentGradient}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2"
      />

      {/* Double-line left border */}
      <div className="flex shrink-0 gap-[2px]">
        <div className="w-[1.5px] bg-[var(--border-hover)]" />
        <div className="w-[1.5px] bg-[var(--border-hover)]" />
      </div>

      <div className="flex-1 p-2.5 border-t border-r border-b border-[var(--border)]">
        <div className="flex items-center gap-2 mb-0.5">
          <NodeIcon icon={data.icon} color={data.color} />
          <span className="text-[12px] font-medium text-[var(--text)]">{data.label}</span>
          <div className={`w-1.5 h-1.5 ml-auto ${stateDot[data.state] || stateDot.idle}`} />
        </div>
        {data.timeMs != null && (
          <span className="text-[10px] font-mono text-[var(--text-muted)]">
            {data.timeMs.toFixed(1)}ms
          </span>
        )}
        {data.summary ? (
          <p className="text-[10px] text-[var(--text-muted)] leading-tight">{data.summary}</p>
        ) : (
          <p className="text-[10px] text-[var(--text-dim)] leading-tight">{data.description}</p>
        )}
      </div>
    </div>
  );
}

"use client";

import { Handle, Position } from "@xyflow/react";
import NodeIcon from "../NodeIcon";
import type { PipelineNodeData } from "../types";

export default function PipelineNode({ data }: { data: PipelineNodeData }) {
  const isActive = data.state === "active";
  const isCompleted = data.state === "completed";
  const isQuery = data.icon === "query";

  if (isQuery) {
    return (
      <div className="relative cursor-pointer group" style={{ width: 170, height: 60 }}>
        <Handle type="source" position={Position.Bottom} className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2" />
        <svg viewBox="0 0 170 60" className="absolute inset-0 w-full h-full">
          <polygon
            points="20,0 150,0 170,30 150,60 20,60 0,30"
            fill={isCompleted ? "var(--accent-muted)" : "var(--bg-card)"}
            stroke={isActive ? "var(--accent)" : isCompleted ? "var(--accent)" : "var(--border-hover)"}
            strokeWidth="1"
            strokeOpacity={isCompleted ? 0.4 : 1}
          />
        </svg>
        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          <span className="text-[11px] font-medium text-[var(--text)]">{data.label}</span>
          {data.summary ? (
            <span className="text-[9px] text-[var(--text-muted)] font-mono">{data.summary}</span>
          ) : (
            <span className="text-[9px] text-[var(--text-dim)]">{data.description}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex w-[170px] cursor-pointer transition-colors
      ${isActive ? "bg-[var(--accent-muted)]" : isCompleted ? "bg-[var(--bg-card)]" : "bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)]"}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2" />

      <div className={`w-[3px] shrink-0 ${
        isActive ? "bg-[var(--accent)]" : isCompleted ? "bg-[var(--text-muted)]" : "bg-[var(--border)]"
      }`} />

      <div className={`flex-1 p-2.5 border-t border-r border-b ${
        isActive ? "border-[var(--accent)]/30" : isCompleted ? "border-[var(--border-hover)]" : "border-[var(--border)]"
      }`}>
        <div className="flex items-center gap-2 mb-0.5">
          <NodeIcon icon={data.icon} color={data.color} />
          <span className="text-[11px] font-medium text-[var(--text)]">{data.label}</span>
          {data.timeMs !== null && (
            <span className={`text-[9px] ml-auto font-mono ${isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
              {data.timeMs.toFixed(1)}ms
            </span>
          )}
        </div>
        {data.summary ? (
          <p className="text-[9px] text-[var(--text-muted)] leading-tight">{data.summary}</p>
        ) : (
          <p className="text-[9px] text-[var(--text-dim)] leading-tight">{data.description}</p>
        )}
      </div>
    </div>
  );
}

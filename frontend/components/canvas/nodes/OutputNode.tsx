"use client";

import { Handle, Position } from "@xyflow/react";
import NodeIcon from "../NodeIcon";
import type { OutputNodeData } from "../types";

export default function OutputNode({ data }: { data: OutputNodeData }) {
  const isResults = data.type === "results";
  const isCompleted = data.state === "completed";
  const isActive = data.state === "active";

  return (
    <div className={`w-[210px] p-3 cursor-pointer transition-colors
      border-2 ${
        isActive ? "bg-[var(--accent-muted)] border-[var(--accent)]/50" :
        isCompleted ? "bg-[var(--accent-muted)] border-[var(--accent)]/30" :
        "bg-[var(--bg-card)] border-[var(--border-hover)] hover:border-[var(--text-dim)]"
      }`}
      style={{ outline: isActive ? "2px solid var(--node-glow)" : isCompleted ? "2px solid var(--node-glow)" : `2px solid var(--border)`, outlineOffset: "3px" }}
    >
      <Handle type="target" position={Position.Top} className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-1.5">
        <NodeIcon icon={isResults ? "results" : "ai_overview"} color="amber" />
        <span className="text-[11px] font-medium text-[var(--text)]">{data.label}</span>
      </div>

      {data.state === "idle" && (
        <p className="text-[9px] text-[var(--text-dim)]">
          {isResults ? "Search to see ranked results" : "AI-generated summary"}
        </p>
      )}

      {isResults && Array.isArray(data.content) ? (
        <div className="space-y-0.5">
          {(data.content as { title: string; score: number }[]).slice(0, 3).map((r, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[9px]">
              <span className="text-[var(--text-dim)]">#{i + 1}</span>
              <span className="text-[var(--text-muted)] truncate flex-1">{(r.title || "").replace(" - Wikipedia", "")}</span>
              <span className="text-[var(--accent)] opacity-60 font-mono">{(r.score ?? 0).toFixed(2)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {!isResults && data.content != null ? (
        <p className="text-[9px] text-[var(--text-muted)] leading-relaxed line-clamp-2">
          {String(data.content)}
        </p>
      ) : null}
    </div>
  );
}

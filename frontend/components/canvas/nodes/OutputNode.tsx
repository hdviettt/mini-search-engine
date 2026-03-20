"use client";

import { Handle, Position } from "@xyflow/react";
import NodeIcon from "../NodeIcon";
import type { OutputNodeData } from "../types";

const stateDot: Record<string, string> = {
  idle: "bg-[var(--text-dim)]",
  active: "bg-[var(--accent)] animate-pulse",
  completed: "bg-emerald-500",
};

export default function OutputNode({ data }: { data: OutputNodeData }) {
  const isResults = data.type === "results";
  const isActive = data.state === "active";
  const accentColor = data.color === "violet" ? "var(--color-ai)" : "var(--color-search)";

  return (
    <div
      className="w-[240px] cursor-pointer bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--text-dim)] transition-colors relative"
      style={{ borderTopWidth: 3, borderTopColor: accentColor }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-[var(--border-hover)] !border-[var(--bg-card)] !w-2 !h-2"
      />

      {/* Scan-line effect when active */}
      {isActive && (
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            background:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, var(--text) 2px, var(--text) 3px)",
          }}
        />
      )}

      <div className="p-3 relative">
        <div className="flex items-center gap-2 mb-1.5">
          <NodeIcon icon={isResults ? "results" : "ai_overview"} color={data.color} />
          <span className="text-[12px] font-medium text-[var(--text)]">{data.label}</span>
          <div className={`w-1.5 h-1.5 ml-auto ${stateDot[data.state] || stateDot.idle}`} />
        </div>

        {data.state === "idle" && (
          <p className="text-[10px] text-[var(--text-dim)]">
            {isResults ? "Search to see ranked results" : "AI-generated summary"}
          </p>
        )}

        {isResults && Array.isArray(data.content) ? (
          <div className="space-y-0.5">
            {(data.content as { title: string; score: number }[]).slice(0, 3).map((r, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px]">
                <span className="text-[var(--text-dim)]">#{i + 1}</span>
                <span className="text-[var(--text-muted)] truncate flex-1">
                  {(r.title || "").replace(" - Wikipedia", "")}
                </span>
                <span className="text-[var(--accent)] opacity-60 font-mono">
                  {(r.score ?? 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {!isResults && data.content != null ? (
          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed line-clamp-2">
            {String(data.content)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

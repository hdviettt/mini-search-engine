"use client";

import { useState } from "react";
import { OverviewSource } from "@/lib/api";

interface AIOverviewProps {
  overview: string | null;
  sources: OverviewSource[];
  loading: boolean;
}

function parseOverviewWithCitations(text: string) {
  // Split text on citation patterns like [1], [2], [1][2], etc.
  const parts: { type: "text" | "citation"; value: string; index?: number }[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Text before this citation
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "citation", value: match[0], index: parseInt(match[1]) });
    lastIndex = regex.lastIndex;
  }
  // Remaining text
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts;
}

export default function AIOverview({ overview, sources, loading }: AIOverviewProps) {
  const [activeSource, setActiveSource] = useState<number | null>(null);

  if (!loading && !overview) return null;

  const parts = overview ? parseOverviewWithCitations(overview) : [];
  const activeSrc = sources.find((s) => s.index === activeSource);

  return (
    <div className="mb-6 bg-gradient-to-br from-[#111138] to-[#0f1028] border border-[#2a2a5a] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4 pb-2">
        <div className="w-2 h-2 rounded-full bg-rose-500" />
        <span className="text-xs font-semibold text-rose-400 uppercase tracking-widest">
          AI Overview
        </span>
        {loading && (
          <span className="text-xs text-gray-500 ml-2 animate-pulse">Generating...</span>
        )}
      </div>

      {loading && !overview ? (
        <div className="px-5 pb-5 space-y-2">
          <div className="h-4 bg-[#1a1a3a] rounded animate-pulse w-full" />
          <div className="h-4 bg-[#1a1a3a] rounded animate-pulse w-4/5" />
          <div className="h-4 bg-[#1a1a3a] rounded animate-pulse w-3/5" />
        </div>
      ) : (
        <div className="flex">
          {/* Overview text */}
          <div className="flex-1 px-5 pb-5">
            <p className="text-gray-300 leading-relaxed text-[15px]">
              {parts.map((part, i) =>
                part.type === "text" ? (
                  <span key={i}>{part.value}</span>
                ) : (
                  <button
                    key={i}
                    onClick={() => setActiveSource(activeSource === part.index ? null : part.index!)}
                    className={`inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full mx-0.5 transition-colors cursor-pointer ${
                      activeSource === part.index
                        ? "bg-rose-500 text-white"
                        : "bg-[#1a1a4a] text-rose-400 hover:bg-rose-500/20"
                    }`}
                  >
                    {part.index}
                  </button>
                )
              )}
            </p>
          </div>

          {/* Source panel — shows on the right when a citation is clicked */}
          {sources.length > 0 && (
            <div className="w-52 shrink-0 border-l border-[#2a2a4a] px-3 py-1">
              {activeSrc ? (
                <a
                  href={activeSrc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <div className="text-[10px] text-gray-600 mb-1">Source {activeSrc.index}</div>
                  <div className="text-sm text-rose-400 group-hover:underline leading-tight mb-1">
                    {activeSrc.title.replace(" - Wikipedia", "")}
                  </div>
                  <div className="text-[11px] text-gray-600 truncate">{activeSrc.url}</div>
                </a>
              ) : (
                <div className="space-y-2">
                  <div className="text-[10px] text-gray-600 mb-2">Sources</div>
                  {sources.map((s) => (
                    <button
                      key={s.index}
                      onClick={() => setActiveSource(s.index)}
                      className="flex items-center gap-2 w-full text-left group cursor-pointer"
                    >
                      <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-[#1a1a4a] text-rose-400 shrink-0">
                        {s.index}
                      </span>
                      <span className="text-xs text-gray-500 group-hover:text-gray-300 truncate transition-colors">
                        {s.title.replace(" - Wikipedia", "").slice(0, 25)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

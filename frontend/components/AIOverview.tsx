"use client";

import { useState } from "react";
import { OverviewSource } from "@/lib/api";

interface AIOverviewProps {
  text: string;
  sources: OverviewSource[];
  loading: boolean;
  streaming: boolean;
}

function parseOverviewWithCitations(text: string) {
  const parts: { type: "text" | "citation"; value: string; index?: number }[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "citation", value: match[0], index: parseInt(match[1]) });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts;
}

export default function AIOverview({ text, sources, loading, streaming }: AIOverviewProps) {
  const [activeSource, setActiveSource] = useState<number | null>(null);

  if (!loading && !streaming && !text) return null;

  const parts = text ? parseOverviewWithCitations(text) : [];
  const activeSrc = sources.find((s) => s.index === activeSource);

  return (
    <div className="mb-4 bg-[#111] border border-[#222] overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
        <div className="w-1.5 h-1.5 bg-[#e88a1a]" />
        <span className="text-[10px] font-medium text-[#888] uppercase tracking-widest">
          AI Overview
        </span>
        {(loading || streaming) && !text && (
          <span className="text-[10px] text-[#555] ml-1 animate-pulse">generating...</span>
        )}
      </div>

      {loading && !text ? (
        <div className="px-4 pb-4 space-y-2.5">
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-[#1a1a1a] animate-pulse w-full" />
              <div className="h-3 bg-[#1a1a1a] animate-pulse w-[92%]" />
              <div className="h-3 bg-[#1a1a1a] animate-pulse w-[78%]" />
              <div className="h-3 bg-[#1a1a1a] animate-pulse w-[45%]" />
            </div>
            <div className="w-36 shrink-0 space-y-2 border-l border-[#222] pl-3">
              <div className="h-2.5 bg-[#1a1a1a] animate-pulse w-12" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-4 h-4 bg-[#1a1a1a] animate-pulse" />
                  <div className="h-2.5 bg-[#1a1a1a] animate-pulse flex-1" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex">
          <div className="flex-1 px-4 pb-4">
            <p className="text-[#ccc] leading-relaxed text-[13px]">
              {parts.map((part, i) =>
                part.type === "text" ? (
                  <span key={i}>{part.value}</span>
                ) : (
                  <button
                    key={i}
                    onClick={() => setActiveSource(activeSource === part.index ? null : part.index!)}
                    className={`inline-flex items-center justify-center w-5 h-5 text-[9px] font-bold mx-0.5 transition-colors cursor-pointer border ${
                      activeSource === part.index
                        ? "bg-[#e88a1a] text-[#0d0d0d] border-[#e88a1a]"
                        : "bg-transparent text-[#e88a1a] border-[#e88a1a]/40 hover:border-[#e88a1a]"
                    }`}
                  >
                    {part.index}
                  </button>
                )
              )}
              {streaming && <span className="inline-block w-1.5 h-3.5 bg-[#e88a1a] animate-pulse ml-0.5 align-middle" />}
            </p>
          </div>

          {sources.length > 0 && (
            <div className="w-40 shrink-0 border-l border-[#222] px-3 py-1">
              {activeSrc ? (
                <a href={activeSrc.url} target="_blank" rel="noopener noreferrer" className="block group">
                  <div className="text-[10px] text-[#555] mb-1">Source {activeSrc.index}</div>
                  <div className="text-sm text-[#e88a1a] group-hover:underline leading-tight mb-1">
                    {activeSrc.title.replace(" - Wikipedia", "")}
                  </div>
                  <div className="text-[10px] text-[#444] truncate">{activeSrc.url}</div>
                </a>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-[10px] text-[#555] mb-1">Sources</div>
                  {sources.map((s) => (
                    <button
                      key={s.index}
                      onClick={() => setActiveSource(s.index)}
                      className="flex items-center gap-1.5 w-full text-left group cursor-pointer"
                    >
                      <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold bg-[#1a1a1a] text-[#e88a1a] border border-[#222] shrink-0">
                        {s.index}
                      </span>
                      <span className="text-[11px] text-[#555] group-hover:text-[#e88a1a] truncate transition-colors">
                        {s.title.replace(" - Wikipedia", "").slice(0, 22)}
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

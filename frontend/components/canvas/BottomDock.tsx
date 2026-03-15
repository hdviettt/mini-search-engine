"use client";

import { useState } from "react";
import AIOverview from "@/components/AIOverview";
import type { SearchResult } from "@/lib/types";
import type { OverviewSource } from "@/lib/api";

interface BottomDockProps {
  results: SearchResult[];
  totalResults: number;
  timeMs: number;
  overviewText: string;
  overviewSources: OverviewSource[];
  overviewLoading: boolean;
  overviewStreaming: boolean;
  visible: boolean;
  onToggle: () => void;
}

export default function BottomDock({
  results, totalResults, timeMs, overviewText, overviewSources,
  overviewLoading, overviewStreaming, visible, onToggle,
}: BottomDockProps) {
  const hasResults = results.length > 0;

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${visible ? "translate-y-0" : "translate-y-[calc(100%-36px)]"}`}>
      {/* Toggle bar */}
      <button
        onClick={onToggle}
        className="w-full bg-[#0d0d22] border-t border-[#1a1a3a] px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-[#111128] transition-colors"
      >
        <span className="text-[11px] font-medium text-gray-400">
          {hasResults ? `${totalResults} results in ${timeMs.toFixed(0)}ms` : "Results"}
        </span>
        <span className="text-[10px] text-gray-600 ml-auto">{visible ? "▼ Hide" : "▲ Show results"}</span>
      </button>

      {/* Dock content */}
      <div className="bg-[#08081a] border-t border-[#1a1a3a] max-h-[45vh] overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4">
          {/* AI Overview */}
          <AIOverview text={overviewText} sources={overviewSources} loading={overviewLoading} streaming={overviewStreaming} />

          {/* Results grid */}
          {results.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {results.map((r, i) => (
                <a
                  key={i}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 bg-[#0d0d22] border border-[#1a1a3a] rounded-lg hover:border-[#2a2a5a] transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-gray-600">#{i + 1}</span>
                    <span className="text-xs text-rose-400 group-hover:underline truncate">{r.title}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed">{r.snippet}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[9px] text-gray-700">
                    <span>BM25: {r.bm25_score}</span>
                    <span>PR: {r.pagerank_score}</span>
                    <span className="text-gray-500">= {r.final_score}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { SearchResult } from "@/lib/types";

interface ResultCardProps {
  result: SearchResult;
  rank: number;
  maxBm25: number;
  maxPr: number;
  isExpanded: boolean;
  onToggleJourney: () => void;
}

export default function ResultCard({ result, rank, maxBm25, maxPr, isExpanded, onToggleJourney }: ResultCardProps) {
  const bm25Pct = maxBm25 > 0 ? (result.bm25_score / maxBm25) * 100 : 0;
  const prPct = maxPr > 0 ? (result.pagerank_score / maxPr) * 100 : 0;

  return (
    <div className={`mb-2 p-4 bg-[#0f1028] border rounded-lg transition-colors ${isExpanded ? "border-rose-500/30" : "border-[#1a1a3a] hover:border-[#2a2a5a]"}`}>
      <div className="flex items-start gap-3">
        <span className="text-xs text-gray-600 mt-1 shrink-0">#{rank}</span>
        <div className="flex-1 min-w-0">
          <a href={result.url} target="_blank" rel="noopener noreferrer" className="block group">
            <div className="text-[11px] text-indigo-400/60 mb-0.5 truncate">{result.url}</div>
            <h3 className="text-[15px] font-medium text-rose-400 group-hover:underline mb-1">{result.title}</h3>
            <p className="text-sm text-gray-400 leading-relaxed line-clamp-2">{result.snippet}</p>
          </a>

          <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-600">
            <div className="flex items-center gap-1">
              <span>BM25</span>
              <div className="w-12 h-1 bg-[#1a1a2e] rounded-full overflow-hidden">
                <div className="h-full bg-rose-500/60 rounded-full" style={{ width: `${bm25Pct}%` }} />
              </div>
              <span className="text-gray-500">{result.bm25_score}</span>
            </div>
            <div className="flex items-center gap-1">
              <span>PR</span>
              <div className="w-12 h-1 bg-[#1a1a2e] rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500/60 rounded-full" style={{ width: `${prPct}%` }} />
              </div>
              <span className="text-gray-500">{result.pagerank_score}</span>
            </div>
            <span className="text-gray-500">= {result.final_score}</span>
            <button
              onClick={onToggleJourney}
              className={`ml-auto text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors ${
                isExpanded
                  ? "bg-rose-500/20 text-rose-400"
                  : "bg-[#1a1a3a] text-gray-500 hover:text-gray-300"
              }`}
            >
              {isExpanded ? "Hide journey" : "Show journey"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

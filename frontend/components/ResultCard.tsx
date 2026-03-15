"use client";

import { SearchResult } from "@/lib/types";

interface ResultCardProps {
  result: SearchResult;
  maxBm25: number;
  maxPr: number;
}

export default function ResultCard({ result, maxBm25, maxPr }: ResultCardProps) {
  const bm25Pct = maxBm25 > 0 ? (result.bm25_score / maxBm25) * 100 : 0;
  const prPct = maxPr > 0 ? (result.pagerank_score / maxPr) * 100 : 0;

  return (
    <div className="mb-4 p-4 bg-[#0f1028] border border-[#1a1a3a] rounded-lg hover:border-[#2a2a5a] transition-colors group">
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <div className="text-sm text-indigo-400/60 mb-1 truncate">
          {result.url}
        </div>
        <h3 className="text-[17px] font-medium text-rose-400 group-hover:underline mb-1.5">
          {result.title}
        </h3>
        <p className="text-sm text-gray-400 leading-relaxed">{result.snippet}</p>
      </a>

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-600">
        <div className="flex items-center gap-1.5">
          <span>BM25</span>
          <div className="w-16 h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden">
            <div className="h-full bg-rose-500/60 rounded-full" style={{ width: `${bm25Pct}%` }} />
          </div>
          <span className="text-gray-500 w-12">{result.bm25_score}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>PR</span>
          <div className="w-16 h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500/60 rounded-full" style={{ width: `${prPct}%` }} />
          </div>
          <span className="text-gray-500 w-16">{result.pagerank_score}</span>
        </div>
        <span className="text-gray-500 ml-auto">Score: {result.final_score}</span>
      </div>
    </div>
  );
}

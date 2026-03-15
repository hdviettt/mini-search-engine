"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PageJourneyData {
  page: {
    id: number; url: string; domain: string; title: string;
    text_preview: string; text_length: number; status_code: number; crawled_at: string | null;
  };
  tokenization: {
    doc_length: number;
    top_terms: { term: string; freq: number }[];
    sample_tokens: string[];
  };
  pagerank: {
    score: number;
    inlinks: { id: number; title: string }[];
    outlinks: { url: string; title: string }[];
  };
  chunks: { id: number; chunk_idx: number; content: string; has_embedding: boolean }[];
}

export default function PageJourney({ pageId, onClose }: { pageId: number; onClose: () => void }) {
  const [data, setData] = useState<PageJourneyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/explore/page/${pageId}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [pageId]);

  if (loading) {
    return (
      <div className="bg-[#0a0a18] border border-[#2a2a5a] rounded-xl p-6 mb-4 text-sm text-gray-500 text-center">
        Loading page journey...
      </div>
    );
  }

  if (!data || !data.page) return null;

  const p = data.page;
  const stages = [
    {
      color: "bg-emerald-500",
      label: "1. Crawled",
      content: (
        <div className="text-[11px] space-y-1">
          <div className="flex items-center gap-2">
            <span className={`px-1 rounded ${p.status_code === 200 ? "bg-emerald-900/40 text-emerald-400" : "bg-rose-900/40 text-rose-400"}`}>
              HTTP {p.status_code}
            </span>
            <span className="text-gray-500">{p.domain}</span>
            <span className="text-gray-600">{(p.text_length / 1000).toFixed(1)}K chars</span>
          </div>
          <div className="p-2 bg-[#050510] rounded text-gray-600 font-mono text-[10px] leading-relaxed max-h-16 overflow-hidden">
            {p.text_preview.slice(0, 200)}...
          </div>
        </div>
      ),
    },
    {
      color: "bg-blue-500",
      label: `2. Tokenized → ${data.tokenization.doc_length.toLocaleString()} tokens`,
      content: (
        <div className="text-[11px] space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {data.tokenization.sample_tokens.slice(0, 12).map((tok, i) => (
              <span key={i} className="px-1 py-0.5 bg-blue-500/10 text-blue-400 rounded text-[10px] font-mono">{tok}</span>
            ))}
            <span className="text-gray-600 text-[10px]">...</span>
          </div>
          <div className="text-[10px] text-gray-600">Top terms in this page:</div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-0.5">
            {data.tokenization.top_terms.slice(0, 9).map((t, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px]">
                <span className="font-mono text-blue-400">{t.term}</span>
                <span className="text-gray-700">×{t.freq}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      color: "bg-indigo-500",
      label: `3. PageRank: ${data.pagerank.score}`,
      content: (
        <div className="text-[11px] space-y-1.5">
          {data.pagerank.inlinks.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-600">Linked FROM ({data.pagerank.inlinks.length}):</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {data.pagerank.inlinks.slice(0, 5).map((l, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 rounded text-[10px]">
                    {l.title.replace(" - Wikipedia", "").slice(0, 25)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {data.pagerank.outlinks.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-600">Links TO ({data.pagerank.outlinks.length}):</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {data.pagerank.outlinks.slice(0, 5).map((l, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-[#1a1a3a] text-gray-500 rounded text-[10px]">
                    {(l.title || l.url).replace(" - Wikipedia", "").slice(0, 25)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      color: "bg-purple-500",
      label: `4. Chunked → ${data.chunks.length} chunks`,
      content: (
        <div className="text-[11px] space-y-1">
          {data.chunks.slice(0, 3).map((c) => (
            <div key={c.id} className="p-1.5 bg-[#050510] rounded border border-[#1a1a3a]">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-gray-600 text-[10px]">chunk {c.chunk_idx}</span>
                <span className={`text-[9px] px-1 rounded ${c.has_embedding ? "bg-purple-900/40 text-purple-400" : "bg-gray-800 text-gray-600"}`}>
                  {c.has_embedding ? "embedded" : "no vector"}
                </span>
              </div>
              <div className="text-[10px] text-gray-600 line-clamp-2">{c.content}</div>
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="bg-[#0a0a18] border border-[#2a2a5a] rounded-xl overflow-hidden mb-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a1a3a]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Page Journey</span>
          <span className="text-xs text-gray-400">{p.title.replace(" - Wikipedia", "")}</span>
        </div>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-sm cursor-pointer">&times;</button>
      </div>

      {/* Flow */}
      <div className="p-4">
        {stages.map((stage, i) => (
          <div key={i} className="flex gap-3 mb-3 last:mb-0">
            <div className="flex flex-col items-center shrink-0 w-6">
              <div className={`w-3 h-3 rounded-full ${stage.color} shrink-0`} />
              {i < stages.length - 1 && <div className="w-px flex-1 bg-[#2a2a4a] mt-1" />}
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <div className="text-xs font-medium text-gray-300 mb-1">{stage.label}</div>
              {stage.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

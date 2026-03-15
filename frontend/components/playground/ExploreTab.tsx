"use client";

import { useState, useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PageRow {
  id: number; url: string; domain: string; title: string;
  status_code: number; text_length: number; outlinks: number;
}

interface TermRow {
  term: string; doc_freq: number; total_freq: number;
}

interface PRRow {
  id: number; title: string; score: number; inlinks: number;
}

interface ChunkRow {
  id: number; page_id: number; chunk_idx: number;
  content: string; title: string; has_embedding: boolean;
}

type View = "pages" | "index" | "pagerank" | "chunks";

export default function ExploreTab() {
  const [view, setView] = useState<View>("pages");
  const [pages, setPages] = useState<PageRow[]>([]);
  const [pagesTotal, setPagesTotal] = useState(0);
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [termsTotal, setTermsTotal] = useState(0);
  const [prPages, setPrPages] = useState<PRRow[]>([]);
  const [chunks, setChunks] = useState<ChunkRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (v: View) => {
    setLoading(true);
    try {
      if (v === "pages") {
        const res = await fetch(`${API_BASE}/api/explore/pages?limit=15`);
        const data = await res.json();
        setPages(data.pages);
        setPagesTotal(data.total);
      } else if (v === "index") {
        const res = await fetch(`${API_BASE}/api/explore/index?limit=25`);
        const data = await res.json();
        setTerms(data.terms);
        setTermsTotal(data.total_terms);
      } else if (v === "pagerank") {
        const res = await fetch(`${API_BASE}/api/explore/pagerank?limit=15`);
        const data = await res.json();
        setPrPages(data.pages);
      } else if (v === "chunks") {
        const res = await fetch(`${API_BASE}/api/explore/chunks?limit=8`);
        const data = await res.json();
        setChunks(data.chunks);
      }
    } catch { /* */ }
    setLoading(false);
  };

  useEffect(() => { load(view); }, [view]);

  const views: { key: View; label: string }[] = [
    { key: "pages", label: "Pages" },
    { key: "index", label: "Index" },
    { key: "pagerank", label: "PageRank" },
    { key: "chunks", label: "Chunks" },
  ];

  return (
    <div className="p-3">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Explore Data</div>

      {/* Sub-nav */}
      <div className="flex gap-1 mb-3">
        {views.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`text-[11px] px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
              view === v.key
                ? "bg-rose-500/20 text-rose-400"
                : "bg-[#111128] text-gray-600 hover:text-gray-400"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-xs text-gray-600 text-center py-4">Loading...</div>}

      {/* Pages table */}
      {!loading && view === "pages" && (
        <div>
          <div className="text-[11px] text-gray-600 mb-2">{pagesTotal.toLocaleString()} pages in database</div>
          <div className="space-y-1.5">
            {pages.map((p) => (
              <div key={p.id} className="p-2 bg-[#0d0d20] rounded border border-[#1a1a3a] text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 w-6">#{p.id}</span>
                  <span className={`px-1 rounded text-[10px] ${p.status_code === 200 ? "bg-emerald-900/40 text-emerald-400" : "bg-rose-900/40 text-rose-400"}`}>
                    {p.status_code}
                  </span>
                  <span className="text-gray-400 truncate flex-1">{p.title?.replace(" - Wikipedia", "") || "Untitled"}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-gray-600">
                  <span className="text-indigo-400/60">{p.domain}</span>
                  <span>{(p.text_length / 1000).toFixed(1)}K chars</span>
                  <span>{p.outlinks} links</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Index — term frequency table */}
      {!loading && view === "index" && (
        <div>
          <div className="text-[11px] text-gray-600 mb-2">{termsTotal.toLocaleString()} unique terms</div>
          <div className="space-y-0.5">
            <div className="flex items-center text-[10px] text-gray-600 px-2 py-1">
              <span className="flex-1">Term</span>
              <span className="w-16 text-right">Docs</span>
              <span className="w-16 text-right">Total</span>
              <span className="w-24 text-right">Bar</span>
            </div>
            {terms.map((t) => {
              const maxDf = terms[0]?.doc_freq || 1;
              const pct = (t.doc_freq / maxDf) * 100;
              return (
                <div key={t.term} className="flex items-center text-[11px] px-2 py-1 hover:bg-[#111128] rounded">
                  <span className="flex-1 font-mono text-rose-400">{t.term}</span>
                  <span className="w-16 text-right text-gray-500">{t.doc_freq}</span>
                  <span className="w-16 text-right text-gray-600">{t.total_freq}</span>
                  <span className="w-24 flex justify-end">
                    <span className="h-2 rounded-full bg-rose-500/30" style={{ width: `${pct}%`, minWidth: "2px" }} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PageRank */}
      {!loading && view === "pagerank" && (
        <div>
          <div className="text-[11px] text-gray-600 mb-2">Top pages by authority</div>
          <div className="space-y-1.5">
            {prPages.map((p, i) => {
              const maxScore = prPages[0]?.score || 1;
              const pct = (p.score / maxScore) * 100;
              return (
                <div key={p.id} className="p-2 bg-[#0d0d20] rounded border border-[#1a1a3a] text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 w-5">#{i + 1}</span>
                    <span className="text-gray-400 truncate flex-1">{p.title?.replace(" - Wikipedia", "")}</span>
                    <span className="text-indigo-400 font-mono">{p.score}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-[#1a1a3a] rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500/50 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-600">{p.inlinks} inlinks</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chunks */}
      {!loading && view === "chunks" && (
        <div>
          <div className="text-[11px] text-gray-600 mb-2">Recent chunks (embeddings for vector search)</div>
          <div className="space-y-1.5">
            {chunks.map((c) => (
              <div key={c.id} className="p-2 bg-[#0d0d20] rounded border border-[#1a1a3a] text-[11px]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-gray-600">page:{c.page_id} chunk:{c.chunk_idx}</span>
                  <span className={`px-1 rounded text-[10px] ${c.has_embedding ? "bg-emerald-900/40 text-emerald-400" : "bg-gray-800 text-gray-600"}`}>
                    {c.has_embedding ? "embedded" : "no vector"}
                  </span>
                  <span className="text-gray-500 truncate flex-1">{c.title?.replace(" - Wikipedia", "")}</span>
                </div>
                <div className="text-gray-600 leading-relaxed line-clamp-3">{c.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type View = "pages" | "index" | "pagerank" | "chunks";

export default function DataExplorer() {
  const [view, setView] = useState<View>("pages");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (v: View) => {
    setLoading(true);
    try {
      const endpoints: Record<View, string> = {
        pages: "/api/explore/pages?limit=10",
        index: "/api/explore/index?limit=20",
        pagerank: "/api/explore/pagerank?limit=10",
        chunks: "/api/explore/chunks?limit=5",
      };
      const res = await fetch(`${API_BASE}${endpoints[v]}`);
      setData(await res.json());
    } catch { /* */ }
    setLoading(false);
  };

  useEffect(() => { load(view); }, [view]);

  const views: { key: View; label: string; icon: string }[] = [
    { key: "pages", label: "Pages", icon: "📄" },
    { key: "index", label: "Index", icon: "📑" },
    { key: "pagerank", label: "PR", icon: "📊" },
    { key: "chunks", label: "Chunks", icon: "🧩" },
  ];

  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--bg)] overflow-hidden">
      <div className="flex items-center border-b border-[var(--border)]">
        <span className="text-[10px] text-gray-600 px-2 shrink-0">DATA</span>
        {views.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`text-[10px] px-2 py-1.5 cursor-pointer transition-colors ${
              view === v.key ? "text-rose-400 bg-rose-500/10" : "text-gray-600 hover:text-gray-400"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="p-2 max-h-[300px] overflow-y-auto">
        {loading && <div className="text-[10px] text-gray-700 text-center py-4">Loading...</div>}

        {!loading && view === "pages" && data && (
          <div className="space-y-1">
            {((data as { pages: { id: number; title: string; domain: string; text_length: number; outlinks: number; status_code: number }[] }).pages || []).map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 text-[10px] py-0.5 hover:bg-[var(--bg-elevated)] px-1 rounded">
                <span className="text-gray-700 w-5">#{p.id}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${p.status_code === 200 ? "bg-emerald-500" : "bg-rose-500"}`} />
                <span className="text-gray-400 truncate flex-1">{(p.title || "").replace(" - Wikipedia", "").slice(0, 30)}</span>
                <span className="text-gray-700">{(p.text_length / 1000).toFixed(0)}K</span>
                <span className="text-gray-700">{p.outlinks}↗</span>
              </div>
            ))}
          </div>
        )}

        {!loading && view === "index" && data && (
          <div className="space-y-0.5">
            {((data as { terms: { term: string; doc_freq: number; total_freq: number }[] }).terms || []).map((t, i) => {
              const maxDf = ((data as { terms: { doc_freq: number }[] }).terms[0]?.doc_freq) || 1;
              return (
                <div key={i} className="flex items-center gap-1.5 text-[10px] py-0.5 px-1">
                  <span className="font-mono text-rose-400/80 w-20 truncate">{t.term}</span>
                  <div className="flex-1 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500/30 rounded-full" style={{ width: `${(t.doc_freq / maxDf) * 100}%` }} />
                  </div>
                  <span className="text-gray-600 w-8 text-right">{t.doc_freq}</span>
                </div>
              );
            })}
          </div>
        )}

        {!loading && view === "pagerank" && data && (
          <div className="space-y-0.5">
            {((data as { pages: { id: number; title: string; score: number; inlinks: number }[] }).pages || []).map((p, i) => {
              const maxScore = ((data as { pages: { score: number }[] }).pages[0]?.score) || 1;
              return (
                <div key={i} className="flex items-center gap-1.5 text-[10px] py-0.5 px-1">
                  <span className="text-gray-700 w-3">#{i + 1}</span>
                  <span className="text-gray-400 truncate flex-1">{(p.title || "").replace(" - Wikipedia", "").slice(0, 25)}</span>
                  <div className="w-12 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500/50 rounded-full" style={{ width: `${(p.score / maxScore) * 100}%` }} />
                  </div>
                  <span className="text-indigo-400/60 w-8 text-right">{p.inlinks}↙</span>
                </div>
              );
            })}
          </div>
        )}

        {!loading && view === "chunks" && data && (
          <div className="space-y-1">
            {((data as { chunks: { id: number; page_id: number; chunk_idx: number; content: string; has_embedding: boolean; title: string }[] }).chunks || []).map((c) => (
              <div key={c.id} className="p-1.5 bg-[var(--bg-card)] rounded text-[10px]">
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-gray-600">p{c.page_id}:c{c.chunk_idx}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${c.has_embedding ? "bg-purple-500" : "bg-gray-700"}`} />
                  <span className="text-gray-500 truncate">{(c.title || "").replace(" - Wikipedia", "").slice(0, 20)}</span>
                </div>
                <div className="text-gray-600 line-clamp-2 leading-relaxed">{c.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

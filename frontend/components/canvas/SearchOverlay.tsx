"use client";

import { useState } from "react";

interface SearchOverlayProps {
  onSearch: (query: string) => void;
  query: string;
  stats: { pages: number; terms: number; chunks: number } | null;
}

export default function SearchOverlay({ onSearch, query, stats }: SearchOverlayProps) {
  const [input, setInput] = useState(query);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed) onSearch(trimmed);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-full max-w-xl px-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search football..."
          className="flex-1 bg-[#0d0d22]/90 backdrop-blur border border-[#2a2a4a] rounded-full px-5 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-rose-500/50 shadow-xl shadow-black/30"
        />
        <button
          type="submit"
          className="bg-rose-600 hover:bg-rose-700 text-white rounded-full px-6 py-2.5 text-sm font-medium shadow-xl shadow-rose-500/10 cursor-pointer transition-colors"
        >
          Search
        </button>
      </form>

      {stats && (
        <div className="flex justify-center gap-3 mt-2 text-[10px] text-gray-600">
          <span>{stats.pages.toLocaleString()} pages</span>
          <span>·</span>
          <span>{stats.terms.toLocaleString()} terms</span>
          <span>·</span>
          <span>{stats.chunks.toLocaleString()} chunks</span>
        </div>
      )}

      {!query && (
        <div className="flex justify-center gap-2 mt-3">
          {["Messi", "Champions League", "World Cup", "Premier League", "Ronaldo"].map((q) => (
            <button
              key={q}
              onClick={() => { setInput(q); onSearch(q); }}
              className="text-[10px] px-3 py-1 border border-[#1a1a3a] rounded-full text-gray-600 hover:text-gray-400 hover:border-rose-500/30 cursor-pointer transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

interface SearchOverlayProps {
  onSearch: (query: string) => void;
  query: string;
  stats: { pages: number; terms: number; chunks: number } | null;
}

const SUGGESTIONS = ["Messi", "Champions League", "World Cup", "Premier League", "Ronaldo"];

export default function SearchOverlay({ onSearch, query, stats }: SearchOverlayProps) {
  const [input, setInput] = useState(query);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed) onSearch(trimmed);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[520px]">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 flex items-center bg-[var(--bg-card)]/95 backdrop-blur border border-[var(--border)] focus-within:border-[var(--accent)]/50 transition-colors">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="w-4 h-4 text-[var(--text-dim)] ml-3 shrink-0"
          >
            <circle cx="9" cy="9" r="6" />
            <line x1="13.5" y1="13.5" x2="18" y2="18" />
          </svg>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search football..."
            className="flex-1 bg-transparent px-3 py-2.5 text-[14px] text-[var(--text)] placeholder-[var(--text-dim)] outline-none"
          />
        </div>
        <button
          type="submit"
          className="bg-[var(--accent)] hover:brightness-90 text-white px-6 py-2.5 text-[13px] font-medium cursor-pointer transition-colors"
        >
          Search
        </button>
      </form>

      {stats && (
        <div className="flex justify-center gap-3 mt-2 text-[10px] text-[var(--text-dim)] font-mono">
          <span>{stats.pages.toLocaleString()} pages</span>
          <span>·</span>
          <span>{stats.terms.toLocaleString()} terms</span>
          <span>·</span>
          <span>{stats.chunks.toLocaleString()} chunks</span>
        </div>
      )}

      {!query && (
        <div className="flex justify-center gap-2 mt-3">
          {SUGGESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => {
                setInput(q);
                onSearch(q);
              }}
              className="text-[10px] px-3 py-1 border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 cursor-pointer transition-colors font-mono"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

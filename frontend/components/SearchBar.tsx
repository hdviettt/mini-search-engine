"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getSuggestions } from "@/lib/api";

interface SearchBarProps {
  initialQuery?: string;
  onSearch: (query: string) => void;
  compact?: boolean;
}

export default function SearchBar({ initialQuery = "", onSearch, compact = false }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync initialQuery when it changes (e.g. "search instead for" click)
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      const results = await getSuggestions(q);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    }, 220);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveIdx(-1);
    onSearch(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      const chosen = suggestions[activeIdx];
      setQuery(chosen);
      setSuggestions([]);
      setShowSuggestions(false);
      setActiveIdx(-1);
      onSearch(chosen);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setActiveIdx(-1);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full ${compact ? "max-w-xl" : "max-w-2xl"}`}>
      <form onSubmit={handleSubmit} className="flex gap-2 w-full">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(-1);
            fetchSuggestions(e.target.value);
          }}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search football..."
          autoFocus
          className={`flex-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-full outline-none text-[var(--text)] placeholder-[var(--text-dim)] focus:border-[var(--accent)] transition-colors ${
            compact ? "px-4 py-2 text-sm" : "px-6 py-3 text-lg"
          }`}
        />
        <button
          type="submit"
          className={`bg-[var(--accent)] hover:opacity-90 text-white rounded-full font-medium transition-opacity ${
            compact ? "px-5 py-2 text-sm" : "px-8 py-3 text-base"
          }`}
        >
          Search
        </button>
      </form>

      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute top-full mt-1 left-0 right-0 z-50 bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <li
              key={s}
              onMouseDown={() => {
                setQuery(s);
                setSuggestions([]);
                setShowSuggestions(false);
                setActiveIdx(-1);
                onSearch(s);
              }}
              className={`px-5 py-2.5 text-sm cursor-pointer flex items-center gap-2 ${
                i === activeIdx
                  ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-50">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

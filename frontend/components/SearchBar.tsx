"use client";

import { useState } from "react";

interface SearchBarProps {
  initialQuery?: string;
  onSearch: (query: string) => void;
  compact?: boolean;
}

export default function SearchBar({ initialQuery = "", onSearch, compact = false }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) onSearch(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className={`flex gap-2 w-full ${compact ? "max-w-xl" : "max-w-2xl"}`}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search football..."
        autoFocus
        className={`flex-1 bg-[#111128] border border-[#2a2a4a] rounded-full outline-none text-gray-200 placeholder-gray-500 focus:border-rose-500 transition-colors ${
          compact ? "px-4 py-2 text-sm" : "px-6 py-3 text-lg"
        }`}
      />
      <button
        type="submit"
        className={`bg-rose-600 hover:bg-rose-700 text-white rounded-full font-medium transition-colors ${
          compact ? "px-5 py-2 text-sm" : "px-8 py-3 text-base"
        }`}
      >
        Search
      </button>
    </form>
  );
}

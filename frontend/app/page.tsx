"use client";

import { useState, useCallback } from "react";
import SearchBar from "@/components/SearchBar";
import AIOverview from "@/components/AIOverview";
import ResultCard from "@/components/ResultCard";
import { searchQuery, getOverview, SearchResponse, OverviewSource } from "@/lib/api";

export default function Home() {
  const [view, setView] = useState<"home" | "results">("home");
  const [query, setQuery] = useState("");
  const [searchData, setSearchData] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [overview, setOverview] = useState<string | null>(null);
  const [overviewSources, setOverviewSources] = useState<OverviewSource[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    setView("results");
    setSearching(true);
    setOverview(null);
    setOverviewSources([]);
    setOverviewLoading(false);

    try {
      const data = await searchQuery(q);
      setSearchData(data);
      setSearching(false);

      // Fetch AI Overview async if enough results
      if (data.total_results >= 3) {
        setOverviewLoading(true);
        try {
          const ov = await getOverview(q);
          setOverview(ov.overview);
          setOverviewSources(ov.sources || []);
        } catch {
          // Silently fail — overview is optional
        } finally {
          setOverviewLoading(false);
        }
      }
    } catch {
      setSearching(false);
    }
  }, []);

  const goHome = () => {
    setView("home");
    setQuery("");
    setSearchData(null);
    setOverview(null);
    setOverviewSources([]);
  };

  // Home view
  if (view === "home") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <h1 className="text-5xl font-bold text-rose-500 mb-2">VietSearch</h1>
        <p className="text-gray-500 mb-8 text-sm">Football search engine with AI Overviews</p>
        <SearchBar onSearch={handleSearch} />
        <div className="mt-8 flex gap-3 text-xs text-gray-600">
          <span>1,000 pages</span>
          <span>·</span>
          <span>15,719 chunks</span>
          <span>·</span>
          <span>BM25 + PageRank + Vector Search</span>
        </div>
      </div>
    );
  }

  // Results view
  const maxBm25 = searchData
    ? Math.max(...searchData.results.map((r) => r.bm25_score), 0)
    : 0;
  const maxPr = searchData
    ? Math.max(...searchData.results.map((r) => r.pagerank_score), 0)
    : 0;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0a0a1a]/95 backdrop-blur border-b border-[#1a1a3a] px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <h1
            onClick={goHome}
            className="text-xl font-bold text-rose-500 cursor-pointer hover:text-rose-400 shrink-0"
          >
            VietSearch
          </h1>
          <SearchBar initialQuery={query} onSearch={handleSearch} compact />
        </div>
      </header>

      {/* Results */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        {searching ? (
          <div className="text-gray-500 text-center mt-12">Searching...</div>
        ) : searchData && searchData.total_results === 0 ? (
          <div className="text-gray-500 text-center mt-12">
            No results found for &ldquo;{query}&rdquo;
          </div>
        ) : searchData ? (
          <>
            <div className="text-sm text-gray-600 mb-4">
              {searchData.total_results} results in {searchData.time_ms.toFixed(1)}ms
            </div>

            <AIOverview
              overview={overview}
              sources={overviewSources}
              loading={overviewLoading}
            />

            {searchData.results.map((result, i) => (
              <ResultCard
                key={i}
                result={result}
                maxBm25={maxBm25}
                maxPr={maxPr}
              />
            ))}
          </>
        ) : null}
      </main>
    </div>
  );
}

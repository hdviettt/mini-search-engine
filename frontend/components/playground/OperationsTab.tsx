"use client";

import { useState } from "react";
import { startCrawl, stopCrawl, rebuildIndex, rebuildEmbeddings } from "@/lib/api";
import { CrawlProgressData, IndexProgressData, EmbedProgressData } from "@/lib/types";
import LiveLog from "./LiveLog";

interface OperationsTabProps {
  crawlProgress: CrawlProgressData | null;
  indexProgress: IndexProgressData | null;
  embedProgress: EmbedProgressData | null;
  logEntries: string[];
  activeCrawlJobId: string | null;
  onCrawlStarted: (jobId: string) => void;
}

export default function OperationsTab({
  crawlProgress, indexProgress, embedProgress, logEntries, activeCrawlJobId, onCrawlStarted,
}: OperationsTabProps) {
  const [seedUrl, setSeedUrl] = useState("https://en.wikipedia.org/wiki/Association_football");
  const [maxPages, setMaxPages] = useState(50);
  const [crawling, setCrawling] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [embedding, setEmbedding] = useState(false);

  const handleStartCrawl = async () => {
    setCrawling(true);
    const res = await startCrawl([seedUrl], maxPages, 3);
    if (res.job_id) onCrawlStarted(res.job_id);
  };

  const handleStopCrawl = async () => {
    if (activeCrawlJobId) {
      await stopCrawl(activeCrawlJobId);
      setCrawling(false);
    }
  };

  const handleRebuildIndex = async () => {
    setIndexing(true);
    await rebuildIndex();
  };

  const handleRebuildEmbeddings = async () => {
    setEmbedding(true);
    await rebuildEmbeddings();
  };

  return (
    <div className="p-3 space-y-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Operations</div>

      {/* Crawl */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-400">Crawl</div>
        <input
          type="text"
          value={seedUrl}
          onChange={(e) => setSeedUrl(e.target.value)}
          placeholder="Seed URL"
          className="w-full text-xs bg-[#111] border border-[#222] rounded px-2 py-1.5 text-gray-300 outline-none focus:border-rose-500"
        />
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={maxPages}
            onChange={(e) => setMaxPages(parseInt(e.target.value) || 50)}
            className="w-20 text-xs bg-[#111] border border-[#222] rounded px-2 py-1.5 text-gray-300 outline-none"
          />
          <span className="text-[11px] text-gray-600">max pages</span>
          <div className="ml-auto flex gap-1">
            {!crawling ? (
              <button onClick={handleStartCrawl} className="text-xs px-3 py-1 bg-[#e88a1a] hover:bg-[#d07a10] text-white rounded cursor-pointer">Start</button>
            ) : (
              <button onClick={handleStopCrawl} className="text-xs px-3 py-1 bg-[#aa2222] hover:bg-[#881818] text-white rounded cursor-pointer">Stop</button>
            )}
          </div>
        </div>
        {crawlProgress && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-gray-500">
              <span>{crawlProgress.pages_crawled}/{crawlProgress.max_pages} pages</span>
              <span>{crawlProgress.queue_size.toLocaleString()} queued</span>
            </div>
            <div className="w-full h-1.5 bg-[#222] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#e88a1a] rounded-full transition-all"
                style={{ width: `${(crawlProgress.pages_crawled / crawlProgress.max_pages) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Index */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400">Index + PageRank</span>
          <button
            onClick={handleRebuildIndex}
            disabled={indexing}
            className="text-xs px-3 py-1 bg-[#e88a1a] hover:bg-[#d07a10] disabled:opacity-50 text-white rounded cursor-pointer"
          >
            {indexing ? "Building..." : "Rebuild"}
          </button>
        </div>
        {indexProgress && (
          <div className="text-[11px] text-gray-500">
            {indexProgress.phase}: {indexProgress.pages_done}/{indexProgress.pages_total} pages | {indexProgress.unique_terms.toLocaleString()} terms
          </div>
        )}
      </div>

      {/* Embeddings */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400">Chunk + Embed</span>
          <button
            onClick={handleRebuildEmbeddings}
            disabled={embedding}
            className="text-xs px-3 py-1 bg-[#e88a1a] hover:bg-[#d07a10] disabled:opacity-50 text-white rounded cursor-pointer"
          >
            {embedding ? "Embedding..." : "Rebuild"}
          </button>
        </div>
        {embedProgress && (
          <div className="space-y-1">
            <div className="text-[11px] text-gray-500">
              {embedProgress.chunks_done}/{embedProgress.chunks_total} chunks
            </div>
            <div className="w-full h-1.5 bg-[#222] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#e88a1a] rounded-full transition-all"
                style={{ width: `${(embedProgress.chunks_done / embedProgress.chunks_total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Live Log */}
      <div>
        <div className="text-xs font-medium text-gray-400 mb-2">Live Log</div>
        <LiveLog entries={logEntries} maxHeight="180px" />
      </div>
    </div>
  );
}

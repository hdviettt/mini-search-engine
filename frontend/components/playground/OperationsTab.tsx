"use client";

import { useState, useRef, useEffect } from "react";
import { startCrawl, stopCrawl, rebuildIndex, rebuildEmbeddings } from "@/lib/api";
import { CrawlProgressData, IndexProgressData, EmbedProgressData } from "@/lib/types";

interface OperationsTabProps {
  crawlProgress: CrawlProgressData | null;
  indexProgress: IndexProgressData | null;
  embedProgress: EmbedProgressData | null;
  logEntries: string[];
  crawledPages?: CrawlProgressData[];
  activeCrawlJobId: string | null;
  onCrawlStarted: (jobId: string) => void;
}

function CrawlFeed({ pages, progress }: { pages: CrawlProgressData[]; progress: CrawlProgressData | null }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [pages.length]);

  if (pages.length === 0 && !progress) {
    return (
      <div className="text-[10px] text-[var(--text-dim)] text-center py-4">
        Start a crawl to see pages discovered in real time.
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-[280px] overflow-y-auto">
      {pages.map((p, i) => {
        const domain = new URL(p.current_url).hostname.replace("www.", "").replace("en.", "");
        return (
          <div key={i} className={`border p-1.5 text-[9px] ${p.status === "ok" ? "border-[var(--border)]" : "border-red-800/30"}`}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`w-1.5 h-1.5 shrink-0 ${p.status === "ok" ? "bg-emerald-500" : "bg-red-500"}`} />
              <span className="text-[var(--accent)] font-mono shrink-0">#{p.pages_crawled}</span>
              <span className="text-[var(--text-muted)] truncate flex-1">{(p.title || "Untitled").replace(" - Wikipedia", "")}</span>
            </div>
            <div className="flex items-center gap-2 pl-4 text-[8px] text-[var(--text-dim)]">
              <span>{domain}</span>
              <span>&middot;</span>
              <span>{(p.text_length / 1000).toFixed(0)}K chars</span>
              <span>&middot;</span>
              <span>{p.links_found} outlinks</span>
              <span>&middot;</span>
              <span>HTTP {p.status_code}</span>
            </div>
          </div>
        );
      })}
      {progress && (
        <div className="border border-[var(--accent)] p-1.5 text-[9px] animate-pulse">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-[var(--accent)] shrink-0" />
            <span className="text-[var(--accent)] truncate">Fetching: {progress.current_url}</span>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

export default function OperationsTab({
  crawlProgress, indexProgress, embedProgress, logEntries, crawledPages, activeCrawlJobId, onCrawlStarted,
}: OperationsTabProps) {
  const [seedUrl, setSeedUrl] = useState("https://en.wikipedia.org/wiki/Association_football");
  const [maxPages, setMaxPages] = useState(50);
  const [extraDomains, setExtraDomains] = useState("");
  const [restrictDomains, setRestrictDomains] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [embedding, setEmbedding] = useState(false);

  const handleStartCrawl = async () => {
    setCrawling(true);
    const extras = extraDomains.split(/[,\n]/).map((d) => d.trim()).filter(Boolean);
    const res = await startCrawl([seedUrl], maxPages, 3, extras, restrictDomains);
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

  const pct = crawlProgress ? Math.round((crawlProgress.pages_crawled / Math.max(crawlProgress.max_pages, 1)) * 100) : 0;

  return (
    <div className="p-3 space-y-4">
      <div className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Operations</div>

      {/* Crawl */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-[var(--text-muted)]">Crawl</div>
        <input
          type="text"
          value={seedUrl}
          onChange={(e) => setSeedUrl(e.target.value)}
          placeholder="Seed URL"
          className="w-full text-xs bg-[var(--bg-card)] border border-[var(--border)] px-2 py-1.5 text-[var(--text)] outline-none focus:border-[var(--accent)]/50 font-mono"
        />
        {/* Domain restriction */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRestrictDomains(!restrictDomains)}
              className={`w-7 h-3.5 cursor-pointer transition-colors ${restrictDomains ? "bg-[var(--accent)]" : "bg-[var(--border-hover)]"}`}
              title={restrictDomains ? "Domain restriction ON" : "Domain restriction OFF — will crawl any domain"}
            >
              <div className={`w-2.5 h-2.5 bg-white transition-transform ${restrictDomains ? "translate-x-3.5" : "translate-x-0.5"}`} />
            </button>
            <span className="text-[10px] text-[var(--text-dim)]">
              {restrictDomains ? "Restrict to allowed domains" : "Allow all domains"}
            </span>
          </div>
          {restrictDomains && (
            <div>
              <div className="text-[9px] text-[var(--text-dim)] mb-0.5">Default: en.wikipedia.org, www.bbc.com, www.espn.com</div>
              <input
                type="text"
                value={extraDomains}
                onChange={(e) => setExtraDomains(e.target.value)}
                placeholder="Extra domains (comma separated)"
                className="w-full text-[10px] bg-[var(--bg-card)] border border-[var(--border)] px-2 py-1 text-[var(--text)] outline-none focus:border-[var(--accent)]/50 font-mono"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="number"
            value={maxPages}
            onChange={(e) => setMaxPages(parseInt(e.target.value) || 50)}
            className="w-20 text-xs bg-[var(--bg-card)] border border-[var(--border)] px-2 py-1.5 text-[var(--text)] outline-none font-mono"
          />
          <span className="text-[11px] text-[var(--text-dim)]">max pages</span>
          <div className="ml-auto flex gap-1">
            {!crawling ? (
              <button onClick={handleStartCrawl} className="text-xs px-3 py-1 bg-[var(--accent)] hover:brightness-90 text-white cursor-pointer">Start</button>
            ) : (
              <button onClick={handleStopCrawl} className="text-xs px-3 py-1 bg-red-700 hover:bg-red-800 text-white cursor-pointer">Stop</button>
            )}
          </div>
        </div>
        {crawlProgress && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-[var(--accent)] font-mono">{crawlProgress.pages_crawled}/{crawlProgress.max_pages} pages</span>
              <span className="text-[var(--text-dim)]">{crawlProgress.queue_size.toLocaleString()} queued &middot; {pct}%</span>
            </div>
            <div className="w-full h-1.5 bg-[var(--score-bar-bg)]">
              <div className="h-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Crawl Feed */}
      <CrawlFeed pages={crawledPages || []} progress={crawlProgress} />

      {/* Index */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--text-muted)]">Index + PageRank</span>
          <button
            onClick={handleRebuildIndex}
            disabled={indexing}
            className="text-xs px-3 py-1 bg-[var(--accent)] hover:brightness-90 disabled:opacity-50 text-white cursor-pointer"
          >
            {indexing ? "Building..." : "Rebuild"}
          </button>
        </div>
        {indexProgress && (
          <div className="space-y-1">
            <div className="text-[10px] text-[var(--text-dim)]">
              {indexProgress.phase}: {indexProgress.pages_done}/{indexProgress.pages_total} pages &middot; {indexProgress.unique_terms.toLocaleString()} terms
            </div>
            <div className="w-full h-1.5 bg-[var(--score-bar-bg)]">
              <div className="h-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${(indexProgress.pages_done / Math.max(indexProgress.pages_total, 1)) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Embeddings */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--text-muted)]">Chunk + Embed</span>
          <button
            onClick={handleRebuildEmbeddings}
            disabled={embedding}
            className="text-xs px-3 py-1 bg-[var(--accent)] hover:brightness-90 disabled:opacity-50 text-white cursor-pointer"
          >
            {embedding ? "Embedding..." : "Rebuild"}
          </button>
        </div>
        {embedProgress && (
          <div className="space-y-1">
            <div className="text-[10px] text-[var(--text-dim)]">
              {embedProgress.chunks_done}/{embedProgress.chunks_total} chunks
            </div>
            <div className="w-full h-1.5 bg-[var(--score-bar-bg)]">
              <div className="h-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${(embedProgress.chunks_done / Math.max(embedProgress.chunks_total, 1)) * 100}%` }} />
            </div>
            {embedProgress.current_chunk_preview && (
              <div className="text-[8px] text-[var(--text-dim)] truncate">{embedProgress.current_chunk_preview}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

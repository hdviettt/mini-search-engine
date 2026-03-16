"use client";

import { useState, useRef, useEffect } from "react";
import { startCrawl, stopCrawl, rebuildIndex, rebuildEmbeddings } from "@/lib/api";
import { CrawlProgressData, IndexProgressData, EmbedProgressData } from "@/lib/types";

const DEFAULT_DOMAINS = ["en.wikipedia.org", "www.bbc.com", "www.espn.com"];

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
      <div className="text-[11px] text-[var(--text-dim)] text-center py-4">
        Start a crawl to see pages discovered in real time.
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
      {pages.map((p, i) => {
        let domain = "";
        try { domain = new URL(p.current_url).hostname; } catch { domain = ""; }
        return (
          <div key={i} className={`border p-2 ${p.status === "ok" ? "border-[var(--border)]" : "border-red-800/30"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 shrink-0 ${p.status === "ok" ? "bg-emerald-500" : "bg-red-500"}`} />
              <span className="text-[var(--accent)] font-mono text-[11px] shrink-0">#{p.pages_crawled}</span>
              <span className="text-[12px] text-[var(--text)] truncate flex-1 font-medium">{(p.title || "Untitled").replace(" - Wikipedia", "")}</span>
            </div>
            <div className="flex items-center gap-3 pl-5 text-[10px] text-[var(--text-dim)]">
              <span>{domain}</span>
              <span>{(p.text_length / 1000).toFixed(0)}K chars</span>
              <span>{p.links_found} outlinks</span>
            </div>
          </div>
        );
      })}
      {progress && (
        <div className="border border-[var(--accent)] p-2 animate-pulse">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-[var(--accent)] shrink-0" />
            <span className="text-[11px] text-[var(--accent)] truncate">{progress.current_url}</span>
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
  const [domains, setDomains] = useState<string[]>([...DEFAULT_DOMAINS]);
  const [newDomain, setNewDomain] = useState("");
  const [restrictDomains, setRestrictDomains] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [embedding, setEmbedding] = useState(false);

  const addDomain = () => {
    const d = newDomain.trim().toLowerCase();
    if (d && !domains.includes(d)) {
      setDomains([...domains, d]);
      setNewDomain("");
    }
  };

  const removeDomain = (d: string) => {
    setDomains(domains.filter((x) => x !== d));
  };

  const handleStartCrawl = async () => {
    setCrawling(true);
    const extras = domains.filter((d) => !DEFAULT_DOMAINS.includes(d));
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
    <div className="p-4 space-y-5">
      <div className="text-[13px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Operations</div>

      {/* Crawl */}
      <div className="space-y-3">
        <div className="text-[12px] font-medium text-[var(--text)]">Crawl</div>
        <div>
          <div className="text-[11px] text-[var(--text-dim)] mb-1">Seed URL</div>
          <input
            type="text"
            value={seedUrl}
            onChange={(e) => setSeedUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full text-[12px] bg-[var(--bg-card)] border border-[var(--border)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]/50 font-mono"
          />
        </div>

        {/* Domain management */}
        <div className="border border-[var(--border)] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">Allowed Domains</span>
            <button
              onClick={() => setRestrictDomains(!restrictDomains)}
              className={`px-2 py-0.5 text-[10px] font-mono cursor-pointer transition-colors ${
                restrictDomains
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--border-hover)] text-[var(--text-dim)]"
              }`}
            >
              {restrictDomains ? "ON" : "OFF"}
            </button>
          </div>

          {!restrictDomains && (
            <div className="text-[11px] text-[var(--text-dim)] p-2 border border-dashed border-[var(--border)]">
              Domain restriction is OFF — crawler will follow links to any domain.
            </div>
          )}

          {restrictDomains && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {domains.map((d) => {
                  const isDefault = DEFAULT_DOMAINS.includes(d);
                  return (
                    <div key={d} className={`flex items-center gap-1 px-2 py-1 text-[11px] font-mono ${
                      isDefault ? "bg-[var(--bg-elevated)] text-[var(--text-muted)]" : "bg-[var(--accent-muted)] text-[var(--accent)]"
                    }`}>
                      <span>{d}</span>
                      {!isDefault && (
                        <button onClick={() => removeDomain(d)} className="text-[var(--text-dim)] hover:text-red-500 cursor-pointer ml-0.5">&times;</button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addDomain()}
                  placeholder="Add domain (e.g. fifa.com)"
                  className="flex-1 text-[11px] bg-[var(--bg-card)] border border-[var(--border)] px-2 py-1.5 text-[var(--text)] outline-none focus:border-[var(--accent)]/50 font-mono"
                />
                <button
                  onClick={addDomain}
                  className="text-[11px] px-3 py-1.5 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent-muted)] cursor-pointer"
                >
                  Add
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div>
            <div className="text-[11px] text-[var(--text-dim)] mb-1">Max pages</div>
            <input
              type="number"
              value={maxPages}
              onChange={(e) => setMaxPages(parseInt(e.target.value) || 50)}
              className="w-24 text-[12px] bg-[var(--bg-card)] border border-[var(--border)] px-3 py-2 text-[var(--text)] outline-none font-mono"
            />
          </div>
          <div className="ml-auto pt-5">
            {!crawling ? (
              <button onClick={handleStartCrawl} className="text-[12px] px-5 py-2 bg-[var(--accent)] hover:brightness-90 text-white cursor-pointer font-medium">Start Crawl</button>
            ) : (
              <button onClick={handleStopCrawl} className="text-[12px] px-5 py-2 bg-red-700 hover:bg-red-800 text-white cursor-pointer font-medium">Stop</button>
            )}
          </div>
        </div>

        {crawlProgress && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--accent)] font-mono font-medium">{crawlProgress.pages_crawled}/{crawlProgress.max_pages} pages</span>
              <span className="text-[var(--text-dim)]">{crawlProgress.queue_size.toLocaleString()} queued &middot; {pct}%</span>
            </div>
            <div className="w-full h-2 bg-[var(--score-bar-bg)]">
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
          <span className="text-[12px] font-medium text-[var(--text)]">Index + PageRank</span>
          <button
            onClick={handleRebuildIndex}
            disabled={indexing}
            className="text-[11px] px-4 py-1.5 bg-[var(--accent)] hover:brightness-90 disabled:opacity-50 text-white cursor-pointer"
          >
            {indexing ? "Building..." : "Rebuild"}
          </button>
        </div>
        {indexProgress && (
          <div className="space-y-1">
            <div className="text-[11px] text-[var(--text-dim)]">
              {indexProgress.phase}: {indexProgress.pages_done}/{indexProgress.pages_total} pages &middot; {indexProgress.unique_terms.toLocaleString()} terms
            </div>
            <div className="w-full h-2 bg-[var(--score-bar-bg)]">
              <div className="h-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${(indexProgress.pages_done / Math.max(indexProgress.pages_total, 1)) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Embeddings */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-[var(--text)]">Chunk + Embed</span>
          <button
            onClick={handleRebuildEmbeddings}
            disabled={embedding}
            className="text-[11px] px-4 py-1.5 bg-[var(--accent)] hover:brightness-90 disabled:opacity-50 text-white cursor-pointer"
          >
            {embedding ? "Embedding..." : "Rebuild"}
          </button>
        </div>
        {embedProgress && (
          <div className="space-y-1">
            <div className="text-[11px] text-[var(--text-dim)]">
              {embedProgress.chunks_done}/{embedProgress.chunks_total} chunks
            </div>
            <div className="w-full h-2 bg-[var(--score-bar-bg)]">
              <div className="h-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${(embedProgress.chunks_done / Math.max(embedProgress.chunks_total, 1)) * 100}%` }} />
            </div>
            {embedProgress.current_chunk_preview && (
              <div className="text-[10px] text-[var(--text-dim)] truncate">{embedProgress.current_chunk_preview}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

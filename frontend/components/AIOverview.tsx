"use client";

import { useState, memo, useCallback } from "react";
import { OverviewSource } from "@/lib/api";

interface AIOverviewProps {
  text: string;
  sources: OverviewSource[];
  loading: boolean;
  streaming: boolean;
  unavailable?: boolean;
  compact?: boolean;
  onSearch?: (q: string) => void;
  query?: string;
  onEnterChat?: (followUpQuestion?: string) => void;
}

function parseOverviewWithCitations(text: string) {
  const parts: { type: "text" | "citation"; value: string; index?: number }[] = [];
  const regex = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    const indices = match[1].split(",").map(s => parseInt(s.trim()));
    for (const idx of indices) {
      parts.push({ type: "citation", value: `[${idx}]`, index: idx });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts;
}

function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path d="M12 2L13.5 8.5L18 6L14.5 11L21 12L14.5 13L18 18L13.5 15.5L12 22L10.5 15.5L6 18L9.5 13L3 12L9.5 11L6 6L10.5 8.5L12 2Z" fill="url(#brave-sparkle)" />
      <defs>
        <linearGradient id="brave-sparkle" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5b7bff" />
          <stop offset="0.5" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function SparkleSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[var(--text-dim)]">
      <path d="M12 2L13.5 8.5L18 6L14.5 11L21 12L14.5 13L18 18L13.5 15.5L12 22L10.5 15.5L6 18L9.5 13L3 12L9.5 11L6 6L10.5 8.5L12 2Z" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function CitationChip({ source, index }: { source: OverviewSource; index: number }) {
  const [showPopover, setShowPopover] = useState(false);
  let domain = "";
  try { domain = new URL(source.url).hostname.replace("www.", ""); } catch { domain = source.url; }

  return (
    <span className="relative inline-block align-baseline mx-0.5">
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setShowPopover(true)}
        onMouseLeave={() => setShowPopover(false)}
        className="inline-flex items-center justify-center w-[18px] h-[18px] text-[10px] font-medium rounded-full bg-[var(--chip-bg)] hover:bg-[var(--chip-hover)] text-[var(--accent)] cursor-pointer transition-colors"
      >
        {index}
      </a>

      {showPopover && (
        <div
          className="absolute z-50 bottom-full left-0 mb-1.5 w-64 bg-[var(--bg-card)] rounded-xl border border-[var(--source-border)] shadow-lg p-3 pointer-events-none"
          style={{ animation: "fade-in 0.15s ease-out" }}
        >
          <div className="text-[13px] text-[var(--link-blue)] leading-snug">{source.title}</div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" width={14} height={14} className="rounded-full" />
            <span className="text-[12px] text-[var(--snippet)]">{domain}</span>
          </div>
        </div>
      )}
    </span>
  );
}

function getFollowUpSuggestions(query: string): string[] {
  return [
    "Elaborate",
    `How has ${query} evolved recently?`,
    `Key facts about ${query}`,
    `${query} notable achievements`,
  ];
}

export default memo(function AIOverview({ text, sources, loading, streaming, unavailable, compact, onSearch, query, onEnterChat }: AIOverviewProps) {
  const [copied, setCopied] = useState(false);

  const copyText = useCallback(() => {
    const clean = text.replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "");
    navigator.clipboard.writeText(clean);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  if (!loading && !streaming && !text && !unavailable && sources.length === 0) return null;

  if (unavailable) {
    return (
      <div className="pt-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <SparkleIcon />
          <span className="text-[15px] font-medium text-[var(--text)]">AI Overview</span>
        </div>
        <p className="text-[13px] text-[var(--text-dim)]">AI Overview temporarily unavailable.</p>
        <div className="mt-6 border-b border-[var(--separator)]" />
      </div>
    );
  }

  const parts = text ? parseOverviewWithCitations(text) : [];
  const isDone = !loading && !streaming && !!text;

  return (
    <div className="pt-4 mb-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <SparkleIcon />
        <span className="text-[15px] font-medium text-[var(--text)]">AI Overview</span>
      </div>

      {/* Skeleton */}
      {(loading || (!text && !streaming)) && (
        <div className="space-y-3 max-w-2xl">
          <div className="h-[14px] bg-[var(--skeleton)] animate-pulse rounded-full w-full" />
          <div className="h-[14px] bg-[var(--skeleton)] animate-pulse rounded-full w-[96%]" />
          <div className="h-[14px] bg-[var(--skeleton)] animate-pulse rounded-full w-[88%]" />
          <div className="h-[14px] bg-[var(--skeleton)] animate-pulse rounded-full w-[72%]" />
        </div>
      )}

      {/* Content */}
      {(text || streaming) && !loading && (
        <div>
          {/* AI-generated text with inline citations */}
          <div className="text-[15px] leading-[1.65] text-[var(--text)] max-w-2xl">
            {parts.map((part, i) =>
              part.type === "text" ? (
                <span key={i}>{part.value}</span>
              ) : (() => {
                const src = sources.find(s => s.index === part.index);
                if (!src) return (
                  <span key={i} className="inline-flex items-center justify-center w-[18px] h-[18px] text-[10px] font-medium mx-0.5 rounded-full bg-[var(--chip-bg)] text-[var(--accent)] align-top">
                    {part.index}
                  </span>
                );
                return <CitationChip key={i} source={src} index={part.index!} />;
              })()
            )}
            {streaming && <span className="inline-block w-[3px] h-4 bg-[var(--accent)] animate-pulse ml-0.5 align-middle rounded-sm" />}
          </div>

          {/* Disclaimer */}
          {isDone && (
            <p className="text-[13px] text-[var(--text-dim)] mt-4">
              AI-generated answer. Please verify critical facts.
            </p>
          )}

          {/* Action bar + source avatars */}
          {isDone && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--separator)]">
              <div className="flex items-center gap-4">
                <button onClick={copyText} className="flex items-center gap-1.5 text-[13px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors cursor-pointer">
                  {copied ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              {/* Stacked source favicons */}
              {sources.length > 0 && (
                <div className="flex items-center -space-x-1">
                  {sources.slice(0, 5).map(s => {
                    let d = "";
                    try { d = new URL(s.url).hostname.replace("www.", ""); } catch { d = s.url; }
                    return (
                      <a key={s.index} href={s.url} target="_blank" rel="noopener noreferrer"
                        className="w-6 h-6 rounded-full bg-[var(--bg-elevated)] border-2 border-[var(--bg)] flex items-center justify-center hover:z-10 hover:scale-110 transition-transform"
                        title={`${s.title} \u2014 ${d}`}>
                        <img src={`https://www.google.com/s2/favicons?domain=${d}&sz=32`} alt="" width={14} height={14} className="rounded-full" />
                      </a>
                    );
                  })}
                  {sources.length > 5 && (
                    <span className="w-6 h-6 rounded-full bg-[var(--bg-elevated)] border-2 border-[var(--bg)] flex items-center justify-center text-[9px] text-[var(--text-dim)] font-medium">
                      +{sources.length - 5}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Follow-up input — enters AI Chat Mode with the typed question */}
          {isDone && !compact && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("followup") as string;
              if (q.trim() && onEnterChat) { onEnterChat(q.trim()); return; }
              if (q.trim() && onSearch) { onSearch(q.trim()); e.currentTarget.reset(); }
            }} className="mt-4">
              <div className="flex items-center bg-[var(--bg-elevated)] rounded-full px-4 border border-transparent hover:border-[var(--border)] focus-within:border-[var(--border)] transition-colors">
                <input name="followup" type="text" placeholder="Ask a follow-up question"
                  className="flex-1 py-3 bg-transparent text-[var(--text)] text-[14px] placeholder:text-[var(--text-dim)] focus:outline-none" />
                <button type="submit" className="p-1 text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors cursor-pointer shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><path d="m16 12-4-4-4 4" /><path d="M12 16V8" />
                  </svg>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Separator */}
      <div className="mt-6 border-b border-[var(--separator)]" />
    </div>
  );
});

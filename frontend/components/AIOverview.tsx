"use client";

import { useState, useRef, memo, useCallback } from "react";
import { OverviewSource } from "@/lib/api";

interface AIOverviewProps {
  text: string;
  sources: OverviewSource[];
  loading: boolean;
  streaming: boolean;
}

function parseOverviewWithCitations(text: string) {
  const parts: { type: "text" | "citation"; value: string; index?: number }[] = [];
  // Match [1], [2, 3], [1, 2, 3] etc.
  const regex = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    // Split "1, 2, 3" into individual citations
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

function GoogleSparkle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path d="M12 2L13.5 8.5L18 6L14.5 11L21 12L14.5 13L18 18L13.5 15.5L12 22L10.5 15.5L6 18L9.5 13L3 12L9.5 11L6 6L10.5 8.5L12 2Z" fill="url(#google-sparkle)" />
      <defs>
        <linearGradient id="google-sparkle" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4285f4" />
          <stop offset="0.33" stopColor="#9b72cb" />
          <stop offset="0.66" stopColor="#d96570" />
          <stop offset="1" stopColor="#d96570" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function SourceCard({ source, highlighted }: { source: OverviewSource; highlighted: boolean }) {
  let domain = "";
  try { domain = new URL(source.url).hostname.replace("www.", ""); } catch { domain = source.url; }
  return (
    <a id={`aio-source-${source.index}`} href={source.url} target="_blank" rel="noopener noreferrer"
      className={`block group py-2.5 border-b border-[#ebebeb] last:border-0 rounded px-1.5 -mx-1.5 transition-colors duration-300 ${highlighted ? "bg-[#e8f0fe]" : ""}`}>
      <div className="text-[14px] text-[#1a0dab] group-hover:underline leading-snug">
        {source.title}
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" width={14} height={14} className="rounded-full" />
        <span className="text-[12px] text-[#4d5156]">{domain}</span>
      </div>
    </a>
  );
}

// Inline citation chip with hover popover (like Google)
function CitationChip({ source, index, onHighlight }: {
  source: OverviewSource;
  index: number;
  onHighlight: (idx: number) => void;
}) {
  const [showPopover, setShowPopover] = useState(false);
  let domain = "";
  try { domain = new URL(source.url).hostname.replace("www.", ""); } catch { domain = source.url; }
  let shortDomain = "";
  try { shortDomain = new URL(source.url).hostname.replace("www.", "").split(".")[0]; } catch { shortDomain = "source"; }

  return (
    <span className="relative inline-block align-baseline mx-0.5">
      <button
        onMouseEnter={() => setShowPopover(true)}
        onMouseLeave={() => setShowPopover(false)}
        onClick={() => {
          onHighlight(index);
          document.getElementById(`aio-source-${index}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#f0f4f9] hover:bg-[#e3e8ef] text-[11px] text-[#1a73e8] font-medium transition-colors cursor-pointer whitespace-nowrap"
      >
        <img src={`https://www.google.com/s2/favicons?domain=${source.url}&sz=16`} alt="" width={10} height={10} className="rounded-full" />
        {shortDomain.charAt(0).toUpperCase() + shortDomain.slice(1)}
      </button>

      {/* Hover popover — source preview card */}
      {showPopover && (
        <div
          className="absolute z-50 bottom-full left-0 mb-1.5 w-64 bg-white rounded-xl border border-[#dadce0] shadow-lg p-3 pointer-events-none"
          style={{ animation: "fade-in 0.15s ease-out" }}
        >
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="pointer-events-auto">
            <div className="text-[13px] text-[#1a0dab] leading-snug hover:underline">
              {source.title}
            </div>
          </a>
          <div className="flex items-center gap-1.5 mt-1.5">
            <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" width={14} height={14} className="rounded-full" />
            <span className="text-[12px] text-[#4d5156]">{domain}</span>
          </div>
        </div>
      )}
    </span>
  );
}

export default memo(function AIOverview({ text, sources, loading, streaming }: AIOverviewProps) {
  const [highlightedSource, setHighlightedSource] = useState<number | null>(null);
  const textRef = useRef<HTMLDivElement>(null);

  const highlight = useCallback((idx: number) => {
    setHighlightedSource(idx);
    setTimeout(() => setHighlightedSource(null), 2000);
  }, []);

  if (!loading && !streaming && !text && sources.length === 0) return null;

  const parts = text ? parseOverviewWithCitations(text) : [];

  return (
    <div className="pt-3 sm:pt-4 mb-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 sm:mb-4">
        <GoogleSparkle />
        <span className="text-[14px] sm:text-[15px] font-normal text-[#1f1f1f]">AI Overview</span>
      </div>

      {/* Skeleton */}
      {(loading || (!text && !streaming)) && (
        <div className="space-y-2.5 max-w-2xl">
          <div className="h-[14px] bg-[#e8eaed] animate-pulse rounded w-full" />
          <div className="h-[14px] bg-[#e8eaed] animate-pulse rounded w-[96%]" />
          <div className="h-[14px] bg-[#e8eaed] animate-pulse rounded w-[88%]" />
          <div className="h-[14px] bg-[#e8eaed] animate-pulse rounded w-[72%]" />
        </div>
      )}

      {/* Content */}
      {(text || streaming) && !loading && (
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
          {/* Text column */}
          <div className="flex-1 min-w-0">
            <div
              ref={textRef}
              className="text-[14px] sm:text-[15px] leading-[1.6] sm:leading-[1.65] text-[#1f1f1f]"
            >
              {parts.map((part, i) =>
                part.type === "text" ? (
                  <span key={i}>{part.value}</span>
                ) : (() => {
                  const src = sources.find(s => s.index === part.index);
                  if (!src) return (
                    <span key={i} className="inline-flex items-center justify-center w-[18px] h-[18px] text-[10px] font-semibold mx-0.5 rounded-full bg-[#e8f0fe] text-[#1a73e8] align-top">
                      {part.index}
                    </span>
                  );
                  return <CitationChip key={i} source={src} index={part.index!} onHighlight={highlight} />;
                })()
              )}
              {streaming && <span className="inline-block w-[3px] h-4 bg-[#1a73e8] animate-pulse ml-0.5 align-middle rounded-sm" />}
            </div>
          </div>

          {/* Sources panel — right side on desktop, below on mobile */}
          {sources.length > 0 && (
            <div className="sm:w-64 lg:w-72 shrink-0 rounded-xl border border-[#dadce0] bg-white overflow-hidden">
              <div className="px-3 pt-2 pb-0.5">
                {sources.map((s) => (
                  <SourceCard key={s.index} source={s} highlighted={highlightedSource === s.index} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Separator between AI Overview and search results */}
      <div className="mt-5 sm:mt-6 border-b border-[#ebebeb]" />
    </div>
  );
});

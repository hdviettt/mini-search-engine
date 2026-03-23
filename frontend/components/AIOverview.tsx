"use client";

import { useState } from "react";
import { OverviewSource } from "@/lib/api";

interface AIOverviewProps {
  text: string;
  sources: OverviewSource[];
  loading: boolean;
  streaming: boolean;
}

function parseOverviewWithCitations(text: string) {
  const parts: { type: "text" | "citation"; value: string; index?: number }[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "citation", value: match[0], index: parseInt(match[1]) });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts;
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2L13.09 8.26L18 6L14.74 10.91L21 12L14.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L9.26 13.09L3 12L9.26 10.91L6 6L10.91 8.26L12 2Z" fill="url(#sparkle-gradient)" />
      <defs>
        <linearGradient id="sparkle-gradient" x1="3" y1="2" x2="21" y2="22">
          <stop stopColor="#4285f4" />
          <stop offset="0.5" stopColor="#9b72cb" />
          <stop offset="1" stopColor="#d96570" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function AIOverview({ text, sources, loading, streaming }: AIOverviewProps) {
  const [expanded, setExpanded] = useState(false);

  if (!loading && !streaming && !text && sources.length === 0) return null;

  const parts = text ? parseOverviewWithCitations(text) : [];
  const isLong = text.length > 400;
  const shouldTruncate = isLong && !expanded;

  return (
    <div className="mb-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 pt-4 pb-2">
        <SparkleIcon />
        <span className="text-sm font-semibold text-[var(--text)]">
          AI Overview
        </span>
        {(loading || streaming) && !text && (
          <span className="text-xs text-[var(--text-dim)] ml-1 animate-pulse">generating...</span>
        )}
      </div>

      {/* Skeleton — shown until first text token arrives */}
      {!text ? (
        <div className="px-5 pb-5 space-y-3">
          <div className="space-y-2.5">
            <div className="h-3.5 bg-[var(--score-bar-bg)] animate-pulse rounded w-full" />
            <div className="h-3.5 bg-[var(--score-bar-bg)] animate-pulse rounded w-[95%]" />
            <div className="h-3.5 bg-[var(--score-bar-bg)] animate-pulse rounded w-[80%]" />
            <div className="h-3.5 bg-[var(--score-bar-bg)] animate-pulse rounded w-[60%]" />
          </div>
          <div className="flex gap-2 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-[var(--score-bar-bg)] animate-pulse rounded-full w-28" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="px-5 pb-3">
            <div className={`text-[14px] leading-[1.7] text-[var(--text)] ${shouldTruncate ? "line-clamp-5" : ""}`}>
              {parts.map((part, i) =>
                part.type === "text" ? (
                  <span key={i}>{part.value}</span>
                ) : (
                  <sup key={i} className="inline-flex items-center justify-center min-w-[16px] h-4 text-[9px] font-bold mx-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] align-top cursor-default">
                    {part.index}
                  </sup>
                )
              )}
              {streaming && <span className="inline-block w-1.5 h-4 bg-[var(--accent)] animate-pulse ml-0.5 align-middle rounded-sm" />}
            </div>
            {isLong && !streaming && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-2 text-sm font-medium text-[var(--accent)] hover:underline cursor-pointer"
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>

          {/* Source pills */}
          {sources.length > 0 && (
            <div className="px-5 pb-4 pt-1 flex gap-2 overflow-x-auto">
              {sources.map((s) => {
                let domain = "";
                try { domain = new URL(s.url).hostname.replace("www.", ""); } catch { domain = s.url; }
                return (
                  <a
                    key={s.index}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-elevated)] hover:bg-[var(--border)] border border-[var(--border)] transition-colors shrink-0 group"
                  >
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                      alt=""
                      width={14}
                      height={14}
                      className="rounded-sm"
                    />
                    <span className="text-xs text-[var(--text-muted)] group-hover:text-[var(--text)] whitespace-nowrap max-w-[140px] truncate">
                      {s.title.replace(" - Wikipedia", "")}
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

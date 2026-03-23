"use client";

import { useState, useRef, useEffect } from "react";
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

function SourceCard({ source }: { source: OverviewSource }) {
  let domain = "";
  try { domain = new URL(source.url).hostname.replace("www.", ""); } catch { domain = source.url; }
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer" className="block group py-2.5 border-b border-[#ebebeb] last:border-0">
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

export default function AIOverview({ text, sources, loading, streaming }: AIOverviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (el && text && !streaming) {
      setIsClamped(el.scrollHeight > el.clientHeight + 2);
    }
  }, [text, streaming, expanded]);

  if (!loading && !streaming && !text && sources.length === 0) return null;

  const parts = text ? parseOverviewWithCitations(text) : [];

  return (
    <div className="mb-5 sm:mb-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <GoogleSparkle />
        <span className="text-[14px] sm:text-[15px] font-normal text-[#1f1f1f]">AI Overview</span>
      </div>

      {/* Skeleton */}
      {!text ? (
        <div className="space-y-2.5 max-w-2xl">
          <div className="h-[14px] bg-[#e8eaed] animate-pulse rounded w-full" />
          <div className="h-[14px] bg-[#e8eaed] animate-pulse rounded w-[96%]" />
          <div className="h-[14px] bg-[#e8eaed] animate-pulse rounded w-[88%]" />
          <div className="h-[14px] bg-[#e8eaed] animate-pulse rounded w-[72%]" />
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6" style={{ animation: "fade-in 0.3s ease-out" }}>
          {/* Text column */}
          <div className="flex-1 min-w-0">
            <div
              ref={textRef}
              className={`text-[14px] sm:text-[15px] leading-[1.6] sm:leading-[1.65] text-[#1f1f1f] ${!expanded ? "line-clamp-6 sm:line-clamp-none" : ""}`}
            >
              {parts.map((part, i) =>
                part.type === "text" ? (
                  <span key={i}>{part.value}</span>
                ) : (() => {
                  const src = sources.find(s => s.index === part.index);
                  if (!src) return <span key={i} className="text-[12px] text-[#70757a] align-super">{part.value}</span>;
                  let d = "";
                  try { d = new URL(src.url).hostname.replace("www.", "").split(".")[0]; } catch { d = "source"; }
                  return (
                    <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0 rounded bg-[#f0f4f9] hover:bg-[#e3e8ef] text-[11px] text-[#1a73e8] font-medium align-baseline transition-colors cursor-pointer whitespace-nowrap">
                      <img src={`https://www.google.com/s2/favicons?domain=${src.url}&sz=16`} alt="" width={10} height={10} className="rounded-full" />
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </a>
                  );
                })()
              )}
              {streaming && <span className="inline-block w-[3px] h-4 bg-[#1a73e8] animate-pulse ml-0.5 align-middle rounded-sm" />}
            </div>

            {/* Show more — mobile only, only when clamped */}
            {isClamped && !streaming && !expanded && (
              <button onClick={() => setExpanded(true)}
                className="sm:hidden mt-2 text-[13px] font-medium text-[#1a73e8] cursor-pointer">
                Show more
              </button>
            )}
            {expanded && !streaming && (
              <button onClick={() => setExpanded(false)}
                className="sm:hidden mt-2 text-[13px] font-medium text-[#1a73e8] cursor-pointer">
                Show less
              </button>
            )}
          </div>

          {/* Sources panel — right side on desktop, below on mobile */}
          {sources.length > 0 && (
            <div className="sm:w-64 lg:w-72 shrink-0 rounded-xl border border-[#dadce0] bg-white overflow-hidden">
              <div className="px-3 pt-2 pb-0.5">
                {sources.map((s) => (
                  <SourceCard key={s.index} source={s} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

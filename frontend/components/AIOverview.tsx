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

export default function AIOverview({ text, sources, loading, streaming }: AIOverviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  // Detect if text is actually overflowing the line-clamp
  useEffect(() => {
    const el = textRef.current;
    if (el && text && !streaming) {
      setIsClamped(el.scrollHeight > el.clientHeight + 2);
    }
  }, [text, streaming, expanded]);

  if (!loading && !streaming && !text && sources.length === 0) return null;

  const parts = text ? parseOverviewWithCitations(text) : [];

  return (
    <div className="mb-4 sm:mb-6 rounded-xl bg-[#f8f9fa] border border-[#dadce0] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
        <GoogleSparkle />
        <span className="text-[13px] sm:text-[14px] font-medium text-[#1f1f1f]">
          AI Overview
        </span>
      </div>

      {/* Skeleton */}
      {!text ? (
        <div className="px-4 pb-4 pt-2 space-y-2.5">
          <div className="space-y-2">
            <div className="h-3 bg-[#e8eaed] animate-pulse rounded w-full" />
            <div className="h-3 bg-[#e8eaed] animate-pulse rounded w-[94%]" />
            <div className="h-3 bg-[#e8eaed] animate-pulse rounded w-[82%]" />
            <div className="h-3 bg-[#e8eaed] animate-pulse rounded w-[65%]" />
          </div>
        </div>
      ) : (
        <div style={{ animation: "fade-in 0.3s ease-out" }}>
          {/* Body text */}
          <div className="px-4 pb-2">
            <div
              ref={textRef}
              className={`text-[14px] sm:text-[15px] leading-[1.65] text-[#1f1f1f] ${!expanded ? "line-clamp-5" : ""}`}
            >
              {parts.map((part, i) =>
                part.type === "text" ? (
                  <span key={i}>{part.value}</span>
                ) : (
                  <a
                    key={i}
                    href={sources.find(s => s.index === part.index)?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-[18px] h-[18px] text-[10px] font-semibold mx-0.5 rounded-full bg-[#e8f0fe] text-[#1a73e8] hover:bg-[#d2e3fc] transition-colors align-top cursor-pointer"
                  >
                    {part.index}
                  </a>
                )
              )}
              {streaming && <span className="inline-block w-[3px] h-4 bg-[#1a73e8] animate-pulse ml-0.5 align-middle rounded-sm" />}
            </div>

            {/* Show more — only when text is actually truncated */}
            {isClamped && !streaming && !expanded && (
              <button onClick={() => setExpanded(true)}
                className="mt-1.5 text-[13px] font-medium text-[#1a73e8] hover:text-[#174ea6] cursor-pointer">
                Show more
              </button>
            )}
            {expanded && !streaming && (
              <button onClick={() => setExpanded(false)}
                className="mt-1.5 text-[13px] font-medium text-[#1a73e8] hover:text-[#174ea6] cursor-pointer">
                Show less
              </button>
            )}
          </div>

          {/* Sources — vertical list like Google */}
          {sources.length > 0 && (
            <div className="px-4 pb-3 pt-1 space-y-1">
              {sources.map((s) => {
                let domain = "";
                try { domain = new URL(s.url).hostname.replace("www.", ""); } catch { domain = s.url; }
                return (
                  <a
                    key={s.index}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 py-1.5 group"
                  >
                    <div className="w-6 h-6 rounded-full bg-white border border-[#dadce0] flex items-center justify-center shrink-0">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                        alt=""
                        width={16}
                        height={16}
                        className="rounded-full"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] text-[#1a73e8] group-hover:underline truncate block">
                        {s.title.replace(" - Wikipedia", "")}
                      </span>
                      <span className="text-[11px] text-[#70757a] truncate block">
                        {domain}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

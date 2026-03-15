"use client";

import React from "react";

const colorValues: Record<string, string> = {
  emerald: "#e88a1a",
  blue: "#e88a1a",
  violet: "#e88a1a",
  purple: "#e88a1a",
  rose: "#e88a1a",
  indigo: "#e88a1a",
  amber: "#e88a1a",
  gray: "#888888",
};

function Icon({ icon, color }: { icon: string; color: string }) {
  const c = colorValues[color] || "#9ca3af";

  switch (icon) {
    case "crawler":
      return (
        <svg viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.5" className="w-4 h-4">
          <circle cx="10" cy="10" r="7.5" />
          <ellipse cx="10" cy="10" rx="3" ry="7.5" />
          <line x1="2.5" y1="7" x2="17.5" y2="7" />
          <line x1="2.5" y1="13" x2="17.5" y2="13" />
        </svg>
      );
    case "indexer":
      return (
        <svg viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.5" className="w-4 h-4">
          <rect x="3" y="2" width="14" height="16" rx="2" />
          <line x1="6" y1="6" x2="14" y2="6" />
          <line x1="6" y1="9.5" x2="14" y2="9.5" />
          <line x1="6" y1="13" x2="11" y2="13" />
        </svg>
      );
    case "chunker":
      return (
        <svg viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.5" className="w-4 h-4">
          <rect x="2" y="2" width="7" height="7" rx="1.5" />
          <rect x="11" y="2" width="7" height="7" rx="1.5" />
          <rect x="2" y="11" width="7" height="7" rx="1.5" />
          <rect x="11" y="11" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "embedder":
      return (
        <svg viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.5" className="w-4 h-4">
          <line x1="3" y1="17" x2="3" y2="3" />
          <line x1="3" y1="17" x2="17" y2="17" />
          <polyline points="3,13 7,8 11,11 15,5" />
          <circle cx="15" cy="5" r="1.5" fill={c} />
        </svg>
      );
    case "bm25":
      return (
        <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
          <rect x="2" y="10" width="3.5" height="8" rx="0.5" fill={c} opacity={0.3} />
          <rect x="7" y="5" width="3.5" height="13" rx="0.5" fill={c} opacity={0.5} />
          <rect x="12" y="2" width="3.5" height="16" rx="0.5" fill={c} opacity={0.7} />
        </svg>
      );
    case "pagerank":
      return (
        <svg viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.5" className="w-4 h-4">
          <circle cx="10" cy="5" r="2.5" fill={c} opacity={0.3} />
          <circle cx="4" cy="14" r="2" fill={c} opacity={0.2} />
          <circle cx="16" cy="14" r="2" fill={c} opacity={0.2} />
          <line x1="10" y1="7.5" x2="4" y2="12" />
          <line x1="10" y1="7.5" x2="16" y2="12" />
          <line x1="6" y1="14" x2="14" y2="14" />
        </svg>
      );
    case "combine":
      return (
        <svg viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.5" className="w-4 h-4">
          <polyline points="3,5 10,10 17,10" />
          <polyline points="3,15 10,10" />
          <circle cx="10" cy="10" r="2" fill={c} opacity={0.3} />
          <polyline points="14,7 17,10 14,13" />
        </svg>
      );
    case "fanout":
      return (
        <svg viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.5" className="w-4 h-4">
          <line x1="3" y1="10" x2="8" y2="10" />
          <line x1="8" y1="10" x2="17" y2="4" />
          <line x1="8" y1="10" x2="17" y2="10" />
          <line x1="8" y1="10" x2="17" y2="16" />
          <circle cx="8" cy="10" r="1.5" fill={c} opacity={0.3} />
        </svg>
      );
    case "retriever":
      return (
        <svg viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.5" className="w-4 h-4">
          <polygon points="2,2 18,2 12,10 12,16 8,18 8,10" />
        </svg>
      );
    case "results":
      return (
        <svg viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.5" className="w-4 h-4">
          <rect x="3" y="2" width="14" height="4" rx="1" />
          <rect x="3" y="8" width="14" height="4" rx="1" />
          <rect x="3" y="14" width="14" height="4" rx="1" />
        </svg>
      );
    case "ai_overview":
      return (
        <svg viewBox="0 0 20 20" fill="none" stroke={c} strokeWidth="1.5" className="w-4 h-4">
          <circle cx="10" cy="10" r="7.5" />
          <path d="M7 10 L9 13 L14 7" />
          <circle cx="10" cy="3" r="1" fill={c} />
          <circle cx="17" cy="10" r="1" fill={c} />
          <circle cx="10" cy="17" r="1" fill={c} />
        </svg>
      );
    default:
      return <div className="w-4 h-4" />;
  }
}

export default React.memo(Icon);

"use client";

import { Stats } from "@/lib/types";

export default function StatsRibbon({ stats }: { stats: Stats | null }) {
  if (!stats) return null;

  const items = [
    { label: "Pages", value: stats.pages_crawled.toLocaleString() },
    { label: "Terms", value: stats.total_terms.toLocaleString() },
    { label: "Chunks", value: stats.total_chunks.toLocaleString() },
    { label: "Embedded", value: stats.chunks_embedded.toLocaleString() },
    { label: "Avg Doc", value: `${Math.round(stats.avg_doc_length)} tokens` },
  ];

  return (
    <div className="flex items-center gap-4 px-4 py-1.5 bg-[#0d0d20] border-b border-[#1a1a3a] text-[11px] text-gray-600 overflow-x-auto">
      {items.map((item, i) => (
        <span key={i} className="whitespace-nowrap">
          <span className="text-gray-500">{item.label}:</span>{" "}
          <span className="text-gray-400">{item.value}</span>
        </span>
      ))}
    </div>
  );
}

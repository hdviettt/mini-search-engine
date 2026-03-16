"use client";

import { useEffect, useRef } from "react";

interface LiveLogProps {
  entries: string[];
  maxHeight?: string;
}

export default function LiveLog({ entries, maxHeight = "200px" }: LiveLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <div
      className="bg-[var(--bg-card)] border border-[var(--border)] font-mono text-[11px] text-[var(--text-dim)] overflow-y-auto p-2"
      style={{ maxHeight }}
    >
      {entries.length === 0 ? (
        <div className="text-[var(--border-hover)] text-center py-4">Waiting for events...</div>
      ) : (
        entries.map((entry, i) => (
          <div key={i} className="py-0.5 hover:text-[var(--text-muted)]">
            <span className="text-[var(--border-hover)] mr-2">{String(i + 1).padStart(3, " ")}</span>
            {entry}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}

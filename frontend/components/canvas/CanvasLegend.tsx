"use client";

export default function CanvasLegend() {
  return (
    <div className="absolute bottom-3 left-3 z-10 bg-[var(--bg-card)] border border-[var(--border)] p-3 text-[10px] font-mono select-none">
      <div className="text-[var(--text-dim)] uppercase tracking-wider mb-2">Legend</div>
      <div className="space-y-1.5">
        {/* System node */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-3.5 bg-[var(--bg-card)] border border-[var(--border)]" />
          <span className="text-[var(--text-muted)]">Build process</span>
        </div>
        {/* Store node */}
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 20 14" className="w-5 h-3.5">
            <path d="M 2 4 L 2 10 Q 2 13 10 13 Q 18 13 18 10 L 18 4" fill="none" stroke="var(--border-hover)" strokeWidth="1" strokeDasharray="2,1.5" />
            <ellipse cx="10" cy="4" rx="8" ry="3" fill="none" stroke="var(--border-hover)" strokeWidth="1" strokeDasharray="2,1.5" />
          </svg>
          <span className="text-[var(--text-muted)]">Data store</span>
        </div>
        {/* Pipeline node */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-3.5 flex">
            <div className="w-[3px] bg-[var(--border-hover)]" />
            <div className="flex-1 border-t border-r border-b border-[var(--border)]" />
          </div>
          <span className="text-[var(--text-muted)]">Query step</span>
        </div>
        {/* Output node */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-3.5 border-2 border-[var(--border-hover)]" style={{ outline: "1px solid var(--border)", outlineOffset: "2px" }} />
          <span className="text-[var(--text-muted)]">Output</span>
        </div>
        {/* Edge types */}
        <div className="border-t border-[var(--border)] pt-1.5 mt-1.5 space-y-1">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 20 4" className="w-5 h-1">
              <line x1="0" y1="2" x2="20" y2="2" stroke="var(--border-hover)" strokeWidth="1" />
            </svg>
            <span className="text-[var(--text-muted)]">Data flow</span>
          </div>
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 20 4" className="w-5 h-1">
              <line x1="0" y1="2" x2="20" y2="2" stroke="var(--border-hover)" strokeWidth="1" strokeDasharray="3,2" />
            </svg>
            <span className="text-[var(--text-muted)]">Write to store</span>
          </div>
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 20 4" className="w-5 h-1">
              <line x1="0" y1="2" x2="20" y2="2" stroke="var(--accent)" strokeWidth="2" strokeDasharray="3,2" />
            </svg>
            <span className="text-[var(--text-muted)]">Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

export default function CanvasLegend() {
  return (
    <div className="absolute bottom-3 left-3 z-10 bg-[var(--bg-card)] border border-[var(--border)] p-3 text-[10px] font-mono select-none">
      <div className="text-[var(--text-dim)] uppercase tracking-wider mb-2">Legend</div>
      <div className="space-y-1.5">
        {/* System node — chamfered */}
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-3.5 bg-[var(--bg-card)] border border-[var(--border)]"
            style={{ clipPath: "polygon(4px 0, 100% 0, 100% 100%, 0 100%, 0 4px)" }}
          />
          <span className="text-[var(--text-muted)]">Build process</span>
        </div>
        {/* Store node */}
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 20 14" className="w-5 h-3.5">
            <path
              d="M 2 4 L 2 10 Q 2 13 10 13 Q 18 13 18 10 L 18 4"
              fill="none"
              stroke="var(--border-hover)"
              strokeWidth="1"
              strokeDasharray="2,1.5"
            />
            <ellipse
              cx="10"
              cy="4"
              rx="8"
              ry="3"
              fill="none"
              stroke="var(--border-hover)"
              strokeWidth="1"
              strokeDasharray="2,1.5"
            />
          </svg>
          <span className="text-[var(--text-muted)]">Data store</span>
        </div>
        {/* Pipeline node — double line */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-3.5 flex">
            <div className="flex gap-[1px]">
              <div className="w-[1.5px] bg-[var(--border-hover)]" />
              <div className="w-[1.5px] bg-[var(--border-hover)]" />
            </div>
            <div className="flex-1 border-t border-r border-b border-[var(--border)]" />
          </div>
          <span className="text-[var(--text-muted)]">Query step</span>
        </div>
        {/* Output node — terminal */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-3.5 border border-[var(--border)]" style={{ borderTopWidth: 2, borderTopColor: "var(--accent)" }} />
          <span className="text-[var(--text-muted)]">Output</span>
        </div>
        {/* Path colors */}
        <div className="border-t border-[var(--border)] pt-1.5 mt-1.5 space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-5 h-0.5 bg-[var(--color-search)]" />
            <span className="text-[var(--text-muted)]">Search path</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-0.5 bg-[var(--color-ai)]" />
            <span className="text-[var(--text-muted)]">AI path</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-0.5 bg-[var(--color-build)]" />
            <span className="text-[var(--text-muted)]">Build</span>
          </div>
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 20 4" className="w-5 h-1">
              <line
                x1="0"
                y1="2"
                x2="20"
                y2="2"
                stroke="var(--border-hover)"
                strokeWidth="1"
                strokeDasharray="3,2"
              />
            </svg>
            <span className="text-[var(--text-muted)]">Store bridge</span>
          </div>
        </div>
      </div>
    </div>
  );
}

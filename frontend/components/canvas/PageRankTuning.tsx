"use client";

import { useState } from "react";
import { recomputePageRank } from "@/lib/api";

export default function PageRankTuning() {
  const [damping, setDamping] = useState(0.85);
  const [iterations, setIterations] = useState(20);
  const [computing, setComputing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleRecompute = async () => {
    setComputing(true);
    setResult(null);
    try {
      await recomputePageRank(damping, iterations);
      setResult("PageRank recomputed successfully");
    } catch {
      setResult("Failed to recompute");
    } finally {
      setComputing(false);
    }
  };

  return (
    <div className="p-3 border-t border-[var(--border)]">
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-3">Parameter Tuning</div>

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-[var(--text-dim)]">Damping Factor</span>
            <span className="text-[var(--accent)] font-mono">{damping.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="1.0"
            step="0.05"
            value={damping}
            onChange={(e) => setDamping(parseFloat(e.target.value))}
            className="w-full h-1 appearance-none bg-[var(--score-bar-bg)] cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--accent)]"
          />
          <div className="flex justify-between text-[9px] text-[var(--text-dim)]">
            <span>0.50</span>
            <span>1.00</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-[var(--text-dim)]">Iterations</span>
            <span className="text-[var(--accent)] font-mono">{iterations}</span>
          </div>
          <input
            type="range"
            min="5"
            max="50"
            step="5"
            value={iterations}
            onChange={(e) => setIterations(parseInt(e.target.value))}
            className="w-full h-1 appearance-none bg-[var(--score-bar-bg)] cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--accent)]"
          />
          <div className="flex justify-between text-[9px] text-[var(--text-dim)]">
            <span>5</span>
            <span>50</span>
          </div>
        </div>

        <button
          onClick={handleRecompute}
          disabled={computing}
          className="w-full py-1.5 text-[10px] font-mono border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent-muted)] disabled:opacity-50 cursor-pointer transition-colors"
        >
          {computing ? "Computing..." : "Recompute PageRank"}
        </button>

        {result && (
          <div className="text-[9px] text-[var(--text-muted)] text-center">{result}</div>
        )}
      </div>
    </div>
  );
}

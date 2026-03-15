"use client";

import { SearchParams } from "@/lib/types";
import ParameterSlider from "./ParameterSlider";

interface TuningTabProps {
  params: SearchParams;
  onChange: (params: SearchParams) => void;
}

const DEFAULTS: SearchParams = { bm25_k1: 1.2, bm25_b: 0.75, rank_alpha: 0.7 };

export default function TuningTab({ params, onChange }: TuningTabProps) {
  const update = (key: keyof SearchParams, value: number) => {
    onChange({ ...params, [key]: value });
  };

  return (
    <div className="p-3">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Tuning</div>

      <ParameterSlider
        label="BM25 k1"
        value={params.bm25_k1}
        defaultValue={DEFAULTS.bm25_k1}
        min={0.5}
        max={3.0}
        step={0.1}
        description="Term frequency saturation"
        onChange={(v) => update("bm25_k1", v)}
      />

      <ParameterSlider
        label="BM25 b"
        value={params.bm25_b}
        defaultValue={DEFAULTS.bm25_b}
        min={0}
        max={1}
        step={0.05}
        description="Length normalization"
        onChange={(v) => update("bm25_b", v)}
      />

      <ParameterSlider
        label="Rank Alpha"
        value={params.rank_alpha}
        defaultValue={DEFAULTS.rank_alpha}
        min={0}
        max={1}
        step={0.05}
        description="BM25 vs PageRank weight"
        onChange={(v) => update("rank_alpha", v)}
      />

      <div className="mt-4 p-3 bg-[#0d0d20] rounded-lg text-[11px] text-gray-600 leading-relaxed">
        <div className="text-gray-500 font-medium mb-1">Current formula:</div>
        <code className="text-rose-400/80">
          final = {params.rank_alpha.toFixed(2)} * BM25(k1={params.bm25_k1.toFixed(1)}, b={params.bm25_b.toFixed(2)}) + {(1 - params.rank_alpha).toFixed(2)} * PageRank
        </code>
      </div>
    </div>
  );
}

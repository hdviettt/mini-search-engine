"use client";

export default function LabelNode({ data }: { data: { label: string } }) {
  return (
    <div className="text-[10px] font-mono text-[var(--text-dim)] tracking-wider uppercase pointer-events-none select-none">
      {data.label}
    </div>
  );
}

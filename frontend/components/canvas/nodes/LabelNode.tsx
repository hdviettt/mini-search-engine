"use client";

export default function LabelNode({ data }: { data: { label: string } }) {
  return (
    <div className="text-[10px] font-mono text-[#555] tracking-wider uppercase pointer-events-none select-none">
      {data.label}
    </div>
  );
}

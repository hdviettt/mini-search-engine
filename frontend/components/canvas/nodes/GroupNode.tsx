"use client";

interface GroupNodeData {
  label: string;
}

export default function GroupNode({ data }: { data: GroupNodeData }) {
  return (
    <div className="w-full h-full relative">
      {data.label && (
        <div className="absolute -top-5 left-2 text-[10px] font-mono text-[#555] tracking-wider uppercase">
          {data.label}
        </div>
      )}
    </div>
  );
}

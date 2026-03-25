"use client";

import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Relationship {
  source: string;
  relation: string;
  target: string;
  confidence: number;
}

interface Attribute {
  entity: string;
  key: string;
  value: string;
}

interface GraphNode {
  id: string;
  name: string;
  type: string;
  degree: number;
  val: number;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
  confidence: number;
}

const TYPE_COLORS: Record<string, string> = {
  player: "#4ade80",
  coach: "#fbbf24",
  team: "#60a5fa",
  league: "#a78bfa",
  tournament: "#f87171",
  country: "#22d3ee",
  stadium: "#fb923c",
  federation: "#818cf8",
};

// Memoized graph canvas to prevent zoom reset on parent re-renders
const GraphCanvas = memo(function GraphCanvas({
  graphData,
  onNodeClick,
  width,
  height,
}: {
  graphData: { nodes: GraphNode[]; links: GraphLink[] };
  onNodeClick: (name: string) => void;
  width: number;
  height: number;
}) {
  const graphRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Center the graph after force layout settles
  useEffect(() => {
    if (graphRef.current && graphData.nodes.length > 0 && width > 0) {
      const timers = [500, 1500, 3000].map(ms =>
        setTimeout(() => graphRef.current?.zoomToFit(400, 30), ms)
      );
      return () => timers.forEach(clearTimeout);
    }
  }, [graphData.nodes.length, width]);

  if (graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--text-dim)]">
        No relationships found yet. Run Knowledge Graph build first.
      </div>
    );
  }

  return (
    <ForceGraph2D
      ref={graphRef}
      graphData={graphData}
      nodeVal={(node) => (node as GraphNode).val}
      nodeRelSize={5}
      nodeLabel={(node) => {
        const n = node as GraphNode;
        return `${n.name} (${n.type}, ${n.degree} connections)`;
      }}
      nodeColor={(node) => TYPE_COLORS[(node as GraphNode).type] || "#888"}
      nodeCanvasObject={(node, ctx, globalScale) => {
        const n = node as GraphNode & { x: number; y: number };
        const r = Math.sqrt(n.val) * 2.5;
        const color = TYPE_COLORS[n.type] || "#888";

        // Circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Label (only show when zoomed in enough)
        if (globalScale > 0.8) {
          const fontSize = Math.max(3, 10 / globalScale);
          ctx.font = `${fontSize}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#333";
          ctx.fillText(n.name, n.x, n.y + r + fontSize);
        }
      }}
      linkLabel={(link) => (link as unknown as GraphLink).label}
      linkColor={() => "rgba(128,128,180,0.4)"}
      linkWidth={(link) => Math.min(3, 1 + (link as unknown as GraphLink).confidence * 0.5)}
      linkDirectionalArrowLength={4}
      linkDirectionalArrowRelPos={1}
      linkDirectionalArrowColor={() => "rgba(128,128,180,0.6)"}
      linkCurvature={0.15}
      linkCanvasObjectMode={() => "after"}
      linkCanvasObject={(link, ctx, globalScale) => {
        const l = link as unknown as GraphLink & { source: { x: number; y: number }; target: { x: number; y: number } };
        if (!l.source?.x || !l.target?.x) return;
        const fontSize = Math.min(12, Math.max(3, 10 / globalScale));
        const mx = (l.source.x + l.target.x) / 2;
        const my = (l.source.y + l.target.y) / 2;
        const label = l.label.replace(/_/g, " ").toLowerCase();
        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(128,128,180,0.85)";
        ctx.fillText(label, mx, my - fontSize * 0.8);
      }}
      onNodeClick={(node) => onNodeClick((node as GraphNode).name)}
      onEngineStop={() => {}}
      cooldownTicks={200}
      d3AlphaDecay={0.04}
      d3VelocityDecay={0.3}
      backgroundColor="transparent"
      width={width}
      height={height}
    />
  );
}, (prev, next) => prev.graphData === next.graphData && prev.width === next.width && prev.height === next.height);

export default function KnowledgeGraphView() {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [entityTypes, setEntityTypes] = useState<Record<string, string>>({});
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<{
    entity: { name: string; type: string };
    attributes: Record<string, string>;
    relationships: { type: string; target: { name: string; entity_type: string }; detail: string }[];
    reverse_relationships: { type: string; source: { name: string; entity_type: string }; detail: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });

  // Measure container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setDimensions({ width: el.clientWidth, height: Math.max(350, el.clientHeight) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Fetch data
  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/explore/knowledge?limit=500`).then(r => r.json()),
      fetch(`${API}/api/explore/entities?limit=500`).then(r => r.json()),
    ]).then(([kgData, entData]) => {
      setRelationships(kgData.relationships || []);
      setAttributes(kgData.attributes || []);

      // Build entity name → type lookup (case-insensitive)
      const typeMap: Record<string, string> = {};
      for (const e of entData.entities || []) {
        typeMap[e.name.toLowerCase()] = e.type;
      }
      setEntityTypes(typeMap);
      setTypeCounts(entData.type_counts || {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadEntityDetail = useCallback((name: string) => {
    fetch(`${API}/api/knowledge/entity/${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(d => { if (d.entity) setSelectedEntity(d); });
  }, []);

  // Build graph data FROM relationships (ensures nodes and links always match)
  const graphData = useMemo(() => {
    const nodeMap = new Map<string, { type: string; degree: number }>();

    // Count degrees from relationships
    for (const r of relationships) {
      if (!nodeMap.has(r.source)) nodeMap.set(r.source, { type: entityTypes[r.source.toLowerCase()] || "unknown", degree: 0 });
      if (!nodeMap.has(r.target)) nodeMap.set(r.target, { type: entityTypes[r.target.toLowerCase()] || "unknown", degree: 0 });
      nodeMap.get(r.source)!.degree++;
      nodeMap.get(r.target)!.degree++;
    }

    // Also add attribute entities as nodes (even without relationships)
    for (const a of attributes) {
      if (!nodeMap.has(a.entity)) nodeMap.set(a.entity, { type: entityTypes[a.entity.toLowerCase()] || "unknown", degree: 0 });
    }

    // Filter by selected type
    let nodes: GraphNode[] = Array.from(nodeMap.entries()).map(([name, info]) => ({
      id: name,
      name,
      type: info.type,
      degree: info.degree,
      val: Math.max(2, Math.sqrt(info.degree + 1) * 3),
    }));

    if (selectedType) {
      const keepNames = new Set(nodes.filter(n => n.type === selectedType).map(n => n.id));
      // Also keep nodes connected TO filtered nodes
      for (const r of relationships) {
        if (keepNames.has(r.source)) keepNames.add(r.target);
        if (keepNames.has(r.target)) keepNames.add(r.source);
      }
      nodes = nodes.filter(n => keepNames.has(n.id));
    }

    const nodeIds = new Set(nodes.map(n => n.id));
    const links: GraphLink[] = relationships
      .filter(r => nodeIds.has(r.source) && nodeIds.has(r.target))
      .map(r => ({ source: r.source, target: r.target, label: r.relation, confidence: r.confidence }));

    return { nodes, links };
  }, [relationships, attributes, entityTypes, selectedType]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-[var(--text-dim)]">Loading knowledge graph...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Type filter pills */}
      <div className="flex flex-wrap gap-1.5 px-4 py-3 border-b border-[var(--border)]">
        <button
          onClick={() => setSelectedType(null)}
          className={`text-[12px] px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
            !selectedType ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          All
        </button>
        {Object.entries(typeCounts).slice(0, 8).map(([type, count]) => (
          <button
            key={type}
            onClick={() => setSelectedType(selectedType === type ? null : type)}
            className={`text-[12px] px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
              selectedType === type ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: TYPE_COLORS[type] || "#888" }} />
            {type} ({count})
          </button>
        ))}
        <span className="text-[11px] text-[var(--text-dim)] self-center ml-2">
          {graphData.nodes.length} nodes, {graphData.links.length} edges
        </span>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Graph canvas */}
        <div ref={containerRef} className="flex-1 relative bg-[var(--bg)]" style={{ minHeight: 300 }}>
          {dimensions.width > 0 && (
            <GraphCanvas graphData={graphData} onNodeClick={loadEntityDetail} width={dimensions.width} height={dimensions.height} />
          )}
        </div>

        {/* Entity detail sidebar */}
        {selectedEntity && (
          <div className="w-72 border-l border-[var(--border)] overflow-y-auto p-4 shrink-0" style={{ animation: "fade-in 0.2s ease-out" }}>
            <button onClick={() => setSelectedEntity(null)} className="text-[11px] text-[var(--accent)] mb-2 cursor-pointer hover:underline">&times; Close</button>
            <h3 className="text-[16px] font-semibold text-[var(--text)] mb-1">{selectedEntity.entity.name}</h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: `${TYPE_COLORS[selectedEntity.entity.type] || "#888"}30`, color: TYPE_COLORS[selectedEntity.entity.type] || "#888" }}>
              {selectedEntity.entity.type}
            </span>

            {Object.keys(selectedEntity.attributes).length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-[10px] text-[var(--text-dim)] font-medium uppercase tracking-wider">Attributes</div>
                {Object.entries(selectedEntity.attributes).map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-2 text-[12px]">
                    <span className="text-[var(--text-dim)] shrink-0">{k}</span>
                    <span className="text-[var(--text)]">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {selectedEntity.relationships.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-[10px] text-[var(--text-dim)] font-medium uppercase tracking-wider">Relationships</div>
                {selectedEntity.relationships.map((r, i) => (
                  <div key={i} className="text-[12px]">
                    <span className="text-[var(--text-dim)]">{r.type}</span>{" "}
                    <button onClick={() => loadEntityDetail(r.target.name)} className="text-[var(--accent)] hover:underline cursor-pointer">{r.target.name}</button>
                    {r.detail && <span className="text-[var(--text-dim)]"> ({r.detail})</span>}
                  </div>
                ))}
              </div>
            )}

            {selectedEntity.reverse_relationships.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-[10px] text-[var(--text-dim)] font-medium uppercase tracking-wider">Referenced by</div>
                {selectedEntity.reverse_relationships.map((r, i) => (
                  <div key={i} className="text-[12px]">
                    <button onClick={() => loadEntityDetail(r.source.name)} className="text-[var(--accent)] hover:underline cursor-pointer">{r.source.name}</button>
                    {" "}<span className="text-[var(--text-dim)]">{r.type}</span>
                    {r.detail && <span className="text-[var(--text-dim)]"> ({r.detail})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

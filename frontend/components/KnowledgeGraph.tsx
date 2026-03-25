"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";

// Force graph must be loaded client-side only (uses Canvas)
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Entity {
  id: number;
  name: string;
  type: string;
  page_count: number;
}

interface Relationship {
  source: string;
  relation: string;
  target: string;
  confidence: number;
}

interface GraphNode {
  id: string;
  name: string;
  type: string;
  pageCount: number;
  val: number; // size
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

export default function KnowledgeGraphView() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<{
    entity: { name: string; type: string };
    attributes: Record<string, string>;
    relationships: { type: string; target: { name: string; entity_type: string }; detail: string }[];
    reverse_relationships: { type: string; source: { name: string; entity_type: string }; detail: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const graphRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/explore/entities?limit=200${selectedType ? `&entity_type=${selectedType}` : ""}`).then(r => r.json()),
      fetch(`${API}/api/explore/knowledge?limit=200`).then(r => r.json()),
    ]).then(([entData, kgData]) => {
      setEntities(entData.entities || []);
      setTypeCounts(entData.type_counts || {});
      setRelationships(kgData.relationships || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selectedType]);

  const loadEntityDetail = useCallback((name: string) => {
    fetch(`${API}/api/knowledge/entity/${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(d => { if (d.entity) setSelectedEntity(d); });
  }, []);

  // Build graph data from entities + relationships
  const entityNames = new Set(entities.map(e => e.name));
  const graphNodes: GraphNode[] = entities.slice(0, 100).map(e => ({
    id: e.name,
    name: e.name,
    type: e.type,
    pageCount: e.page_count,
    val: Math.max(2, Math.min(15, e.page_count)),
  }));

  const nodeIds = new Set(graphNodes.map(n => n.id));
  const graphLinks: GraphLink[] = relationships
    .filter(r => nodeIds.has(r.source) && nodeIds.has(r.target))
    .map(r => ({ source: r.source, target: r.target, label: r.relation, confidence: r.confidence }));

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
          onClick={() => { setSelectedType(null); setSelectedEntity(null); }}
          className={`text-[12px] px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
            !selectedType ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          All ({Object.values(typeCounts).reduce((a, b) => a + b, 0)})
        </button>
        {Object.entries(typeCounts).map(([type, count]) => (
          <button
            key={type}
            onClick={() => { setSelectedType(type); setSelectedEntity(null); }}
            className={`text-[12px] px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
              selectedType === type ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: TYPE_COLORS[type] || "#888" }} />
            {type} ({count})
          </button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Graph canvas */}
        <div className="flex-1 relative bg-[var(--bg)]">
          {graphNodes.length > 0 ? (
            <ForceGraph2D
              ref={graphRef}
              graphData={{ nodes: graphNodes, links: graphLinks }}
              nodeLabel={(node) => `${(node as GraphNode).name} (${(node as GraphNode).type}, ${(node as GraphNode).pageCount} pages)`}
              nodeColor={(node) => TYPE_COLORS[(node as GraphNode).type] || "#888"}
              nodeVal={(node) => (node as GraphNode).val}
              linkLabel={(link) => (link as unknown as GraphLink).label}
              linkColor={() => "rgba(255,255,255,0.15)"}
              linkDirectionalArrowLength={4}
              linkDirectionalArrowRelPos={1}
              onNodeClick={(node) => loadEntityDetail((node as GraphNode).name)}
              backgroundColor="transparent"
              width={600}
              height={400}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-[var(--text-dim)]">
              No entities with relationships to display
            </div>
          )}
        </div>

        {/* Entity detail sidebar */}
        {selectedEntity && (
          <div className="w-72 border-l border-[var(--border)] overflow-y-auto p-4" style={{ animation: "fade-in 0.2s ease-out" }}>
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

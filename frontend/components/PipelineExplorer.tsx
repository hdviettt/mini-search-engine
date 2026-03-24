"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getStats, startCrawl, rebuildIndex, rebuildEmbeddings, explorePages, exploreIndex, explorePageRank, exploreChunks, exploreEmbed } from "@/lib/api";
import type { OverviewSource, OverviewTrace } from "@/lib/api";
import type { ExplainResponse, PipelineTrace, Stats } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────────

type NodeId =
  // Build
  | "crawler" | "pages_db" | "indexer" | "pr_compute" | "chunker" | "embedder"
  // Stores
  | "inv_index" | "pr_scores" | "vector_store"
  // Query — search path
  | "query_input" | "tokenize" | "index_lookup" | "bm25" | "pr_lookup" | "combine" | "results"
  // Query — AI path
  | "fanout" | "embed_query" | "vector_search" | "llm" | "ai_overview";

type NodeStatus = "idle" | "ready" | "active" | "done";

interface NodeDef {
  id: NodeId;
  label: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  activeFill: string;
  kind: "process" | "store" | "io";
}

interface ArrowDef {
  path: string;
  dashed?: boolean;
  dim?: boolean;
  label?: string;
  labelX?: number;
  labelY?: number;
}

// ─── Layout ─────────────────────────────────────────────────────

const LANES = [
  { label: "Build", sub: "(offline)", y: 0, h: 260, bg: "#f0fdf4" },
  { label: "Stores", sub: "", y: 268, h: 62, bg: "#fffbeb" },
  { label: "Query", sub: "(per search)", y: 338, h: 450, bg: "#eff6ff" },
];

const NODES: NodeDef[] = [
  // ── BUILD ──
  { id: "crawler",    label: "Crawler",         cx: 390, cy: 42,  w: 120, h: 40, fill: "#a7f3d0", stroke: "#6ee7b7", activeFill: "#6ee7b7", kind: "process" },
  { id: "pages_db",   label: "Pages DB",        cx: 390, cy: 112, w: 115, h: 40, fill: "#fef3c7", stroke: "#fcd34d", activeFill: "#fde68a", kind: "store" },
  { id: "indexer",    label: "Indexer",          cx: 150, cy: 192, w: 110, h: 40, fill: "#bfdbfe", stroke: "#93c5fd", activeFill: "#93c5fd", kind: "process" },
  { id: "pr_compute", label: "PageRank Compute", cx: 390, cy: 192, w: 155, h: 40, fill: "#c7d2fe", stroke: "#a5b4fc", activeFill: "#a5b4fc", kind: "process" },
  { id: "chunker",    label: "Chunker",          cx: 630, cy: 192, w: 110, h: 40, fill: "#ddd6fe", stroke: "#c4b5fd", activeFill: "#c4b5fd", kind: "process" },
  { id: "embedder",   label: "Embedder",         cx: 630, cy: 245, w: 110, h: 40, fill: "#e9d5ff", stroke: "#c084fc", activeFill: "#c084fc", kind: "process" },
  // ── STORES ──
  { id: "inv_index",    label: "Inverted Index", cx: 150, cy: 300, w: 125, h: 40, fill: "#fef3c7", stroke: "#fcd34d", activeFill: "#fde68a", kind: "store" },
  { id: "pr_scores",    label: "PR Scores",      cx: 390, cy: 300, w: 115, h: 40, fill: "#fef3c7", stroke: "#fcd34d", activeFill: "#fde68a", kind: "store" },
  { id: "vector_store", label: "Vector Store",   cx: 630, cy: 300, w: 120, h: 40, fill: "#fef3c7", stroke: "#fcd34d", activeFill: "#fde68a", kind: "store" },
  // ── QUERY — shared ──
  { id: "query_input", label: "Search Query",    cx: 390, cy: 385, w: 135, h: 40, fill: "#fed7aa", stroke: "#fdba74", activeFill: "#fdba74", kind: "io" },
  // ── QUERY — search path ──
  { id: "tokenize",     label: "Tokenize",       cx: 195, cy: 460, w: 115, h: 40, fill: "#fed7aa", stroke: "#fdba74", activeFill: "#fdba74", kind: "process" },
  { id: "index_lookup", label: "Index Lookup",   cx: 195, cy: 530, w: 125, h: 40, fill: "#fed7aa", stroke: "#fdba74", activeFill: "#fdba74", kind: "process" },
  { id: "bm25",         label: "BM25 Scoring",   cx: 195, cy: 603, w: 125, h: 40, fill: "#fed7aa", stroke: "#fdba74", activeFill: "#fdba74", kind: "process" },
  { id: "pr_lookup",    label: "PR Lookup",      cx: 345, cy: 603, w: 110, h: 40, fill: "#fed7aa", stroke: "#fdba74", activeFill: "#fdba74", kind: "process" },
  { id: "combine",      label: "Combine Scores", cx: 265, cy: 678, w: 135, h: 40, fill: "#fed7aa", stroke: "#fdba74", activeFill: "#fdba74", kind: "process" },
  { id: "results",      label: "Ranked Results",  cx: 265, cy: 748, w: 135, h: 40, fill: "#bfdbfe", stroke: "#93c5fd", activeFill: "#93c5fd", kind: "io" },
  // ── QUERY — AI path (sequential: fan-out → embed → vector search → LLM → overview) ──
  { id: "fanout",        label: "Fan-out",          cx: 600, cy: 460, w: 115, h: 40, fill: "#ddd6fe", stroke: "#c4b5fd", activeFill: "#c4b5fd", kind: "process" },
  { id: "embed_query",   label: "Embed Query",     cx: 600, cy: 530, w: 115, h: 40, fill: "#ddd6fe", stroke: "#c4b5fd", activeFill: "#c4b5fd", kind: "process" },
  { id: "vector_search", label: "Vector Search",   cx: 600, cy: 600, w: 125, h: 40, fill: "#ddd6fe", stroke: "#c4b5fd", activeFill: "#c4b5fd", kind: "process" },
  { id: "llm",           label: "LLM Synthesis",   cx: 600, cy: 670, w: 125, h: 40, fill: "#ddd6fe", stroke: "#c4b5fd", activeFill: "#c4b5fd", kind: "process" },
  { id: "ai_overview",   label: "AI Overview",     cx: 600, cy: 740, w: 125, h: 40, fill: "#e9d5ff", stroke: "#c084fc", activeFill: "#c084fc", kind: "io" },
];

const ARROWS: ArrowDef[] = [
  // BUILD
  { path: "M 390 62 V 92" },                                     // crawler → pages_db
  { path: "M 390 132 V 152 H 150 V 172" },                       // pages_db → indexer
  { path: "M 390 132 V 172" },                                    // pages_db → pr_compute
  { path: "M 390 132 V 152 H 630 V 172" },                       // pages_db → chunker
  { path: "M 150 212 V 280" },                                    // indexer → inv_index
  { path: "M 390 212 V 280" },                                    // pr_compute → pr_scores
  { path: "M 630 212 V 225" },                                    // chunker → embedder
  { path: "M 630 265 V 280" },                                    // embedder → vector_store
  // BRIDGE (dashed, dim)
  { path: "M 150 320 V 500 H 195 V 510", dashed: true, dim: true },   // inv_index → index_lookup
  { path: "M 390 320 V 573 H 345 V 583", dashed: true, dim: true },   // pr_scores → pr_lookup
  { path: "M 630 320 V 570 H 600 V 580", dashed: true, dim: true },   // vector_store → vector_search
  // QUERY — from query_input (all share same V-turn for clean fan-out)
  { path: "M 390 405 V 430 H 195 V 440" },                       // query → tokenize
  { path: "M 458 385 H 600 V 440" },                              // query → fanout (from right edge)
  // QUERY — search path
  { path: "M 195 480 V 510" },                                    // tokenize → index_lookup
  { path: "M 230 480 V 495 H 345 V 583" },                       // tokenize → pr_lookup (down, right, down)
  { path: "M 195 550 V 583" },                                    // index_lookup → bm25
  { path: "M 195 623 V 648 H 265 V 658" },                       // bm25 → combine
  { path: "M 345 623 V 648 H 265 V 658" },                       // pr_lookup → combine
  { path: "M 265 698 V 728" },                                    // combine → results
  // QUERY — AI path (sequential)
  { path: "M 600 480 V 510" },                                    // fanout → embed_query
  { path: "M 600 550 V 580" },                                    // embed_query → vector_search
  { path: "M 600 620 V 650" },                                    // vector_search → llm
  { path: "M 600 690 V 720" },                                    // llm → ai_overview
];

// ─── Animation ──────────────────────────────────────────────────

const NODE_STEP: Record<NodeId, number> = {
  // Build nodes start as "ready"
  crawler: -1, pages_db: -1, indexer: -1, pr_compute: -1, chunker: -1, embedder: -1,
  inv_index: -1, pr_scores: -1, vector_store: -1,
  // Query animation steps
  query_input: 0,
  tokenize: 1,
  index_lookup: 2, // inv_index also activates
  bm25: 3,
  pr_lookup: 4, // pr_scores also activates
  combine: 5,
  results: 6,
  fanout: 7,
  embed_query: 8,
  vector_search: 9, // vector_store also activates
  llm: 10,
  ai_overview: 11,
};

// Stores that activate with query steps
const STORE_ACTIVATE: Record<number, NodeId[]> = {
  2: ["inv_index"],
  4: ["pr_scores"],
  9: ["vector_store"],
};

function useAnimatedSteps(trace: PipelineTrace | null) {
  const [step, setStep] = useState(-1);
  const prev = useRef<PipelineTrace | null>(null);

  useEffect(() => {
    if (!trace || trace === prev.current) return;
    prev.current = trace;
    setStep(-1);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i <= 10; i++) {
      timers.push(setTimeout(() => setStep(i), 300 * (i + 1)));
    }
    return () => timers.forEach(clearTimeout);
  }, [trace]);

  return step;
}

function getNodeStatus(id: NodeId, activeStep: number): NodeStatus {
  const s = NODE_STEP[id];
  if (s === -1) return "ready"; // build/store nodes are always ready
  if (activeStep < s) return "idle";
  if (activeStep === s) return "active";
  // Check if this store is activated by current step
  const storeActivations = STORE_ACTIVATE[activeStep];
  if (storeActivations?.includes(id)) return "active";
  return "done";
}

// ─── SVG Flowchart ──────────────────────────────────────────────

function Flowchart({
  activeStep,
  selectedNode,
  onSelectNode,
  data,
}: {
  activeStep: number;
  selectedNode: NodeId | null;
  onSelectNode: (id: NodeId | null) => void;
  data: ExplainResponse | null;
}) {
  return (
    <div className="overflow-x-auto -mx-2 px-2 sm:-mx-4 sm:px-4">
      <div className="min-w-[380px] sm:min-w-[500px]">
        <svg viewBox="0 0 770 800" className="w-full h-auto pipeline-canvas" preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="0.7" fill="var(--border)" />
            </pattern>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
            </marker>
            <marker id="arr-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#cbd5e1" />
            </marker>
          </defs>

          <rect width="770" height="800" fill="url(#dots)" rx="12" />

          {/* Swimlane bands */}
          {LANES.map((lane) => (
            <g key={lane.label}>
              <rect x="42" y={lane.y + 4} width="720" height={lane.h - 8} rx="8" fill={lane.bg} opacity="0.2" />
              <text
                x="16" y={lane.y + lane.h / 2 - (lane.sub ? 4 : 0)}
                textAnchor="middle" fontSize="10" fill="#94a3b8" fontWeight="700" letterSpacing="0.05em"
                transform={`rotate(-90, 16, ${lane.y + lane.h / 2})`}
              >
                {lane.label.toUpperCase()}
              </text>
              {lane.sub && (
                <text
                  x="28" y={lane.y + lane.h / 2 + 4}
                  textAnchor="middle" fontSize="8" fill="#cbd5e1"
                  transform={`rotate(-90, 28, ${lane.y + lane.h / 2})`}
                >
                  {lane.sub}
                </text>
              )}
            </g>
          ))}

          {/* Sub-path labels — on the left edge of each column, rotated vertically */}
          <text x="128" y="590" textAnchor="middle" fontSize="9" fill="#b45309" fontWeight="700" letterSpacing="0.06em" opacity="0.6"
            transform="rotate(-90, 128, 590)">SEARCH PATH</text>
          <text x="710" y="600" textAnchor="middle" fontSize="9" fill="#7c3aed" fontWeight="700" letterSpacing="0.06em" opacity="0.6"
            transform="rotate(-90, 710, 600)">AI OVERVIEW PATH</text>

          {/* Subtle divider between the two query paths */}
          <line x1="415" y1="450" x2="415" y2="790" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,4" />

          {/* Arrows */}
          {ARROWS.map((a, i) => (
            <path
              key={i}
              d={a.path}
              fill="none"
              stroke={a.dim ? "#cbd5e1" : "#94a3b8"}
              strokeWidth={a.dim ? "1" : "1.5"}
              strokeDasharray={a.dashed ? "5,4" : undefined}
              strokeLinejoin="round"
              markerEnd={a.dim ? "url(#arr-dim)" : "url(#arr)"}
              opacity={a.dim ? 0.5 : 1}
            />
          ))}

          {/* Nodes */}
          {NODES.map((node) => {
            const status = getNodeStatus(node.id, activeStep);
            const selected = selectedNode === node.id;
            const clickable = status !== "idle";
            const x = node.cx - node.w / 2;
            const y = node.cy - node.h / 2;
            const isStore = node.kind === "store";
            const isIO = node.kind === "io";
            const ry = 7; // ellipse ry for cylinder caps

            let fill = "#f5f5f5";
            let strokeColor = "#d4d4d4";
            let sw = 1.5;
            if (status === "active") { fill = node.activeFill; strokeColor = node.stroke; }
            else if (status === "done" || status === "ready") { fill = node.fill; strokeColor = node.stroke; }
            if (selected) { fill = node.activeFill; strokeColor = "#2563eb"; sw = isStore ? 1.5 : 2.5; }

            return (
              <g
                key={node.id}
                onClick={() => clickable ? onSelectNode(selected ? null : node.id) : undefined}
                style={{ cursor: clickable ? "pointer" : "default" }}
              >
                {/* Active pulse — subtle glow behind the node */}
                {status === "active" && !selected && (
                  <rect x={x - 2} y={y - 2} width={node.w + 4} height={node.h + 4}
                    rx={isStore ? 12 : isIO ? (node.h + 4) / 2 : 10}
                    fill={node.activeFill} opacity="0.3">
                    <animate attributeName="opacity" values="0.3;0.1;0.3" dur="1.2s" repeatCount="indefinite" />
                  </rect>
                )}

                {/* Node shape */}
                {isStore ? (
                  /* Cylinder for database/store nodes */
                  <g>
                    {/* Body */}
                    <rect x={x} y={y + ry} width={node.w} height={node.h - 2 * ry}
                      fill={fill} stroke={strokeColor} strokeWidth={sw} />
                    {/* Side lines connecting top and bottom ellipses */}
                    <line x1={x} y1={y + ry} x2={x} y2={y + node.h - ry}
                      stroke={strokeColor} strokeWidth={sw} />
                    <line x1={x + node.w} y1={y + ry} x2={x + node.w} y2={y + node.h - ry}
                      stroke={strokeColor} strokeWidth={sw} />
                    {/* Bottom ellipse */}
                    <ellipse cx={node.cx} cy={y + node.h - ry} rx={node.w / 2} ry={ry}
                      fill={fill} stroke={strokeColor} strokeWidth={sw} />
                    {/* Top ellipse (drawn last to be on top) */}
                    <ellipse cx={node.cx} cy={y + ry} rx={node.w / 2} ry={ry}
                      fill={fill} stroke={strokeColor} strokeWidth={sw} />
                  </g>
                ) : (
                  /* Rectangle for process nodes, pill for I/O nodes */
                  <rect
                    x={x} y={y} width={node.w} height={node.h}
                    rx={isIO ? node.h / 2 : 8}
                    fill={fill} stroke={strokeColor} strokeWidth={sw}
                  />
                )}

                {/* Label */}
                <text x={node.cx} y={node.cy + 1} textAnchor="middle" dominantBaseline="central"
                  fontSize="10.5" fontWeight="600"
                  fill={status === "idle" ? "#a3a3a3" : "#1e293b"}>
                  {node.label}
                </text>

                {/* Done indicator */}
                {status === "done" && (
                  <circle cx={x + node.w - 5} cy={y + 5} r="4" fill="#22c55e" />
                )}
              </g>
            );
          })}

          {/* Annotations — positioned to the right of nodes, avoiding arrows */}
          {data && activeStep >= 1 && (
            <Annotation x={265} y={450} text={`${data.pipeline.tokenization.tokens.join(", ")}`} />
          )}
          {data && activeStep >= 3 && (
            <Annotation x={280} y={583} text={`${data.pipeline.bm25_scoring.total_matched} docs matched`} />
          )}
          {data && activeStep >= 6 && (
            <Annotation x={345} y={740} text={`${data.total_results} results`} />
          )}
        </svg>
      </div>
    </div>
  );
}

function Annotation({ x, y, text }: { x: number; y: number; text: string }) {
  const clipped = text.length > 30 ? text.slice(0, 28) + "…" : text;
  const w = Math.max(clipped.length * 6 + 14, 48);
  return (
    <g style={{ animation: "fade-in 0.3s ease-out" }}>
      <rect x={x} y={y} width={w} height={22} rx="5" fill="#fefce8" stroke="#fde047" strokeWidth="1" />
      <polygon points={`${x},${y + 7} ${x - 5},${y + 11} ${x},${y + 15}`} fill="#fefce8" stroke="#fde047" strokeWidth="1" />
      <text x={x + w / 2} y={y + 14} textAnchor="middle" fontSize="9.5" fill="#854d0e" fontFamily="var(--font-mono, monospace)">
        {clipped}
      </text>
    </g>
  );
}

// ─── Detail Panel ───────────────────────────────────────────────

// Reusable skeleton components
function SkeletonLine({ w = "w-full" }: { w?: string }) {
  return <div className={`h-3 bg-[var(--score-bar-bg)] animate-pulse rounded ${w}`} />;
}

function SkeletonRows({ rows = 3 }: { rows?: number }) {
  const widths = ["w-full", "w-[85%]", "w-[70%]", "w-[90%]", "w-[60%]"];
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonLine key={i} w={widths[i % widths.length]} />
      ))}
    </div>
  );
}

function SkeletonStats({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex justify-between">
          <div className="h-3 bg-[var(--score-bar-bg)] animate-pulse rounded w-20" />
          <div className="h-3 bg-[var(--score-bar-bg)] animate-pulse rounded w-14" />
        </div>
      ))}
    </div>
  );
}

function SkeletonTable({ rows = 4, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex gap-3">
        {Array.from({ length: cols }, (_, i) => (
          <div key={i} className="h-2.5 bg-[var(--score-bar-bg)] animate-pulse rounded w-16" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }, (_, j) => (
            <div key={j} className={`h-3 bg-[var(--score-bar-bg)] animate-pulse rounded ${j === 0 ? "w-12" : "w-20"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-1.5">{children}</div>;
}

function IOBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="bg-[var(--bg-elevated)] rounded-lg px-3 py-2">{children}</div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-[var(--text-dim)]">{label}</span>
      <span className="font-mono text-[var(--text)]">{value}</span>
    </div>
  );
}

function ActionButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="w-full text-xs px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 cursor-pointer transition-colors text-left">
      {children}
    </button>
  );
}

function DetailPanel({ nodeId, data, stats, onClose, onRefreshStats, overviewText, overviewSources, overviewLoading, overviewTrace }: {
  nodeId: NodeId;
  data: ExplainResponse | null;
  stats: Stats | null;
  onClose: () => void;
  onRefreshStats: () => void;
  overviewText: string;
  overviewSources: OverviewSource[];
  overviewLoading: boolean;
  overviewTrace?: OverviewTrace | null;
}) {
  const node = NODES.find((n) => n.id === nodeId)!;
  const trace = data?.pipeline;
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  async function runAction(fn: () => Promise<unknown>, msg: string) {
    setActionMsg(msg);
    try { await fn(); onRefreshStats(); }
    catch { setActionMsg("Failed"); }
    finally { setTimeout(() => setActionMsg(null), 3000); }
  }

  return (
    <div className="bg-[var(--bg-card)] overflow-hidden h-fit">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-[var(--border)]">
        <div className="w-3 h-3 rounded shrink-0" style={{ background: node.fill, border: `1.5px solid ${node.stroke}` }} />
        <span className="text-xs sm:text-sm font-semibold text-[var(--text)] flex-1 truncate">{node.label}</span>
        <button onClick={onClose} className="text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer p-1.5 -mr-1 shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 space-y-2.5 sm:space-y-3 text-sm max-h-[50vh] lg:max-h-[60vh] overflow-y-auto">
        {actionMsg && <div className="text-xs text-[var(--accent)] font-medium animate-pulse">{actionMsg}</div>}

        {nodeId === "crawler" && (
          <>
            <p className="text-xs text-[var(--text-muted)]">Fetches web pages via breadth-first search from seed URLs.</p>
            {stats ? (
              <div className="space-y-1" style={{ animation: "fade-in 0.3s ease-out" }}>
                <StatRow label="Pages crawled" value={stats.pages_crawled.toLocaleString()} />
                <StatRow label="Pending" value={stats.pages_pending.toLocaleString()} />
                <StatRow label="Failed" value={stats.pages_failed.toLocaleString()} />
                {stats.last_crawl_at && <StatRow label="Last crawl" value={new Date(stats.last_crawl_at).toLocaleDateString()} />}
              </div>
            ) : <SkeletonStats rows={4} />}
            <ActionButton onClick={() => runAction(() => startCrawl(["https://en.wikipedia.org/wiki/Association_football"], 500, 2), "Starting crawl...")}>
              Start new crawl (Wikipedia football, 500 pages)
            </ActionButton>
          </>
        )}

        {nodeId === "indexer" && (
          <>
            <p className="text-xs text-[var(--text-muted)]">Tokenizes each page and builds the inverted index (term → doc list).</p>
            {stats ? (
              <div className="space-y-1" style={{ animation: "fade-in 0.3s ease-out" }}>
                <StatRow label="Unique terms" value={stats.total_terms.toLocaleString()} />
                <StatRow label="Total postings" value={stats.total_postings.toLocaleString()} />
              </div>
            ) : <SkeletonStats rows={2} />}
            <SectionLabel>Top terms by document frequency</SectionLabel>
            <IndexPreview />
            <ActionButton onClick={() => runAction(rebuildIndex, "Rebuilding index...")}>
              Rebuild inverted index
            </ActionButton>
          </>
        )}

        {nodeId === "pr_compute" && (
          <>
            <p className="text-xs text-[var(--text-muted)]">Iteratively distributes authority through the link graph. Pages linked by many high-authority pages score highest.</p>
            {stats ? (
              <div className="space-y-1" style={{ animation: "fade-in 0.3s ease-out" }}>
                <StatRow label="Pages scored" value={stats.pages_crawled.toLocaleString()} />
                <StatRow label="Damping factor" value="0.85" />
              </div>
            ) : <SkeletonStats rows={2} />}
            <SectionLabel>Top pages by PageRank</SectionLabel>
            <PageRankPreview />
          </>
        )}

        {nodeId === "chunker" && (
          <>
            <p className="text-xs text-[var(--text-muted)]">Splits pages into ~300-token chunks at sentence boundaries.</p>
            {stats ? (
              <div className="space-y-1" style={{ animation: "fade-in 0.3s ease-out" }}>
                <StatRow label="Total chunks" value={stats.total_chunks.toLocaleString()} />
                <StatRow label="Avg per page" value={(stats.total_chunks / Math.max(stats.pages_crawled, 1)).toFixed(1)} />
                <StatRow label="Max tokens" value="~300" />
              </div>
            ) : <SkeletonStats rows={3} />}
            <SectionLabel>Sample chunks</SectionLabel>
            <ChunkList limit={3} />
          </>
        )}

        {nodeId === "embedder" && (
          <>
            <p className="text-xs text-[var(--text-muted)]">Generates dense vectors for each chunk using Voyage AI.</p>
            {stats ? (
              <div className="space-y-1" style={{ animation: "fade-in 0.3s ease-out" }}>
                <StatRow label="Embedded" value={stats.chunks_embedded.toLocaleString()} />
                <StatRow label="Dimensions" value="512" />
                <StatRow label="Model" value="Voyage AI" />
              </div>
            ) : <SkeletonStats rows={3} />}
            <SectionLabel>Sample embeddings</SectionLabel>
            <ChunkList limit={3} includeEmbeddings />
            <ActionButton onClick={() => runAction(rebuildEmbeddings, "Rebuilding embeddings...")}>
              Rebuild embeddings
            </ActionButton>
          </>
        )}

        {/* STORES — actual database records */}
        {nodeId === "pages_db" && <DbTableView endpoint="pages" />}
        {nodeId === "inv_index" && <DbTableView endpoint="index" />}
        {nodeId === "pr_scores" && <DbTableView endpoint="pagerank" />}
        {nodeId === "vector_store" && (
          <>
            {stats && (
              <div className="space-y-1 mb-2">
                <StatRow label="Total chunks" value={stats.total_chunks.toLocaleString()} />
                <StatRow label="Embedded" value={stats.chunks_embedded.toLocaleString()} />
              </div>
            )}
            <SectionLabel>Stored vectors</SectionLabel>
            <ChunkList limit={4} includeEmbeddings />
          </>
        )}

        {/* QUERY nodes */}
        {nodeId === "query_input" && data && (
          <div style={{ animation: "fade-in 0.3s ease-out" }}>
            <IOBlock label="Query">
              <span className="font-mono text-sm text-[var(--text)]">&quot;{data.query}&quot;</span>
            </IOBlock>
          </div>
        )}
        {nodeId === "query_input" && !data && <SkeletonRows rows={1} />}

        {nodeId === "tokenize" && trace && (
          <div style={{ animation: "fade-in 0.3s ease-out" }}>
            <IOBlock label="Input">
              <span className="font-mono text-xs text-[var(--text)]">&quot;{trace.tokenization.input}&quot;</span>
            </IOBlock>
            <IOBlock label="Output tokens">
              <div className="flex flex-wrap gap-1">
                {trace.tokenization.tokens.map((t, i) => (
                  <span key={i} className="font-mono text-xs px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded">{t}</span>
                ))}
              </div>
            </IOBlock>
            {trace.tokenization.stopwords_removed.length > 0 && (
              <IOBlock label="Stopwords removed">
                <div className="flex flex-wrap gap-1">
                  {trace.tokenization.stopwords_removed.map((w, i) => (
                    <span key={i} className="font-mono text-xs px-1.5 py-0.5 bg-red-50 text-red-400 rounded line-through">{w}</span>
                  ))}
                </div>
              </IOBlock>
            )}
            <StatRow label="Time" value={`${trace.tokenization.time_ms.toFixed(1)}ms`} />
          </div>
        )}
        {nodeId === "tokenize" && !trace && <SkeletonRows rows={2} />}

        {nodeId === "index_lookup" && trace && <div style={{ animation: "fade-in 0.3s ease-out" }}><IndexDetail trace={trace} /></div>}
        {nodeId === "bm25" && trace && <div style={{ animation: "fade-in 0.3s ease-out" }}><BM25Detail trace={trace} /></div>}
        {nodeId === "pr_lookup" && trace && <div style={{ animation: "fade-in 0.3s ease-out" }}><PageRankDetail trace={trace} /></div>}
        {nodeId === "combine" && trace && <div style={{ animation: "fade-in 0.3s ease-out" }}><CombineDetail trace={trace} /></div>}

        {nodeId === "results" && data && <div style={{ animation: "fade-in 0.3s ease-out" }}><ResultsDetail data={data} /></div>}
        {nodeId === "results" && !data && <SkeletonRows rows={4} />}

        {nodeId === "fanout" && (
          <>
            <p className="text-xs text-[var(--text-muted)]">Expands the query via LLM into multiple search angles — generates related questions and keywords for broader coverage.</p>
            {overviewTrace?.fanout && (
              <div style={{ animation: "fade-in 0.3s ease-out" }}>
                <IOBlock label="Original query">
                  <span className="font-mono text-xs text-[var(--text)]">&quot;{overviewTrace.fanout.original}&quot;</span>
                </IOBlock>
                <IOBlock label="Expanded queries">
                  <div className="flex flex-wrap gap-1">
                    {overviewTrace.fanout.expanded.map((q, i) => (
                      <span key={i} className="font-mono text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">{q}</span>
                    ))}
                  </div>
                </IOBlock>
                <StatRow label="Time" value={`${overviewTrace.fanout.time_ms.toFixed(1)}ms`} />
              </div>
            )}
          </>
        )}
        {nodeId === "embed_query" && (
          <>
            <p className="text-xs text-[var(--text-muted)]">Converts each expanded query into a dense vector for cosine similarity matching against stored chunk embeddings.</p>
            {overviewTrace?.embedding ? (
              <div style={{ animation: "fade-in 0.3s ease-out" }}>
                <IOBlock label="Queries embedded">
                  <div className="flex flex-wrap gap-1">
                    {overviewTrace.embedding.queries.map((q: string, i: number) => (
                      <span key={i} className="font-mono text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">{q}</span>
                    ))}
                  </div>
                </IOBlock>
                <StatRow label="Dimensions" value={overviewTrace.embedding.dimensions} />
                <StatRow label="Time" value={`${overviewTrace.embedding.time_ms.toFixed(1)}ms`} />
              </div>
            ) : data?.query ? (
              <EmbeddingPreview query={data.query} />
            ) : (
              <SkeletonRows rows={3} />
            )}
          </>
        )}
        {nodeId === "vector_search" && (
          <>
            <p className="text-xs text-[var(--text-muted)]">Hybrid retrieval: combines cosine similarity (vector) with BM25 keyword search.</p>
            {overviewTrace?.retrieval && (
              <div style={{ animation: "fade-in 0.3s ease-out" }}>
                <div className="space-y-1">
                  <StatRow label="Chunks retrieved" value={overviewTrace.retrieval.chunks_retrieved ?? 0} />
                  {overviewTrace.retrieval.time_ms != null && <StatRow label="Time" value={`${overviewTrace.retrieval.time_ms.toFixed(1)}ms`} />}
                </div>
                <div className="mt-2 mb-1 text-[9px] text-[var(--text-dim)] font-mono bg-[var(--bg-elevated)] rounded px-2 py-1">
                  combined = 0.6 &times; <span className="text-blue-400">vector</span> + 0.4 &times; <span className="text-amber-400">keyword</span>
                </div>
                {overviewTrace.retrieval.chunks?.length > 0 && (
                  <div className="space-y-2.5 mt-2">
                    {overviewTrace.retrieval.chunks.slice(0, 5).map((c, i) => (
                      <div key={i} className="bg-[var(--bg-elevated)] rounded-lg px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] text-[var(--text-dim)] font-mono w-4 shrink-0">#{i + 1}</span>
                          <span className="text-[11px] text-[var(--accent)] font-medium truncate">{c.title ?? "Untitled"}</span>
                        </div>
                        <DualScoreBar
                          vectorScore={c.vector_score ?? 0}
                          keywordScore={c.keyword_score ?? 0}
                          combinedScore={c.combined_score ?? 0}
                        />
                        <p className="text-[10px] text-[var(--text-dim)] line-clamp-2 mt-1.5">{c.content_preview ?? ""}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!overviewTrace?.retrieval && <SkeletonRows rows={3} />}
          </>
        )}
        {nodeId === "llm" && (
          <>
            <p className="text-xs text-[var(--text-muted)]">Synthesizes a coherent answer from retrieved chunks. Grounded in retrieved context to reduce hallucination.</p>
            <div className="space-y-1 mt-2">
              <StatRow label="Provider" value="Groq" />
              <StatRow label="Model" value={overviewTrace?.synthesis?.model ?? "Llama 3.3 70B"} />
              {overviewTrace?.synthesis?.time_ms != null && <StatRow label="Time" value={`${overviewTrace.synthesis.time_ms.toFixed(1)}ms`} />}
              {overviewTrace?.retrieval && <StatRow label="Context chunks" value={overviewTrace.retrieval.chunks_retrieved ?? 0} />}
              <StatRow label="Sources" value={overviewSources?.length ?? 0} />
            </div>
            {overviewTrace?.synthesis ? (
              overviewText ? (
                <IOBlock label="Output">
                  <p className="text-[11px] text-[var(--text-muted)] line-clamp-4">{overviewText.slice(0, 250)}{overviewText.length > 250 ? "..." : ""}</p>
                </IOBlock>
              ) : null
            ) : (
              <div className="flex items-center gap-2 mt-2 text-xs text-[var(--text-dim)]">
                <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
                Generating...
              </div>
            )}
          </>
        )}
        {nodeId === "ai_overview" && (
          <>
            <p className="text-xs text-[var(--text-muted)]">AI-generated summary with inline citations [1][2] linking to source pages.</p>
            {overviewTrace?.total_ms != null && (
              <div className="space-y-1 mt-2" style={{ animation: "fade-in 0.3s ease-out" }}>
                <StatRow label="Total AI pipeline" value={`${Number(overviewTrace.total_ms).toFixed(0)}ms`} />
                <StatRow label="Sources" value={overviewSources.length} />
                {overviewText && (
                  <IOBlock label="Preview">
                    <p className="text-[11px] text-[var(--text-muted)] line-clamp-3">{overviewText.slice(0, 200)}{overviewText.length > 200 ? "..." : ""}</p>
                  </IOBlock>
                )}
              </div>
            )}
          </>
        )}

        {/* Skeleton for query nodes without data */}
        {["index_lookup", "bm25", "pr_lookup", "combine"].includes(nodeId) && !trace && (
          <SkeletonStats rows={3} />
        )}
      </div>
    </div>
  );
}

// ─── Step detail renderers ──────────────────────────────────────

function IndexDetail({ trace }: { trace: PipelineTrace }) {
  const t = trace.index_lookup;
  return (
    <div className="space-y-3">
      <IOBlock label="Terms found">
        <div className="space-y-1.5">
          {Object.entries(t.terms_found).map(([term, info]) => (
            <div key={term} className="flex items-center gap-2 text-xs">
              <span className="font-mono text-[var(--accent)] font-medium">&quot;{term}&quot;</span>
              <span className="text-[var(--text-dim)]">&rarr;</span>
              <span className="text-[var(--text-muted)]">{info.doc_freq} docs</span>
              <span className="text-[var(--text-dim)] font-mono ml-auto">IDF {info.idf.toFixed(2)}</span>
            </div>
          ))}
          {t.terms_missing.length > 0 && t.terms_missing.map((term) => (
            <div key={term} className="flex items-center gap-2 text-xs">
              <span className="font-mono text-red-400">&quot;{term}&quot;</span>
              <span className="text-red-300">not found</span>
            </div>
          ))}
        </div>
      </IOBlock>
      <div className="space-y-1">
        <StatRow label="Corpus size" value={`${t.corpus_stats.total_docs.toLocaleString()} docs`} />
        <StatRow label="Avg doc length" value={`${t.corpus_stats.avg_doc_length.toFixed(0)} tokens`} />
        <StatRow label="Time" value={`${t.time_ms.toFixed(1)}ms`} />
      </div>
    </div>
  );
}

function BM25Detail({ trace }: { trace: PipelineTrace }) {
  const t = trace.bm25_scoring;
  const max = t.top_scores[0]?.score ?? 1;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <StatRow label="k1" value={t.params.k1} />
        <StatRow label="b" value={t.params.b} />
        <StatRow label="Docs matched" value={t.total_matched} />
        <StatRow label="Time" value={`${t.time_ms.toFixed(1)}ms`} />
      </div>
      <IOBlock label="Top scores">
        <div className="space-y-1.5">
          {t.top_scores.slice(0, 5).map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--text-dim)] w-3 text-right shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-[var(--text)] truncate">{s.title || `Page ${s.page_id}`}</div>
                <div className="h-1 bg-[var(--bg)] rounded-full mt-0.5 overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(s.score / max) * 100}%` }} />
                </div>
              </div>
              <span className="text-[10px] font-mono text-[var(--text-dim)] w-9 text-right shrink-0">{s.score.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </IOBlock>
    </div>
  );
}

function PageRankDetail({ trace }: { trace: PipelineTrace }) {
  const t = trace.pagerank;
  const max = t.top_scores[0]?.score ?? 1;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <StatRow label="Damping factor" value={t.damping} />
        <StatRow label="Time" value={`${t.time_ms.toFixed(1)}ms`} />
      </div>
      <IOBlock label="Top scores">
        <div className="space-y-1.5">
          {t.top_scores.slice(0, 5).map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--text-dim)] w-3 text-right shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-[var(--text)] truncate">{s.title || `Page ${s.page_id}`}</div>
                <div className="h-1 bg-[var(--bg)] rounded-full mt-0.5 overflow-hidden">
                  <div className="h-full bg-purple-400 rounded-full" style={{ width: `${(s.score / max) * 100}%` }} />
                </div>
              </div>
              <span className="text-[10px] font-mono text-[var(--text-dim)] w-14 text-right shrink-0">{s.score.toFixed(6)}</span>
            </div>
          ))}
        </div>
      </IOBlock>
    </div>
  );
}

function CombineDetail({ trace }: { trace: PipelineTrace }) {
  const t = trace.combination;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <StatRow label="Alpha (α)" value={t.alpha} />
        <StatRow label="Formula" value={t.formula} />
        <StatRow label="Time" value={`${t.time_ms.toFixed(1)}ms`} />
      </div>
      {t.rank_changes.length > 0 && (
        <IOBlock label="Rank changes (BM25 → Final)">
          <div className="space-y-1">
            {t.rank_changes.slice(0, 5).map((rc, i) => {
              const bm25r = typeof rc.bm25_rank === "number" ? rc.bm25_rank : 99;
              const delta = bm25r - rc.final_rank;
              return (
                <div key={i} className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-[var(--text)] truncate flex-1 min-w-0">{rc.title}</span>
                  <span className="font-mono text-[var(--text-dim)]">#{typeof rc.bm25_rank === "number" ? rc.bm25_rank : "—"}</span>
                  <span className="text-[var(--text-dim)]">&rarr;</span>
                  <span className="font-mono text-[var(--text)]">#{rc.final_rank}</span>
                  {delta !== 0 && <span className={`font-mono ${delta > 0 ? "text-green-500" : "text-red-400"}`}>{delta > 0 ? `+${delta}` : delta}</span>}
                </div>
              );
            })}
          </div>
        </IOBlock>
      )}
    </div>
  );
}

function ResultsDetail({ data }: { data: ExplainResponse }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <StatRow label="Total results" value={data.total_results} />
        <StatRow label="Time" value={`${data.time_ms}ms`} />
      </div>
      <IOBlock label="Top results">
        <div className="space-y-2">
          {data.results.slice(0, 4).map((r, i) => (
            <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
              className="block group">
              <div className="text-[11px] text-[var(--accent)] group-hover:underline truncate">{r.title}</div>
              <div className="flex gap-2 mt-0.5 text-[10px] font-mono text-[var(--text-dim)]">
                <span>BM25 {r.bm25_score.toFixed(1)}</span>
                <span>PR {r.pagerank_score.toFixed(4)}</span>
                <span className="text-[var(--accent)]">{r.final_score.toFixed(2)}</span>
              </div>
            </a>
          ))}
        </div>
      </IOBlock>
    </div>
  );
}

// ─── Index Preview ──────────────────────────────────────────────

function IndexPreview() {
  const [terms, setTerms] = useState<{ term: string; doc_freq: number; total_freq: number; sample_docs: { title: string }[] }[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    exploreIndex(8)
      .then((res) => setTerms(res.terms ?? []))
      .catch(() => setTerms([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonRows rows={4} />;
  if (!terms || terms.length === 0) return <p className="text-xs text-[var(--text-dim)]">No terms found.</p>;

  const maxFreq = terms[0]?.doc_freq ?? 1;

  return (
    <div className="space-y-1.5" style={{ animation: "fade-in 0.3s ease-out" }}>
      {terms.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-[var(--accent)] w-20 truncate shrink-0">{t.term}</span>
          <div className="flex-1 h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(t.doc_freq / maxFreq) * 100}%` }} />
          </div>
          <span className="text-[9px] font-mono text-[var(--text-dim)] w-12 text-right shrink-0">{t.doc_freq} docs</span>
        </div>
      ))}
    </div>
  );
}

// ─── PageRank Preview ───────────────────────────────────────────

function PageRankPreview() {
  const [pages, setPages] = useState<{ title: string; url: string; score: number; inlinks: number }[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    explorePageRank(6)
      .then((res) => setPages(res.pages ?? []))
      .catch(() => setPages([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonRows rows={4} />;
  if (!pages || pages.length === 0) return <p className="text-xs text-[var(--text-dim)]">No scores found.</p>;

  const maxScore = pages[0]?.score ?? 1;

  return (
    <div className="space-y-2" style={{ animation: "fade-in 0.3s ease-out" }}>
      {pages.map((p, i) => (
        <div key={i}>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--text-dim)] w-3 text-right shrink-0">{i + 1}</span>
            <span className="text-[11px] text-[var(--text)] truncate flex-1">{p.title}</span>
          </div>
          <div className="flex items-center gap-1.5 ml-[18px]">
            <div className="flex-1 h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
              <div className="h-full bg-purple-400 rounded-full" style={{ width: `${(p.score / maxScore) * 100}%` }} />
            </div>
            <span className="text-[9px] font-mono text-[var(--text-dim)] w-16 text-right shrink-0">{p.score.toFixed(6)}</span>
          </div>
          <div className="ml-[18px] text-[9px] text-[var(--text-dim)]">{p.inlinks} inlinks</div>
        </div>
      ))}
    </div>
  );
}

// ─── Reusable embedding heatmap ─────────────────────────────────

function MiniHeatmap({ values, showLegend = false }: { values: number[]; showLegend?: boolean }) {
  return (
    <>
      <div className="flex flex-wrap gap-px">
        {values.map((v, i) => {
          const abs = Math.min(Math.abs(v) * 8, 1);
          const color = v >= 0
            ? `rgba(59, 130, 246, ${abs})`
            : `rgba(239, 68, 68, ${abs})`;
          return <div key={i} className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} title={`[${i}] ${v.toFixed(4)}`} />;
        })}
      </div>
      {showLegend && (
        <div className="flex items-center gap-3 mt-1.5 text-[9px] text-[var(--text-dim)]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "rgba(59, 130, 246, 0.7)" }} /> positive</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "rgba(239, 68, 68, 0.7)" }} /> negative</span>
          <span>{values.length} dims</span>
        </div>
      )}
    </>
  );
}

// ─── Chunk preview with optional embeddings ─────────────────────

function ChunkList({ includeEmbeddings = false, limit = 4 }: { includeEmbeddings?: boolean; limit?: number }) {
  const [chunks, setChunks] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    exploreChunks(limit, includeEmbeddings)
      .then((res) => setChunks(res.chunks ?? []))
      .catch(() => setChunks([]))
      .finally(() => setLoading(false));
  }, [limit, includeEmbeddings]);

  if (loading) return <SkeletonRows rows={3} />;
  if (!chunks || chunks.length === 0) return <p className="text-xs text-[var(--text-dim)]">No chunks found.</p>;

  return (
    <div className="space-y-3" style={{ animation: "fade-in 0.3s ease-out" }}>
      {chunks.map((c, i) => (
        <div key={i} className="bg-[var(--bg-elevated)] rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] text-[var(--accent)] font-medium truncate flex-1">{(c.title as string) ?? "Untitled"}</span>
            <span className="text-[9px] text-[var(--text-dim)] font-mono shrink-0">chunk #{c.chunk_idx as number}</span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] line-clamp-2">{((c.content as string) ?? "").slice(0, 150)}</p>
          <div className="flex items-center gap-3 mt-1 text-[9px] font-mono text-[var(--text-dim)]">
            <span>{(c.word_count as number) ?? 0} words</span>
            {c.has_embedding ? <span className="text-green-500">embedded</span> : <span className="text-red-400">not embedded</span>}
          </div>
          {includeEmbeddings && (c.embedding_preview as number[])?.length > 0 && (
            <div className="mt-2">
              <MiniHeatmap values={c.embedding_preview as number[]} />
              <span className="text-[9px] text-[var(--text-dim)] mt-0.5 block">{c.dimensions as number}d vector · first 64 shown</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Dual score bar for vector search ───────────────────────────

function DualScoreBar({ vectorScore, keywordScore, combinedScore }: { vectorScore: number; keywordScore: number; combinedScore: number }) {
  const maxScore = Math.max(vectorScore, keywordScore, 0.01);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-blue-400 w-6 shrink-0">vec</span>
        <div className="flex-1 h-1.5 bg-[var(--bg)] rounded-full overflow-hidden">
          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(vectorScore / maxScore) * 100}%` }} />
        </div>
        <span className="text-[9px] font-mono text-[var(--text-dim)] w-8 text-right">{vectorScore.toFixed(2)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-amber-400 w-6 shrink-0">kw</span>
        <div className="flex-1 h-1.5 bg-[var(--bg)] rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(keywordScore / maxScore) * 100}%` }} />
        </div>
        <span className="text-[9px] font-mono text-[var(--text-dim)] w-8 text-right">{keywordScore.toFixed(2)}</span>
      </div>
      <div className="text-right">
        <span className="text-[9px] font-mono text-[var(--accent)]">= {combinedScore.toFixed(3)}</span>
      </div>
    </div>
  );
}

// ─── Embedding Preview ──────────────────────────────────────────

function EmbeddingPreview({ query }: { query: string }) {
  const [embedding, setEmbedding] = useState<number[] | null>(null);
  const [dims, setDims] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    exploreEmbed(query)
      .then((res) => { setEmbedding(res.embedding); setDims(res.dimensions); })
      .finally(() => setLoading(false));
  }, [query]);

  if (loading) return <SkeletonRows rows={2} />;
  if (!embedding) return <p className="text-xs text-[var(--text-dim)]">Embedding unavailable.</p>;

  const preview = embedding.slice(0, 8).map(v => v.toFixed(4)).join(", ");

  return (
    <div style={{ animation: "fade-in 0.3s ease-out" }}>
      <div className="space-y-1">
        <StatRow label="Dimensions" value={dims} />
        <StatRow label="Model" value="Voyage AI" />
        <StatRow label="Input type" value="query" />
      </div>
      <IOBlock label="Input">
        <span className="font-mono text-xs text-[var(--text)]">&quot;{query}&quot;</span>
      </IOBlock>
      <IOBlock label={`Vector (${dims}d)`}>
        <div className="font-mono text-[10px] text-[var(--text-muted)] break-all leading-relaxed">
          [{preview}, <span className="text-[var(--text-dim)]">...{dims - 8} more</span>]
        </div>
        <div className="mt-2">
          <MiniHeatmap values={embedding.slice(0, 64)} showLegend />
        </div>
      </IOBlock>
    </div>
  );
}

// ─── Database Table View ────────────────────────────────────────

function DbTableView({ endpoint }: { endpoint: "pages" | "index" | "pagerank" | "chunks" }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fetcher = endpoint === "pages" ? explorePages(8)
      : endpoint === "index" ? exploreIndex(12)
      : endpoint === "pagerank" ? explorePageRank(10)
      : exploreChunks(6);
    fetcher.then((res) => {
      const data = res.pages || res.terms || res.chunks || [];
      setRows(Array.isArray(data) ? data : []);
    }).catch(() => setRows([])).finally(() => setLoading(false));
  }, [endpoint]);

  if (loading) return <SkeletonTable rows={5} cols={4} />;
  if (!rows || rows.length === 0) return <p className="text-xs text-[var(--text-dim)]">No records found.</p>;

  const columns = Object.keys(rows[0]).slice(0, 5);

  return (
    <div className="overflow-x-auto -mx-4 px-4" style={{ animation: "fade-in 0.3s ease-out" }}>
      <table className="w-full text-[11px] border-collapse min-w-[300px]">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {columns.map((col) => (
              <th key={col} className="text-left py-1.5 px-2 text-[var(--text-dim)] font-semibold uppercase tracking-wider text-[10px]">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg-elevated)] transition-colors">
              {columns.map((col) => {
                const val = row[col];
                let display: string;
                if (val === null || val === undefined) display = "—";
                else if (typeof val === "number") display = Number.isInteger(val) ? val.toLocaleString() : val.toFixed(6);
                else if (Array.isArray(val)) display = `[${val.length} items]`;
                else if (typeof val === "object") display = JSON.stringify(val).slice(0, 30);
                else display = String(val).slice(0, 40);
                return (
                  <td key={col} className="py-1.5 px-2 text-[var(--text)] font-mono truncate max-w-[120px]" title={String(val)}>
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-[var(--text-dim)] mt-2">Showing {rows.length} rows</p>
    </div>
  );
}

// ─── Mobile Bottom Sheet with swipe-to-dismiss ──────────────

function MobileSheet({ nodeId, onClose, data, stats, overviewText, overviewSources, overviewLoading, overviewTrace, onRefreshStats }: {
  nodeId: NodeId;
  onClose: () => void;
  data: ExplainResponse | null;
  stats: Stats | null;
  overviewText: string;
  overviewSources: OverviewSource[];
  overviewLoading: boolean;
  overviewTrace?: OverviewTrace | null;
  onRefreshStats: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ startY: 0, active: false });

  const onHandleTouchStart = useCallback((e: React.TouchEvent) => {
    drag.current = { startY: e.touches[0].clientY, active: true };
  }, []);

  const onHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!drag.current.active || !sheetRef.current) return;
    const diff = e.touches[0].clientY - drag.current.startY;
    if (diff > 0) {
      sheetRef.current.style.transform = `translateY(${diff}px)`;
      sheetRef.current.style.transition = "none";
    }
  }, []);

  const onHandleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!drag.current.active || !sheetRef.current) return;
    drag.current.active = false;
    const diff = e.changedTouches[0].clientY - drag.current.startY;
    sheetRef.current.style.transition = "transform 0.2s ease-out";
    if (diff > 80) {
      sheetRef.current.style.transform = "translateY(100%)";
      setTimeout(onClose, 200);
    } else {
      sheetRef.current.style.transform = "";
    }
  }, [onClose]);

  return (
    <>
      <div className="lg:hidden fixed inset-0 bg-black/25 z-40" onClick={onClose} />
      <div
        ref={sheetRef}
        className="lg:hidden fixed z-50 bottom-0 left-0 right-0 max-h-[70vh] rounded-t-2xl shadow-xl bg-[var(--bg-card)] overflow-hidden overflow-y-auto"
        style={{ animation: "slide-up 0.2s ease-out" }}
      >
        {/* Drag handle — swipe down to dismiss */}
        <div
          className="sticky top-0 z-10 bg-[var(--bg-card)] flex justify-center pt-3 pb-2 cursor-pointer touch-none"
          onClick={onClose}
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
        >
          <div className="w-10 h-1 bg-[var(--border-hover)] rounded-full" />
        </div>
        <DetailPanel
          nodeId={nodeId}
          data={data}
          stats={stats}
          onClose={onClose}
          onRefreshStats={onRefreshStats}
          overviewText={overviewText}
          overviewSources={overviewSources}
          overviewLoading={overviewLoading}
          overviewTrace={overviewTrace}
        />
      </div>
    </>
  );
}

// ─── Exported Component ──────────────────────────────────────

export { DetailPanel };
export type { NodeId };

export default function PipelineExplorer({ data, stats: propStats, overviewText, overviewSources, overviewLoading, overviewTrace, selectedNode: externalSelectedNode, onNodeSelect }: {
  data: ExplainResponse | null;
  stats: Stats | null;
  overviewText: string;
  overviewSources: OverviewSource[];
  overviewLoading: boolean;
  overviewTrace?: OverviewTrace | null;
  selectedNode?: string | null;
  onNodeSelect?: (id: string | null) => void;
}) {
  const [internalSelectedNode, setInternalSelectedNode] = useState<NodeId | null>(null);
  const [stats, setStats] = useState<Stats | null>(propStats);
  const activeStep = useAnimatedSteps(data?.pipeline ?? null);

  const selectedNode = (externalSelectedNode !== undefined ? externalSelectedNode : internalSelectedNode) as NodeId | null;
  const setSelectedNode = (id: NodeId | null) => {
    if (onNodeSelect) onNodeSelect(id);
    else setInternalSelectedNode(id);
  };

  useEffect(() => { if (!stats) getStats().then(setStats).catch(() => {}); }, [stats]);
  useEffect(() => { if (propStats) setStats(propStats); }, [propStats]);

  return (
    <div className="px-2 sm:px-4 py-3 sm:py-4">
      <Flowchart activeStep={activeStep} selectedNode={selectedNode} onSelectNode={setSelectedNode} data={data} />

      {data && activeStep >= 10 && !selectedNode && (
        <div className="text-center pt-2" style={{ animation: "fade-in 0.4s ease-out" }}>
          <span className="text-xs text-[var(--text-dim)]">Pipeline complete · <span className="font-mono text-[var(--accent)]">{data.time_ms}ms</span></span>
        </div>
      )}

      {/* Mobile bottom sheet — swipe down from handle to dismiss */}
      {selectedNode && (
        <MobileSheet
          nodeId={selectedNode}
          onClose={() => setSelectedNode(null)}
          data={data}
          stats={stats}
          overviewText={overviewText}
          overviewSources={overviewSources}
          overviewLoading={overviewLoading}
          overviewTrace={overviewTrace}
          onRefreshStats={() => getStats().then(setStats).catch(() => {})}
        />
      )}
    </div>
  );
}

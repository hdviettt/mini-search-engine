"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { searchExplain } from "@/lib/api";
import type { ExplainResponse, PipelineTrace } from "@/lib/types";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────────

type NodeId =
  | "query" | "tokenize" | "invIndex" | "idxLookup"
  | "bm25" | "prDb" | "pagerank" | "combine"
  | "decision" | "results" | "aiOverview";

type NodeStatus = "idle" | "active" | "done";

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
  kind: "process" | "store" | "diamond" | "io";
}

interface ArrowDef {
  path: string;
  label?: string;
  labelX?: number;
  labelY?: number;
}

// ─── Layout constants ───────────────────────────────────────────

const LANES = [
  { label: "Processing", y: 0, h: 115, bg: "#eff6ff" },
  { label: "Retrieval", y: 125, h: 115, bg: "#f0fdf4" },
  { label: "Ranking", y: 250, h: 120, bg: "#faf5ff" },
  { label: "Output", y: 380, h: 110, bg: "#fefce8" },
];

const NODES: NodeDef[] = [
  // Lane 0: Processing
  { id: "query",     label: "Search Query",    cx: 180, cy: 58,  w: 140, h: 44, fill: "#bfdbfe", stroke: "#93c5fd", activeFill: "#93c5fd", kind: "io" },
  { id: "tokenize",  label: "Tokenize",        cx: 400, cy: 58,  w: 130, h: 44, fill: "#bbf7d0", stroke: "#86efac", activeFill: "#86efac", kind: "process" },
  // Lane 1: Retrieval
  { id: "invIndex",  label: "Inverted Index",  cx: 105, cy: 182, w: 125, h: 44, fill: "#fef3c7", stroke: "#fcd34d", activeFill: "#fde68a", kind: "store" },
  { id: "idxLookup", label: "Index Lookup",    cx: 295, cy: 182, w: 140, h: 44, fill: "#bbf7d0", stroke: "#86efac", activeFill: "#86efac", kind: "process" },
  { id: "bm25",      label: "BM25 Scoring",    cx: 500, cy: 182, w: 140, h: 44, fill: "#bbf7d0", stroke: "#86efac", activeFill: "#86efac", kind: "process" },
  // Lane 2: Ranking
  { id: "prDb",      label: "PageRank DB",     cx: 105, cy: 310, w: 125, h: 44, fill: "#fef3c7", stroke: "#fcd34d", activeFill: "#fde68a", kind: "store" },
  { id: "pagerank",  label: "PageRank",        cx: 275, cy: 310, w: 130, h: 44, fill: "#ddd6fe", stroke: "#c4b5fd", activeFill: "#c4b5fd", kind: "process" },
  { id: "combine",   label: "Combine Scores",  cx: 445, cy: 310, w: 150, h: 44, fill: "#bbf7d0", stroke: "#86efac", activeFill: "#86efac", kind: "process" },
  { id: "decision",  label: "≥3?",             cx: 600, cy: 310, w: 40,  h: 40, fill: "#fde68a", stroke: "#f59e0b", activeFill: "#fbbf24", kind: "diamond" },
  // Lane 3: Output
  { id: "results",    label: "Search Results",  cx: 350, cy: 435, w: 155, h: 44, fill: "#bfdbfe", stroke: "#93c5fd", activeFill: "#93c5fd", kind: "io" },
  { id: "aiOverview", label: "AI Overview",     cx: 555, cy: 435, w: 140, h: 44, fill: "#e9d5ff", stroke: "#c084fc", activeFill: "#c084fc", kind: "io" },
];

const ARROWS: ArrowDef[] = [
  // query → tokenize (horizontal)
  { path: "M 250 58 H 335" },
  // tokenize → idxLookup (L-shape: down, left, down)
  { path: "M 400 80 V 122 H 295 V 160" },
  // invIndex → idxLookup (horizontal)
  { path: "M 168 182 H 225" },
  // idxLookup → bm25 (horizontal)
  { path: "M 365 182 H 430" },
  // bm25 → pagerank (L-shape: down, left, down)
  { path: "M 500 204 V 247 H 275 V 288" },
  // prDb → pagerank (horizontal)
  { path: "M 168 310 H 210" },
  // pagerank → combine (horizontal)
  { path: "M 340 310 H 370" },
  // combine → decision (horizontal)
  { path: "M 520 310 H 580", label: "if ≥3", labelX: 549, labelY: 299 },
  // combine → results (L-shape: down, left, down)
  { path: "M 445 332 V 377 H 350 V 413" },
  // decision → aiOverview (vertical down via L-shape)
  { path: "M 600 330 V 377 H 555 V 413", label: "yes", labelX: 610, labelY: 355 },
];

// ─── Animation step mapping ─────────────────────────────────────

const NODE_STEP: Record<NodeId, number> = {
  query: 0, tokenize: 1,
  invIndex: 2, idxLookup: 2,
  bm25: 3,
  prDb: 4, pagerank: 4,
  combine: 5,
  decision: 6, results: 6,
  aiOverview: 7,
};

function useAnimatedSteps(trace: PipelineTrace | null) {
  const [step, setStep] = useState(-1);
  const prev = useRef<PipelineTrace | null>(null);

  useEffect(() => {
    if (!trace || trace === prev.current) return;
    prev.current = trace;
    setStep(-1);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i <= 7; i++) {
      timers.push(setTimeout(() => setStep(i), 350 * (i + 1)));
    }
    return () => timers.forEach(clearTimeout);
  }, [trace]);

  return step;
}

function nodeStatus(id: NodeId, activeStep: number): NodeStatus {
  const s = NODE_STEP[id];
  if (activeStep < s) return "idle";
  if (activeStep === s) return "active";
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
    <div className="overflow-x-auto">
      <div style={{ minWidth: 660 }}>
        <svg viewBox="0 0 680 490" className="w-full h-auto" style={{ maxHeight: "60vh" }}>
          {/* Dot grid background */}
          <defs>
            <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="0.8" fill="#d4d4d4" />
            </pattern>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
            </marker>
            <marker id="arr-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#2563eb" />
            </marker>
          </defs>

          <rect width="680" height="490" fill="url(#dots)" rx="12" />

          {/* Swimlane bands */}
          {LANES.map((lane) => (
            <g key={lane.label}>
              <rect x="45" y={lane.y + 4} width="630" height={lane.h - 8} rx="8" fill={lane.bg} opacity="0.6" />
              <text
                x="18" y={lane.y + lane.h / 2}
                textAnchor="middle" fontSize="10" fill="#94a3b8" fontWeight="600" letterSpacing="0.05em"
                transform={`rotate(-90, 18, ${lane.y + lane.h / 2})`}
              >
                {lane.label.toUpperCase()}
              </text>
            </g>
          ))}

          {/* Arrows */}
          {ARROWS.map((a, i) => (
            <g key={i}>
              <path
                d={a.path}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.5"
                markerEnd="url(#arr)"
                strokeLinejoin="round"
              />
              {a.label && (
                <text x={a.labelX} y={a.labelY} fontSize="9" fill="#94a3b8" fontStyle="italic">
                  {a.label}
                </text>
              )}
            </g>
          ))}

          {/* Nodes */}
          {NODES.map((node) => {
            const status = nodeStatus(node.id, activeStep);
            const selected = selectedNode === node.id;
            const hasData = data !== null && status !== "idle";
            const x = node.cx - node.w / 2;
            const y = node.cy - node.h / 2;

            return (
              <g
                key={node.id}
                onClick={() => hasData ? onSelectNode(selected ? null : node.id) : undefined}
                style={{ cursor: hasData ? "pointer" : "default" }}
              >
                {/* Glow for active */}
                {status === "active" && (
                  <rect
                    x={x - 3} y={y - 3} width={node.w + 6} height={node.h + 6}
                    rx={node.kind === "diamond" ? 4 : 10} fill="none"
                    stroke={node.stroke} strokeWidth="2" opacity="0.6"
                  >
                    <animate attributeName="opacity" values="0.6;0.2;0.6" dur="1.2s" repeatCount="indefinite" />
                  </rect>
                )}

                {/* Selection ring */}
                {selected && (
                  <rect
                    x={x - 3} y={y - 3} width={node.w + 6} height={node.h + 6}
                    rx={node.kind === "diamond" ? 4 : 10} fill="none"
                    stroke="#2563eb" strokeWidth="2"
                  />
                )}

                {/* Node shape */}
                {node.kind === "diamond" ? (
                  <polygon
                    points={`${node.cx},${node.cy - 22} ${node.cx + 22},${node.cy} ${node.cx},${node.cy + 22} ${node.cx - 22},${node.cy}`}
                    fill={status === "active" ? node.activeFill : status === "done" ? node.fill : "#f5f5f5"}
                    stroke={status !== "idle" ? node.stroke : "#d4d4d4"}
                    strokeWidth="1.5"
                  />
                ) : (
                  <rect
                    x={x} y={y} width={node.w} height={node.h}
                    rx={node.kind === "store" ? 4 : 8}
                    fill={status === "active" ? node.activeFill : status === "done" ? node.fill : "#f5f5f5"}
                    stroke={status !== "idle" ? node.stroke : "#d4d4d4"}
                    strokeWidth="1.5"
                    strokeDasharray={node.kind === "store" ? "5,3" : undefined}
                  />
                )}

                {/* Label */}
                <text
                  x={node.cx} y={node.cy + 1}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={node.kind === "diamond" ? "10" : "11"}
                  fontWeight="600"
                  fill={status !== "idle" ? "#1e293b" : "#a3a3a3"}
                >
                  {node.label}
                </text>

                {/* Done checkmark */}
                {status === "done" && node.kind !== "diamond" && (
                  <circle cx={x + node.w - 6} cy={y + 6} r="5" fill="#22c55e">
                    <title>Done</title>
                  </circle>
                )}
              </g>
            );
          })}

          {/* Annotations (callout bubbles with data) */}
          {data && activeStep >= 1 && (
            <Annotation x={505} y={38} text={`[${data.pipeline.tokenization.tokens.join(", ")}]`} />
          )}
          {data && activeStep >= 3 && (
            <Annotation x={565} y={162} text={`${data.pipeline.bm25_scoring.total_matched} matched`} />
          )}
          {data && activeStep >= 6 && (
            <Annotation x={280} y={460} text={`${data.total_results} results`} />
          )}
        </svg>
      </div>
    </div>
  );
}

function Annotation({ x, y, text }: { x: number; y: number; text: string }) {
  const w = Math.min(Math.max(text.length * 6.5 + 16, 50), 180);
  return (
    <g style={{ animation: "fade-in 0.3s ease-out" }}>
      <rect x={x} y={y} width={w} height={24} rx="6" fill="#fefce8" stroke="#fde047" strokeWidth="1" />
      <polygon points={`${x},${y + 8} ${x - 6},${y + 12} ${x},${y + 16}`} fill="#fefce8" stroke="#fde047" strokeWidth="1" />
      <text x={x + w / 2} y={y + 15} textAnchor="middle" fontSize="10" fill="#854d0e" fontFamily="monospace">
        {text.length > 26 ? text.slice(0, 24) + "…" : text}
      </text>
    </g>
  );
}

// ─── Detail Panel ───────────────────────────────────────────────

function DetailPanel({
  nodeId,
  data,
  onClose,
}: {
  nodeId: NodeId;
  data: ExplainResponse;
  onClose: () => void;
}) {
  const trace = data.pipeline;
  const nodeDef = NODES.find((n) => n.id === nodeId)!;

  return (
    <div className="border border-[var(--border)] rounded-xl bg-[var(--bg-card)] overflow-hidden" style={{ animation: "fade-in 0.2s ease-out" }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <div className="w-3 h-3 rounded" style={{ background: nodeDef.fill, border: `1px solid ${nodeDef.stroke}` }} />
        <span className="text-sm font-semibold text-[var(--text)] flex-1">{nodeDef.label}</span>
        <button onClick={onClose} className="text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="px-4 py-3">
        {nodeId === "query" && <QueryDetail query={data.query} />}
        {nodeId === "tokenize" && <TokenizeDetail trace={trace} />}
        {(nodeId === "idxLookup" || nodeId === "invIndex") && <IndexDetail trace={trace} />}
        {nodeId === "bm25" && <BM25Detail trace={trace} />}
        {(nodeId === "pagerank" || nodeId === "prDb") && <PageRankDetail trace={trace} />}
        {nodeId === "combine" && <CombineDetail trace={trace} />}
        {nodeId === "decision" && <DecisionDetail data={data} />}
        {nodeId === "results" && <ResultsDetail data={data} />}
        {nodeId === "aiOverview" && <AIDetail data={data} />}
      </div>
    </div>
  );
}

function QueryDetail({ query }: { query: string }) {
  return <div className="text-sm font-mono bg-[var(--bg-elevated)] px-3 py-2 rounded">&quot;{query}&quot;</div>;
}

function TokenizeDetail({ trace }: { trace: PipelineTrace }) {
  const t = trace.tokenization;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {t.tokens.map((tok, i) => (
          <span key={i} className="text-sm font-mono px-2 py-0.5 bg-[var(--accent)]/8 text-[var(--accent)] rounded border border-[var(--accent)]/15">{tok}</span>
        ))}
      </div>
      {t.stopwords_removed.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {t.stopwords_removed.map((w, i) => (
            <span key={i} className="text-sm font-mono px-2 py-0.5 bg-red-50 text-red-400 rounded line-through">{w}</span>
          ))}
        </div>
      )}
      <div className="text-[11px] text-[var(--text-dim)] font-mono">{t.time_ms.toFixed(1)}ms</div>
    </div>
  );
}

function IndexDetail({ trace }: { trace: PipelineTrace }) {
  const t = trace.index_lookup;
  return (
    <div className="space-y-2">
      {Object.entries(t.terms_found).map(([term, info]) => (
        <div key={term} className="flex items-center gap-3 bg-[var(--bg-elevated)] px-3 py-1.5 rounded text-sm">
          <span className="font-mono text-[var(--accent)] font-medium">&quot;{term}&quot;</span>
          <span className="text-[var(--text-dim)]">&rarr;</span>
          <span className="text-[var(--text-muted)]">{info.doc_freq} docs</span>
          <span className="text-[11px] text-[var(--text-dim)] font-mono ml-auto">IDF {info.idf.toFixed(2)}</span>
        </div>
      ))}
      <div className="text-[11px] text-[var(--text-dim)]">
        Corpus: {t.corpus_stats.total_docs.toLocaleString()} docs, avg {t.corpus_stats.avg_doc_length.toFixed(0)} tokens — {t.time_ms.toFixed(1)}ms
      </div>
    </div>
  );
}

function BM25Detail({ trace }: { trace: PipelineTrace }) {
  const t = trace.bm25_scoring;
  const max = t.top_scores[0]?.score ?? 1;
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-[var(--text-dim)]">k1={t.params.k1}, b={t.params.b} — {t.total_matched} matched — {t.time_ms.toFixed(1)}ms</div>
      {t.top_scores.slice(0, 6).map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-dim)] w-4 text-right shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-[var(--text)] truncate">{s.title || `Page ${s.page_id}`}</div>
            <div className="h-1.5 bg-[var(--bg-elevated)] rounded-full mt-0.5 overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(s.score / max) * 100}%` }} />
            </div>
          </div>
          <span className="text-[11px] font-mono text-[var(--text-dim)] w-10 text-right shrink-0">{s.score.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function PageRankDetail({ trace }: { trace: PipelineTrace }) {
  const t = trace.pagerank;
  const max = t.top_scores[0]?.score ?? 1;
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-[var(--text-dim)]">Damping: {t.damping} — {t.time_ms.toFixed(1)}ms</div>
      {t.top_scores.slice(0, 6).map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-dim)] w-4 text-right shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-[var(--text)] truncate">{s.title || `Page ${s.page_id}`}</div>
            <div className="h-1.5 bg-[var(--bg-elevated)] rounded-full mt-0.5 overflow-hidden">
              <div className="h-full bg-purple-400 rounded-full" style={{ width: `${(s.score / max) * 100}%` }} />
            </div>
          </div>
          <span className="text-[11px] font-mono text-[var(--text-dim)] w-16 text-right shrink-0">{s.score.toFixed(6)}</span>
        </div>
      ))}
    </div>
  );
}

function CombineDetail({ trace }: { trace: PipelineTrace }) {
  const t = trace.combination;
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-[var(--text-dim)]">&alpha; = {t.alpha} — {t.formula} — {t.time_ms.toFixed(1)}ms</div>
      {t.rank_changes.length > 0 && (
        <div className="space-y-1">
          {t.rank_changes.slice(0, 6).map((rc, i) => {
            const bm25Rank = typeof rc.bm25_rank === "number" ? rc.bm25_rank : 99;
            const delta = bm25Rank - rc.final_rank;
            return (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-[var(--text)] truncate flex-1 min-w-0">{rc.title}</span>
                <span className="text-[11px] font-mono text-[var(--text-dim)]">#{typeof rc.bm25_rank === "number" ? rc.bm25_rank : "—"}</span>
                <span className="text-[var(--text-dim)]">&rarr;</span>
                <span className="text-[11px] font-mono text-[var(--text)]">#{rc.final_rank}</span>
                {delta !== 0 && (
                  <span className={`text-[10px] font-mono ${delta > 0 ? "text-green-500" : "text-red-400"}`}>
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DecisionDetail({ data }: { data: ExplainResponse }) {
  const has = data.total_results >= 3;
  return (
    <div className="text-sm text-[var(--text-muted)]">
      {data.total_results} results found — {has ? "AI Overview will be generated" : "too few results for AI Overview"}
    </div>
  );
}

function ResultsDetail({ data }: { data: ExplainResponse }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-[var(--text-dim)]">{data.total_results} results in {data.time_ms}ms</div>
      {data.results.slice(0, 5).map((r, i) => (
        <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
          className="block bg-[var(--bg-elevated)] rounded px-3 py-1.5 hover:bg-[var(--border)]/30 transition-colors group">
          <div className="text-sm text-[var(--accent)] group-hover:underline truncate">{r.title}</div>
          <div className="flex gap-3 mt-0.5 text-[10px] font-mono text-[var(--text-dim)]">
            <span>BM25 {r.bm25_score.toFixed(2)}</span>
            <span>PR {r.pagerank_score.toFixed(6)}</span>
            <span className="text-[var(--accent)]">Final {r.final_score.toFixed(2)}</span>
          </div>
        </a>
      ))}
    </div>
  );
}

function AIDetail({ data }: { data: ExplainResponse }) {
  return (
    <div className="text-sm text-[var(--text-muted)]">
      {data.total_results >= 3
        ? "AI Overview streams a synthesized answer using retrieved chunks and an LLM."
        : "Not enough results to generate an AI Overview."}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export default function PipelinePage() {
  return (
    <Suspense>
      <PipelineContent />
    </Suspense>
  );
}

function PipelineContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState<ExplainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<NodeId | null>(null);

  const activeStep = useAnimatedSteps(data?.pipeline ?? null);

  async function handleSearch(q: string) {
    if (!q.trim()) return;
    setQuery(q);
    setLoading(true);
    setData(null);
    setSelectedNode(null);
    try {
      const result = await searchExplain(q.trim());
      setData(result);
    } catch { /* */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (initialQuery) handleSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-card)]">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Link href="/" className="text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </Link>
            <h1 className="text-lg font-semibold text-[var(--text)]">Search Pipeline</h1>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(new FormData(e.currentTarget).get("q") as string); }}>
            <input
              name="q" type="text" placeholder="Enter a query to trace the pipeline..."
              defaultValue={query} key={query} autoFocus
              className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] text-sm placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-all"
            />
          </form>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block w-5 h-5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
            <p className="text-sm text-[var(--text-dim)] mt-3">Running search pipeline...</p>
          </div>
        )}

        {!data && !loading && (
          <div className="text-center py-8">
            <p className="text-[var(--text-dim)] text-sm mb-4">
              Search for something to see the pipeline in action
            </p>
            <div className="flex flex-wrap justify-center gap-2 mb-8">
              {["Messi", "Champions League", "World Cup"].map((q) => (
                <button key={q} onClick={() => handleSearch(q)}
                  className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 cursor-pointer transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Flowchart — always visible, animates when data arrives */}
        <Flowchart
          activeStep={activeStep}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
          data={data}
        />

        {/* Hint */}
        {data && activeStep >= 6 && !selectedNode && (
          <p className="text-center text-xs text-[var(--text-dim)]" style={{ animation: "fade-in 0.4s ease-out" }}>
            Click any node to inspect its data
          </p>
        )}

        {/* Detail panel */}
        {selectedNode && data && (
          <DetailPanel nodeId={selectedNode} data={data} onClose={() => setSelectedNode(null)} />
        )}

        {/* Total time */}
        {data && activeStep >= 6 && (
          <div className="text-center pt-2" style={{ animation: "fade-in 0.4s ease-out" }}>
            <span className="text-sm text-[var(--text-dim)]">
              Total: <span className="font-mono text-[var(--accent)]">{data.time_ms}ms</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

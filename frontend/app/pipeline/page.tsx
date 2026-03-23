"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { searchExplain, getStats } from "@/lib/api";
import type { ExplainResponse, PipelineTrace, Stats } from "@/lib/types";
import Link from "next/link";

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
  { label: "Query", sub: "(per search)", y: 338, h: 455, bg: "#eff6ff" },
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
  // ── QUERY — AI path ──
  { id: "fanout",        label: "Fan-out",          cx: 530, cy: 460, w: 100, h: 40, fill: "#ddd6fe", stroke: "#c4b5fd", activeFill: "#c4b5fd", kind: "process" },
  { id: "embed_query",   label: "Embed Query",     cx: 670, cy: 460, w: 115, h: 40, fill: "#ddd6fe", stroke: "#c4b5fd", activeFill: "#c4b5fd", kind: "process" },
  { id: "vector_search", label: "Vector Search",   cx: 600, cy: 530, w: 125, h: 40, fill: "#ddd6fe", stroke: "#c4b5fd", activeFill: "#c4b5fd", kind: "process" },
  { id: "llm",           label: "LLM Synthesis",   cx: 600, cy: 603, w: 125, h: 40, fill: "#ddd6fe", stroke: "#c4b5fd", activeFill: "#c4b5fd", kind: "process" },
  { id: "ai_overview",   label: "AI Overview",     cx: 600, cy: 678, w: 125, h: 40, fill: "#e9d5ff", stroke: "#c084fc", activeFill: "#c084fc", kind: "io" },
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
  { path: "M 630 320 V 500 H 600 V 510", dashed: true, dim: true },   // vector_store → vector_search
  // QUERY — from query_input
  { path: "M 390 405 V 425 H 195 V 440" },                       // query → tokenize
  { path: "M 390 405 V 425 H 530 V 440" },                       // query → fanout
  { path: "M 390 405 V 430 H 670 V 440" },                       // query → embed_query
  // QUERY — search path
  { path: "M 195 480 V 510" },                                    // tokenize → index_lookup
  { path: "M 253 460 H 290 V 583" },                              // tokenize → pr_lookup (right, then down)
  { path: "M 195 550 V 583" },                                    // index_lookup → bm25
  { path: "M 195 623 V 648 H 265 V 658" },                       // bm25 → combine
  { path: "M 345 623 V 648 H 265 V 658" },                       // pr_lookup → combine
  { path: "M 265 698 V 728" },                                    // combine → results
  // QUERY — AI path
  { path: "M 530 480 V 500 H 600 V 510" },                       // fanout → vector_search
  { path: "M 670 480 V 500 H 600 V 510" },                       // embed_query → vector_search
  { path: "M 600 550 V 583" },                                    // vector_search → llm
  { path: "M 600 623 V 658" },                                    // llm → ai_overview
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
  fanout: 7, embed_query: 7,
  vector_search: 8, // vector_store also activates
  llm: 9,
  ai_overview: 10,
};

// Stores that activate with query steps
const STORE_ACTIVATE: Record<number, NodeId[]> = {
  2: ["inv_index"],
  4: ["pr_scores"],
  8: ["vector_store"],
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
    <div className="overflow-x-auto -mx-4 px-4">
      <div style={{ minWidth: 700 }}>
        <svg viewBox="0 0 770 790" className="w-full h-auto">
          <defs>
            <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="0.7" fill="#d4d4d4" />
            </pattern>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
            </marker>
            <marker id="arr-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#cbd5e1" />
            </marker>
          </defs>

          <rect width="770" height="790" fill="url(#dots)" rx="12" />

          {/* Swimlane bands */}
          {LANES.map((lane) => (
            <g key={lane.label}>
              <rect x="42" y={lane.y + 4} width="720" height={lane.h - 8} rx="8" fill={lane.bg} opacity="0.5" />
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

          {/* Sub-path labels in query section */}
          <text x="120" y="437" fontSize="9" fill="#b45309" fontWeight="600" letterSpacing="0.06em" opacity="0.7">SEARCH PATH</text>
          <text x="510" y="437" fontSize="9" fill="#7c3aed" fontWeight="600" letterSpacing="0.06em" opacity="0.7">AI OVERVIEW PATH</text>

          {/* Label: DATA STORES in build section */}
          <text x="68" y="293" fontSize="8" fill="#a3a3a3" fontWeight="600" letterSpacing="0.06em">STORES</text>

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

            let fill = "#f5f5f5";
            let strokeColor = "#d4d4d4";
            if (status === "active") { fill = node.activeFill; strokeColor = node.stroke; }
            else if (status === "done" || status === "ready") { fill = node.fill; strokeColor = node.stroke; }

            return (
              <g
                key={node.id}
                onClick={() => clickable ? onSelectNode(selected ? null : node.id) : undefined}
                style={{ cursor: clickable ? "pointer" : "default" }}
              >
                {/* Active pulse */}
                {status === "active" && (
                  <rect x={x - 3} y={y - 3} width={node.w + 6} height={node.h + 6} rx={10} fill="none"
                    stroke={node.stroke} strokeWidth="2" opacity="0.5">
                    <animate attributeName="opacity" values="0.5;0.15;0.5" dur="1.2s" repeatCount="indefinite" />
                  </rect>
                )}

                {/* Selection ring */}
                {selected && (
                  <rect x={x - 3} y={y - 3} width={node.w + 6} height={node.h + 6} rx={10} fill="none"
                    stroke="#2563eb" strokeWidth="2" />
                )}

                {/* Node rect */}
                <rect
                  x={x} y={y} width={node.w} height={node.h} rx={8}
                  fill={fill} stroke={strokeColor} strokeWidth="1.5"
                  strokeDasharray={isStore ? "5,3" : undefined}
                />

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

          {/* Annotations */}
          {data && activeStep >= 1 && (
            <Annotation x={270} y={448} text={`[${data.pipeline.tokenization.tokens.join(", ")}]`} />
          )}
          {data && activeStep >= 3 && (
            <Annotation x={268} y={591} text={`${data.pipeline.bm25_scoring.total_matched} matched`} />
          )}
          {data && activeStep >= 6 && (
            <Annotation x={345} y={738} text={`${data.total_results} results · ${data.time_ms}ms`} />
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

function DetailPanel({ nodeId, data, stats, onClose }: {
  nodeId: NodeId;
  data: ExplainResponse | null;
  stats: Stats | null;
  onClose: () => void;
}) {
  const node = NODES.find((n) => n.id === nodeId)!;
  const trace = data?.pipeline;

  return (
    <div className="border border-[var(--border)] rounded-xl bg-[var(--bg-card)] overflow-hidden" style={{ animation: "fade-in 0.2s ease-out" }}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)]">
        <div className="w-3 h-3 rounded" style={{ background: node.fill, border: `1.5px solid ${node.stroke}` }} />
        <span className="text-sm font-semibold text-[var(--text)] flex-1">{node.label}</span>
        <button onClick={onClose} className="text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer p-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="px-4 py-3 text-sm">
        {/* BUILD nodes */}
        {nodeId === "crawler" && <p className="text-[var(--text-muted)]">Fetches web pages via breadth-first search starting from seed URLs. {stats && `${stats.pages_crawled} pages crawled.`}</p>}
        {nodeId === "pages_db" && <p className="text-[var(--text-muted)]">Stores raw crawled pages — HTML content, titles, outgoing links. {stats && `${stats.pages_crawled} pages stored.`}</p>}
        {nodeId === "indexer" && <p className="text-[var(--text-muted)]">Tokenizes each page and builds the inverted index (term → document list). {stats && `${stats.total_terms.toLocaleString()} unique terms, ${stats.total_postings.toLocaleString()} postings.`}</p>}
        {nodeId === "pr_compute" && <p className="text-[var(--text-muted)]">Computes PageRank authority scores using the link graph between crawled pages.</p>}
        {nodeId === "chunker" && <p className="text-[var(--text-muted)]">Splits pages into ~300-token chunks at sentence boundaries for vector embedding. {stats && `${stats.total_chunks.toLocaleString()} chunks.`}</p>}
        {nodeId === "embedder" && <p className="text-[var(--text-muted)]">Generates 512-dimensional vectors for each chunk using Voyage AI. {stats && `${stats.chunks_embedded.toLocaleString()} embedded.`}</p>}

        {/* STORES */}
        {nodeId === "inv_index" && <p className="text-[var(--text-muted)]">Maps each term to the list of documents containing it. {stats && `${stats.total_terms.toLocaleString()} terms → ${stats.total_postings.toLocaleString()} postings.`}</p>}
        {nodeId === "pr_scores" && <p className="text-[var(--text-muted)]">Stores authority score per page computed by PageRank. {stats && `${stats.pages_crawled} pages scored.`}</p>}
        {nodeId === "vector_store" && <p className="text-[var(--text-muted)]">Stores chunk embeddings for cosine similarity search. {stats && `${stats.chunks_embedded.toLocaleString()} vectors.`}</p>}

        {/* QUERY nodes with trace data */}
        {nodeId === "query_input" && data && <div className="font-mono bg-[var(--bg-elevated)] px-3 py-2 rounded">&quot;{data.query}&quot;</div>}

        {nodeId === "tokenize" && trace && <TokenizeDetail trace={trace} />}
        {nodeId === "index_lookup" && trace && <IndexDetail trace={trace} />}
        {nodeId === "bm25" && trace && <BM25Detail trace={trace} />}
        {nodeId === "pr_lookup" && trace && <PageRankDetail trace={trace} />}
        {nodeId === "combine" && trace && <CombineDetail trace={trace} />}
        {nodeId === "results" && data && <ResultsDetail data={data} />}

        {nodeId === "fanout" && <p className="text-[var(--text-muted)]">Expands the query via LLM into multiple search angles for broader retrieval.</p>}
        {nodeId === "embed_query" && <p className="text-[var(--text-muted)]">Converts the search query into a 512-dim vector for similarity matching.</p>}
        {nodeId === "vector_search" && <p className="text-[var(--text-muted)]">Finds the most relevant chunks by cosine similarity between query and chunk vectors.</p>}
        {nodeId === "llm" && <p className="text-[var(--text-muted)]">Synthesizes a coherent answer from retrieved chunks using Groq (Llama 3.3 70B).</p>}
        {nodeId === "ai_overview" && <p className="text-[var(--text-muted)]">The final AI-generated summary with inline citations to source pages.</p>}
      </div>
    </div>
  );
}

// ─── Step detail renderers ──────────────────────────────────────

function TokenizeDetail({ trace }: { trace: PipelineTrace }) {
  const t = trace.tokenization;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {t.tokens.map((tok, i) => (
          <span key={i} className="font-mono px-2 py-0.5 bg-[var(--accent)]/8 text-[var(--accent)] rounded border border-[var(--accent)]/15 text-xs">{tok}</span>
        ))}
      </div>
      {t.stopwords_removed.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {t.stopwords_removed.map((w, i) => (
            <span key={i} className="font-mono px-2 py-0.5 bg-red-50 text-red-400 rounded line-through text-xs">{w}</span>
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
        <div key={term} className="flex items-center gap-2 bg-[var(--bg-elevated)] px-3 py-1.5 rounded text-xs">
          <span className="font-mono text-[var(--accent)] font-medium">&quot;{term}&quot;</span>
          <span className="text-[var(--text-dim)]">&rarr;</span>
          <span className="text-[var(--text-muted)]">{info.doc_freq} docs</span>
          <span className="text-[var(--text-dim)] font-mono ml-auto">IDF {info.idf.toFixed(2)}</span>
        </div>
      ))}
      <div className="text-[11px] text-[var(--text-dim)]">{t.corpus_stats.total_docs.toLocaleString()} docs, avg {t.corpus_stats.avg_doc_length.toFixed(0)} tokens — {t.time_ms.toFixed(1)}ms</div>
    </div>
  );
}

function BM25Detail({ trace }: { trace: PipelineTrace }) {
  const t = trace.bm25_scoring;
  const max = t.top_scores[0]?.score ?? 1;
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-[var(--text-dim)]">k1={t.params.k1}, b={t.params.b} — {t.total_matched} matched — {t.time_ms.toFixed(1)}ms</div>
      {t.top_scores.slice(0, 5).map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-dim)] w-3 text-right shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-[var(--text)] truncate">{s.title || `Page ${s.page_id}`}</div>
            <div className="h-1 bg-[var(--bg-elevated)] rounded-full mt-0.5 overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(s.score / max) * 100}%` }} />
            </div>
          </div>
          <span className="text-[10px] font-mono text-[var(--text-dim)] w-9 text-right shrink-0">{s.score.toFixed(2)}</span>
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
      {t.top_scores.slice(0, 5).map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-dim)] w-3 text-right shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-[var(--text)] truncate">{s.title || `Page ${s.page_id}`}</div>
            <div className="h-1 bg-[var(--bg-elevated)] rounded-full mt-0.5 overflow-hidden">
              <div className="h-full bg-purple-400 rounded-full" style={{ width: `${(s.score / max) * 100}%` }} />
            </div>
          </div>
          <span className="text-[10px] font-mono text-[var(--text-dim)] w-14 text-right shrink-0">{s.score.toFixed(6)}</span>
        </div>
      ))}
    </div>
  );
}

function CombineDetail({ trace }: { trace: PipelineTrace }) {
  const t = trace.combination;
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-[var(--text-dim)]">&alpha;={t.alpha} — {t.formula} — {t.time_ms.toFixed(1)}ms</div>
      {t.rank_changes.slice(0, 5).map((rc, i) => {
        const bm25r = typeof rc.bm25_rank === "number" ? rc.bm25_rank : 99;
        const delta = bm25r - rc.final_rank;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="text-[var(--text)] truncate flex-1 min-w-0">{rc.title}</span>
            <span className="font-mono text-[var(--text-dim)]">#{typeof rc.bm25_rank === "number" ? rc.bm25_rank : "—"}</span>
            <span className="text-[var(--text-dim)]">&rarr;</span>
            <span className="font-mono text-[var(--text)]">#{rc.final_rank}</span>
            {delta !== 0 && <span className={`font-mono ${delta > 0 ? "text-green-500" : "text-red-400"}`}>{delta > 0 ? `+${delta}` : delta}</span>}
          </div>
        );
      })}
    </div>
  );
}

function ResultsDetail({ data }: { data: ExplainResponse }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-[var(--text-dim)]">{data.total_results} results in {data.time_ms}ms</div>
      {data.results.slice(0, 4).map((r, i) => (
        <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
          className="block bg-[var(--bg-elevated)] rounded px-3 py-1.5 hover:bg-[var(--border)]/30 transition-colors group">
          <div className="text-xs text-[var(--accent)] group-hover:underline truncate">{r.title}</div>
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
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<NodeId | null>(null);

  const activeStep = useAnimatedSteps(data?.pipeline ?? null);

  useEffect(() => { getStats().then(setStats).catch(() => {}); }, []);

  async function handleSearch(q: string) {
    if (!q.trim()) return;
    setQuery(q);
    setLoading(true);
    setData(null);
    setSelectedNode(null);
    try { setData(await searchExplain(q.trim())); }
    catch { /* */ }
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

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block w-5 h-5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
            <p className="text-sm text-[var(--text-dim)] mt-3">Running search pipeline...</p>
          </div>
        )}

        {!data && !loading && (
          <div className="text-center py-6">
            <p className="text-[var(--text-dim)] text-sm mb-4">Search to see the pipeline animate</p>
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {["Messi", "Champions League", "World Cup"].map((q) => (
                <button key={q} onClick={() => handleSearch(q)}
                  className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 cursor-pointer transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <Flowchart activeStep={activeStep} selectedNode={selectedNode} onSelectNode={setSelectedNode} data={data} />

        {data && activeStep >= 6 && !selectedNode && (
          <p className="text-center text-xs text-[var(--text-dim)]" style={{ animation: "fade-in 0.4s ease-out" }}>
            Click any node to inspect its data
          </p>
        )}

        {selectedNode && (
          <DetailPanel nodeId={selectedNode} data={data} stats={stats} onClose={() => setSelectedNode(null)} />
        )}
      </div>
    </div>
  );
}

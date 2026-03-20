export type FlowPhase =
  | "idle"
  | "queryInput"
  | "tokenizing"
  | "indexLookup"
  | "bm25"
  | "pagerank"
  | "combining"
  | "results"
  | "aiFanout"
  | "aiEmbedding"
  | "aiRetrieval"
  | "aiSynthesis"
  | "aiComplete";

// Build-time processes (offline)
export interface SystemNodeData {
  label: string;
  icon: string;
  description: string;
  stats: { label: string; value: string }[];
  status: "idle" | "running" | "ready";
  color: string;
  progress?: { done: number; total: number; label?: string } | null;
}

// Data stores (databases) — the bridge between build and query
export interface StoreNodeData {
  label: string;
  icon: string;
  description: string;
  stats: { label: string; value: string }[];
  color: string;
  active: boolean; // true when store is being read (query-time) or written to (build-time)
}

// Query-time processing steps
export interface PipelineNodeData {
  label: string;
  icon: string;
  description: string;
  color: string;
  path?: "search" | "ai";
  phase: FlowPhase;
  timeMs: number | null;
  summary: string | null;
  detail: Record<string, unknown> | null;
  state: "idle" | "active" | "completed";
}

// Output nodes
export interface OutputNodeData {
  type: "results" | "ai_overview";
  label: string;
  color: string;
  content: unknown;
  state: "idle" | "active" | "completed";
}

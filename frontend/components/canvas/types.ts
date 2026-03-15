export type FlowPhase =
  | "idle"
  | "tokenizing"
  | "indexLookup"
  | "bm25"
  | "pagerank"
  | "combining"
  | "results"
  | "aiFanout"
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
}

// Data stores (databases) — the bridge between build and query
export interface StoreNodeData {
  label: string;
  icon: string;
  description: string;
  stats: { label: string; value: string }[];
  color: string;
  reading: boolean; // true when query-time is reading from this store
}

// Query-time processing steps
export interface PipelineNodeData {
  label: string;
  icon: string;
  description: string;
  color: string;
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

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

export interface SystemNodeData {
  label: string;
  icon: string;
  description: string;
  stats: { label: string; value: string }[];
  status: "idle" | "running" | "ready";
  color: string;
}

export interface PipelineNodeData {
  label: string;
  icon: string;
  description: string;
  color: string;
  phase: FlowPhase; // which phase activates this node
  timeMs: number | null;
  summary: string | null;
  detail: Record<string, unknown> | null;
  state: "idle" | "active" | "completed";
}

export interface OutputNodeData {
  type: "results" | "ai_overview";
  label: string;
  color: string;
  content: unknown;
  state: "idle" | "active" | "completed";
}

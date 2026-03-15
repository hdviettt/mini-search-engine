import type { Node, Edge } from "@xyflow/react";

/*
  3-zone architecture with group containers:

  ┌─── BUILD ZONE ──────────────────────────────────────────────┐
  │  Crawler → Indexer, PageRank Compute, Chunker → Embedder    │
  └─────────────────────────────────────────────────────────────┘
                              ↓ writes to
  ┌─── DATA STORES ────────────────────────────────────────────┐
  │  Pages DB | Inverted Index | PageRank Scores | Vector Store │
  └─────────────────────────────────────────────────────────────┘
                              ↓ reads from
  ┌─── QUERY ZONE ─────────────────────────────────────────────┐
  │  [Query] → Tokenize → BM25 + PR Lookup → Combine → Results │
  │  [Query] → Embed → Fan-out → Vector Search → LLM → AI Ovw  │
  └─────────────────────────────────────────────────────────────┘
*/

export const initialNodes: Node[] = [
  // ============================================================
  // ZONE LABELS (standalone, not children of groups)
  // ============================================================
  { id: "label_build", type: "label", position: { x: 8, y: -18 }, draggable: false, selectable: false, connectable: false, data: { label: "BUILD (offline)" } },
  { id: "label_stores", type: "label", position: { x: 8, y: 152 }, draggable: false, selectable: false, connectable: false, data: { label: "DATA STORES" } },
  { id: "label_query", type: "label", position: { x: 8, y: 322 }, draggable: false, selectable: false, connectable: false, data: { label: "QUERY (per search)" } },

  // ============================================================
  // GROUP: BUILD ZONE
  // ============================================================
  {
    id: "group_build",
    type: "group",
    position: { x: 0, y: 0 },
    data: { label: "" },
    style: {
      width: 960,
      height: 130,
      background: "rgba(232, 138, 26, 0.02)",
      border: "1px dashed #2a2a2a",
      borderRadius: 0,
      padding: 0,
    },
  },
  {
    id: "crawler",
    type: "system",
    position: { x: 20, y: 25 },
    parentId: "group_build",
    data: { label: "Crawler", icon: "crawler", description: "Fetches pages via BFS", stats: [], status: "ready", color: "emerald" },
  },
  {
    id: "indexer",
    type: "system",
    position: { x: 220, y: 25 },
    parentId: "group_build",
    data: { label: "Indexer", icon: "indexer", description: "Builds inverted index", stats: [], status: "ready", color: "blue" },
  },
  {
    id: "pr_compute",
    type: "system",
    position: { x: 420, y: 25 },
    parentId: "group_build",
    data: { label: "PageRank", icon: "pagerank", description: "Computes link authority", stats: [], status: "ready", color: "indigo" },
  },
  {
    id: "chunker",
    type: "system",
    position: { x: 600, y: 25 },
    parentId: "group_build",
    data: { label: "Chunker", icon: "chunker", description: "~300-token chunks", stats: [], status: "ready", color: "violet" },
  },
  {
    id: "embedder",
    type: "system",
    position: { x: 780, y: 25 },
    parentId: "group_build",
    data: { label: "Embedder", icon: "embedder", description: "768-dim vectors", stats: [], status: "ready", color: "purple" },
  },

  // ============================================================
  // GROUP: DATA STORES
  // ============================================================
  {
    id: "group_stores",
    type: "group",
    position: { x: 0, y: 170 },
    data: { label: "" },
    style: {
      width: 960,
      height: 130,
      background: "rgba(232, 138, 26, 0.02)",
      border: "1px dashed #2a2a2a",
      borderRadius: 0,
    },
  },
  {
    id: "pages_db",
    type: "store",
    position: { x: 20, y: 25 },
    parentId: "group_stores",
    data: { label: "Pages DB", icon: "database", description: "Crawled pages", stats: [], color: "emerald", reading: false },
  },
  {
    id: "inverted_index",
    type: "store",
    position: { x: 220, y: 25 },
    parentId: "group_stores",
    data: { label: "Inverted Index", icon: "inverted_index", description: "term → [docs...]", stats: [], color: "blue", reading: false },
  },
  {
    id: "pr_scores",
    type: "store",
    position: { x: 450, y: 25 },
    parentId: "group_stores",
    data: { label: "PageRank Scores", icon: "scores", description: "Authority per page", stats: [], color: "indigo", reading: false },
  },
  {
    id: "vector_store",
    type: "store",
    position: { x: 680, y: 25 },
    parentId: "group_stores",
    data: { label: "Vector Store", icon: "vector_store", description: "Chunk embeddings", stats: [], color: "purple", reading: false },
  },

  // ============================================================
  // GROUP: QUERY ZONE
  // ============================================================
  {
    id: "group_query",
    type: "group",
    position: { x: 0, y: 340 },
    data: { label: "" },
    style: {
      width: 960,
      height: 390,
      background: "rgba(232, 138, 26, 0.02)",
      border: "1px dashed #2a2a2a",
      borderRadius: 0,
    },
  },

  // -- Query entry point --
  {
    id: "query_input",
    type: "pipeline",
    position: { x: 20, y: 25 },
    parentId: "group_query",
    data: {
      label: "Search Query", icon: "query", description: "User enters a query",
      color: "amber", phase: "tokenizing", timeMs: null, summary: null, detail: null, state: "idle",
    },
  },

  // -- Left track: keyword search --
  {
    id: "tokenize",
    type: "pipeline",
    position: { x: 20, y: 130 },
    parentId: "group_query",
    data: {
      label: "Tokenize", icon: "tokenize", description: "Query → tokens",
      color: "amber", phase: "tokenizing", timeMs: null, summary: null, detail: null, state: "idle",
    },
  },
  {
    id: "bm25",
    type: "pipeline",
    position: { x: 20, y: 220 },
    parentId: "group_query",
    data: {
      label: "BM25 Scoring", icon: "bm25", description: "TF × IDF × length",
      color: "amber", phase: "bm25", timeMs: null, summary: null, detail: null, state: "idle",
    },
  },
  {
    id: "pr_lookup",
    type: "pipeline",
    position: { x: 220, y: 220 },
    parentId: "group_query",
    data: {
      label: "PR Lookup", icon: "pagerank", description: "Fetch scores",
      color: "amber", phase: "pagerank", timeMs: null, summary: null, detail: null, state: "idle",
    },
  },
  {
    id: "combine",
    type: "pipeline",
    position: { x: 120, y: 310 },
    parentId: "group_query",
    data: {
      label: "Combine", icon: "combine", description: "α×BM25 + (1-α)×PR",
      color: "amber", phase: "combining", timeMs: null, summary: null, detail: null, state: "idle",
    },
  },

  // -- Right track: AI overview --
  {
    id: "embed_query",
    type: "pipeline",
    position: { x: 500, y: 25 },
    parentId: "group_query",
    data: {
      label: "Embed Query", icon: "embedder", description: "Query → vector",
      color: "amber", phase: "aiRetrieval", timeMs: null, summary: null, detail: null, state: "idle",
    },
  },
  {
    id: "fanout",
    type: "pipeline",
    position: { x: 500, y: 130 },
    parentId: "group_query",
    data: {
      label: "Fan-out", icon: "fanout", description: "Expand via LLM",
      color: "amber", phase: "aiFanout", timeMs: null, summary: null, detail: null, state: "idle",
    },
  },
  {
    id: "vector_search",
    type: "pipeline",
    position: { x: 700, y: 130 },
    parentId: "group_query",
    data: {
      label: "Vector Search", icon: "retriever", description: "Cosine similarity",
      color: "amber", phase: "aiRetrieval", timeMs: null, summary: null, detail: null, state: "idle",
    },
  },
  {
    id: "llm",
    type: "pipeline",
    position: { x: 600, y: 220 },
    parentId: "group_query",
    data: {
      label: "LLM Synthesis", icon: "llm", description: "Groq — Llama 3.3 70B",
      color: "amber", phase: "aiSynthesis", timeMs: null, summary: null, detail: null, state: "idle",
    },
  },

  // -- Outputs (inside query zone) --
  {
    id: "results",
    type: "output",
    position: { x: 20, y: 310 },
    parentId: "group_query",
    data: { type: "results", label: "Ranked Results", color: "amber", content: null, state: "idle" },
  },
  {
    id: "ai_overview",
    type: "output",
    position: { x: 500, y: 310 },
    parentId: "group_query",
    data: { type: "ai_overview", label: "AI Overview", color: "amber", content: null, state: "idle" },
  },
];

export const initialEdges: Edge[] = [
  // BUILD → STORE (dashed, write paths)
  { id: "b-crawler-pages", source: "crawler", target: "pages_db", style: { strokeDasharray: "4,4", stroke: "#333" } },
  { id: "b-crawler-indexer", source: "crawler", target: "indexer", style: { stroke: "#333" } },
  { id: "b-indexer-index", source: "indexer", target: "inverted_index", style: { strokeDasharray: "4,4", stroke: "#333" } },
  { id: "b-crawler-pr", source: "crawler", target: "pr_compute", style: { stroke: "#333" } },
  { id: "b-pr-scores", source: "pr_compute", target: "pr_scores", style: { strokeDasharray: "4,4", stroke: "#333" } },
  { id: "b-crawler-chunker", source: "crawler", target: "chunker", style: { stroke: "#333" } },
  { id: "b-chunker-embedder", source: "chunker", target: "embedder", style: { stroke: "#333" } },
  { id: "b-embedder-vectors", source: "embedder", target: "vector_store", style: { strokeDasharray: "4,4", stroke: "#333" } },

  // STORE → QUERY (read paths)
  { id: "q-index-bm25", source: "inverted_index", target: "bm25", style: { stroke: "#222" } },
  { id: "q-scores-prlookup", source: "pr_scores", target: "pr_lookup", style: { stroke: "#222" } },
  { id: "q-vectors-vsearch", source: "vector_store", target: "vector_search", style: { stroke: "#222" } },

  // QUERY flow — left track (keyword search)
  { id: "q-input-tokenize", source: "query_input", target: "tokenize", style: { stroke: "#222" } },
  { id: "q-token-bm25", source: "tokenize", target: "bm25", style: { stroke: "#222" } },
  { id: "q-token-prlookup", source: "tokenize", target: "pr_lookup", style: { stroke: "#222" } },
  { id: "q-bm25-combine", source: "bm25", target: "combine", style: { stroke: "#222" } },
  { id: "q-prlookup-combine", source: "pr_lookup", target: "combine", style: { stroke: "#222" } },
  { id: "q-combine-results", source: "combine", target: "results", style: { stroke: "#222" } },

  // QUERY flow — right track (AI overview)
  { id: "q-input-embed", source: "query_input", target: "embed_query", style: { stroke: "#222" } },
  { id: "q-embed-vsearch", source: "embed_query", target: "vector_search", style: { stroke: "#222" } },
  { id: "q-fanout-vsearch", source: "fanout", target: "vector_search", style: { stroke: "#222" } },
  { id: "q-input-fanout", source: "query_input", target: "fanout", style: { stroke: "#222" } },
  { id: "q-vsearch-llm", source: "vector_search", target: "llm", style: { stroke: "#222" } },
  { id: "q-llm-ai", source: "llm", target: "ai_overview", style: { stroke: "#222" } },
];

export const phaseEdgeMap: Record<string, string[]> = {
  tokenizing: ["q-input-tokenize", "q-input-embed", "q-input-fanout"],
  indexLookup: ["q-index-bm25", "q-token-bm25"],
  bm25: ["q-index-bm25", "q-token-bm25"],
  pagerank: ["q-scores-prlookup", "q-token-prlookup"],
  combining: ["q-bm25-combine", "q-prlookup-combine"],
  results: ["q-combine-results"],
  aiFanout: ["q-input-fanout", "q-fanout-vsearch"],
  aiRetrieval: ["q-vectors-vsearch", "q-embed-vsearch", "q-fanout-vsearch"],
  aiSynthesis: ["q-vsearch-llm"],
  aiComplete: ["q-llm-ai"],
};

export const phaseNodeMap: Record<string, string> = {
  tokenizing: "tokenize",
  indexLookup: "tokenize",
  bm25: "bm25",
  pagerank: "pr_lookup",
  combining: "combine",
  results: "results",
  aiFanout: "fanout",
  aiRetrieval: "vector_search",
  aiSynthesis: "llm",
  aiComplete: "ai_overview",
};

export const phaseStoreMap: Record<string, string[]> = {
  bm25: ["inverted_index"],
  indexLookup: ["inverted_index"],
  pagerank: ["pr_scores"],
  aiRetrieval: ["vector_store"],
};

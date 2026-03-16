import type { Node, Edge } from "@xyflow/react";

/*
  BUILD ZONE:
                    Crawler
                   /       \
          Indexer  PR_Compute  Chunker → Embedder

  DATA STORES:
    Pages DB | Inverted Index | PR Scores | Vector Store

  QUERY ZONE:
    ┌─ SEARCH PATH ──────────────────────────┐
    │ Query → Tokenize → BM25 + PR → Combine │
    │                                → Results│
    └────────────────────────────────────────┘
    ┌─ AI OVERVIEW PATH ─────────────────────┐
    │ Query → Embed → Fan-out → Vector Search│
    │                       → LLM → AI Ovw   │
    └────────────────────────────────────────┘
*/

const BUILD_ROW1 = 45;
const BUILD_ROW2 = 180;
const STORE_Y = 40;
const Q_ROW1 = 50;
const Q_ROW2 = 190;
const Q_ROW3 = 330;
const Q_ROW4 = 470;

export const initialNodes: Node[] = [
  // ZONE LABELS
  { id: "label_build", type: "label", position: { x: 10, y: -20 }, draggable: false, selectable: false, connectable: false, data: { label: "BUILD (offline)" } },
  { id: "label_stores", type: "label", position: { x: 10, y: 360 }, draggable: false, selectable: false, connectable: false, data: { label: "DATA STORES" } },
  { id: "label_query", type: "label", position: { x: 10, y: 580 }, draggable: false, selectable: false, connectable: false, data: { label: "QUERY (per search)" } },

  // ============================================================
  // BUILD ZONE — Crawler on top, branches down
  // ============================================================
  {
    id: "group_build",
    type: "group",
    position: { x: 0, y: 0 },
    data: { label: "" },
    style: { width: 1150, height: 320, background: "var(--group-bg)", border: "1px dashed var(--group-border)", borderRadius: 0 },
  },
  // Row 1: Crawler centered
  {
    id: "crawler",
    type: "system",
    position: { x: 450, y: BUILD_ROW1 },
    parentId: "group_build",
    data: { label: "Crawler", icon: "crawler", description: "Fetches pages via BFS", stats: [], status: "ready", color: "emerald" },
  },
  // Row 2: branches
  {
    id: "indexer",
    type: "system",
    position: { x: 60, y: BUILD_ROW2 },
    parentId: "group_build",
    data: { label: "Indexer", icon: "indexer", description: "Builds inverted index", stats: [], status: "ready", color: "blue" },
  },
  {
    id: "pr_compute",
    type: "system",
    position: { x: 340, y: BUILD_ROW2 },
    parentId: "group_build",
    data: { label: "PageRank", icon: "pagerank", description: "Link-based authority score", stats: [], status: "ready", color: "indigo" },
  },
  {
    id: "chunker",
    type: "system",
    position: { x: 630, y: BUILD_ROW2 },
    parentId: "group_build",
    data: { label: "Chunker", icon: "chunker", description: "~300 tokens @ sentence boundaries", stats: [], status: "ready", color: "violet" },
  },
  {
    id: "embedder",
    type: "system",
    position: { x: 900, y: BUILD_ROW2 },
    parentId: "group_build",
    data: { label: "Embedder", icon: "embedder", description: "512-dim vectors (Voyage)", stats: [], status: "ready", color: "purple" },
  },

  // ============================================================
  // DATA STORES
  // ============================================================
  {
    id: "group_stores",
    type: "group",
    position: { x: 0, y: 380 },
    data: { label: "" },
    style: { width: 1150, height: 150, background: "var(--group-bg)", border: "1px dashed var(--group-border)", borderRadius: 0 },
  },
  {
    id: "pages_db",
    type: "store",
    position: { x: 30, y: STORE_Y },
    parentId: "group_stores",
    data: { label: "Pages DB", icon: "database", description: "Crawled pages", stats: [], color: "emerald", reading: false },
  },
  {
    id: "inverted_index",
    type: "store",
    position: { x: 280, y: STORE_Y },
    parentId: "group_stores",
    data: { label: "Inverted Index", icon: "inverted_index", description: "term → [docs...]", stats: [], color: "blue", reading: false },
  },
  {
    id: "pr_scores",
    type: "store",
    position: { x: 540, y: STORE_Y },
    parentId: "group_stores",
    data: { label: "PR Scores", icon: "scores", description: "Authority per page", stats: [], color: "indigo", reading: false },
  },
  {
    id: "vector_store",
    type: "store",
    position: { x: 830, y: STORE_Y },
    parentId: "group_stores",
    data: { label: "Vector Store", icon: "vector_store", description: "Chunk embeddings", stats: [], color: "purple", reading: false },
  },

  // ============================================================
  // QUERY ZONE — two labeled sub-paths
  // ============================================================
  {
    id: "group_query",
    type: "group",
    position: { x: 0, y: 600 },
    data: { label: "" },
    style: { width: 1150, height: 580, background: "var(--group-bg)", border: "1px dashed var(--group-border)", borderRadius: 0 },
  },

  // Path labels inside query zone
  { id: "label_search_path", type: "label", position: { x: 12, y: 10 }, parentId: "group_query", draggable: false, selectable: false, connectable: false, data: { label: "> SEARCH PATH" } },
  { id: "label_ai_path", type: "label", position: { x: 600, y: 10 }, parentId: "group_query", draggable: false, selectable: false, connectable: false, data: { label: "> AI OVERVIEW PATH" } },

  // Query entry
  {
    id: "query_input",
    type: "pipeline",
    position: { x: 450, y: Q_ROW1 },
    parentId: "group_query",
    data: { label: "Search Query", icon: "query", description: "User enters a query", color: "amber", phase: "tokenizing", timeMs: null, summary: null, detail: null, state: "idle" },
  },

  // -- SEARCH PATH (left) --
  {
    id: "tokenize",
    type: "pipeline",
    position: { x: 50, y: Q_ROW2 },
    parentId: "group_query",
    data: { label: "Tokenize", icon: "tokenize", description: "Query → tokens", color: "amber", phase: "tokenizing", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "bm25",
    type: "pipeline",
    position: { x: 50, y: Q_ROW3 },
    parentId: "group_query",
    data: { label: "BM25 Scoring", icon: "bm25", description: "TF × IDF × length", color: "amber", phase: "bm25", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "pr_lookup",
    type: "pipeline",
    position: { x: 300, y: Q_ROW3 },
    parentId: "group_query",
    data: { label: "PR Lookup", icon: "pagerank", description: "Fetch scores", color: "amber", phase: "pagerank", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "combine",
    type: "pipeline",
    position: { x: 170, y: Q_ROW4 },
    parentId: "group_query",
    data: { label: "Combine", icon: "combine", description: "α×BM25 + (1-α)×PR", color: "amber", phase: "combining", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "results",
    type: "output",
    position: { x: 50, y: Q_ROW4 + 120 },
    parentId: "group_query",
    data: { type: "results", label: "Ranked Results", color: "amber", content: null, state: "idle" },
  },

  // -- AI OVERVIEW PATH (right) --
  {
    id: "fanout",
    type: "pipeline",
    position: { x: 620, y: Q_ROW2 },
    parentId: "group_query",
    data: { label: "Fan-out", icon: "fanout", description: "Expand via LLM", color: "amber", phase: "aiFanout", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "embed_query",
    type: "pipeline",
    position: { x: 870, y: Q_ROW2 },
    parentId: "group_query",
    data: { label: "Embed Query", icon: "embedder", description: "Query → vector", color: "amber", phase: "aiRetrieval", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "vector_search",
    type: "pipeline",
    position: { x: 740, y: Q_ROW3 },
    parentId: "group_query",
    data: { label: "Vector Search", icon: "retriever", description: "Cosine similarity", color: "amber", phase: "aiRetrieval", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "llm",
    type: "pipeline",
    position: { x: 740, y: Q_ROW4 },
    parentId: "group_query",
    data: { label: "LLM Synthesis", icon: "llm", description: "Groq — Llama 3.3 70B", color: "amber", phase: "aiSynthesis", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "ai_overview",
    type: "output",
    position: { x: 640, y: Q_ROW4 + 120 },
    parentId: "group_query",
    data: { type: "ai_overview", label: "AI Overview", color: "amber", content: null, state: "idle" },
  },
];

export const initialEdges: Edge[] = [
  // BUILD: Crawler branches down
  { id: "b-crawler-indexer", source: "crawler", target: "indexer", style: { stroke: "var(--edge-color)" } },
  { id: "b-crawler-pr", source: "crawler", target: "pr_compute", style: { stroke: "var(--edge-color)" } },
  { id: "b-crawler-chunker", source: "crawler", target: "chunker", style: { stroke: "var(--edge-color)" } },
  { id: "b-chunker-embedder", source: "chunker", target: "embedder", style: { stroke: "var(--edge-color)" } },

  // BUILD → STORE (dashed write paths)
  { id: "b-crawler-pages", source: "crawler", target: "pages_db", style: { strokeDasharray: "4,4", stroke: "var(--edge-color)" } },
  { id: "b-indexer-index", source: "indexer", target: "inverted_index", style: { strokeDasharray: "4,4", stroke: "var(--edge-color)" } },
  { id: "b-pr-scores", source: "pr_compute", target: "pr_scores", style: { strokeDasharray: "4,4", stroke: "var(--edge-color)" } },
  { id: "b-embedder-vectors", source: "embedder", target: "vector_store", style: { strokeDasharray: "4,4", stroke: "var(--edge-color)" } },

  // STORE → QUERY (read paths)
  { id: "q-index-bm25", source: "inverted_index", target: "bm25", style: { stroke: "var(--edge-query)" } },
  { id: "q-scores-prlookup", source: "pr_scores", target: "pr_lookup", style: { stroke: "var(--edge-query)" } },
  { id: "q-vectors-vsearch", source: "vector_store", target: "vector_search", style: { stroke: "var(--edge-query)" } },

  // SEARCH PATH
  { id: "q-input-tokenize", source: "query_input", target: "tokenize", style: { stroke: "var(--edge-query)" } },
  { id: "q-token-bm25", source: "tokenize", target: "bm25", style: { stroke: "var(--edge-query)" } },
  { id: "q-token-prlookup", source: "tokenize", target: "pr_lookup", style: { stroke: "var(--edge-query)" } },
  { id: "q-bm25-combine", source: "bm25", target: "combine", style: { stroke: "var(--edge-query)" } },
  { id: "q-prlookup-combine", source: "pr_lookup", target: "combine", style: { stroke: "var(--edge-query)" } },
  { id: "q-combine-results", source: "combine", target: "results", style: { stroke: "var(--edge-query)" } },

  // AI OVERVIEW PATH
  { id: "q-input-fanout", source: "query_input", target: "fanout", style: { stroke: "var(--edge-query)" } },
  { id: "q-input-embed", source: "query_input", target: "embed_query", style: { stroke: "var(--edge-query)" } },
  { id: "q-fanout-vsearch", source: "fanout", target: "vector_search", style: { stroke: "var(--edge-query)" } },
  { id: "q-embed-vsearch", source: "embed_query", target: "vector_search", style: { stroke: "var(--edge-query)" } },
  { id: "q-vsearch-llm", source: "vector_search", target: "llm", style: { stroke: "var(--edge-query)" } },
  { id: "q-llm-ai", source: "llm", target: "ai_overview", style: { stroke: "var(--edge-query)" } },
];

export const phaseEdgeMap: Record<string, string[]> = {
  queryInput: [],
  tokenizing: ["q-input-tokenize"],
  indexLookup: ["q-token-bm25", "q-index-bm25"],
  bm25: ["q-index-bm25", "q-token-bm25"],
  pagerank: ["q-scores-prlookup", "q-token-prlookup"],
  combining: ["q-bm25-combine", "q-prlookup-combine"],
  results: ["q-combine-results"],
  aiFanout: ["q-input-fanout"],
  aiEmbedding: ["q-input-embed"],
  aiRetrieval: ["q-fanout-vsearch", "q-embed-vsearch", "q-vectors-vsearch"],
  aiSynthesis: ["q-vsearch-llm"],
  aiComplete: ["q-llm-ai"],
};

export const phaseNodeMap: Record<string, string> = {
  queryInput: "query_input",
  tokenizing: "tokenize",
  indexLookup: "tokenize",
  bm25: "bm25",
  pagerank: "pr_lookup",
  combining: "combine",
  results: "results",
  aiFanout: "fanout",
  aiEmbedding: "embed_query",
  aiRetrieval: "vector_search",
  aiSynthesis: "llm",
  aiComplete: "ai_overview",
};

export const phaseStoreMap: Record<string, string[]> = {
  indexLookup: ["inverted_index"],
  bm25: ["inverted_index"],
  pagerank: ["pr_scores"],
  aiRetrieval: ["vector_store"],
};

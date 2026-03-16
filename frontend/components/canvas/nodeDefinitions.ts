import type { Node, Edge } from "@xyflow/react";

/*
  OPTION B — Column-based layout, stores as horizontal divider

  BUILD ZONE (3 columns):
           Crawler
              ↓
          Pages DB        ← store
         /    |    \
   Indexer  PageRank  Chunker → Embedder

  ═══ STORE BAND ═══════════════════════════
   Inv.Index  PR Scores    Vector Store

  QUERY ZONE (2 paths):
         Search Query
        ↙            ↘
   SEARCH PATH     AI OVERVIEW PATH
   Tokenize        Fan-out    Embed Query
   Idx Lookup      Vector Search
   BM25  PR Lookup LLM
   Combine         AI Overview
   Results
*/

// === Y coordinates (absolute, no groups) ===
// Build zone
const B_CRAWLER = 30;
const B_PAGES_DB = 150;
const B_PROCESSORS = 290;
const B_EMBEDDER = 400;   // Embedder below Chunker

// Store band
const S_BAND = 530;

// Query zone — Search Query sits above like Crawler sits above BUILD
const Q_INPUT = 660;     // Entry point, between stores and query paths
const Q_LABEL = 760;     // Zone label below query input
const Q_ROW1 = 820;
const Q_ROW1_5 = 920;
const Q_ROW2 = 1020;
const Q_ROW3 = 1130;
const Q_ROW4 = 1240;

// === X coordinates (3 aligned columns) ===
const COL1 = 30;       // Indexing column
const COL2 = 280;      // PageRank column
const COL3 = 530;      // Chunker + Embedder column (stacked)

// Query X positions — wide gap between paths
const QS = 30;         // Search path left edge
const QS2 = 230;       // PR Lookup
const QA = 580;        // AI path left
const QA2 = 790;       // AI path right

export const initialNodes: Node[] = [
  // ============================================================
  // BUILD ZONE
  // ============================================================
  { id: "label_build", type: "label", position: { x: 10, y: B_CRAWLER - 25 }, data: { label: "BUILD (offline)" } },

  // Crawler centered above Pages DB
  {
    id: "crawler",
    type: "system",
    position: { x: COL2, y: B_CRAWLER },
    data: { label: "Crawler", icon: "crawler", description: "Fetches pages via BFS", stats: [], status: "ready", color: "emerald" },
  },
  // Pages DB centered — the hub
  {
    id: "pages_db",
    type: "store",
    position: { x: COL2 + 15, y: B_PAGES_DB },
    data: { label: "Pages DB", icon: "database", description: "Crawled pages", stats: [], color: "emerald", active: false },
  },
  // 3 processors + embedder in a row
  {
    id: "indexer",
    type: "system",
    position: { x: COL1, y: B_PROCESSORS },
    data: { label: "Indexer", icon: "indexer", description: "Builds inverted index", stats: [], status: "ready", color: "blue" },
  },
  {
    id: "pr_compute",
    type: "system",
    position: { x: COL2, y: B_PROCESSORS },
    data: { label: "PageRank", icon: "pagerank", description: "Link-based authority score", stats: [], status: "ready", color: "indigo" },
  },
  {
    id: "chunker",
    type: "system",
    position: { x: COL3, y: B_PROCESSORS },
    data: { label: "Chunker", icon: "chunker", description: "~300 tokens @ sentence boundaries", stats: [], status: "ready", color: "violet" },
  },
  {
    id: "embedder",
    type: "system",
    position: { x: COL3, y: B_EMBEDDER },
    data: { label: "Embedder", icon: "embedder", description: "512-dim vectors (Voyage)", stats: [], status: "ready", color: "purple" },
  },

  // ============================================================
  // STORE BAND — each store aligned under its processor
  // ============================================================
  { id: "label_stores", type: "label", position: { x: 10, y: S_BAND - 25 }, data: { label: "DATA STORES" } },

  {
    id: "inverted_index",
    type: "store",
    position: { x: COL1 + 15, y: S_BAND },
    data: { label: "Inverted Index", icon: "inverted_index", description: "term → [docs...]", stats: [], color: "blue", active: false },
  },
  {
    id: "pr_scores",
    type: "store",
    position: { x: COL2 + 15, y: S_BAND },
    data: { label: "PR Scores", icon: "scores", description: "Authority per page", stats: [], color: "indigo", active: false },
  },
  {
    id: "vector_store",
    type: "store",
    position: { x: COL3 + 15, y: S_BAND },
    data: { label: "Vector Store", icon: "vector_store", description: "Chunk embeddings", stats: [], color: "purple", active: false },
  },

  // ============================================================
  // QUERY ZONE
  // ============================================================
  // Query input — entry point, sits above the two paths like Crawler sits above BUILD
  {
    id: "query_input",
    type: "pipeline",
    position: { x: 280, y: Q_INPUT },
    data: { label: "Search Query", icon: "query", description: "User enters a query", color: "amber", phase: "tokenizing", timeMs: null, summary: null, detail: null, state: "idle" },
  },

  { id: "label_query", type: "label", position: { x: 10, y: Q_INPUT - 25 }, data: { label: "QUERY (per search)" } },
  { id: "label_search_path", type: "label", position: { x: QS, y: Q_LABEL }, data: { label: "> SEARCH PATH" } },
  { id: "label_ai_path", type: "label", position: { x: QA, y: Q_LABEL }, data: { label: "> AI OVERVIEW PATH" } },

  // -- SEARCH PATH --
  {
    id: "tokenize",
    type: "pipeline",
    position: { x: QS, y: Q_ROW1 },
    data: { label: "Tokenize", icon: "tokenize", description: "Query → tokens", color: "amber", phase: "tokenizing", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "index_lookup",
    type: "pipeline",
    position: { x: QS, y: Q_ROW1_5 },
    data: { label: "Index Lookup", icon: "inverted_index", description: "Term → doc list", color: "amber", phase: "indexLookup", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "bm25",
    type: "pipeline",
    position: { x: QS, y: Q_ROW2 },
    data: { label: "BM25 Scoring", icon: "bm25", description: "TF × IDF × length", color: "amber", phase: "bm25", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "pr_lookup",
    type: "pipeline",
    position: { x: QS2, y: Q_ROW2 },
    data: { label: "PR Lookup", icon: "pagerank", description: "Fetch scores", color: "amber", phase: "pagerank", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "combine",
    type: "pipeline",
    position: { x: QS + 90, y: Q_ROW3 },
    data: { label: "Combine", icon: "combine", description: "α×BM25 + (1-α)×PR", color: "amber", phase: "combining", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "results",
    type: "output",
    position: { x: QS + 30, y: Q_ROW4 },
    data: { type: "results", label: "Ranked Results", color: "amber", content: null, state: "idle" },
  },

  // -- AI OVERVIEW PATH --
  {
    id: "fanout",
    type: "pipeline",
    position: { x: QA, y: Q_ROW1 },
    data: { label: "Fan-out", icon: "fanout", description: "Expand via LLM", color: "amber", phase: "aiFanout", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "embed_query",
    type: "pipeline",
    position: { x: QA2, y: Q_ROW1 },
    data: { label: "Embed Query", icon: "embedder", description: "Query → vector", color: "amber", phase: "aiRetrieval", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "vector_search",
    type: "pipeline",
    position: { x: QA + 90, y: Q_ROW2 },
    data: { label: "Vector Search", icon: "retriever", description: "Cosine similarity", color: "amber", phase: "aiRetrieval", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "llm",
    type: "pipeline",
    position: { x: QA + 90, y: Q_ROW3 },
    data: { label: "LLM Synthesis", icon: "llm", description: "Groq — Llama 3.3 70B", color: "amber", phase: "aiSynthesis", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "ai_overview",
    type: "output",
    position: { x: QA + 30, y: Q_ROW4 },
    data: { type: "ai_overview", label: "AI Overview", color: "amber", content: null, state: "idle" },
  },
];

export const initialEdges: Edge[] = [
  // BUILD: Crawler → Pages DB (write)
  { id: "b-crawler-pages", source: "crawler", target: "pages_db", type: "default", style: { strokeDasharray: "4,4", stroke: "var(--edge-color)" } },

  // Pages DB → processors (read)
  { id: "b-pages-indexer", source: "pages_db", target: "indexer", type: "default", style: { stroke: "var(--edge-color)" } },
  { id: "b-pages-pr", source: "pages_db", target: "pr_compute", type: "default", style: { stroke: "var(--edge-color)" } },
  { id: "b-pages-chunker", source: "pages_db", target: "chunker", type: "default", style: { stroke: "var(--edge-color)" } },

  // Processors → stores (write)
  { id: "b-indexer-index", source: "indexer", target: "inverted_index", type: "default", style: { strokeDasharray: "4,4", stroke: "var(--edge-color)" } },
  { id: "b-pr-scores", source: "pr_compute", target: "pr_scores", type: "default", style: { strokeDasharray: "4,4", stroke: "var(--edge-color)" } },

  // Chunker → Embedder → Vector Store
  { id: "b-chunker-embedder", source: "chunker", target: "embedder", type: "default", style: { stroke: "var(--edge-color)" } },
  { id: "b-embedder-vectors", source: "embedder", target: "vector_store", type: "default", style: { strokeDasharray: "4,4", stroke: "var(--edge-color)" } },

  // STORES → QUERY (read paths)
  { id: "q-store-lookup", source: "inverted_index", target: "index_lookup", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-scores-prlookup", source: "pr_scores", target: "pr_lookup", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-vectors-vsearch", source: "vector_store", target: "vector_search", type: "default", style: { stroke: "var(--edge-query)" } },

  // SEARCH PATH
  { id: "q-input-tokenize", source: "query_input", target: "tokenize", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-token-lookup", source: "tokenize", target: "index_lookup", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-lookup-bm25", source: "index_lookup", target: "bm25", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-token-prlookup", source: "tokenize", target: "pr_lookup", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-bm25-combine", source: "bm25", target: "combine", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-prlookup-combine", source: "pr_lookup", target: "combine", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-combine-results", source: "combine", target: "results", type: "default", style: { stroke: "var(--edge-query)" } },

  // AI OVERVIEW PATH
  { id: "q-input-fanout", source: "query_input", target: "fanout", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-input-embed", source: "query_input", target: "embed_query", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-fanout-vsearch", source: "fanout", target: "vector_search", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-embed-vsearch", source: "embed_query", target: "vector_search", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-vsearch-llm", source: "vector_search", target: "llm", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-llm-ai", source: "llm", target: "ai_overview", type: "default", style: { stroke: "var(--edge-query)" } },
];

export const phaseEdgeMap: Record<string, string[]> = {
  queryInput: [],
  tokenizing: ["q-input-tokenize"],
  indexLookup: ["q-token-lookup", "q-store-lookup"],
  bm25: ["q-lookup-bm25"],
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
  indexLookup: "index_lookup",
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

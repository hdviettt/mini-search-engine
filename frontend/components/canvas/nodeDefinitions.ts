import type { Node, Edge } from "@xyflow/react";

/*
  SIDE-BY-SIDE LAYOUT
  Left: BUILD (offline)     Center: STORES     Right: QUERY (online)

  Crawler                                      Search Query
     ↓                                          ↙        ↘
  Pages DB ──────────────────────────→      Tokenize    Fan-out  Embed
     ↓       ↓        ↓                       ↓             ↘   ↙
  Indexer  PageRank  Chunker              Idx Lookup     Vector Search
     ↓       ↓        ↓                       ↓              ↓
  Inv.Idx  PR Scores  Embedder            BM25  PR Lookup    LLM
     ↓       ↓        ↓                       ↓    ↓         ↓
     ─ ─ STORES BRIDGE ─ ─ ─ →           Combine        AI Overview
                                              ↓
                                          Results
*/

// === LEFT SIDE: BUILD (x: 0–350) ===
const BX = 80;            // Build column center
const BX2 = 0;            // Indexer
const BX3 = 200;          // PageRank
const BX4 = 400;          // Chunker/Embedder

const BY1 = 30;           // Crawler
const BY2 = 150;          // Pages DB
const BY3 = 290;          // Processors
const BY4 = 410;          // Embedder (below Chunker)
const BY5 = 550;          // Stores

// === RIGHT SIDE: QUERY (x: 680+) ===
const QX = 680;           // Query entry
const QS = 630;           // Search path
const QS2 = 830;          // PR Lookup
const QA = 1050;          // AI path
const QA2 = 1250;         // Embed Query

const QY1 = 30;           // Search Query
const QY2 = 170;          // Path labels + Tokenize / Fan-out / Embed
const QY3 = 310;          // Idx Lookup / Vector Search — aligned with stores (BY5=550)
const QY4 = 450;          // BM25+PR / LLM
const QY5 = 590;          // Combine / AI Overview
const QY6 = 730;          // Results

export const initialNodes: Node[] = [
  // ============================================================
  // BUILD ZONE (left side)
  // ============================================================
  { id: "label_build", type: "label", position: { x: 10, y: BY1 - 25 }, data: { label: "BUILD (offline)" } },

  {
    id: "crawler",
    type: "system",
    position: { x: BX3, y: BY1 },
    data: { label: "Crawler", icon: "crawler", description: "Fetches pages via BFS", stats: [], status: "ready", color: "emerald" },
  },
  {
    id: "pages_db",
    type: "store",
    position: { x: BX3 + 15, y: BY2 },
    data: { label: "Pages DB", icon: "database", description: "Crawled pages", stats: [], color: "emerald", active: false },
  },
  {
    id: "indexer",
    type: "system",
    position: { x: BX2, y: BY3 },
    data: { label: "Indexer", icon: "indexer", description: "Builds inverted index", stats: [], status: "ready", color: "blue" },
  },
  {
    id: "pr_compute",
    type: "system",
    position: { x: BX3, y: BY3 },
    data: { label: "PageRank", icon: "pagerank", description: "Link-based authority score", stats: [], status: "ready", color: "indigo" },
  },
  {
    id: "chunker",
    type: "system",
    position: { x: BX4, y: BY3 },
    data: { label: "Chunker", icon: "chunker", description: "~300 tokens @ sentence boundaries", stats: [], status: "ready", color: "violet" },
  },
  {
    id: "embedder",
    type: "system",
    position: { x: BX4, y: BY4 },
    data: { label: "Embedder", icon: "embedder", description: "512-dim vectors (Voyage)", stats: [], status: "ready", color: "purple" },
  },

  // Stores — bottom of build side
  { id: "label_stores", type: "label", position: { x: 10, y: BY5 - 25 }, data: { label: "DATA STORES" } },

  {
    id: "inverted_index",
    type: "store",
    position: { x: BX2 + 15, y: BY5 },
    data: { label: "Inverted Index", icon: "inverted_index", description: "term → [docs...]", stats: [], color: "blue", active: false },
  },
  {
    id: "pr_scores",
    type: "store",
    position: { x: BX3 + 15, y: BY5 },
    data: { label: "PR Scores", icon: "scores", description: "Authority per page", stats: [], color: "indigo", active: false },
  },
  {
    id: "vector_store",
    type: "store",
    position: { x: BX4 + 15, y: BY5 },
    data: { label: "Vector Store", icon: "vector_store", description: "Chunk embeddings", stats: [], color: "purple", active: false },
  },

  // ============================================================
  // QUERY ZONE (right side)
  // ============================================================
  { id: "label_query", type: "label", position: { x: QS, y: QY1 - 25 }, data: { label: "QUERY (per search)" } },

  {
    id: "query_input",
    type: "pipeline",
    position: { x: QX + 200, y: QY1 },
    data: { label: "Search Query", icon: "query", description: "User enters a query", color: "amber", phase: "tokenizing", timeMs: null, summary: null, detail: null, state: "idle" },
  },

  { id: "label_search_path", type: "label", position: { x: QS, y: QY2 - 25 }, data: { label: "> SEARCH PATH" } },
  { id: "label_ai_path", type: "label", position: { x: QA, y: QY2 - 25 }, data: { label: "> AI OVERVIEW PATH" } },

  // -- SEARCH PATH --
  {
    id: "tokenize",
    type: "pipeline",
    position: { x: QS, y: QY2 },
    data: { label: "Tokenize", icon: "tokenize", description: "Query → tokens", color: "amber", phase: "tokenizing", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "index_lookup",
    type: "pipeline",
    position: { x: QS, y: QY3 },
    data: { label: "Index Lookup", icon: "inverted_index", description: "Term → doc list", color: "amber", phase: "indexLookup", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "bm25",
    type: "pipeline",
    position: { x: QS, y: QY4 },
    data: { label: "BM25 Scoring", icon: "bm25", description: "TF × IDF × length", color: "amber", phase: "bm25", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "pr_lookup",
    type: "pipeline",
    position: { x: QS2, y: QY4 },
    data: { label: "PR Lookup", icon: "pagerank", description: "Fetch scores", color: "amber", phase: "pagerank", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "combine",
    type: "pipeline",
    position: { x: QS + 80, y: QY5 },
    data: { label: "Combine", icon: "combine", description: "α×BM25 + (1-α)×PR", color: "amber", phase: "combining", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "results",
    type: "output",
    position: { x: QS + 30, y: QY6 },
    data: { type: "results", label: "Ranked Results", color: "amber", content: null, state: "idle" },
  },

  // -- AI OVERVIEW PATH --
  {
    id: "fanout",
    type: "pipeline",
    position: { x: QA, y: QY2 },
    data: { label: "Fan-out", icon: "fanout", description: "Expand via LLM", color: "amber", phase: "aiFanout", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "embed_query",
    type: "pipeline",
    position: { x: QA2, y: QY2 },
    data: { label: "Embed Query", icon: "embedder", description: "Query → vector", color: "amber", phase: "aiRetrieval", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "vector_search",
    type: "pipeline",
    position: { x: QA + 80, y: QY3 },
    data: { label: "Vector Search", icon: "retriever", description: "Cosine similarity", color: "amber", phase: "aiRetrieval", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "llm",
    type: "pipeline",
    position: { x: QA + 80, y: QY4 },
    data: { label: "LLM Synthesis", icon: "llm", description: "Groq — Llama 3.3 70B", color: "amber", phase: "aiSynthesis", timeMs: null, summary: null, detail: null, state: "idle" },
  },
  {
    id: "ai_overview",
    type: "output",
    position: { x: QA + 30, y: QY5 },
    data: { type: "ai_overview", label: "AI Overview", color: "amber", content: null, state: "idle" },
  },
];

export const initialEdges: Edge[] = [
  // === BUILD EDGES ===
  // Crawler → Pages DB (write)
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

  // === STORE → QUERY BRIDGE (subtle read connections) ===
  { id: "q-store-lookup", source: "inverted_index", target: "index_lookup", type: "default", style: { strokeDasharray: "6,4", stroke: "var(--edge-color)", strokeWidth: 1, opacity: 0.5 } },
  { id: "q-scores-prlookup", source: "pr_scores", target: "pr_lookup", type: "default", style: { strokeDasharray: "6,4", stroke: "var(--edge-color)", strokeWidth: 1, opacity: 0.5 } },
  { id: "q-vectors-vsearch", source: "vector_store", target: "vector_search", type: "default", style: { strokeDasharray: "6,4", stroke: "var(--edge-color)", strokeWidth: 1, opacity: 0.5 } },

  // === SEARCH PATH ===
  { id: "q-input-tokenize", source: "query_input", target: "tokenize", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-token-lookup", source: "tokenize", target: "index_lookup", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-lookup-bm25", source: "index_lookup", target: "bm25", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-token-prlookup", source: "tokenize", target: "pr_lookup", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-bm25-combine", source: "bm25", target: "combine", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-prlookup-combine", source: "pr_lookup", target: "combine", type: "default", style: { stroke: "var(--edge-query)" } },
  { id: "q-combine-results", source: "combine", target: "results", type: "default", style: { stroke: "var(--edge-query)" } },

  // === AI OVERVIEW PATH ===
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

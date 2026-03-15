import type { Node, Edge } from "@xyflow/react";

// Vertical flow layout — two columns flowing top to bottom
// Left column: Search Pipeline | Right column: AI Overview Pipeline
const COL_LEFT = 0;
const COL_RIGHT = 300;
const ROW_GAP = 170;

export const initialNodes: Node[] = [
  // === ROW 0: Crawler (shared root) ===
  {
    id: "crawler",
    type: "system",
    position: { x: 140, y: 0 },
    data: {
      label: "Crawler", icon: "crawler",
      description: "Fetches web pages via BFS, respects robots.txt",
      stats: [], status: "ready", color: "emerald",
    },
  },

  // === ROW 1: Indexer (left) + Chunker (right) ===
  {
    id: "indexer",
    type: "system",
    position: { x: COL_LEFT, y: ROW_GAP },
    data: {
      label: "Indexer", icon: "indexer",
      description: "Tokenizes text, builds inverted index",
      stats: [], status: "ready", color: "blue",
    },
  },
  {
    id: "chunker",
    type: "system",
    position: { x: COL_RIGHT, y: ROW_GAP },
    data: {
      label: "Chunker", icon: "chunker",
      description: "Splits pages into ~300-token chunks",
      stats: [], status: "ready", color: "violet",
    },
  },

  // === ROW 2: BM25 + PageRank (left) + Embedder (right) ===
  {
    id: "bm25",
    type: "pipeline",
    position: { x: COL_LEFT - 40, y: ROW_GAP * 2 },
    data: {
      label: "BM25", icon: "bm25", description: "Scores by term relevance",
      color: "rose", phase: "bm25", timeMs: null, summary: null, detail: null, state: "idle",
    },
  },
  {
    id: "pagerank",
    type: "pipeline",
    position: { x: COL_LEFT + 170, y: ROW_GAP * 2 },
    data: {
      label: "PageRank", icon: "pagerank", description: "Link authority scores",
      color: "indigo", phase: "pagerank", timeMs: null, summary: null, detail: null, state: "idle",
    },
  },
  {
    id: "embedder",
    type: "system",
    position: { x: COL_RIGHT, y: ROW_GAP * 2 },
    data: {
      label: "Embedder", icon: "embedder",
      description: "Vector embeddings (768-dim)",
      stats: [], status: "ready", color: "purple",
    },
  },

  // === ROW 3: Combine (left) + Fan-out + Retriever (right) ===
  {
    id: "combine",
    type: "pipeline",
    position: { x: COL_LEFT + 60, y: ROW_GAP * 3 },
    data: {
      label: "Combine", icon: "combine", description: "α × BM25 + (1-α) × PageRank",
      color: "amber", phase: "combining", timeMs: null, summary: null, detail: null, state: "idle",
    },
  },
  {
    id: "fanout",
    type: "pipeline",
    position: { x: COL_RIGHT - 30, y: ROW_GAP * 3 },
    data: {
      label: "Fan-out", icon: "fanout", description: "Expands query via LLM",
      color: "amber", phase: "aiFanout", timeMs: null, summary: null, detail: null, state: "idle",
    },
  },
  {
    id: "retriever",
    type: "pipeline",
    position: { x: COL_RIGHT + 180, y: ROW_GAP * 3 },
    data: {
      label: "Retriever", icon: "retriever", description: "Vector + keyword hybrid",
      color: "purple", phase: "aiRetrieval", timeMs: null, summary: null, detail: null, state: "idle",
    },
  },

  // === ROW 4: Results (left) + AI Overview (right) ===
  {
    id: "results",
    type: "output",
    position: { x: COL_LEFT + 20, y: ROW_GAP * 4 + 20 },
    data: {
      type: "results", label: "Results", color: "gray",
      content: null, state: "idle",
    },
  },
  {
    id: "ai_overview",
    type: "output",
    position: { x: COL_RIGHT + 60, y: ROW_GAP * 4 + 20 },
    data: {
      type: "ai_overview", label: "AI Overview", color: "rose",
      content: null, state: "idle",
    },
  },
];

export const initialEdges: Edge[] = [
  { id: "e-crawler-indexer", source: "crawler", target: "indexer" },
  { id: "e-indexer-bm25", source: "indexer", target: "bm25" },
  { id: "e-indexer-pagerank", source: "indexer", target: "pagerank" },
  { id: "e-bm25-combine", source: "bm25", target: "combine" },
  { id: "e-pagerank-combine", source: "pagerank", target: "combine" },
  { id: "e-combine-results", source: "combine", target: "results" },
  { id: "e-crawler-chunker", source: "crawler", target: "chunker" },
  { id: "e-chunker-embedder", source: "chunker", target: "embedder" },
  { id: "e-embedder-retriever", source: "embedder", target: "retriever" },
  { id: "e-fanout-retriever", source: "fanout", target: "retriever" },
  { id: "e-retriever-ai", source: "retriever", target: "ai_overview" },
];

export const phaseEdgeMap: Record<string, string[]> = {
  tokenizing: ["e-crawler-indexer"],
  indexLookup: ["e-indexer-bm25"],
  bm25: ["e-indexer-bm25"],
  pagerank: ["e-indexer-pagerank", "e-pagerank-combine"],
  combining: ["e-bm25-combine", "e-pagerank-combine"],
  results: ["e-combine-results"],
  aiFanout: ["e-fanout-retriever"],
  aiRetrieval: ["e-embedder-retriever", "e-fanout-retriever"],
  aiSynthesis: ["e-retriever-ai"],
  aiComplete: ["e-retriever-ai"],
};

export const phaseNodeMap: Record<string, string> = {
  tokenizing: "indexer",
  indexLookup: "indexer",
  bm25: "bm25",
  pagerank: "pagerank",
  combining: "combine",
  results: "results",
  aiFanout: "fanout",
  aiRetrieval: "retriever",
  aiSynthesis: "ai_overview",
  aiComplete: "ai_overview",
};

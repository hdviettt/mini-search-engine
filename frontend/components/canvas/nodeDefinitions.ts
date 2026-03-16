/* Phase maps — which nodes/edges/stores are active at each query phase */

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

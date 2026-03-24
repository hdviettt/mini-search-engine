// Canvas animation phases
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

// Pipeline trace types from the explain endpoint

export interface TokenizationTrace {
  input: string;
  tokens: string[];
  stopwords_removed: string[];
  stems_applied?: Record<string, string>;  // e.g. {"running": "run"}
  time_ms: number;
}

export interface TermInfo {
  term_id: number;
  doc_freq: number;
  idf: number;
}

export interface IndexLookupTrace {
  terms_found: Record<string, TermInfo>;
  terms_missing: string[];
  corpus_stats: { total_docs: number; avg_doc_length: number };
  time_ms: number;
}

export interface ScoreEntry {
  page_id: number;
  score: number;
  title: string;
}

export interface BM25Trace {
  params: { k1: number; b: number };
  total_matched: number;
  top_scores: ScoreEntry[];
  time_ms: number;
}

export interface PageRankTrace {
  damping: number;
  top_scores: ScoreEntry[];
  time_ms: number;
}

export interface RankChange {
  page_id: number;
  title: string;
  bm25_rank: number | string;
  final_rank: number;
}

export interface CombinationTrace {
  alpha: number;
  formula: string;
  rank_changes: RankChange[];
  time_ms: number;
}

export interface SnippetTrace {
  results_count: number;
  time_ms: number;
}

export interface PipelineTrace {
  tokenization: TokenizationTrace;
  index_lookup: IndexLookupTrace;
  bm25_scoring: BM25Trace;
  pagerank: PageRankTrace;
  combination: CombinationTrace;
  snippet_generation: SnippetTrace;
}

export interface ExplainResponse {
  query: string;
  results: SearchResult[];
  total_results: number;
  time_ms: number;
  params_used: { bm25_k1: number; bm25_b: number; rank_alpha: number };
  pipeline: PipelineTrace;
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  bm25_score: number;
  pagerank_score: number;
  final_score: number;
}

export interface Stats {
  pages_crawled: number;
  pages_pending: number;
  pages_failed: number;
  total_terms: number;
  total_postings: number;
  total_chunks: number;
  chunks_embedded: number;
  avg_doc_length: number;
  last_crawl_at: string | null;
}

export interface SearchParams {
  bm25_k1: number;
  bm25_b: number;
  rank_alpha: number;
}

// WebSocket message types
export interface CrawlProgressData {
  pages_crawled: number;
  max_pages: number;
  queue_size: number;
  current_url: string;
  title: string;
  text_length: number;
  links_found: number;
  status_code: number;
  status: string;
}

export interface IndexProgressData {
  phase: string;
  page_id: number;
  title: string;
  tokens_sample: string[];
  token_count: number;
  pages_done: number;
  pages_total: number;
  unique_terms: number;
}

export interface EmbedProgressData {
  chunks_done: number;
  chunks_total: number;
  current_chunk_preview: string;
}

export interface WSMessage {
  type: string;
  job_id: string;
  data: CrawlProgressData | IndexProgressData | EmbedProgressData | Record<string, unknown>;
}

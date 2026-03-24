# Database Indexes: Making Queries Fast

Without indexes, every database query scans the entire table row by row. With indexes, the database can jump directly to the relevant rows using tree structures (B-tree) or specialized algorithms (HNSW for vectors).

## Indexes Added

### B-tree Indexes (exact lookups)

| Index | Table.Column | Purpose |
|-------|-------------|---------|
| `idx_pages_domain` | `pages(domain)` | Filter pages by domain (e.g., all Wikipedia pages) |
| `idx_pages_crawled_at` | `pages(crawled_at)` | Sort by freshness, find recently crawled pages |
| `idx_ai_cache_created` | `ai_cache(created_at)` | Expire old cache entries efficiently |
| `idx_query_log_created` | `query_log(created_at)` | Time-range analytics queries |
| `idx_query_log_query` | `query_log(query)` | Find searches for a specific query |

### Already Existing (via constraints)

| Index | How Created | Purpose |
|-------|------------|---------|
| `terms(term)` | `UNIQUE NOT NULL` constraint | Term lookup in BM25 — O(log n) |
| `postings(term_id, page_id)` | `PRIMARY KEY` | Composite lookup for postings |
| `pages(url)` | `UNIQUE NOT NULL` constraint | Dedup during crawl |

### HNSW Vector Index

```sql
CREATE INDEX idx_chunks_embedding_hnsw
ON chunks USING hnsw (embedding vector_cosine_ops);
```

**What it does:** Approximate Nearest Neighbor (ANN) search on vector embeddings. Without it, vector search compares the query embedding against every chunk — O(n). With HNSW, it navigates a hierarchical graph structure — O(log n).

**When it's created:** At the end of `embed_all_chunks()`, after all embeddings are generated. This ensures the index matches the actual vector dimensions.

**Trade-off:** HNSW is approximate — it may miss the absolute closest vectors in exchange for 100x speed. For search, this is almost always worth it.

## Impact

For a database with 1,099 pages, 117K terms, and 16K chunks:
- **Term lookup**: Was already fast (UNIQUE index), stays O(log n)
- **Vector search**: O(n) → O(log n) with HNSW — critical for AI Overview retrieval
- **Domain filtering**: O(n) scan → O(log n) index lookup
- **Analytics**: Query log queries are indexed from day one

## Files

- `backend/db.py` — Schema SQL with all index definitions
- `backend/rag/embedder.py` — HNSW index creation after embedding

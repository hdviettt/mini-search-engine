# AI Overview Pipeline: Fan-out → Embed → Hybrid Retrieve → Synthesize

The AI Overview generates a concise, cited summary using a Retrieval-Augmented Generation (RAG) pipeline. The architecture ensures the LLM answer is grounded in actual crawled content, not hallucinated.

## Pipeline Flow

```
Query: "Ronaldo"
    │
    ▼
Fan-out (Groq LLM)
    │  Expands into 2-3 search angles:
    │  ["Ronaldo", "Cristiano Ronaldo career stats", "Ronaldo achievements"]
    │
    ▼
Embed Queries (Voyage AI, batch)
    │  All 3 queries embedded in one API call
    │  Returns 3 × 512-dim vectors
    │
    ▼
Hybrid Retrieve (per-query vector + BM25)
    │  For EACH fan-out query:
    │    - Vector search: cosine similarity against chunk embeddings (top 10)
    │    - Merge best scores per chunk across all queries
    │  Plus BM25 keyword search on original query (top 10 pages → all their chunks)
    │  Combine: 0.6 × vector + 0.4 × keyword
    │  Deduplicate by page, return top 5
    │
    ▼
LLM Synthesis (Groq, streaming)
    │  System prompt: "Summarize concisely. Cite as [1], [2]."
    │  Context: top 5 chunks (title + first 500 chars each)
    │  Streams token-by-token via SSE
    │
    ▼
AI Overview (with inline citations)
```

## Key Design Decision: Fan-out Feeds Into Embedding

Previously, fan-out and embedding ran in parallel — the expanded queries weren't used for vector search. Now the pipeline is strictly sequential:

1. Fan-out produces expanded queries
2. ALL expanded queries are batch-embedded
3. Each embedding is used for independent vector search
4. Results are merged, keeping the best score per chunk across all queries

This means a fan-out query like "Cristiano Ronaldo career statistics" can find chunks that the original "Ronaldo" query would miss via vector similarity alone.

## Trace Visibility

The retrieval trace now shows per-query stats:
```
Queries searched:        3
Vector chunks found:     28
BM25 chunks found:       45
Final (deduped):         5

Per-query vector results:
  10  ronaldo
  10  cristiano ronaldo career stats    +3 new
   8  ronaldo football achievements     +1 new
```

The `+N new` shows unique chunks each expanded query contributed beyond what previous queries found.

## Hybrid Scoring

```
combined_score = 0.6 × normalized_vector_similarity + 0.4 × normalized_bm25_score
```

- **Vector** captures semantic meaning ("greatest footballer" ≈ "best player")
- **BM25** captures exact keyword matches ("Ronaldo" in text)
- Normalization: min-max scaling to [0, 1] within each score set
- Deduplication: one chunk per page (keeps best-scoring chunk)

## Caching

AI Overviews are cached in `ai_cache` table by normalized query (sorted tokens). TTL: 24 hours. Cache hits skip LLM synthesis but still run fan-out + retrieval for fresh trace data.

## Files

- `backend/rag/fanout.py` — Query expansion via Groq LLM
- `backend/rag/embedder.py` — Voyage AI batch embedding + HNSW index creation
- `backend/rag/retriever.py` — Hybrid retrieve with per-query stats
- `backend/rag/chunker.py` — Page → chunk splitting (~300 tokens)
- `backend/ai_overview/generator.py` — Pipeline orchestration + SSE streaming

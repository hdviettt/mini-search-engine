# Chunking and Embeddings

## Why Full Pages Don't Work

Our first AI Overview approach sent the first 200 characters of each top-ranked page to the LLM. This is terrible:

```
Page: "Lionel Messi - Wikipedia Jump to content From Wikipedia, the free
encyclopedia This article is about the Argentine footballer..."

What the LLM sees: navigation text and disclaimers
What we actually wanted: "Messi scored 672 goals for Barcelona in 778 appearances"
```

The useful information is buried in paragraph 15. The solution: split pages into small chunks and find the specific paragraph that answers the query.

## Chunking

### What It Is

Chunking splits a page into smaller pieces (~300 tokens each), breaking at natural boundaries:

```
Page (3,438 tokens average) → ~11 chunks per page
1,000 pages → 15,719 chunks total
```

### Our Chunking Strategy

```
Raw page text
    ↓
Split at paragraph boundaries (double newlines)
    ↓
If a paragraph is too long (>300 tokens), split at sentence boundaries
    ↓
Filter out chunks shorter than 20 words (navigation fragments, footers)
    ↓
Store each chunk with its page_id and chunk_idx
```

### Why 300 Tokens?

| Size | Pros | Cons |
|------|------|------|
| 50 tokens | Very precise retrieval | Loses context, too fragmented |
| 300 tokens | Good balance of precision and context | May split related info |
| 1000 tokens | Lots of context per chunk | Less precise, more noise |

300 tokens is roughly one paragraph — enough context to be useful, small enough to be specific. This is the industry standard for RAG systems.

### What We Observed

From 1,000 football pages:
- **15,719 chunks** created
- **Average ~16 chunks per page** (some pages have 3, some have 50+)
- Long articles (Messi biography: ~70,000 chars) produce many focused chunks
- Short pages (category listings) produce few chunks

## Embeddings

### What They Are

An embedding is a vector (list of numbers) that represents the meaning of a text. Similar texts have similar vectors.

```
"Messi scored a goal"     → [0.12, -0.34, 0.56, 0.78, ...] (768 numbers)
"Lionel netted one"       → [0.11, -0.33, 0.55, 0.79, ...] (very similar!)
"The weather is sunny"    → [0.89, 0.12, -0.67, 0.23, ...] (very different)
```

### Why They Matter

BM25 (keyword search) only matches exact words. Embeddings match meaning:

| Query | BM25 finds | Embeddings find |
|-------|-----------|-----------------|
| "Messi goals" | Pages containing "Messi" AND "goals" | Pages about Messi scoring, even if they say "netted", "scored", "found the back of the net" |
| "football" | Pages with "football" | Pages with "soccer", "the beautiful game", "association football" |
| "World Cup winner" | Pages with "World Cup" AND "winner" | Pages about Argentina's 2022 triumph, even if they don't use the word "winner" |

### Our Embedding Model: nomic-embed-text

| Attribute | Value |
|-----------|-------|
| Model | nomic-embed-text |
| Dimensions | 768 |
| Runs via | Ollama (local, free) |
| Speed | ~50 embeddings per batch in 2.8 seconds |
| Total time | ~15 minutes for 15,719 chunks (batched) |

### The Batching Lesson

Our first approach embedded one chunk at a time:
```
1 embedding × 15,719 chunks × 2.26s each = 10 hours
```

Switching to batch embedding (50 at a time):
```
50 embeddings × 315 batches × 2.8s each = 15 minutes
```

**40x speedup from batching.** Same lesson as COPY vs INSERT for database writes — always batch when possible.

### How They're Stored: pgvector

We use PostgreSQL's pgvector extension to store embeddings directly in the database:

```sql
CREATE TABLE chunks (
    id        SERIAL PRIMARY KEY,
    page_id   INTEGER REFERENCES pages(id),
    chunk_idx INTEGER,
    content   TEXT,
    embedding vector(768)    -- pgvector column type
);
```

pgvector supports similarity search with operators:
- `<=>` — cosine distance (we use this)
- `<->` — L2 (Euclidean) distance
- `<#>` — inner product

```sql
-- Find 10 most similar chunks to a query vector
SELECT content, 1 - (embedding <=> query_vector) as similarity
FROM chunks
ORDER BY embedding <=> query_vector
LIMIT 10;
```

### Why pgvector Instead of a Dedicated Vector DB?

| Option | Pros | Cons |
|--------|------|------|
| **pgvector** (our choice) | No new infrastructure, SQL joins with other tables, transactional | Slower at very large scale (millions of vectors) |
| ChromaDB | Easy API, built for RAG | Another service to run, can't join with our pages/links tables |
| Pinecone | Managed, fast at scale | Cloud-only, costs money, vendor lock-in |
| FAISS | Fastest in-memory search | No persistence, no SQL integration |

At our scale (15,719 vectors), pgvector is more than fast enough and keeps everything in one database.

## How Google Does It

Google's embedding pipeline is orders of magnitude more sophisticated:

1. **Multiple embedding models** — different models for different content types (text, images, code, tables)
2. **Hierarchical embeddings** — page-level, section-level, and passage-level embeddings
3. **Learned embeddings** — trained specifically on search queries and click data, not general-purpose
4. **Quantized embeddings** — compressed vectors for faster search at massive scale
5. **Distributed vector search** — sharded across thousands of machines
6. **Real-time updating** — new content gets embedded and indexed within minutes

Our system uses a general-purpose embedding model (nomic-embed-text) on all content uniformly. Google's system understands that a player statistics table should be embedded differently than a match report narrative.

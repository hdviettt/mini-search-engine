# Hybrid Retrieval

## Why Not Just Use One Method?

Vector search and keyword search each have blind spots:

| Query | Vector search finds | Vector search misses |
|-------|--------------------|--------------------|
| "beautiful game" | Pages about football (understands the metaphor) | Pages that literally say "beautiful game" but in a non-football context |
| "CR7 stats" | Pages about Cristiano Ronaldo | Nothing — if "CR7" wasn't in the embedding model's training data |

| Query | Keyword search finds | Keyword search misses |
|-------|---------------------|-----------------------|
| "CR7 stats" | Pages containing "CR7" and "stats" | Pages about "Ronaldo's career statistics" (different words, same meaning) |
| "football" | Pages containing "football" | Pages about "soccer" (same sport, different word) |

**Hybrid retrieval combines both** — keyword search catches exact matches, vector search catches semantic matches.

## Our Implementation

```
Query: "Messi Champions League goals"
           |
     +-----+-----+
     |             |
  Vector          BM25
  Search          Search
     |             |
  Embed all      Search inverted
  fan-out        index with
  queries        original query
     |             |
  Top 10         Top 10
  chunks by      pages by
  cosine         BM25 score
  similarity     (get their chunks)
     |             |
     +-----+-----+
           |
        Merge & Score
           |
     combined = 0.6 × vector + 0.4 × keyword
           |
        Deduplicate (best chunk per page)
           |
        Top 5 chunks → LLM synthesis
```

## Score Combination

### Normalization

Vector similarity scores range from 0 to 1. BM25 scores range from 0 to ~15. We normalize both to [0, 1] before combining:

```
normalized = (score - min) / (max - min)
```

### Weights: 60% Vector + 40% Keyword

```python
combined = 0.6 * vector_score + 0.4 * keyword_score
```

| Weight | Effect |
|--------|--------|
| 100% vector | Pure semantic search. Great for vague queries, misses exact-match needs. |
| 60/40 (ours) | Semantic-first with keyword backup. Catches both meaning and exact terms. |
| 50/50 | Equal balance. Safe default. |
| 40/60 | Keyword-first. Better for specific technical queries. |
| 100% keyword | Pure BM25. Misses synonyms and semantic matches entirely. |

We lean toward vector (60%) because football queries often use varied vocabulary — fans say "goal", "scored", "netted", "found the net", "put it away" interchangeably.

### Deduplication

Multiple chunks from the same page might rank high. We keep only the best-scoring chunk per page to ensure source diversity in the AI Overview.

## What We Observed

```
Query: "Messi Champions League"

Source                                    Vector  Keyword  Combined
IFAB - Wikipedia                          1.000   0.000    0.600
Lionel Messi - Wikipedia                  0.098   1.000    0.459
Cristiano Ronaldo - Wikipedia             0.000   0.995    0.398
El Clásico - Wikipedia                    0.000   0.751    0.300
Luis Suárez - Wikipedia                   0.000   0.721    0.288
```

Interesting findings:
- **IFAB article** scored highest on vector search (semantic similarity to football governance) but zero on keywords — it doesn't contain "Messi" or "Champions League" literally
- **Messi article** scored highest on keywords but low on vector — the 200-char chunk that got embedded might not have been about the Champions League specifically
- **Hybrid scoring** balances both signals, though in this case the results could be better with more targeted chunking

## How Google Does Hybrid Retrieval

Google's retrieval system is much more complex:

### Multi-Stage Pipeline

```
Stage 1: Candidate generation (fast, broad)
    → BM25 on inverted index → millions of candidates
    → Approximate nearest neighbor (ANN) on embeddings → millions of candidates
    → Merge candidates

Stage 2: Lightweight scoring (fast, filter)
    → Simple neural model scores each candidate
    → Keep top ~1000

Stage 3: Full scoring (slow, precise)
    → BERT-based model scores remaining candidates
    → Consider 100+ features: content, links, freshness, user signals, E-E-A-T
    → Keep top ~100

Stage 4: Final ranking
    → Apply diversity rules (not all results from one domain)
    → Apply freshness rules (recent content for time-sensitive queries)
    → Insert rich features (knowledge panels, featured snippets)
    → Return top 10
```

Our system does stages 1 and 4 in one step. Google's multi-stage approach handles billions of documents by progressively filtering.

### Approximate Nearest Neighbor (ANN)

At Google's scale, exact cosine similarity search is impossible (billions of vectors). They use ANN algorithms:

- **ScaNN** (Scalable Nearest Neighbors) — Google's open-source ANN library
- **HNSW** (Hierarchical Navigable Small World) — used by pgvector for indexing

These sacrifice a small amount of accuracy for massive speed gains:
```
Exact search:  O(n) — scan every vector
ANN search:    O(log n) — navigate a graph structure
```

At 15,719 vectors, we don't need ANN — exact search is fast enough. At 1 billion vectors, ANN is essential.

## SEO Implications

### Semantic Search Changes SEO

Hybrid retrieval means Google finds content by meaning, not just keywords. This means:

1. **Topic coverage matters more than keyword density** — Google can match your content to queries you never explicitly mentioned
2. **Natural language wins** — write for humans, not search engines. The embedding model understands natural prose better than keyword-stuffed text.
3. **Entities over keywords** — writing about "Lionel Messi" builds entity associations. Google knows Messi is connected to Barcelona, Argentina, World Cup, Ballon d'Or — even if you don't mention all of them.
4. **Comprehensive content ranks for more queries** — a thorough article about "Premier League history" will be retrieved for hundreds of related queries through semantic matching.

### The Keyword Search Isn't Dead

Despite embeddings, exact keyword matching still matters:
- **Brand names** — "Nike" must match "Nike", not just "athletic brand"
- **Technical terms** — "offside rule" should find pages with that exact phrase
- **Named entities** — "Manchester United" shouldn't be confused with "Manchester City"
- **Long-tail queries** — very specific queries like "2024 Champions League semi-final second leg results" still rely heavily on keyword matching

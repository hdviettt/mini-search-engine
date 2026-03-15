# Query Processing Pipeline

When someone types "Messi Champions League goals" into our search engine, here's everything that happens before results appear.

## Our Pipeline

```
User types: "Messi Champions League goals"
    |
    v
Step 1: TOKENIZE the query
    → ["messi", "champions", "league", "goals"]
    (lowercase, remove stopwords — "the" would be removed if present)
    |
    v
Step 2: LOOK UP each term in the inverted index
    → "messi"     → appears in pages [12, 45, 67, 89, 201, ...]
    → "champions" → appears in pages [3, 12, 45, 89, 102, ...]
    → "league"    → appears in pages [3, 12, 45, 67, 89, 102, 201, ...]
    → "goals"     → appears in pages [12, 23, 45, 67, 89, 156, ...]
    |
    v
Step 3: SCORE with BM25
    → For each page that matches ANY term, compute BM25 score
    → Page 12: has all 4 terms, high term frequency → score: 14.2
    → Page 89: has 3 terms, moderate frequency → score: 9.8
    → Page 67: has 3 terms, very long document → score: 7.1 (length penalty)
    |
    v
Step 4: LOOK UP PageRank scores
    → Page 12: PageRank 0.003 (well-linked page)
    → Page 89: PageRank 0.001 (average)
    → Page 67: PageRank 0.008 (highly linked, like a Wikipedia overview)
    |
    v
Step 5: NORMALIZE both score sets to [0, 1]
    → BM25: min-max normalize across all matching documents
    → PageRank: min-max normalize across all matching documents
    |
    v
Step 6: COMBINE scores
    → final = 0.7 × norm_BM25 + 0.3 × norm_PageRank
    → Page 12: 0.7 × 1.0 + 0.3 × 0.35 = 0.805
    → Page 67: 0.7 × 0.5 + 0.3 × 1.0 = 0.650
    → Page 89: 0.7 × 0.69 + 0.3 × 0.12 = 0.519
    |
    v
Step 7: SORT by final score, PAGINATE (top 10)
    |
    v
Step 8: GENERATE snippets for each result
    → Find the best text window containing query terms
    |
    v
Step 9: RETURN results (105ms total)
```

## Timing Breakdown

From our test queries on 750 pages:

| Step | Time | Why |
|------|------|-----|
| Tokenization | <1ms | Simple string operations |
| Index lookups | 30-50ms | SQL queries to postings table |
| BM25 scoring | 20-40ms | Math on postings + doc_stats |
| PageRank lookup | 5-10ms | Single SQL query |
| Normalization + combining | <1ms | Pure math in memory |
| Snippet generation | 10-20ms | String scanning per result |
| **Total** | **65-120ms** | |

At our scale (750 pages, ~150K terms), this is fast. At Google's scale (100B+ pages), the same operations happen across thousands of machines in parallel and still return in under 500ms.

## What We Don't Do (But Google Does)

### Query Understanding

Before even hitting the index, Google processes the query itself:

1. **Spelling correction** — "mesii goals" → "messi goals"
2. **Query expansion** — "CR7" → also search for "Cristiano Ronaldo"
3. **Intent classification** — is this informational ("what is offside"), navigational ("espn football"), or transactional ("buy football tickets")?
4. **Entity recognition** — "Messi" = Person entity, "Champions League" = Competition entity
5. **Language detection** — serve results in the user's language
6. **Location awareness** — "football scores" in the UK shows Premier League; in the US shows NFL

### Retrieval Optimization

Our approach does a full scan of all postings for each query term. Google uses:

1. **Tiered index** — important pages in a fast tier, obscure pages in a slow tier. Most queries only need the fast tier.
2. **Early termination** — if you already have 1000 high-quality results, stop scanning less promising postings.
3. **Term proximity** — pages where "Champions" and "League" appear next to each other score higher than pages where they're 500 words apart.
4. **Field-specific scoring** — a match in the title is worth more than a match in the body text. A match in anchor text from incoming links is worth even more.

### Re-ranking

After the initial retrieval, Google applies a second pass:

1. **BERT/Neural re-ranking** — deep learning models that understand semantic meaning, not just keyword matching
2. **Freshness boost** — for time-sensitive queries, newer content ranks higher
3. **Diversity** — avoid showing 10 results from the same domain
4. **Personalization** — adjust rankings based on user history and preferences

## The Speed Challenge

Our search takes ~100ms for 750 pages. How does Google search 100 billion pages in the same time?

1. **Distributed index** — the index is split across thousands of machines. Each machine handles a portion. Queries are sent to all machines in parallel.
2. **Pre-computed scores** — many signals (PageRank, domain authority) are computed offline, not at query time.
3. **Caching** — popular queries ("football scores", "Premier League") have pre-computed results. Only novel queries need full processing.
4. **Approximate algorithms** — at massive scale, exact scoring is replaced with approximate algorithms that are 100x faster with 99% accuracy.

## SEO Implications

### Match Query Intent
Understanding the pipeline helps you see why content should match query intent, not just keywords. If someone searches "Champions League 2026 results", they want current scores — not a history of the competition.

### Title Tags Matter
Even without field-specific scoring in our engine, title matches naturally score high in BM25 because titles are short documents with high term density. Google explicitly boosts title matches. Write titles that contain your target keywords.

### Don't Over-Optimize
BM25's term frequency saturation means mentioning "football" 50 times doesn't help more than 5 times. Write naturally, cover the topic thoroughly, and the algorithm will reward you.

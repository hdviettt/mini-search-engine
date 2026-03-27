# Query Fan-Out

## The Problem

When a user searches "Messi Champions League goals", they want comprehensive information. But a single query only retrieves chunks that match those exact concepts. Relevant information might use different wording:

- "Messi's UCL scoring record"
- "Lionel's Champions League career statistics"
- "Barcelona's top scorer in European competition"

A single embedding won't catch all of these.

## The Solution: Co-Occurrence Expansion

Instead of asking an LLM to generate alternative queries (which adds latency and can hallucinate), we mine the index itself. When BM25 returns the top 10 pages for a query, we look at which terms appear frequently alongside the query terms in those pages — and build sub-queries from them.

```
Original: "Messi Champions League goals"
    ↓ BM25 top-10 pages → co-occurring terms: ["ucl", "scorer", "record", "barcelona", "career"]
Fan-out queries:
  1. "Messi Champions League goals"           (original)
  2. "Messi Champions League goals ucl scorer" (original + top 2 co-occurring)
  3. "ucl scorer record barcelona"             (top 4 co-occurring — different angle)
```

Each query is embedded separately and searched against the vector database. The results are merged, giving broader coverage.

## Our Implementation

```python
def expand_query(query: str, conn) -> tuple[list[str], dict]:
    # BM25 top-10 pages for the query
    top_pages = search_bm25(conn, query, limit=10)

    # Count co-occurring terms across those pages
    # (excluding the original query tokens)
    co_occurring = most_common_terms(conn, top_page_ids, exclude=query_tokens)

    related = [term for term, _ in co_occurring[:4]]
    sub1 = " ".join(query_tokens + related[:2])   # original + 2 related
    sub2 = " ".join(related[:4])                   # pure related angle

    return [query, sub1, sub2], trace_metadata
```

### Why Co-Occurrence, Not LLM?

| Approach | Latency | Quality | Risk |
|----------|---------|---------|------|
| LLM-generated (Qwen3 local) | 20–30s | Good | Hallucination, model dependency |
| LLM-generated (Groq API) | ~200ms | Good | Rate limits, cost, hallucination |
| **Co-occurrence (our current)** | **~2ms** | **Good for domain-specific** | Can miss abstract synonyms |

For a football-specific corpus, co-occurrence is excellent — the vocabulary is consistent and "ucl", "scorer", "record" appear reliably alongside "Messi Champions League" in the pages we've indexed.

### Why 2 Extra Queries?

| Count | Pros | Cons |
|-------|------|------|
| 0 (no fan-out) | Fast | Misses relevant content with different wording |
| 2 extras | Good coverage, <3ms total | May miss very abstract synonyms |
| 5+ extras | Maximum coverage | Diminishing returns, more noise |

2 extra queries is the sweet spot — enough to catch related terms and alternative framings without overwhelming the retrieval step.

## How Google Does Query Expansion

Google's query understanding is far more sophisticated:

### 1. Synonym Expansion
```
"football" → also search "soccer", "association football"
"CR7" → also search "Cristiano Ronaldo"
```
This uses a pre-built synonym graph, not an LLM at query time.

### 2. Entity Resolution
```
"Messi" → entity:Lionel_Messi → retrieve all known aliases, team history, awards
```
Google's Knowledge Graph connects entities to structured data, enabling rich retrieval.

### 3. Intent Classification
```
"Messi Champions League" → informational intent
"buy Champions League tickets" → transactional intent
"UEFA.com Champions League" → navigational intent
```
Different intents trigger different retrieval strategies and result types.

### 4. Query Reformulation
```
"who has the most goals in cl history" →
  reformulated: "Champions League all-time top scorers"
```
Google rewrites poorly-formed queries into more searchable versions.

### 5. Related Queries
```
"Messi Champions League goals" →
  related: "Messi Champions League assists"
  related: "Most Champions League goals all time"
  related: "Messi vs Ronaldo Champions League"
```
These appear as "People also ask" and "Related searches" — a form of fan-out shown to the user.

## The Trade-Off

Query fan-out improves **recall** (finding more relevant content) at the cost of **latency** (slower response) and potentially **precision** (more noise in results).

Our co-occurrence approach keeps the fan-out cost under 2ms — negligible compared to the embedding step (~50–150ms). Google pre-computes expansions for common queries and uses lookup tables for synonyms, keeping query-time cost near zero.

## SEO Implication

Query fan-out means your content can rank even if it doesn't use the exact query words. This is why:
- **Writing naturally** works better than keyword stuffing
- **Covering a topic thoroughly** catches more query variations
- **Using varied vocabulary** (synonyms, related terms) increases your surface area for retrieval
- **Answering related questions** in your content captures fan-out queries you didn't explicitly target

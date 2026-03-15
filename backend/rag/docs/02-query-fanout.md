# Query Fan-Out

## The Problem

When a user searches "Messi Champions League goals", they want comprehensive information. But a single query only retrieves chunks that match those exact concepts. Relevant information might use different wording:

- "Messi's UCL scoring record"
- "Lionel's Champions League career statistics"
- "Barcelona's top scorer in European competition"

A single embedding of "Messi Champions League goals" won't catch all of these.

## The Solution: Query Expansion

Before searching, we use the LLM to generate 2-3 alternative queries:

```
Original: "Messi Champions League goals"
    ↓ LLM expansion
Fan-out queries:
  1. "Messi Champions League goals"          (original)
  2. "Messi UCL scoring record"              (generated)
  3. "Lionel Messi Champions League career"  (generated)
```

Each query gets embedded separately and searched against the vector database. The results are merged, giving us broader coverage.

## Our Implementation

```python
def expand_query(query: str) -> list[str]:
    prompt = f'Generate 2 alternative search queries for: "{query}"'
    # Send to Qwen3 → parse response → return [original, alt1, alt2]
```

### Why Only 2 Extra Queries?

| Count | Pros | Cons |
|-------|------|------|
| 0 (no fan-out) | Fast | Misses relevant content with different wording |
| 2 extras | Good coverage, manageable latency | Adds ~20-30s for LLM generation on CPU |
| 5+ extras | Maximum coverage | Diminishing returns, slow, more noise |

2 extra queries is the sweet spot — enough to catch synonyms and related phrasings without overwhelming the retrieval step.

## How Google Does Query Expansion

Google's query understanding is far more sophisticated than LLM-based fan-out:

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

In our system, the fan-out adds ~20-30 seconds because we're running Qwen3 on CPU. In production:
- Google pre-computes expansions for common queries (cached)
- Synonym expansion uses lookup tables, not LLMs (instant)
- Entity resolution uses the Knowledge Graph (pre-built)
- LLM-based reformulation only runs for novel or ambiguous queries

## SEO Implication

Query fan-out means your content can rank even if it doesn't use the exact query words. This is why:
- **Writing naturally** works better than keyword stuffing
- **Covering a topic thoroughly** catches more query variations
- **Using varied vocabulary** (synonyms, related terms) increases your surface area for retrieval
- **Answering related questions** in your content captures fan-out queries you didn't explicitly target

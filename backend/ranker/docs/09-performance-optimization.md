# Performance Optimization: Snippet Generation & Query Batching

After adding neural re-ranking, profiling revealed two major bottlenecks:
1. **Snippet generation**: 2100ms (70% of total search time)
2. **Trace DB queries**: 30+ individual SELECTs for titles

## Snippet Generation: From O(n²) to O(n)

### The problem

The original snippet generator scanned every word in the document body, rebuilding a 30-word string window each iteration:

```python
# OLD: O(n × m × 30) where n=words, m=query_terms
for i in range(len(words)):              # n = 10,000 iterations
    window = " ".join(words[i:i+30])     # 30 string joins per iteration
    count = sum(1 for t in terms if t in window)  # m substring searches
```

For a 10,000-word page with 3 query terms: 10,000 × 3 × 30 = 900,000 string operations. Over 10 results: 9 million operations → **2+ seconds**.

### The fix: sliding window with set lookups

```python
# NEW: O(n) with O(1) set lookups
stemmed = [stem(w.lower()) for w in words[:2000]]  # stem once upfront
term_set = set(query_terms)

# Initialize window count
current_count = sum(1 for w in stemmed[:30] if w in term_set)

# Slide: subtract leaving word, add entering word
for i in range(1, len(stemmed) - 30 + 1):
    if stemmed[i - 1] in term_set: current_count -= 1
    if stemmed[i + 29] in term_set: current_count += 1
```

Three key optimizations:
1. **Scan limit**: Only check first 2000 words (snippets are almost always near the top)
2. **Sliding window**: O(1) per position instead of O(30) — just add/remove one word
3. **Set lookup**: O(1) hash set instead of O(30) substring search in joined string

### Additional improvement: stemmed matching

The old code did `t in window` (substring matching), which meant "run" matched inside "running" by accident. The new code stems each word properly using the same Porter stemmer as the index, so matching is **correct**, not accidental.

### Expected improvement

| | Old | New |
|---|---|---|
| Operations per result | ~900,000 | ~4,000 |
| Time for 10 results | ~2,100ms | ~100ms |
| Speedup | — | **~20x** |

## Trace Query Batching

### The problem

The explainer fetched page titles for trace data one at a time:

```python
# OLD: 10 DB round trips
for page_id, score in bm25_sorted[:10]:
    title = conn.execute("SELECT title FROM pages WHERE id = %s", (page_id,))
```

With BM25 trace (10), PageRank trace (10), combination trace (10), plus result fetching — that's 30+ individual SELECTs.

### The fix: batch with IN clause

```python
# NEW: 1 DB round trip
ids = [pid for pid, _ in bm25_sorted[:10]]
ph = ",".join(["%s"] * len(ids))
title_rows = dict(conn.execute(f"SELECT id, title FROM pages WHERE id IN ({ph})", ids))
```

Applied to: BM25 top scores, PageRank top scores, and combination rank changes. Reduces from ~30 round trips to ~3.

### Expected improvement

| | Old | New |
|---|---|---|
| DB round trips (trace) | ~30 | ~3 |
| Network overhead | ~30 × 2ms = 60ms | ~3 × 2ms = 6ms |
| Savings | — | **~54ms** |

## Full Pipeline Timing (Target)

| Step | Before optimization | After optimization |
|------|--------------------|--------------------|
| Tokenize | 0.1ms | 0.1ms |
| Index lookup | 10ms | 10ms |
| BM25 scoring | 40ms | 40ms |
| PageRank | 30ms | 30ms |
| Combine | 25ms | 15ms (fewer DB calls) |
| Neural rerank | 620ms | 620ms |
| Snippets | **2,100ms** | **~100ms** |
| **Total** | **~2,800ms** | **~800ms** |

## Files

- `backend/search/engine.py` — Optimized `generate_snippet()` with sliding window
- `backend/search/explainer.py` — Batched title queries in trace generation

# BM25: The Text Relevance Algorithm

BM25 (Best Matching 25) is the standard algorithm for scoring how relevant a document is to a search query. It's what most search engines started from — including Google's earliest versions.

## The Core Idea

BM25 answers: **"Given this query, how relevant is this document?"**

It considers three things:
1. **Does the document contain the query terms?** (term frequency)
2. **How rare are the query terms?** (inverse document frequency)
3. **How long is the document?** (length normalization)

## The Formula

For each query term `t` in document `d`:

```
score += IDF(t) × (tf × (k1 + 1)) / (tf + k1 × (1 - b + b × (dl / avgdl)))
```

Total score = sum across all query terms.

### Breaking It Down

#### IDF — Inverse Document Frequency
```
IDF(t) = log((N - df + 0.5) / (df + 0.5) + 1)
```
- `N` = total documents (750 in our case)
- `df` = number of documents containing term `t`

**What it means:** Rare terms are more valuable. If "geotargeting" appears in only 14 of 750 documents, it's a strong signal. If "wikipedia" appears in 700 of 750 documents, it tells you almost nothing.

**Real example from our data:**
- "geotargeting" → df=14, IDF is high (~3.9) → strong signal
- "search" → df=600+, IDF is low (~0.2) → weak signal

#### TF — Term Frequency
```
tf = number of times term t appears in document d
```

**What it means:** A page that mentions "robots.txt" 15 times is probably more about robots.txt than a page that mentions it once.

But raw term frequency has diminishing returns — mentioning a word 100 times isn't 100x more relevant than mentioning it once. BM25 handles this with the saturation formula.

#### Length Normalization
```
k1 × (1 - b + b × (dl / avgdl))
```
- `dl` = document length (tokens in this document)
- `avgdl` = average document length across all documents (3,736 tokens for us)
- `k1 = 1.2` — controls term frequency saturation
- `b = 0.75` — controls how much document length matters

**What it means:** A 2,000-token article about robots.txt is more focused than a 70,000-token article that mentions robots.txt in passing. The `b` parameter penalizes longer documents because they're more likely to contain a term by chance.

## What We Observed

### Query: "robots.txt"

| Rank | Page | BM25 | Why |
|------|------|------|-----|
| 1 | Wayback Machine | 11.82 | Mentions robots.txt many times in context of web archiving |
| 2 | robots.txt article | 12.82 | Higher raw BM25 but lower combined score (less PageRank) |
| 4 | SEO article | 10.05 | Mentions robots.txt but it's a huge page (37K chars) — length penalty |

The robots.txt article has the highest raw BM25 score (12.82) but ranks #2 in the combined results because PageRank also factors in.

### Query: "search engine optimization"

The actual SEO article ranks #4, not #1. Why? The category page and other pages have slightly higher BM25 scores because they have the exact phrase in a shorter document — the length normalization gives them an edge.

## The Parameters

### k1 = 1.2 (Term Frequency Saturation)

Controls how quickly term frequency stops mattering:

```
tf=1  → contributes ~0.55 of max
tf=2  → contributes ~0.73 of max
tf=5  → contributes ~0.88 of max
tf=10 → contributes ~0.94 of max
tf=50 → contributes ~0.99 of max
```

After ~5 occurrences, adding more barely helps. This prevents keyword stuffing from gaming the algorithm.

### b = 0.75 (Length Normalization)

- `b=0` → no length normalization (long documents aren't penalized)
- `b=1` → full length normalization (long documents are heavily penalized)
- `b=0.75` → moderate penalty for long documents (the standard default)

## Why BM25 Matters for SEO

### Content Length
BM25's length normalization is why "write 10,000-word articles" isn't always good SEO advice. A focused 2,000-word article that thoroughly covers a topic can outrank a 10,000-word article that mentions it briefly.

### Keyword Density
BM25's term frequency saturation means there's a sweet spot. Mentioning your keyword 3-5 times is useful. Mentioning it 50 times (keyword stuffing) gives almost no additional benefit — and Google has separate spam penalties for it.

### Term Rarity
If you're writing about a niche topic (high IDF), your content is naturally more likely to rank for those terms. This is the mathematical reason why long-tail keywords are easier to rank for — fewer competing documents means higher IDF.

## How Google Has Evolved Beyond BM25

Google still uses BM25-like signals but has added hundreds of other factors:

- **Semantic understanding** — BERT and MUM models understand meaning, not just keywords
- **User signals** — click-through rate, dwell time, pogo-sticking
- **Entity matching** — understanding that "Apple CEO" relates to "Tim Cook"
- **Freshness** — newer content boosted for time-sensitive queries
- **E-E-A-T** — Experience, Expertise, Authoritativeness, Trustworthiness
- **Link signals** — PageRank and anchor text (we cover this separately)

BM25 is the foundation, but modern search is a machine learning model with thousands of features where BM25 is just one input.

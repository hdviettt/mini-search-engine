# BM25F: Field-Weighted Ranking

BM25F extends standard BM25 by weighting term frequencies differently depending on which field (title vs body) the match occurs in. A match in the title is a much stronger relevance signal than a match buried in the body text.

## The Problem

With standard BM25, all term occurrences are equal. If "Ronaldo" appears once in a title and once in a 5000-word body, both count the same. But a page *titled* "Cristiano Ronaldo" is almost certainly more relevant to the query "ronaldo" than a page that mentions him once in passing.

## The Solution: Weighted Term Frequency

Instead of using raw term frequency:
```
tf = total occurrences in document
```

BM25F uses field-weighted term frequency:
```
tf_weighted = W_title × title_freq + W_body × body_freq
```

Where:
- `W_title = 4.0` — title matches count 4x
- `W_body = 1.0` — body matches count 1x

This weighted TF replaces the raw TF in the standard BM25 formula:
```
score += IDF(t) × (tf_weighted × (k1 + 1)) / (tf_weighted + k1 × (1 - b + b × (dl / avgdl)))
```

## Implementation

### Schema Change

The `postings` table now stores per-field frequencies:

```sql
CREATE TABLE postings (
    term_id    INTEGER NOT NULL,
    page_id    INTEGER NOT NULL,
    term_freq  INTEGER NOT NULL,       -- total (backward compat)
    title_freq INTEGER NOT NULL DEFAULT 0,  -- occurrences in title
    body_freq  INTEGER NOT NULL DEFAULT 0,  -- occurrences in body
    PRIMARY KEY (term_id, page_id)
);
```

### Indexer Change

The indexer tokenizes title and body separately:

```python
title_tokens = tokenize(title or "")
body_tokens = tokenize(body_text or "")
title_counts = Counter(title_tokens)
body_counts = Counter(body_tokens)
all_counts = Counter(title_tokens + body_tokens)
```

### Scorer Change

BM25 uses weighted TF with a fallback for old data:

```python
TITLE_WEIGHT = 4.0
BODY_WEIGHT = 1.0

if title_freq > 0 or body_freq > 0:
    tf_weighted = TITLE_WEIGHT * title_freq + BODY_WEIGHT * body_freq
else:
    tf_weighted = float(tf)  # fallback for pre-BM25F data
```

## Impact

Searching "Cristiano Ronaldo" after BM25F:

| Rank | Page | BM25 Score |
|------|------|------------|
| #1 | Cristiano Ronaldo \| GiveMeSport | 11.25 |
| #2 | Lionel Messi, Inter Miami to play Cristiano Ronaldo's... | 10.87 |
| #4 | Cristiano Ronaldo - Wikipedia | 11.26 |

Pages with "Cristiano Ronaldo" in the title get significantly boosted. The Wikipedia page has a slightly higher raw BM25 but lower PageRank, showing the combined ranking at work.

## Why 4x?

The 4:1 ratio is a common default in search engines. The intuition:
- Titles are short (5-15 tokens) and curated by authors
- Body text is long (hundreds/thousands of tokens) and contains noise
- A term in the title is a deliberate topic signal

Production engines learn this weight from click data (Learning to Rank). Our 4:1 is a reasonable starting point.

## Files

- `backend/db.py` — Schema with `title_freq`, `body_freq` columns
- `backend/indexer/indexer.py` — Separate title/body tokenization
- `backend/ranker/bm25.py` — BM25F weighted scoring

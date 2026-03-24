# Porter Stemming: Reducing Words to Their Roots

Stemming is the process of reducing words to their root form so that morphological variations match the same index entry. Without stemming, "running" and "run" are completely different terms — a search for "run" would miss documents that only contain "running".

## Why Stemming Matters

Before stemming, our engine had ~137K unique terms. After stemming, that dropped to ~117K — a 14% reduction. More importantly, queries that previously returned 0 results now find relevant documents.

**Example:** Searching "running players" without stemming would look for the exact tokens "running" and "players". With stemming, it becomes "run" and "player", matching any document containing "run", "running", "runs", "ran", "player", "players", etc.

## The Porter Algorithm

We implemented the Porter (1980) stemmer from scratch in `backend/indexer/stemmer.py`. It's a 5-step suffix-stripping algorithm:

### Step 1: Plurals and past tenses
```
sses → ss    (caresses → caress)
ies  → i     (ponies → poni)
s    → ∅     (cats → cat)
ed   → ∅     (played → plai, agreed → agree)
ing  → ∅     (running → run, motoring → motor)
```

### Steps 2-4: Derivational suffixes
```
ational → ate  (relational → relate)
fulness → ful  (hopefulness → hopeful)
iveness → ive  (effectiveness → effective)
ize     → ∅    (formalize → formal)
```

### Step 5: Cleanup
Remove trailing `e` and double `l` in certain conditions.

## Key Design Decision: Stem at Both Index and Query Time

The stemmer runs in `tokenize()` which is called by both:
- **Indexer** (`build_index`) — stems every token before storing in the inverted index
- **BM25 scorer** (`search_bm25`) — stems query terms before looking up postings

This ensures consistency. If "running" is stored as "run" in the index, the query "running" must also be stemmed to "run" to find it.

```python
# backend/indexer/tokenizer.py
def tokenize(text: str) -> list[str]:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    tokens = text.split()
    return [stem(t) for t in tokens if t not in STOPWORDS and len(t) > 1]
```

## Limitations

Porter stemming is rule-based, not dictionary-based. It handles regular morphology well but:
- **Irregular verbs**: "ran" does NOT stem to "run" (stays "ran")
- **Over-stemming**: "university" and "universe" both stem to "univers"
- **Non-English**: Only works for English

For production engines, more sophisticated approaches exist:
- **Snowball stemmer** — improved Porter with multi-language support
- **Lemmatization** — uses a dictionary to find true root forms ("ran" → "run")
- **WordPiece/BPE** — subword tokenization used by BERT and modern NLP

## Impact on Our Engine

| Metric | Before | After |
|--------|--------|-------|
| Unique terms | 137,293 | 117,580 |
| Term reduction | — | 14.4% |
| "running players" results | 0 | 888 |
| Index rebuild time | ~30s | ~35s (slightly longer due to stemming) |

## Files

- `backend/indexer/stemmer.py` — Porter stemmer implementation (180 lines)
- `backend/indexer/tokenizer.py` — Integration point (`stem()` called in `tokenize()`)

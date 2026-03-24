# Neural Re-ranking: BERT-Style Semantic Understanding

Neural re-ranking adds semantic understanding on top of BM25F keyword matching. It's the same approach Google introduced with BERT in 2019 — the single biggest search quality improvement in a decade.

## The Problem

BM25F is keyword matching. "best striker in football history" only finds documents containing those exact words (or their stems). It misses:
- "greatest goalscorer of all time" (same meaning, different words)
- "top forwards who changed the game" ("forward" ≈ "striker")
- "all-time leading scorers" (semantic equivalent)

## The Solution: Cross-Encoder Re-ranking

A cross-encoder reads the query AND document together, attending across both texts to score semantic relevance:

```
Input:  ("best striker", "Ronaldo is the top goalscorer of all time")
Model:  BERT reads both texts simultaneously, cross-attends
Output: 7.29 (high relevance)
```

Unlike bi-encoders (which embed texts independently), cross-encoders capture **interaction** between query and document — "won" vs "lost" in the context of the query matters.

## Architecture

We use a two-stage retrieval pipeline (same as Google):

```
Stage 1: BM25F + PageRank → top candidates         (~100ms, keyword-based)
Stage 2: Cross-encoder re-ranks top 5 candidates   (~600ms, semantic)
Stage 3: Remaining results from original ranking     (no extra cost)
```

Stage 1 is fast and broad — narrows millions of documents to a handful. Stage 2 is slow but precise — only runs on 5 documents.

## Model

**Model:** `cross-encoder/ms-marco-MiniLM-L-6-v2` (22M parameters)
- Trained on the MS MARCO passage ranking dataset (8.8M query-passage pairs)
- 6 Transformer layers, 384 hidden dimensions
- Small enough for CPU inference

**Runtime:** ONNX on CPU (no GPU needed)
- Model exported to ONNX format via HuggingFace (Xenova export)
- `onnxruntime` for inference, `tokenizers` for text encoding
- Batched inference: all 5 (query, doc) pairs in one forward pass

**Latency:** ~600ms warm on Railway CPU for 5 candidates at 128 tokens each
- Cold start (first request): ~2-3s (model loading)
- Subsequent requests: ~600ms

## Implementation

### Reranker module (`backend/ranker/reranker.py`)

```python
# Lazy-loaded model (loaded once, stays in memory)
session = ort.InferenceSession("model.onnx")
tokenizer = Tokenizer.from_file("tokenizer.json")

def rerank(query, candidates, top_k=5):
    pairs = [(query, doc_text[:300]) for doc in candidates]
    encodings = tokenizer.encode_batch(pairs)  # tokenize all pairs
    scores = session.run(None, {                # batched inference
        "input_ids": ...,
        "attention_mask": ...,
        "token_type_ids": ...,
    })
    # Sort candidates by cross-encoder score
    return sorted(zip(candidates, scores), reverse=True)
```

### Configuration

- `RERANK_TOP_K = 5` — re-rank top 5 BM25 candidates
- `MAX_LENGTH = 128` — max tokens per (query, doc) pair
- `RERANKER_MODEL_DIR` — path to ONNX model files

### Graceful fallback

If the model isn't available (missing files, import error), the reranker returns candidates in their original order with `rerank_score = None`. Search never breaks.

## Impact

Searching "Ronaldo" — before and after neural re-ranking:

| Before (BM25F + PageRank) | After (+ Neural Rerank) |
|---|---|
| #1 Cristiano Ronaldo \| GiveMeSport | #1 **Cristiano Ronaldo - Wikipedia** (+3) |
| #2 Lionel Messi, Inter Miami... | #2 Cristiano Ronaldo \| GiveMeSport (-1) |
| #3 Lionel Messi \| GiveMeSport | #3 Lionel Messi, Inter Miami... (-1) |
| #4 **Cristiano Ronaldo - Wikipedia** | #4 Lionel Messi \| GiveMeSport (-1) |

The Wikipedia article about Ronaldo jumped from #4 to #1 — the cross-encoder recognized it as the most directly relevant result.

## Why not run BERT on all documents?

BERT takes ~120ms per (query, document) pair on CPU. For 1000 documents, that's 120 seconds — unusable. The two-stage approach lets us get the best of both worlds: BM25's speed for broad retrieval + BERT's accuracy for final ranking.

## Files

- `backend/ranker/reranker.py` — ONNX cross-encoder inference
- `backend/search/engine.py` — Integration into search pipeline
- `backend/search/explainer.py` — Re-ranking trace for Explore tab
- `backend/Dockerfile` — ONNX dependencies + model download

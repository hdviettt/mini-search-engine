"""Neural re-ranking using a local ONNX cross-encoder.

Re-ranks the top BM25+PageRank candidates by semantic relevance.
The cross-encoder jointly encodes (query, document) pairs — unlike
bi-encoders, it captures the interaction between query and document.

Model: cross-encoder/ms-marco-MiniLM-L-6-v2 (22M params)
Runtime: ONNX on CPU (no GPU needed)
Latency: ~100-150ms for 10 candidates
"""
import os
import time

import numpy as np

RERANK_TOP_K = 5      # how many BM25 candidates to re-rank (fewer = faster)
MAX_LENGTH = 128      # max tokens per (query, doc) pair (shorter = faster)

# Lazy-loaded model components (loaded on first use, stays in memory)
_session = None
_tokenizer = None


def _get_model():
    """Load the ONNX model and tokenizer (once, then cached)."""
    global _session, _tokenizer

    if _session is not None:
        return _session, _tokenizer

    try:
        import onnxruntime as ort
        from tokenizers import Tokenizer

        model_dir = os.environ.get("RERANKER_MODEL_DIR", "/app/models/reranker")

        model_path = os.path.join(model_dir, "onnx", "model.onnx")
        tokenizer_path = os.path.join(model_dir, "tokenizer.json")

        if not os.path.exists(model_path):
            print(f"  Reranker model not found at {model_path}, skipping.")
            return None, None

        print(f"  Loading reranker model from {model_dir}...")
        _session = ort.InferenceSession(
            model_path,
            providers=["CPUExecutionProvider"],
        )
        _tokenizer = Tokenizer.from_file(tokenizer_path)
        _tokenizer.enable_truncation(max_length=MAX_LENGTH)
        _tokenizer.enable_padding(length=MAX_LENGTH, pad_id=0, pad_token="[PAD]")
        print("  Reranker model loaded.")

    except ImportError:
        print("  onnxruntime/tokenizers not installed, reranker disabled.")
        return None, None
    except Exception as e:
        print(f"  Reranker load error: {e}")
        return None, None

    return _session, _tokenizer


def rerank(query: str, candidates: list[dict], top_k: int = RERANK_TOP_K) -> list[dict]:
    """Re-rank candidates using the cross-encoder.

    Args:
        query: The search query.
        candidates: List of dicts with at least 'page_id', 'title', 'body_text'.
        top_k: Number of results to return.

    Returns:
        Re-ranked candidates with 'rerank_score' added to each.
        Falls back to original order if model is unavailable.
    """
    session, tokenizer = _get_model()

    if session is None or tokenizer is None or not candidates:
        # Model not available — return candidates unchanged
        for c in candidates:
            c["rerank_score"] = None
        return candidates[:top_k]

    t0 = time.time()

    # Build (query, document) pairs for the cross-encoder
    doc_texts = []
    for c in candidates:
        title = c.get("title", "") or ""
        body = c.get("body_text", "") or ""
        # Title + first part of body (tokenizer truncates to MAX_LENGTH)
        doc_texts.append(f"{title}. {body[:300]}")

    # Encode all pairs in a batch
    pairs = [(query, doc) for doc in doc_texts]
    encodings = tokenizer.encode_batch(pairs)

    input_ids = np.array([e.ids for e in encodings], dtype=np.int64)
    attention_mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)
    token_type_ids = np.array([e.type_ids for e in encodings], dtype=np.int64)

    # Run inference
    input_names = [inp.name for inp in session.get_inputs()]
    feed = {}
    if "input_ids" in input_names:
        feed["input_ids"] = input_ids
    if "attention_mask" in input_names:
        feed["attention_mask"] = attention_mask
    if "token_type_ids" in input_names:
        feed["token_type_ids"] = token_type_ids

    outputs = session.run(None, feed)
    logits = outputs[0]  # shape: (n_candidates, 1) or (n_candidates,)

    scores = logits.flatten().tolist()
    elapsed = (time.time() - t0) * 1000

    # Attach scores and sort
    for c, score in zip(candidates, scores):
        c["rerank_score"] = round(float(score), 4)

    candidates.sort(key=lambda x: x["rerank_score"], reverse=True)

    print(f"  Reranked {len(candidates)} candidates in {elapsed:.0f}ms")
    return candidates[:top_k]

"""Neural re-ranking using a local ONNX cross-encoder.

Re-ranks the top BM25+PageRank candidates by semantic relevance.
The cross-encoder jointly encodes (query, document) pairs — unlike
bi-encoders, it captures the interaction between query and document.

Model: cross-encoder/ms-marco-MiniLM-L-6-v2 (22M params)
Runtime: ONNX on CPU (no GPU needed)
Latency: ~100-150ms for 10 candidates
"""
import logging
import os
import time

import numpy as np

log = logging.getLogger(__name__)

RERANK_TOP_K = 5      # how many BM25 candidates to re-rank (fewer = faster)
MAX_LENGTH = 128      # max tokens per (query, doc) pair (shorter = faster)

# Set RERANK_ENABLED=false to measure what the reranker is actually worth.
ENABLED = os.getenv("RERANK_ENABLED", "true").lower() not in ("false", "0", "no")

# Lazy-loaded model components (loaded on first use, stays in memory)
_session = None
_tokenizer = None


def _model_dir() -> str:
    """Where the ONNX weights live.

    Defaults to a path inside the repo so a local checkout works with no extra
    config; the Docker image overrides it with RERANKER_MODEL_DIR.
    """
    default_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models", "reranker"
    )
    return os.environ.get("RERANKER_MODEL_DIR", default_dir)


def _get_model():
    """Load the ONNX model and tokenizer (once, then cached)."""
    global _session, _tokenizer

    if not ENABLED:
        return None, None

    if _session is not None:
        return _session, _tokenizer

    try:
        import onnxruntime as ort
        from tokenizers import Tokenizer

        model_dir = _model_dir()
        model_path = os.path.join(model_dir, "onnx", "model.onnx")
        tokenizer_path = os.path.join(model_dir, "tokenizer.json")

        if not os.path.exists(model_path):
            log.warning(
                "Reranker model missing at %s. Neural reranking is DISABLED — "
                "results use BM25 + PageRank only. Fix: python scripts/download_model.py",
                model_path,
            )
            return None, None

        log.info("Loading reranker model from %s...", model_dir)
        _session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        _tokenizer = Tokenizer.from_file(tokenizer_path)
        _tokenizer.enable_truncation(max_length=MAX_LENGTH)
        _tokenizer.enable_padding(length=MAX_LENGTH, pad_id=0, pad_token="[PAD]")
        log.info("Reranker model loaded.")

    except ImportError:
        log.warning("onnxruntime/tokenizers not installed, reranker disabled.")
        return None, None
    except Exception:
        log.error("Reranker load failed", exc_info=True)
        return None, None

    return _session, _tokenizer


def rerank(query: str, candidates: list[dict], top_k: int = RERANK_TOP_K) -> list[dict]:
    """Re-rank candidates using the cross-encoder.

    Args:
        query: The search query.
        candidates: Dicts with at least 'page_id', 'title', 'body_text'.
        top_k: Number of results to return.

    Returns:
        Re-ranked candidates with 'rerank_score' added. Falls back to the
        original order with rerank_score=None when the model is unavailable.
    """
    session, tokenizer = _get_model()

    if session is None or tokenizer is None or not candidates:
        for c in candidates:
            c["rerank_score"] = None
        return candidates[:top_k]

    t0 = time.time()

    # Title + first part of body; the tokenizer truncates to MAX_LENGTH.
    doc_texts = [
        f"{c.get('title') or ''}. {(c.get('body_text') or '')[:300]}" for c in candidates
    ]

    encodings = tokenizer.encode_batch([(query, doc) for doc in doc_texts])

    input_ids = np.array([e.ids for e in encodings], dtype=np.int64)
    attention_mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)
    token_type_ids = np.array([e.type_ids for e in encodings], dtype=np.int64)

    input_names = {inp.name for inp in session.get_inputs()}
    feed = {}
    if "input_ids" in input_names:
        feed["input_ids"] = input_ids
    if "attention_mask" in input_names:
        feed["attention_mask"] = attention_mask
    if "token_type_ids" in input_names:
        feed["token_type_ids"] = token_type_ids

    logits = session.run(None, feed)[0]
    scores = logits.flatten().tolist()

    for c, score in zip(candidates, scores, strict=False):
        c["rerank_score"] = round(float(score), 4)

    candidates.sort(key=lambda c: c["rerank_score"], reverse=True)

    log.debug("Reranked %d candidates in %.0fms", len(candidates), (time.time() - t0) * 1000)
    return candidates[:top_k]

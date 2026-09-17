"""Neural re-ranking using a local ONNX cross-encoder.

Re-ranks the top BM25+PageRank candidates by semantic relevance.
The cross-encoder jointly encodes (query, document) pairs — unlike
bi-encoders, it captures the interaction between query and document.

Model: cross-encoder/ms-marco-MiniLM-L-6-v2 (22M params)
Runtime: ONNX on CPU (no GPU needed)
Latency: about 10 ms per candidate, near enough linear — 42 ms for 5, 94 ms
for 10, 196 ms for 20, measured on a 16-core CPU with the model already
loaded. Do not confuse this with the 1,158 ms gap between p50 with and
without reranking: that is an end-to-end request difference measured against
the deployed instance, and most of it is not this function.

How many candidates to re-score is not decided here. `search/ranking.py` owns
that, and `top_k` is required so the number cannot quietly diverge between
callers — the same duplication that let two copies of the freshness formula
drift apart.
"""
import logging
import os
import time

import numpy as np

log = logging.getLogger(__name__)

MAX_LENGTH = 128      # max tokens per (query, doc) pair (shorter = faster)

# Set RERANK_ENABLED=false to measure what the reranker is actually worth.
ENABLED = os.getenv("RERANK_ENABLED", "true").lower() not in ("false", "0", "no")

# Lazy-loaded model components (loaded on first use, stays in memory)
_session = None
_tokenizer = None


def _cpu_allowance() -> int:
    """How many CPUs this process may actually use, not how many it can see.

    `os.cpu_count()` reports the host's cores. Inside a container that number
    is a fiction: the cgroup quota is what the scheduler enforces. ONNX Runtime
    defaults its intra-op pool to the visible count, so on this deployment it
    was building a 48-thread pool against an 8-CPU quota and spending most of
    its time context switching. Measured on a batch of 40 pairs at seq len 128:

        48 threads (the default)   3322 ms     83.0 ms per candidate
        16 threads                  424 ms     10.6 ms per candidate
         8 threads (the quota)      247 ms      6.2 ms per candidate
         4 threads                  556 ms     13.9 ms per candidate
         1 thread                   1673 ms    41.8 ms per candidate

    13x, for reading a file. Note 16 is worse than 8, which is the tell: past
    the quota the threads are fighting each other, not the work.
    """
    override = os.getenv("RERANK_THREADS")
    if override:
        try:
            return max(1, int(override))
        except ValueError:
            log.warning("RERANK_THREADS=%r is not an integer, ignoring", override)

    # cgroup v2
    try:
        with open("/sys/fs/cgroup/cpu.max") as fh:
            quota, period = fh.read().split()
            if quota != "max":
                return max(1, int(int(quota) / int(period)))
    except (OSError, ValueError):
        pass

    # cgroup v1
    try:
        with open("/sys/fs/cgroup/cpu/cpu.cfs_quota_us") as fh:
            quota = int(fh.read())
        with open("/sys/fs/cgroup/cpu/cpu.cfs_period_us") as fh:
            period = int(fh.read())
        if quota > 0 and period > 0:
            return max(1, quota // period)
    except (OSError, ValueError):
        pass

    # Not containerised, or a cgroup layout we do not know. Affinity is the
    # next most honest answer, then the raw core count.
    try:
        return max(1, len(os.sched_getaffinity(0)))
    except AttributeError:
        return max(1, os.cpu_count() or 1)


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

        threads = _cpu_allowance()
        log.info("Loading reranker model from %s (intra_op_num_threads=%d)...", model_dir, threads)
        opts = ort.SessionOptions()
        # Size the intra-op pool to the CPU quota, see _cpu_allowance.
        opts.intra_op_num_threads = threads
        # One inference at a time per request, so there is no graph-level
        # parallelism to win here; extra inter-op threads only add contention.
        opts.inter_op_num_threads = 1
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        _session = ort.InferenceSession(model_path, opts, providers=["CPUExecutionProvider"])
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


def rerank(query: str, candidates: list[dict], top_k: int) -> list[dict]:
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

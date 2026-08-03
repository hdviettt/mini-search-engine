"""Shared scoring primitives.

`search.engine` (what users get) and `search.explainer` (what the playground
canvas shows) both rank results. When they each carried their own copy of the
freshness formula they drifted, and the canvas explained scoring the engine
did not actually perform. Everything either of them needs to score lives here.
"""
import os
from math import exp

from config import FRESHNESS_DECAY, FRESHNESS_FLOOR

# Two-phase retrieval: BM25 selects a pool, the expensive signals only run on
# it. Without a bound, a common term pulls every matching page into an
# `IN (...)` clause with thousands of placeholders.
CANDIDATE_POOL = 500

# How many of the top candidates the cross-encoder re-scores. This is the only
# definition; `ranker.reranker.rerank` takes it as a required argument so the
# number cannot diverge between callers.
#
# Was 5. Measured on the 50-query set, letting the cross-encoder order every
# returned candidate rather than the top five is worth +0.0553 nDCG@10
# (± 0.0171) and +0.0593 MRR (± 0.0286) — 15 queries better, 2 worse, both gaps
# clearing two standard errors. Reranking costs about 10 ms per candidate, and
# per-domain dedup means roughly twice this many have to be scored to fill a
# page of ten.
#
# Env-overridable so the trade-off can be retuned against a live instance
# without a redeploy. Raise it, re-run `eval/run.py --compare`, and read the
# latency line as carefully as the nDCG line.
RERANK_TOP_K = int(os.getenv("RERANK_TOP_K", "10"))

# Cross-encoder logits below this are treated as "not actually relevant".
RERANK_MIN_SCORE = -8.0

# At most this many results from any single domain, so one site cannot own
# the whole page.
MAX_PER_DOMAIN = 2

# Pages newer than this get an extra nudge, capped so a fresh-but-weak page
# cannot outrank a strong one.
RECENT_DAYS = 7
RECENT_BONUS = 1.15
RECENT_BONUS_CAP = 1.2


def normalize_scores(scores: dict[int, float]) -> dict[int, float]:
    """Min-max normalize to [0, 1] so BM25 and PageRank are comparable."""
    if not scores:
        return {}
    min_s = min(scores.values())
    max_s = max(scores.values())
    spread = max_s - min_s
    if spread == 0:
        return {k: 1.0 for k in scores}
    return {k: (v - min_s) / spread for k, v in scores.items()}


def freshness_multiplier(days_old: int) -> float:
    """Exponential decay toward a floor, with a bonus for very recent pages."""
    days_old = max(0, days_old)
    boost = FRESHNESS_FLOOR + (1 - FRESHNESS_FLOOR) * exp(-days_old * FRESHNESS_DECAY)
    if days_old < RECENT_DAYS:
        boost = min(boost * RECENT_BONUS, RECENT_BONUS_CAP)
    return boost


def combine_scores(
    bm25_scores: dict[int, float],
    pagerank_scores: dict[int, float],
    alpha: float,
) -> dict[int, float]:
    """alpha * BM25 + (1 - alpha) * PageRank, both min-max normalized first."""
    norm_bm25 = normalize_scores(bm25_scores)
    norm_pr = normalize_scores(pagerank_scores)
    return {
        page_id: alpha * norm_bm25.get(page_id, 0.0) + (1 - alpha) * norm_pr.get(page_id, 0.0)
        for page_id in bm25_scores
    }


def dedupe_by_domain(
    ordered_ids: list[int],
    url_by_id: dict[int, str],
    max_per_domain: int = MAX_PER_DOMAIN,
) -> list[int]:
    """Drop results past the per-domain cap, preserving order.

    Applied to the whole candidate pool before pagination — deduping per page
    instead would make page 2 depend on what page 1 happened to drop.
    """
    from urllib.parse import urlparse

    seen: dict[str, int] = {}
    kept: list[int] = []
    for page_id in ordered_ids:
        url = url_by_id.get(page_id)
        if not url:
            continue
        domain = (urlparse(url).hostname or "").replace("www.", "")
        if seen.get(domain, 0) >= max_per_domain:
            continue
        seen[domain] = seen.get(domain, 0) + 1
        kept.append(page_id)
    return kept

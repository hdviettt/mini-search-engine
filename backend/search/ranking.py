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
# Was 5. Five depths were deployed and measured on a warm instance — see the
# table in CLAUDE.md. 40 is the pick: best MRR of any depth, and it is what
# lifts zero-result precision from 0.40 to 0.60, because a deeper rerank gives
# RERANK_MIN_SCORE enough candidates to throw the junk out of a nonsense query.
# It gives up 0.0036 nDCG@10 against depth 20, which is nothing next to that.
#
# Do not raise this much further without re-measuring. p50 goes 300 ms at 20,
# 440 ms at 40, then 4,700 ms at 80 — a ten-fold jump for no quality. That is
# almost certainly the `SELECT ... body_text` for the head, not the model,
# which costs about 10 ms per candidate.
#
# Env-overridable so the trade-off can be retuned against a live instance
# without a redeploy.
RERANK_TOP_K = int(os.getenv("RERANK_TOP_K", "40"))

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


# Multiplier when a query term names the host a result sits on.
#
# "bbc sport football", "espn soccer", "guardian football" are navigational:
# the user has named the site and wants that site. BM25F scores title and body
# only, so unless the page happens to print its own publisher in the text,
# there is nothing for "bbc" to match and the query cannot be satisfied.
# navigational was the weakest intent in the eval at 0.7152 for this reason.
#
# Kept modest on purpose. It should be enough to lift the named site above
# equally-relevant pages, not enough to drag an off-topic page from that site
# above a strongly matching one elsewhere.
SITE_MATCH_BONUS = 1.5

# Dropped before matching: present in most hosts, so they discriminate nothing
# and would make "co" or "com" in a query match everything.
_HOST_NOISE = frozenset({
    "www", "com", "org", "net", "co", "uk", "us", "io", "app", "edu", "gov",
    "info", "me", "tv", "news2", "amp",
})


def site_match_multiplier(query_tokens, url: str, bonus: float = SITE_MATCH_BONUS) -> float:
    """Boost a result whose host is named in the query.

    Matches a whole host label ("espn" in espn.com) or a query token contained
    in one ("guardian" in theguardian.com). Containment needs four characters,
    which keeps short tokens from matching inside unrelated hosts.
    """
    from urllib.parse import urlparse

    if not url or not query_tokens:
        return 1.0
    host = (urlparse(url).hostname or "").lower()
    if not host:
        return 1.0
    labels = [lbl for lbl in host.split(".") if lbl and lbl not in _HOST_NOISE]
    if not labels:
        return 1.0

    for tok in query_tokens:
        tok = (tok or "").lower()
        if len(tok) < 3:
            continue
        for label in labels:
            if tok == label:
                return bonus
            if len(tok) >= 4 and tok in label:
                return bonus
    return 1.0


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

"""Scoring primitives shared by the engine and the playground explainer."""
import pytest

from search.ranking import (
    MAX_PER_DOMAIN,
    RECENT_DAYS,
    combine_scores,
    dedupe_by_domain,
    freshness_multiplier,
    normalize_scores,
)


def test_normalize_maps_to_unit_range():
    out = normalize_scores({1: 2.0, 2: 6.0, 3: 10.0})
    assert out[1] == 0.0
    assert out[3] == 1.0
    assert out[2] == pytest.approx(0.5)


def test_normalize_handles_identical_scores():
    """Zero spread must not divide by zero."""
    assert normalize_scores({1: 5.0, 2: 5.0}) == {1: 1.0, 2: 1.0}


def test_normalize_handles_empty():
    assert normalize_scores({}) == {}


def test_freshness_decays_with_age():
    assert freshness_multiplier(0) > freshness_multiplier(30) > freshness_multiplier(365)


def test_freshness_has_a_floor():
    from config import FRESHNESS_FLOOR

    assert freshness_multiplier(100_000) >= FRESHNESS_FLOOR


def test_recent_pages_get_a_bonus():
    from search.ranking import RECENT_BONUS_CAP

    fresh = freshness_multiplier(1)
    assert fresh > 1.0
    assert fresh <= RECENT_BONUS_CAP


def test_bonus_stops_after_the_recent_window():
    assert freshness_multiplier(RECENT_DAYS) < 1.0


def test_negative_age_is_treated_as_zero():
    assert freshness_multiplier(-5) == freshness_multiplier(0)


def test_combine_respects_alpha():
    bm25 = {1: 10.0, 2: 0.0}
    pagerank = {1: 0.0, 2: 10.0}

    all_bm25 = combine_scores(bm25, pagerank, alpha=1.0)
    assert all_bm25[1] > all_bm25[2]

    all_pr = combine_scores(bm25, pagerank, alpha=0.0)
    assert all_pr[2] > all_pr[1]


def test_combine_only_scores_bm25_matches():
    """A page PageRank knows about but BM25 does not must not appear."""
    out = combine_scores({1: 5.0}, {1: 1.0, 99: 9.0}, alpha=0.5)
    assert set(out) == {1}


def test_dedupe_caps_results_per_domain():
    urls = {
        1: "https://en.wikipedia.org/wiki/A",
        2: "https://en.wikipedia.org/wiki/B",
        3: "https://en.wikipedia.org/wiki/C",
        4: "https://www.bbc.com/sport/football",
    }
    kept = dedupe_by_domain([1, 2, 3, 4], urls)
    assert kept == [1, 2, 4]
    assert len([p for p in kept if "wikipedia" in urls[p]]) == MAX_PER_DOMAIN


def test_dedupe_treats_www_as_same_domain():
    urls = {1: "https://bbc.com/a", 2: "https://www.bbc.com/b", 3: "https://www.bbc.com/c"}
    assert dedupe_by_domain([1, 2, 3], urls) == [1, 2]


def test_dedupe_preserves_input_order():
    urls = {1: "https://a.com/1", 2: "https://b.com/1", 3: "https://a.com/2"}
    assert dedupe_by_domain([3, 2, 1], urls) == [3, 2, 1]


def test_dedupe_skips_ids_without_a_url():
    assert dedupe_by_domain([1, 2], {1: "https://a.com/1"}) == [1]


def test_rerank_depth_has_exactly_one_definition():
    """`ranker.reranker` used to carry its own RERANK_TOP_K = 5.

    Both callers passed top_k explicitly, so that copy never ran — but anyone
    reading reranker.py would have taken 5 for the knob. Two copies of the
    freshness formula already drifted apart once in this codebase; this asserts
    the depth cannot go the same way.
    """
    import ranker.reranker as reranker

    assert not hasattr(reranker, "RERANK_TOP_K")


def test_rerank_requires_an_explicit_depth():
    """No default, so a new caller has to decide rather than inherit one."""
    import inspect

    from ranker.reranker import rerank

    assert inspect.signature(rerank).parameters["top_k"].default is inspect.Parameter.empty


def test_rerank_depth_is_read_from_the_environment(monkeypatch):
    """The nDCG/latency trade-off is retunable against a live instance."""
    import importlib

    import search.ranking as ranking

    monkeypatch.setenv("RERANK_TOP_K", "37")
    try:
        assert importlib.reload(ranking).RERANK_TOP_K == 37
    finally:
        monkeypatch.delenv("RERANK_TOP_K")
        importlib.reload(ranking)


def test_rerank_depth_covers_a_full_page_after_dedup():
    """Per-domain dedup discards candidates, so the depth has to exceed the
    page size or the page cannot be filled from reranked results alone."""
    from search.ranking import MAX_PER_DOMAIN, RERANK_TOP_K

    assert RERANK_TOP_K >= 10 * MAX_PER_DOMAIN / 2

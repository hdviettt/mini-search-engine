"""Metric maths behind eval/run.py.

The eval harness is what decides whether a ranking change was an improvement,
so the metrics themselves need to be right before any of its numbers mean
anything.
"""
import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "eval"))

from run import GAIN_HIGH, GAIN_LOW, gain_for, ndcg_at_k, reciprocal_rank  # noqa: E402

QUERIES_PATH = Path(__file__).resolve().parents[2] / "eval" / "queries.yaml"


# ── relevance labelling ────────────────────────────────────────────────

def test_highly_relevant_beats_relevant():
    spec = {"highly_relevant": ["messi"], "relevant": ["barcelona"]}
    assert gain_for({"title": "Lionel Messi", "url": "/wiki/Lionel_Messi"}, spec) == GAIN_HIGH
    assert gain_for({"title": "FC Barcelona", "url": "/wiki/Barcelona"}, spec) == GAIN_LOW
    assert gain_for({"title": "Cricket", "url": "/wiki/Cricket"}, spec) == 0


def test_matching_is_case_insensitive():
    spec = {"highly_relevant": ["MESSI"]}
    assert gain_for({"title": "lionel messi", "url": ""}, spec) == GAIN_HIGH


def test_url_is_searched_as_well_as_title():
    spec = {"highly_relevant": ["transfermarkt.com"]}
    assert gain_for({"title": "Premier League", "url": "https://transfermarkt.com/x"}, spec) == GAIN_HIGH


def test_missing_label_lists_are_fine():
    assert gain_for({"title": "x", "url": "y"}, {}) == 0


# ── nDCG ───────────────────────────────────────────────────────────────

def test_perfect_ranking_scores_one():
    assert ndcg_at_k([3, 3, 1, 1, 0]) == pytest.approx(1.0)


def test_reversed_ranking_scores_less_than_perfect():
    assert ndcg_at_k([0, 1, 1, 3, 3]) < ndcg_at_k([3, 3, 1, 1, 0])


def test_no_relevant_results_scores_zero():
    assert ndcg_at_k([0, 0, 0]) == 0.0


def test_empty_results_score_zero():
    assert ndcg_at_k([]) == 0.0


def test_position_matters():
    """Same gains, better order must score higher."""
    assert ndcg_at_k([3, 0, 0, 0]) > ndcg_at_k([0, 0, 0, 3])


def test_only_top_k_counts():
    assert ndcg_at_k([0] * 10 + [3], k=10) == 0.0


# ── MRR ────────────────────────────────────────────────────────────────

def test_mrr_rewards_first_position():
    assert reciprocal_rank([3, 0, 0]) == 1.0
    assert reciprocal_rank([0, 3, 0]) == pytest.approx(0.5)
    assert reciprocal_rank([0, 0, 3]) == pytest.approx(1 / 3)


def test_mrr_ignores_merely_relevant_hits():
    """MRR asks where the *right* answer landed, not a related one."""
    assert reciprocal_rank([1, 1, 1]) == 0.0


def test_mrr_zero_when_nothing_relevant():
    assert reciprocal_rank([0, 0, 0]) == 0.0
    assert reciprocal_rank([]) == 0.0


# ── the query set itself ───────────────────────────────────────────────

def test_query_file_is_valid():
    specs = yaml.safe_load(QUERIES_PATH.read_text(encoding="utf-8"))["queries"]
    assert len(specs) >= 50, "the set is meant to cover at least 50 queries"

    seen = set()
    for spec in specs:
        assert spec.get("q"), f"query missing text: {spec}"
        assert spec["q"] not in seen, f"duplicate query: {spec['q']}"
        seen.add(spec["q"])
        assert spec.get("intent"), f"query missing intent: {spec['q']}"
        if not spec.get("expects_zero"):
            assert spec.get("highly_relevant"), f"no labels for: {spec['q']}"


def test_every_intent_bucket_is_represented():
    specs = yaml.safe_load(QUERIES_PATH.read_text(encoding="utf-8"))["queries"]
    intents = {s["intent"] for s in specs}
    assert {
        "entity",
        "informational",
        "navigational",
        "multi_term",
        "misspelled",
        "zero_result",
    } <= intents

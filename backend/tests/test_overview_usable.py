"""An overview is only cached if it is complete.

A generation that stopped early is still a non-empty string, so the old
`if not overview` guard let it through and `_set_cache` pinned it for 24 hours.
That happened in production on 2026-09-17: one request for "erling haaland
goals" came back as the single word "Erling", and every later request served
the same six characters from cache while the model itself was answering
perfectly for every other query.
"""
from ai_overview.generator import MIN_OVERVIEW_CHARS, _is_usable

GOOD = (
    "Erling Haaland is a Norwegian striker for Manchester City, known for his "
    "record 36 goals in the 2022-23 Premier League season [1]."
)


def test_a_complete_answer_is_usable():
    assert _is_usable(GOOD)
    assert _is_usable(GOOD, "stop")


def test_the_truncation_that_poisoned_the_cache_is_rejected():
    assert not _is_usable("Erling")
    assert not _is_usable("Erling", "stop")


def test_empty_and_whitespace_are_rejected():
    assert not _is_usable("")
    assert not _is_usable("   \n  ")
    assert not _is_usable(None or "")


def test_hitting_the_token_ceiling_is_rejected_however_long():
    """finish_reason=length means the model was cut off mid-sentence."""
    assert not _is_usable(GOOD, "length")


def test_threshold_is_a_boundary_not_a_range():
    assert not _is_usable("x" * (MIN_OVERVIEW_CHARS - 1))
    assert _is_usable("x" * MIN_OVERVIEW_CHARS)

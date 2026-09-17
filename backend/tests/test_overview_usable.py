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


# gpt-oss sometimes emits CJK fullwidth brackets for citations instead of the
# ASCII ones the prompt asks for, so a citation renders as literal junk next to
# the sentence it marks. Seen live on "explain the video assistant referee
# system", which came back citing \u30102\u3011.

def test_fullwidth_citation_brackets_are_normalised():
    from ai_overview.generator import _normalise_citations
    assert _normalise_citations("won it\u30101\u3011 twice") == "won it[1] twice"
    assert _normalise_citations("see\uff3b2\uff3d here") == "see[2] here"


def test_ascii_citations_are_left_alone():
    from ai_overview.generator import _normalise_citations
    assert _normalise_citations("plain [1] and [2]") == "plain [1] and [2]"


def test_normalisation_is_safe_on_empty_text():
    from ai_overview.generator import _normalise_citations
    assert _normalise_citations("") == ""

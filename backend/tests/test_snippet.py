"""Snippet generation — the text under every result."""
from indexer.tokenizer import tokenize
from search.engine import generate_snippet


def test_returns_empty_for_empty_body():
    assert generate_snippet("", ["football"]) == ""


def test_picks_the_sentence_containing_the_query_terms():
    body = (
        "Some unrelated opening text about weather. "
        "More filler that mentions nothing of interest at all here. "
        "Lionel Messi won the Ballon d'Or a record eight times."
    )
    snippet = generate_snippet(body, tokenize("messi ballon"))
    assert "Messi" in snippet


def test_strips_wikipedia_citation_markers():
    snippet = generate_snippet("Messi joined Barcelona[1] in 2000[23].", tokenize("messi"))
    assert "[1]" not in snippet
    assert "[23]" not in snippet


def test_strips_edit_markers():
    assert "[edit]" not in generate_snippet("History[edit] of the club.", tokenize("history"))


def test_collapses_whitespace():
    assert "  " not in generate_snippet("Messi    plays\n\n  football here.", tokenize("messi"))


def test_respects_max_length():
    body = "Messi is great. " * 200
    assert len(generate_snippet(body, tokenize("messi"), max_length=100)) <= 100


def test_falls_back_when_no_terms_match():
    body = "This is a long opening sentence about something entirely different indeed."
    assert generate_snippet(body, tokenize("zzzz")) != ""


def test_handles_empty_query_terms():
    body = "This is a long opening sentence about something entirely different indeed."
    assert generate_snippet(body, []) != ""


def test_body_of_only_citations_yields_empty():
    assert generate_snippet("[1][2][3]", tokenize("messi")) == ""

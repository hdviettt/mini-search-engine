"""Tokenizer and stemmer.

Both are pure functions and sit under every query, so a regression here
silently changes every ranking in the index.
"""
from indexer.stemmer import stem
from indexer.tokenizer import STOPWORDS, tokenize


def test_lowercases_and_splits():
    assert tokenize("Premier League") == [stem("premier"), stem("league")]


def test_removes_stopwords():
    assert "the" not in tokenize("the ball")
    assert "of" not in tokenize("king of football")


def test_drops_single_characters():
    assert tokenize("a b football") == [stem("football")]


def test_strips_punctuation():
    assert tokenize("Real-Madrid, C.F.!") == tokenize("real madrid c f")


def test_keeps_four_digit_years():
    assert "2024" in tokenize("world cup 2024")
    assert "1998" in tokenize("france 1998")


def test_drops_other_bare_numbers():
    assert tokenize("scored 3 goals in 45 minutes") == [stem("score"), stem("goal"), stem("minut")]


def test_normalizes_season_strings():
    assert tokenize("2024/25 season") == tokenize("2024 season")
    assert tokenize("2024-25 season") == tokenize("2024 season")


def test_stems_word_families_together():
    assert stem("running") == stem("runs") == stem("run")


def test_empty_input():
    assert tokenize("") == []
    assert tokenize("   ") == []


def test_all_stopwords_gives_empty():
    assert tokenize("the and of a") == []


def test_wiki_noise_is_a_stopword():
    """HTML parsing leaks citation and nav chrome; it must not be indexed."""
    for noise in ("edit", "retrieved", "cookie", "advertisement"):
        assert noise in STOPWORDS
        assert noise not in tokenize(f"football {noise}")

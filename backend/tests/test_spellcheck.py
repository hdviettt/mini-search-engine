"""Spell correction picks the word someone meant, not any word two edits away.

Distance alone does not decide it. In a vocabulary this size a great many
words sit exactly two edits from a given typo, and the original
`if d < best_dist` kept whichever one set iteration reached first. "premeir"
is two edits from "premier" and also from a pile of words nobody meant; it
drew one of those, the corrected query matched no more than the typo did, and
the correction was discarded. That query scored 0.356 in the eval.
"""
from search.spellcheck import SpellChecker, _levenshtein


class FakeConn:
    """Serves the two queries _load makes: page titles, then indexed terms."""

    def __init__(self, titles, terms=()):
        self.titles, self.terms = titles, terms

    def execute(self, sql, params=None):
        rows = [(t,) for t in (self.titles if "FROM pages" in sql else self.terms)]
        return _Cursor(rows)


class _Cursor:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


def _checker(titles, terms=()):
    sc = SpellChecker()
    sc._load(FakeConn(titles, terms))
    sc._loaded = True
    return sc


# "premier" is everywhere in a football corpus; "premeir" is not a word.
TITLES = (
    ["Premier League - Wikipedia"] * 40
    + ["2023-24 Premier League season"] * 25
    + ["Premier League records"] * 12
    + ["Premio Nacional history", "Preminger retrospective", "Premise of the game"]
)


def test_levenshtein_cutoff():
    assert _levenshtein("premeir", "premier") == 2
    assert _levenshtein("cat", "dog", cutoff=2) > 2


def test_the_typo_that_stayed_broken():
    sc = _checker(TITLES)
    assert sc.correct_query("premeir league", FakeConn(TITLES)) == "premier league"


def test_frequency_breaks_the_tie():
    """Both are two edits away. The common one is the intended one."""
    sc = _checker(TITLES)
    assert sc._freq["premier"] > sc._freq.get("premise", 0)
    assert sc.correct_query("premeir", FakeConn(TITLES)) == "premier"


def test_a_word_in_the_corpus_is_never_corrected():
    """Real names must survive, which is why the index feeds the vocabulary."""
    sc = _checker(["Erling Haaland - Wikipedia"], terms=["haaland", "erling"])
    assert sc.correct_query("haaland", FakeConn([])) is None
    assert sc.correct_query("erling haaland", FakeConn([])) is None


def test_no_correction_returns_none():
    sc = _checker(TITLES)
    assert sc.correct_query("premier league", FakeConn(TITLES)) is None


def test_short_words_are_left_alone():
    sc = _checker(TITLES)
    assert sc.correct_query("an fc", FakeConn(TITLES)) is None


def test_a_word_with_nothing_within_two_edits_is_left_alone():
    sc = _checker(TITLES)
    assert sc.correct_query("zzzzqqqwx", FakeConn(TITLES)) is None

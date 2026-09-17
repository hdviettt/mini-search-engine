"""A long query about something the corpus has never heard of should return nothing.

BM25 as written admits any document matching any single term. That is right
for "messi" and useless for "sourdough starter hydration ratio", which matches
football pages on "starter" alone, because a starter is also a player who
starts. Two of the five nonsense queries in the eval leaked this way.
"""
import math

from search.ranking import MIN_SHOULD_MATCH_RATIO, min_should_match


def test_short_queries_are_left_alone():
    """One or two terms carry no redundancy; demanding both only loses results."""
    assert min_should_match(1) == 1
    assert min_should_match(2) == 1


def test_three_or_more_terms_need_at_least_two():
    assert min_should_match(3) == 2
    assert min_should_match(4) == 2


def test_the_requirement_grows_with_the_query():
    assert min_should_match(6) == 3
    assert min_should_match(8) == 4
    assert min_should_match(10) == 5


def test_it_never_demands_every_term():
    """Requiring all of them is the opposite failure, and a quieter one."""
    for n in range(3, 15):
        assert min_should_match(n) < n


def test_it_follows_the_ratio():
    for n in range(3, 15):
        assert min_should_match(n) == max(2, math.ceil(n * MIN_SHOULD_MATCH_RATIO))


def test_the_queries_this_was_written_for():
    """Four-word nonsense needs two hits, not one stray common word."""
    assert min_should_match(4) == 2   # sourdough starter hydration ratio
    assert min_should_match(3) == 2   # quantum chromodynamics lagrangian


def test_a_real_multi_term_query_is_not_over_constrained():
    """"messi barcelona champions league goals" stems to 5 distinct terms."""
    assert min_should_match(5) == 3

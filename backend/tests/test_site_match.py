"""A query that names a site should surface that site.

"bbc sport football", "espn soccer" and "guardian football" are navigational:
the user has named the publisher and wants it. BM25F scores title and body
only, so unless a page happens to print its own publisher in the text there is
nothing for "bbc" to match. navigational was the weakest intent in the eval at
0.7152 for exactly this reason.
"""
from search.ranking import SITE_MATCH_BONUS, site_match_multiplier

B = SITE_MATCH_BONUS


def test_exact_host_label_matches():
    assert site_match_multiplier(["espn", "soccer"], "https://www.espn.com/soccer/") == B
    assert site_match_multiplier(["bbc", "sport"], "https://www.bbc.com/sport/football") == B


def test_query_token_inside_a_host_label_matches():
    """"guardian" should find theguardian.com."""
    assert site_match_multiplier(["guardian"], "https://www.theguardian.com/football") == B


def test_an_unrelated_host_is_not_boosted():
    assert site_match_multiplier(["espn"], "https://en.wikipedia.org/wiki/ESPN_FC") == 1.0
    assert site_match_multiplier(["messi"], "https://www.bbc.com/sport/football") == 1.0


def test_tld_and_www_noise_never_match():
    """Otherwise a query containing "com" or "co" would boost nearly everything."""
    assert site_match_multiplier(["com"], "https://www.bbc.com/sport") == 1.0
    assert site_match_multiplier(["www"], "https://www.bbc.com/sport") == 1.0
    assert site_match_multiplier(["co", "uk"], "https://www.independent.co.uk/sport") == 1.0


def test_short_tokens_do_not_match_by_containment():
    """Containment needs four characters, so "spo" must not hit skysports.com."""
    assert site_match_multiplier(["spo"], "https://www.skysports.com/football") == 1.0


def test_containment_still_works_at_four_characters():
    assert site_match_multiplier(["sport"], "https://www.skysports.com/football") == B


def test_degenerate_input_is_safe():
    assert site_match_multiplier([], "https://www.bbc.com") == 1.0
    assert site_match_multiplier(["bbc"], "") == 1.0
    assert site_match_multiplier(["bbc"], "not a url") == 1.0


def test_the_bonus_is_modest():
    """It should lift a named site over an equal rival, not over a better page."""
    assert 1.2 <= SITE_MATCH_BONUS <= 2.0

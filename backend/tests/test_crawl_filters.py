"""Wikipedia namespace filtering.

Every article links to Help:, File: and Category: pages, so admitting them
gives navigational furniture enormous in-degree. It took over PageRank
entirely once: the top three pages by authority were Help:Category,
Wikipedia:Protection policy and File:Commons-logo.svg, with the first real
article fourth.
"""
from crawler.manager import _is_wikipedia_citation_page, _is_wikipedia_meta_page


def test_articles_are_not_meta():
    assert not _is_wikipedia_meta_page("/wiki/Lionel_Messi")
    assert not _is_wikipedia_meta_page("/wiki/Association_football")
    assert not _is_wikipedia_meta_page("/wiki/UEFA_Champions_League")


def test_known_namespaces_are_meta():
    assert _is_wikipedia_meta_page("/wiki/Help:Category")
    assert _is_wikipedia_meta_page("/wiki/Wikipedia:Protection_policy")
    assert _is_wikipedia_meta_page("/wiki/File:Commons-logo.svg")
    assert _is_wikipedia_meta_page("/wiki/Category:Articles_with_short_description")
    assert _is_wikipedia_meta_page("/wiki/Template:Infobox_football_biography")
    assert _is_wikipedia_meta_page("/wiki/Special:Random")


def test_talk_namespaces_are_meta():
    assert _is_wikipedia_meta_page("/wiki/Category_talk:Football")
    assert _is_wikipedia_meta_page("/wiki/Wikipedia_talk:Manual_of_Style")


def test_namespace_check_is_case_insensitive():
    assert _is_wikipedia_meta_page("/wiki/help:Category")
    assert _is_wikipedia_meta_page("/wiki/CATEGORY:Football")


def test_percent_encoded_colon_is_decoded():
    assert _is_wikipedia_meta_page("/wiki/Help%3ACategory")


def test_article_titles_containing_a_colon_are_kept():
    """Only registered namespaces count — a colon alone is not disqualifying."""
    assert not _is_wikipedia_meta_page("/wiki/Turn:_Washington's_Spies")
    assert not _is_wikipedia_meta_page("/wiki/Sniper:_Ghost_Warrior")


# Citation-identifier articles. These live in the article namespace, so the
# namespace test cannot see them, but every reference list links to them and
# they took over PageRank once the meta namespaces were removed.


def test_citation_identifier_pages_are_rejected():
    assert _is_wikipedia_citation_page("/wiki/ISBN")
    assert _is_wikipedia_citation_page("/wiki/Digital_object_identifier")
    assert _is_wikipedia_citation_page("/wiki/Wayback_Machine")
    assert _is_wikipedia_citation_page("/wiki/ISSN_(identifier)")
    assert _is_wikipedia_citation_page("/wiki/JSTOR")


def test_citation_match_is_exact_not_substring():
    """'ISBN' must not drag real articles that merely mention it."""
    assert not _is_wikipedia_citation_page("/wiki/List_of_ISBN_agencies")
    assert not _is_wikipedia_citation_page("/wiki/ISBN_agency_of_Vietnam")


def test_football_articles_survive_both_filters():
    for path in ("/wiki/Lionel_Messi", "/wiki/Premier_League", "/wiki/FIFA_World_Cup"):
        assert not _is_wikipedia_meta_page(path)
        assert not _is_wikipedia_citation_page(path)

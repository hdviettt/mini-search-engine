"""Error pages must not reach the index.

The title check was `title.lower().strip() in _BAD_TITLES`, an exact set
membership. A page titled "Error 404" equals neither "error" nor "404", so it
passed the gate, and three of them were sitting in the production corpus as
indexed documents after a single crawl.
"""
from crawler.manager import is_quality_page

BODY = " ".join(["football"] * 200)  # comfortably over the 100-word floor


class FakeCursor:
    def fetchone(self):
        return None  # no content-hash duplicate


class FakeConn:
    def execute(self, sql, params=None):
        return FakeCursor()


def check(title, body=BODY):
    return is_quality_page(FakeConn(), 1, title, body, "hash-unique")


def test_a_real_page_passes():
    assert check("Arsenal 2-1 Chelsea: match report - BBC Sport")
    assert check("Lionel Messi - Wikipedia")


def test_the_titles_that_slipped_through():
    """Each of these is a real title the exact-match version accepted."""
    assert not check("Error 404")
    assert not check("404 - Page Not Found")
    assert not check("Error 403 - Forbidden")


def test_plain_error_titles_still_rejected():
    for t in ("404", "error", "not found", "access denied", "untitled", "loading"):
        assert not check(t), t


def test_bot_wall_titles_rejected():
    assert not check("Just a moment...")
    assert not check("Are you a robot?")
    assert not check("Service Unavailable")


def test_empty_title_rejected():
    assert not check("")
    assert not check("   ")


def test_thin_pages_rejected_regardless_of_title():
    assert not check("Arsenal 2-1 Chelsea - BBC Sport", body="short body")


def test_football_words_in_title_are_not_false_positives():
    """Anchored, not substring, so a headline may mention the word in passing."""
    assert check("Liverpool loading up for the transfer window - Sky Sports")
    assert check("VAR error costs Arsenal a point - The Guardian")


def test_titles_that_merely_start_with_three_digits_survive():
    r"""A bare \d{3} caught these. It de-indexed "999-year lease" in production."""
    assert check("999-year lease - Wikipedia")
    assert check("100-metre sprint records")
    assert check("1966 World Cup final - Wikipedia")
    assert check("777 Partners takeover of Everton - The Guardian")


# parse_page must never raise. A crawl walks other people's servers and some
# answer 200 with an empty body. html.fromstring("") raises ParserError, the
# scheduler caught that as a failed schedule, and the entire crawl was
# abandoned on the first empty response it met.
# bbc.com/sport/football/european serves one.

def test_parse_page_survives_an_empty_body():
    from crawler.parser import parse_page
    for bad in ("", "   ", "\n\t "):
        out = parse_page("https://example.com/x", bad)
        assert out["title"] == ""
        assert out["body_text"] == ""
        assert out["links"] == set()


def test_parse_page_survives_junk():
    from crawler.parser import parse_page
    out = parse_page("https://example.com/x", "\x00\x01\x02")
    assert isinstance(out["body_text"], str)


def test_parse_page_still_parses_real_html():
    from crawler.parser import parse_page
    html_doc = "<html><head><title>Arsenal 2-1 Chelsea</title></head><body><p>" + ("A match report. " * 40) + "</p></body></html>"
    out = parse_page("https://example.com/x", html_doc)
    assert out["title"] == "Arsenal 2-1 Chelsea"
    assert "match report" in out["body_text"].lower()

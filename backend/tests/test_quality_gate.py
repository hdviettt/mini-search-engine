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
    """The patterns are substrings, so check they do not eat real headlines."""
    assert check("Liverpool loading up for the transfer window - Sky Sports")
    assert check("VAR error costs Arsenal a point - The Guardian")

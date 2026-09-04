"""Terms must be upserted in a deterministic global order.

`ON CONFLICT DO UPDATE` takes an exclusive row lock even though the write is
a no-op. Two pages sharing vocabulary that acquire those locks in different
orders deadlock, and Postgres kills one of them. On 2026-09-04 that killed a
scheduled crawl one page in:

    ERROR [scheduler] Schedule sched-c54adeb0 failed: deadlock detected
    CONTEXT: while inserting index tuple (1164,111) in relation "terms"

Sorting is what makes the deadlock impossible rather than merely unlikely, so
it is worth a test that fails if someone "simplifies" it back.
"""
from indexer.indexer import index_page


class FakeCursor:
    def __init__(self, row=None, rows=()):
        self._row = row
        self._rows = rows

    def fetchone(self):
        return self._row

    def fetchall(self):
        return self._rows


class RecordingConn:
    """Minimal psycopg.Connection stand-in that records term insert order."""

    def __init__(self):
        self.term_order: list[str] = []
        self._next_id = 0

    def execute(self, sql, params=None):
        if "INSERT INTO terms" in sql:
            self.term_order.append(params[0])
            self._next_id += 1
            return FakeCursor((self._next_id,))
        if "SELECT key, value FROM corpus_stats" in sql:
            return FakeCursor(rows=[("total_docs", 0), ("avg_doc_length", 0)])
        return FakeCursor()

    def commit(self):
        pass


def _index(text: str) -> list[str]:
    conn = RecordingConn()
    index_page(conn, page_id=1, title="", body_text=text)
    return conn.term_order


def test_terms_are_inserted_in_sorted_order():
    order = _index("zebra apple mango banana football")
    assert order == sorted(order)


def test_order_is_independent_of_text_order():
    """The whole point: two pages sharing vocabulary must agree on lock order."""
    a = _index("messi barcelona goal record")
    b = _index("record goal barcelona messi")
    assert a == b
    assert a == sorted(a)


def test_repeated_terms_are_inserted_once_each():
    order = _index("goal goal goal messi messi")
    assert len(order) == len(set(order))

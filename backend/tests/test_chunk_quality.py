"""Tables and reference lists must not become retrievable chunks.

There was no gate on chunking at all, so every fragment of a page became a
chunk. Asking "how does var work" returned Paris Saint-Germain season tables
and a citation fragment, while the "Video assistant referee" article, fully
chunked and fully embedded, was nowhere. A vector store full of
"Pos Nat Player Total" cannot answer anything and dilutes what sits beside it.
"""
from rag.chunker import is_useful_chunk

PROSE = (
    "Video assistant referee (VAR) is a match official who reviews decisions "
    "made by the head referee using video footage and a headset. VAR was first "
    "used at the 2018 World Cup and is now standard across most major leagues, "
    "though its use remains contested among supporters and managers alike."
)


def test_prose_is_kept():
    assert is_useful_chunk(PROSE)


def test_squad_tables_are_dropped():
    assert not is_useful_chunk(
        "Pos Nat Player Total Apps Goals 1 FRA Keylor Navas 34 0 2 BRA "
        "Marquinhos 41 3 5 ESP Sergio Ramos 28 2 7 ARG Angel Di Maria 33 6"
    )


def test_score_grids_are_dropped():
    assert not is_useful_chunk(
        "Baggio 79 (pen.) Stadio Olimpico 12 45 3 2 1 0 7 4 2 1 9 12 4 0 3 8 "
        "2 1 15 3 2 0 7 22 4 1 9 3 0 2 11 5"
    )


def test_citation_fragments_are_dropped():
    for bad in (
        '^ "Edicion del dateTime". Retrieved 12 March 2024. Archived from the '
        "original on 3 April 2024. Some more trailing words to clear the floor.",
        "36. ISBN 978-1-58157-114-1. Archived from the original on 10 January "
        "2024. Retrieved 6 November 2015 from the publisher website listing.",
    ):
        assert not is_useful_chunk(bad), bad[:40]


def test_short_fragments_are_dropped():
    assert not is_useful_chunk("Short.")
    assert not is_useful_chunk("")
    assert not is_useful_chunk("   ")
    assert not is_useful_chunk(" ".join(["word"] * 24))


def test_a_chunk_with_no_sentence_is_dropped():
    """A grid of cells has almost no terminal punctuation."""
    assert not is_useful_chunk(" ".join(["Arsenal Chelsea Liverpool Everton"] * 10))


def test_prose_about_numbers_survives():
    """A match report mentions scores. It is still prose."""
    assert is_useful_chunk(
        "Manchester City beat Arsenal 3-1 at the Etihad on Sunday, with Erling "
        "Haaland scoring twice before half time and Phil Foden adding a third "
        "midway through the second half to settle a bad-tempered contest."
    )


def test_the_splitter_applies_the_gate():
    """Both call sites inherit it, so neither can forget."""
    from rag.chunker import _split_into_chunks
    out = _split_into_chunks(PROSE + "\n\n" + "Pos Nat Player 1 2 3 4 5 " * 12)
    assert out, "prose should survive"
    assert all(is_useful_chunk(c) for c in out)

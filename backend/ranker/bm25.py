"""BM25 ranking algorithm.

BM25 (Best Matching 25) scores how relevant a document is to a query.
It's the standard text relevance algorithm — what Google started from.

Formula per query term t in document d:
    score += IDF(t) * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avgdl)))

Where:
    tf    = how many times term t appears in document d
    dl    = document length (total tokens)
    avgdl = average document length across all documents
    k1    = term frequency saturation (1.2 = diminishing returns after a few occurrences)
    b     = length normalization (0.75 = penalize long docs, reward short ones)
    IDF   = how rare the term is across all documents
"""
import math

import psycopg

from config import BM25_K1, BM25_B
from indexer.tokenizer import tokenize


def search_bm25(conn: psycopg.Connection, query: str, k1: float | None = None, b: float | None = None) -> dict[int, float]:
    """Score all matching documents for a query using BM25.

    Returns {page_id: bm25_score} for all documents containing at least one query term.
    Optional k1 and b params allow live tuning from the playground.
    """
    k1 = k1 if k1 is not None else BM25_K1
    b = b if b is not None else BM25_B

    query_terms = tokenize(query)
    if not query_terms:
        return {}

    # Load corpus stats
    stats = dict(conn.execute("SELECT key, value FROM corpus_stats").fetchall())
    total_docs = stats.get("total_docs", 0)
    avg_doc_length = stats.get("avg_doc_length", 1)

    if total_docs == 0:
        return {}

    scores: dict[int, float] = {}

    for term in query_terms:
        # Look up term ID
        row = conn.execute("SELECT id FROM terms WHERE term = %s", (term,)).fetchone()
        if row is None:
            continue  # term not in index
        term_id = row[0]

        # Get document frequency (how many docs contain this term)
        df = conn.execute(
            "SELECT COUNT(*) FROM postings WHERE term_id = %s", (term_id,)
        ).fetchone()[0]

        # IDF: how rare is this term? Rarer terms = higher weight
        idf = math.log((total_docs - df + 0.5) / (df + 0.5) + 1)

        # Get all postings for this term (which docs contain it, how often)
        postings = conn.execute(
            """SELECT p.page_id, p.term_freq, d.doc_length
               FROM postings p
               JOIN doc_stats d ON p.page_id = d.page_id
               WHERE p.term_id = %s""",
            (term_id,),
        ).fetchall()

        for page_id, tf, doc_length in postings:
            # BM25 formula
            numerator = tf * (k1 + 1)
            denominator = tf + k1 * (1 - b + b * (doc_length / avg_doc_length))
            term_score = idf * (numerator / denominator)

            scores[page_id] = scores.get(page_id, 0) + term_score

    return scores

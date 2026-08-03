"""BM25F ranking algorithm.

BM25F extends BM25 with field-weighted term frequencies. A match in
the title is worth more than a match in the body, because titles are
strong relevance signals.

Formula per query term t in document d:
    tf_weighted = W_TITLE * title_freq + W_BODY * body_freq
    score += IDF(t) * (tf_weighted * (k1 + 1)) / (tf_weighted + k1 * (1 - b + b * (dl / avgdl)))

Where:
    W_TITLE = 4.0 (title matches count 4x)
    W_BODY  = 1.0 (body matches count 1x)
    dl      = document length (total tokens)
    avgdl   = average document length across all documents
    k1, b   = standard BM25 parameters
    IDF     = how rare the term is across all documents
"""
import math

import psycopg

from config import BM25_B, BM25_K1
from indexer.tokenizer import tokenize

# Field weights for BM25F — title matches are far more relevant
TITLE_WEIGHT = 4.0
BODY_WEIGHT = 1.0

# One statement for every query term. The previous version issued three
# round-trips per term (term id, COUNT(*) for df, then postings); the window
# function computes df in the same pass.
_POSTINGS_SQL = """
SELECT t.term,
       p.page_id,
       p.term_freq,
       p.title_freq,
       p.body_freq,
       d.doc_length,
       COUNT(*) OVER (PARTITION BY p.term_id) AS doc_freq
FROM terms t
JOIN postings p ON p.term_id = t.id
JOIN doc_stats d ON d.page_id = p.page_id
WHERE t.term = ANY(%s)
"""


def search_bm25(
    conn: psycopg.Connection,
    query: str,
    k1: float | None = None,
    b: float | None = None,
) -> dict[int, float]:
    """Score all matching documents for a query using BM25F.

    Returns {page_id: score} for every document containing at least one query
    term. Optional k1/b allow live tuning from the playground.
    """
    k1 = k1 if k1 is not None else BM25_K1
    b = b if b is not None else BM25_B

    query_terms = tokenize(query)
    if not query_terms:
        return {}

    stats = dict(conn.execute("SELECT key, value FROM corpus_stats").fetchall())
    total_docs = stats.get("total_docs", 0)
    avg_doc_length = stats.get("avg_doc_length", 1) or 1

    if not total_docs:
        return {}

    rows = conn.execute(_POSTINGS_SQL, (list(set(query_terms)),)).fetchall()

    # A term repeated in the query should count once per occurrence.
    term_counts: dict[str, int] = {}
    for term in query_terms:
        term_counts[term] = term_counts.get(term, 0) + 1

    idf_cache: dict[str, float] = {}
    scores: dict[int, float] = {}

    for term, page_id, tf, title_freq, body_freq, doc_length, doc_freq in rows:
        idf = idf_cache.get(term)
        if idf is None:
            idf = math.log((total_docs - doc_freq + 0.5) / (doc_freq + 0.5) + 1)
            idf_cache[term] = idf

        if title_freq > 0 or body_freq > 0:
            tf_weighted = TITLE_WEIGHT * title_freq + BODY_WEIGHT * body_freq
        else:
            tf_weighted = float(tf)  # fallback for old rows without field freqs

        numerator = tf_weighted * (k1 + 1)
        denominator = tf_weighted + k1 * (1 - b + b * (doc_length / avg_doc_length))
        term_score = idf * (numerator / denominator) * term_counts.get(term, 1)

        scores[page_id] = scores.get(page_id, 0.0) + term_score

    return scores

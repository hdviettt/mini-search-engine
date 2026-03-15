"""Build the inverted index from crawled pages."""
import io
from collections import Counter

import psycopg

from indexer.tokenizer import tokenize


def build_index(conn: psycopg.Connection):
    """Build inverted index from all pages in the database.

    Uses COPY for bulk loading — orders of magnitude faster than INSERT.
    """
    print("Building inverted index...")

    # Clear existing index
    conn.execute("DELETE FROM postings")
    conn.execute("DELETE FROM terms")
    conn.execute("DELETE FROM doc_stats")
    conn.execute("DELETE FROM corpus_stats")
    conn.commit()

    # Load all pages
    pages = conn.execute("SELECT id, title, body_text FROM pages").fetchall()
    print(f"  Indexing {len(pages)} pages...")

    # Phase 1: Tokenize everything in memory
    all_terms: set[str] = set()
    page_data: list[tuple[int, Counter]] = []
    doc_lengths: list[tuple[int, int]] = []
    total_doc_length = 0

    for i, (page_id, title, body_text) in enumerate(pages):
        text = (title or "") + " " + (body_text or "")
        tokens = tokenize(text)
        doc_length = len(tokens)
        total_doc_length += doc_length

        term_counts = Counter(tokens)
        page_data.append((page_id, term_counts))
        doc_lengths.append((page_id, doc_length))
        all_terms.update(term_counts.keys())

        if (i + 1) % 100 == 0:
            print(f"    Tokenized {i + 1}/{len(pages)} pages...")

    print(f"  {len(all_terms)} unique terms found.")

    # Phase 2: Bulk insert terms using COPY
    print("  Inserting terms...")
    terms_buf = io.StringIO()
    for term in all_terms:
        # Escape tabs and newlines for COPY format
        safe_term = term.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n")
        terms_buf.write(f"{safe_term}\n")
    terms_buf.seek(0)

    cur = conn.cursor()
    with cur.copy("COPY terms (term) FROM STDIN") as copy:
        for line in terms_buf:
            copy.write(line.encode())
    conn.commit()

    # Load term -> id mapping
    term_to_id = {}
    for row in conn.execute("SELECT id, term FROM terms").fetchall():
        term_to_id[row[1]] = row[0]

    # Phase 3: Bulk insert doc_stats using COPY
    print("  Inserting doc stats...")
    stats_buf = io.StringIO()
    for page_id, doc_length in doc_lengths:
        stats_buf.write(f"{page_id}\t{doc_length}\n")
    stats_buf.seek(0)

    with cur.copy("COPY doc_stats (page_id, doc_length) FROM STDIN") as copy:
        for line in stats_buf:
            copy.write(line.encode())
    conn.commit()

    # Phase 4: Bulk insert postings using COPY
    print("  Inserting postings...")
    postings_buf = io.StringIO()
    postings_count = 0
    for page_id, term_counts in page_data:
        for term, freq in term_counts.items():
            term_id = term_to_id[term]
            postings_buf.write(f"{term_id}\t{page_id}\t{freq}\n")
            postings_count += 1
    postings_buf.seek(0)

    with cur.copy("COPY postings (term_id, page_id, term_freq) FROM STDIN") as copy:
        for line in postings_buf:
            copy.write(line.encode())
    conn.commit()

    # Phase 5: Corpus stats
    num_docs = len(pages)
    avg_doc_length = total_doc_length / num_docs if num_docs > 0 else 0

    conn.execute(
        "INSERT INTO corpus_stats (key, value) VALUES ('total_docs', %s) ON CONFLICT (key) DO UPDATE SET value = %s",
        (num_docs, num_docs),
    )
    conn.execute(
        "INSERT INTO corpus_stats (key, value) VALUES ('avg_doc_length', %s) ON CONFLICT (key) DO UPDATE SET value = %s",
        (avg_doc_length, avg_doc_length),
    )
    conn.commit()
    cur.close()

    print(f"  {len(term_to_id)} unique terms indexed.")
    print(f"  {postings_count} postings created.")
    print(f"  Avg document length: {avg_doc_length:.0f} tokens.")
    print("Index built.")

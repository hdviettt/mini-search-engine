"""Build the inverted index from crawled pages."""
import io
from collections import Counter

import psycopg

from indexer.tokenizer import tokenize


def index_page(conn: psycopg.Connection, page_id: int, title: str, body_text: str):
    """Index a single page incrementally — called right after crawling.

    1. Remove old postings/doc_stats for this page
    2. Tokenize title + body
    3. Upsert terms (ON CONFLICT)
    4. Insert postings with per-field frequencies
    5. Incrementally update corpus_stats
    """
    title = title or ""
    body_text = body_text or ""

    # Phase 1: Remove old data for this page
    old_doc = conn.execute(
        "SELECT doc_length FROM doc_stats WHERE page_id = %s", (page_id,)
    ).fetchone()
    old_doc_length = old_doc[0] if old_doc else 0

    conn.execute("DELETE FROM postings WHERE page_id = %s", (page_id,))
    conn.execute("DELETE FROM doc_stats WHERE page_id = %s", (page_id,))

    # Phase 2: Tokenize
    title_tokens = tokenize(title)
    body_tokens = tokenize(body_text)
    all_tokens = title_tokens + body_tokens
    doc_length = len(all_tokens)

    if doc_length == 0:
        # Empty page — update corpus stats and return
        _update_corpus_stats_remove(conn, old_doc_length) if old_doc else None
        conn.commit()
        return

    all_counts = Counter(all_tokens)
    title_counts = Counter(title_tokens)
    body_counts = Counter(body_tokens)

    # Phase 3: Upsert terms — get_or_create with ON CONFLICT
    term_ids = {}
    for term in all_counts:
        row = conn.execute(
            "INSERT INTO terms (term) VALUES (%s) ON CONFLICT (term) DO UPDATE SET term = EXCLUDED.term RETURNING id",
            (term,),
        ).fetchone()
        term_ids[term] = row[0]

    # Phase 4: Insert postings and doc_stats
    for term, freq in all_counts.items():
        conn.execute(
            """INSERT INTO postings (term_id, page_id, term_freq, title_freq, body_freq)
               VALUES (%s, %s, %s, %s, %s)""",
            (term_ids[term], page_id, freq, title_counts.get(term, 0), body_counts.get(term, 0)),
        )

    conn.execute(
        "INSERT INTO doc_stats (page_id, doc_length) VALUES (%s, %s)",
        (page_id, doc_length),
    )

    # Phase 5: Incrementally update corpus_stats
    _update_corpus_stats_incremental(conn, old_doc_length if old_doc else None, doc_length)

    conn.commit()


def _update_corpus_stats_incremental(conn, old_doc_length: int | None, new_doc_length: int):
    """Update total_docs and avg_doc_length incrementally.

    If old_doc_length is None, this is a new page (total_docs += 1).
    If old_doc_length is set, this is a re-index (total_docs unchanged).
    """
    stats = {}
    for row in conn.execute("SELECT key, value FROM corpus_stats").fetchall():
        stats[row[0]] = row[1]

    total_docs = stats.get("total_docs", 0)
    avg_dl = stats.get("avg_doc_length", 0)
    total_length = avg_dl * total_docs

    if old_doc_length is None:
        # New page
        total_length += new_doc_length
        total_docs += 1
    else:
        # Re-index: swap old length for new
        total_length = total_length - old_doc_length + new_doc_length

    new_avg = total_length / total_docs if total_docs > 0 else 0

    conn.execute(
        "INSERT INTO corpus_stats (key, value) VALUES ('total_docs', %s) ON CONFLICT (key) DO UPDATE SET value = %s",
        (total_docs, total_docs),
    )
    conn.execute(
        "INSERT INTO corpus_stats (key, value) VALUES ('avg_doc_length', %s) ON CONFLICT (key) DO UPDATE SET value = %s",
        (new_avg, new_avg),
    )


def _update_corpus_stats_remove(conn, old_doc_length: int):
    """Remove a page's contribution from corpus_stats (page became empty)."""
    stats = {}
    for row in conn.execute("SELECT key, value FROM corpus_stats").fetchall():
        stats[row[0]] = row[1]

    total_docs = stats.get("total_docs", 0)
    avg_dl = stats.get("avg_doc_length", 0)
    total_length = avg_dl * total_docs

    total_length -= old_doc_length
    total_docs = max(0, total_docs - 1)
    new_avg = total_length / total_docs if total_docs > 0 else 0

    conn.execute(
        "INSERT INTO corpus_stats (key, value) VALUES ('total_docs', %s) ON CONFLICT (key) DO UPDATE SET value = %s",
        (total_docs, total_docs),
    )
    conn.execute(
        "INSERT INTO corpus_stats (key, value) VALUES ('avg_doc_length', %s) ON CONFLICT (key) DO UPDATE SET value = %s",
        (new_avg, new_avg),
    )


def build_index(conn: psycopg.Connection, progress_callback=None):
    """Build inverted index from all pages in the database.

    Uses COPY for bulk loading — orders of magnitude faster than INSERT.
    """
    print("Building inverted index...")

    # Ensure BM25F columns exist (migration for existing databases)
    try:
        conn.execute("ALTER TABLE postings ADD COLUMN IF NOT EXISTS title_freq INTEGER NOT NULL DEFAULT 0")
        conn.execute("ALTER TABLE postings ADD COLUMN IF NOT EXISTS body_freq INTEGER NOT NULL DEFAULT 0")
        conn.commit()
    except Exception:
        conn.rollback()

    # Clear existing index
    conn.execute("DELETE FROM postings")
    conn.execute("DELETE FROM terms")
    conn.execute("DELETE FROM doc_stats")
    conn.execute("DELETE FROM corpus_stats")
    conn.commit()

    # Load all pages
    pages = conn.execute("SELECT id, title, body_text FROM pages").fetchall()
    print(f"  Indexing {len(pages)} pages...")

    # Phase 1: Tokenize everything in memory (title and body separately for BM25F)
    all_terms: set[str] = set()
    page_data: list[tuple[int, Counter, Counter, Counter]] = []  # (page_id, all_counts, title_counts, body_counts)
    doc_lengths: list[tuple[int, int]] = []
    total_doc_length = 0

    for i, (page_id, title, body_text) in enumerate(pages):
        title_tokens = tokenize(title or "")
        body_tokens = tokenize(body_text or "")
        all_tokens = title_tokens + body_tokens
        doc_length = len(all_tokens)
        total_doc_length += doc_length

        all_counts = Counter(all_tokens)
        title_counts = Counter(title_tokens)
        body_counts = Counter(body_tokens)
        page_data.append((page_id, all_counts, title_counts, body_counts))
        doc_lengths.append((page_id, doc_length))
        all_terms.update(all_counts.keys())

        if (i + 1) % 100 == 0:
            print(f"    Tokenized {i + 1}/{len(pages)} pages...")

        if progress_callback and (i + 1) % 10 == 0:
            sample_tokens = list(all_counts.keys())[:8]
            progress_callback({
                "phase": "tokenizing",
                "page_id": page_id,
                "title": (title or "")[:60],
                "tokens_sample": sample_tokens,
                "token_count": doc_length,
                "pages_done": i + 1,
                "pages_total": len(pages),
                "unique_terms": len(all_terms),
            })

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

    # Phase 4: Bulk insert postings using COPY (with per-field frequencies for BM25F)
    print("  Inserting postings...")
    postings_buf = io.StringIO()
    postings_count = 0
    for page_id, all_counts, title_counts, body_counts in page_data:
        for term, freq in all_counts.items():
            term_id = term_to_id[term]
            t_freq = title_counts.get(term, 0)
            b_freq = body_counts.get(term, 0)
            postings_buf.write(f"{term_id}\t{page_id}\t{freq}\t{t_freq}\t{b_freq}\n")
            postings_count += 1
    postings_buf.seek(0)

    with cur.copy("COPY postings (term_id, page_id, term_freq, title_freq, body_freq) FROM STDIN") as copy:
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

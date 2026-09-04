"""Remove Wikipedia non-article pages (Help:, File:, Category:, …) from the index.

The crawler now rejects these at discovery, but pages crawled before that fix
are still in the database, and they are not harmless: every article links to
them, so they accumulate enormous in-degree and dominate PageRank. Before this
ran, the three most authoritative pages in the index were Help:Category,
Wikipedia:Protection policy and File:Commons-logo.svg — "Association football"
was fourth.

They are deleted outright rather than tombstoned. A tombstone still holds a
`pages` row, and `compute_pagerank` scores every row in that table, so a
tombstone would keep absorbing authority. Deleting is safe now that
`_is_wikipedia_meta_page` stops them being re-crawled.

    python scripts/purge_wiki_meta.py --dry-run   # count first
    python scripts/purge_wiki_meta.py             # then delete and recompute
"""
import sys

sys.path.insert(0, sys.path[0] + "/..")

import argparse

from crawler.manager import _is_wikipedia_citation_page
from db import get_connection
from ranker.pagerank import compute_pagerank

# Matches "/wiki/Namespace:Title" and its %3A-encoded and _talk variants.
META_URL_PATTERN = (
    r"/wiki/(Help|Wikipedia|File|Category|Template|Portal|Special|Draft|Talk|User"
    r"|MediaWiki|Module|Book|TimedText|Image)(_talk)?(:|%3A)"
)


def _referencing_columns(conn) -> list[tuple[str, str]]:
    """Every (table, column) with a foreign key onto pages(id).

    Read from the catalogue so the purge cannot be defeated by a table the
    repository's schema does not know about.
    """
    rows = conn.execute(
        """SELECT c.conrelid::regclass::text AS table_name,
                  a.attname                  AS column_name
           FROM pg_constraint c
           JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
           WHERE c.contype = 'f'
             AND c.confrelid = 'pages'::regclass
           ORDER BY table_name, column_name"""
    ).fetchall()
    return [(t, col) for t, col in rows]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="report what would be deleted, change nothing")
    args = parser.parse_args()

    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, url FROM pages WHERE domain = 'en.wikipedia.org' AND url ~ %s",
            (META_URL_PATTERN,),
        ).fetchall()
        # Citation-identifier articles live in the article namespace, so the URL
        # pattern above cannot see them. Match them by title instead.
        citation_rows = [
            (pid, url)
            for pid, url in conn.execute(
                "SELECT id, url FROM pages WHERE domain = 'en.wikipedia.org'"
            ).fetchall()
            if _is_wikipedia_citation_page(url)
        ]
        rows = rows + citation_rows
        page_ids = [r[0] for r in rows]
        total = conn.execute("SELECT COUNT(*) FROM pages").fetchone()[0]

        print(f"{len(page_ids)} meta pages of {total} total ({len(page_ids) / max(total, 1):.1%})")
        for _, url in rows[:10]:
            print(f"  {url}")
        if len(rows) > 10:
            print(f"  ... and {len(rows) - 10} more")

        if not page_ids:
            print("Nothing to do.")
            return

        if args.dry_run:
            print("\nDry run — nothing deleted.")
            return

        # Everything referencing pages(id) goes first. The dependants are read
        # from pg_constraint rather than hardcoded: production carries tables
        # this repo's db.py does not define (page_entities, entity_attributes,
        # entity_relationships), and a hardcoded list silently missed them —
        # the delete failed on a foreign key after doing most of its work.
        for table, column in _referencing_columns(conn):
            cur = conn.execute(f'DELETE FROM "{table}" WHERE "{column}" = ANY(%s)', (page_ids,))
            print(f"  deleted {cur.rowcount:>7} from {table}.{column}")

        cur = conn.execute("DELETE FROM crawl_queue WHERE url ~ %s", (META_URL_PATTERN,))
        queued_meta = cur.rowcount
        queued_citation = [
            qid
            for qid, url in conn.execute(
                "SELECT id, url FROM crawl_queue WHERE url LIKE '%%en.wikipedia.org%%'"
            ).fetchall()
            if _is_wikipedia_citation_page(url)
        ]
        if queued_citation:
            conn.execute("DELETE FROM crawl_queue WHERE id = ANY(%s)", (queued_citation,))
        print(f"  deleted {queued_meta + len(queued_citation):>7} from crawl_queue")

        cur = conn.execute("DELETE FROM pages WHERE id = ANY(%s)", (page_ids,))
        print(f"  deleted {cur.rowcount:>7} pages")
        conn.commit()

        # corpus_stats holds total_docs and avg_doc_length, which the deletes
        # above invalidate. Recompute from what is actually left.
        conn.execute(
            """INSERT INTO corpus_stats (key, value)
               VALUES ('total_docs', (SELECT COUNT(*) FROM doc_stats))
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"""
        )
        conn.execute(
            """INSERT INTO corpus_stats (key, value)
               VALUES ('avg_doc_length', (SELECT COALESCE(AVG(doc_length), 0) FROM doc_stats))
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"""
        )
        conn.commit()
        print("  corpus_stats recomputed")

        print("\nRecomputing PageRank over the cleaned graph...")
        compute_pagerank(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()

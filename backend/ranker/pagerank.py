"""PageRank algorithm.

PageRank scores a page's authority based on who links to it.
The core idea: a page is important if important pages link to it.

Algorithm:
    1. Start: every page gets equal rank (1/N)
    2. Each iteration: a page's new rank =
       (1-d)/N + d * SUM(rank[linker] / outlinks[linker])
       for every page that links to it
    3. Repeat until scores converge (~20 iterations)

Where d = damping factor (0.85) = probability a random surfer follows a link
instead of jumping to a random page.
"""
import logging

import psycopg

from config import PAGERANK_DAMPING, PAGERANK_ITERATIONS

log = logging.getLogger(__name__)


def compute_pagerank(
    conn: psycopg.Connection,
    damping: float | None = None,
    iterations: int | None = None,
) -> None:
    """Compute PageRank for all pages and store the results."""
    log.info("Computing PageRank...")

    page_ids = [row[0] for row in conn.execute("SELECT id FROM pages").fetchall()]
    n = len(page_ids)

    if n == 0:
        log.info("No pages to rank.")
        return

    page_set = set(page_ids)

    # Link graph, restricted to pages we have actually crawled.
    outlinks: dict[int, list[int]] = {pid: [] for pid in page_ids}
    inlinks: dict[int, list[int]] = {pid: [] for pid in page_ids}

    rows = conn.execute(
        """SELECT DISTINCT l.source_id, p.id
           FROM links l
           JOIN pages p ON p.url = l.target_url
           WHERE l.source_id IN (SELECT id FROM pages)"""
    ).fetchall()

    for source_id, target_id in rows:
        if source_id in page_set and target_id in page_set:
            outlinks[source_id].append(target_id)
            inlinks[target_id].append(source_id)

    log.info("%d pages, %d links in graph.", n, len(rows))

    # Precompute out-degrees and the dangling set once instead of per iteration.
    out_degree = {pid: len(targets) for pid, targets in outlinks.items()}
    dangling = [pid for pid, deg in out_degree.items() if deg == 0]

    d = damping if damping is not None else PAGERANK_DAMPING
    num_iterations = iterations if iterations is not None else PAGERANK_ITERATIONS

    rank = {pid: 1.0 / n for pid in page_ids}

    for _ in range(num_iterations):
        dangling_sum = sum(rank[pid] for pid in dangling)
        base = (1 - d) / n + d * dangling_sum / n

        new_rank = {}
        for pid in page_ids:
            r = base
            for linker in inlinks[pid]:
                r += d * rank[linker] / out_degree[linker]
            new_rank[pid] = r
        rank = new_rank

    # One round-trip instead of one INSERT per page.
    conn.execute("DELETE FROM pagerank")
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO pagerank (page_id, score) VALUES (%s, %s)",
            list(rank.items()),
        )
    conn.commit()

    if log.isEnabledFor(logging.INFO):
        top = sorted(rank.items(), key=lambda kv: kv[1], reverse=True)[:10]
        titles = dict(
            conn.execute(
                "SELECT id, title FROM pages WHERE id = ANY(%s)", ([pid for pid, _ in top],)
            ).fetchall()
        )
        log.info("Top 10 pages by PageRank:")
        for pid, score in top:
            log.info("  %.6f  %s", score, (titles.get(pid) or "")[:60])

    log.info("PageRank computed.")

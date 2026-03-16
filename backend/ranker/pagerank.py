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
import psycopg

from config import PAGERANK_DAMPING, PAGERANK_ITERATIONS


def compute_pagerank(conn: psycopg.Connection, damping: float = None, iterations: int = None):
    """Compute PageRank for all pages and store results."""
    print("Computing PageRank...")

    # Load all page IDs
    page_ids = [row[0] for row in conn.execute("SELECT id FROM pages").fetchall()]
    n = len(page_ids)

    if n == 0:
        print("  No pages to rank.")
        return

    page_set = set(page_ids)

    # Build link graph: page_id -> list of pages it links TO
    # Only count links where both source and target are in our crawled pages
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

    print(f"  {n} pages, {len(rows)} links in graph.")

    # Initialize ranks equally
    rank = {pid: 1.0 / n for pid in page_ids}

    # Iterative computation — use provided values or fall back to config defaults
    d = damping if damping is not None else PAGERANK_DAMPING
    num_iterations = iterations if iterations is not None else PAGERANK_ITERATIONS
    for i in range(num_iterations):
        new_rank = {}

        # Handle dangling nodes (pages with no outlinks)
        # Their rank gets distributed evenly across all pages
        dangling_sum = sum(rank[pid] for pid in page_ids if len(outlinks[pid]) == 0)

        for pid in page_ids:
            # Base rank (random jump)
            r = (1 - d) / n

            # Dangling node contribution
            r += d * dangling_sum / n

            # Contribution from pages linking to this page
            for linker in inlinks[pid]:
                r += d * rank[linker] / len(outlinks[linker])

            new_rank[pid] = r

        rank = new_rank

    # Store results
    conn.execute("DELETE FROM pagerank")
    for pid, score in rank.items():
        conn.execute(
            "INSERT INTO pagerank (page_id, score) VALUES (%s, %s)",
            (pid, score),
        )
    conn.commit()

    # Show top 10
    top = sorted(rank.items(), key=lambda x: x[1], reverse=True)[:10]
    print("  Top 10 pages by PageRank:")
    for pid, score in top:
        title = conn.execute("SELECT title FROM pages WHERE id = %s", (pid,)).fetchone()[0]
        print(f"    {score:.6f}  {title[:60]}")

    print("PageRank computed.")

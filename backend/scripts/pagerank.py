"""Compute PageRank scores for all crawled pages."""
import sys
sys.path.insert(0, sys.path[0] + "/..")

from db import get_connection
from ranker.pagerank import compute_pagerank


def main():
    conn = get_connection()
    compute_pagerank(conn)
    conn.close()


if __name__ == "__main__":
    main()

"""Build the inverted index from crawled pages."""
import sys
sys.path.insert(0, sys.path[0] + "/..")

from db import get_connection
from indexer.indexer import build_index


def main():
    conn = get_connection()
    build_index(conn)
    conn.close()


if __name__ == "__main__":
    main()

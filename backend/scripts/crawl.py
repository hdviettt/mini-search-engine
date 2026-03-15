"""Run the crawler. Seeds the queue if empty, then crawls."""
import sys
sys.path.insert(0, sys.path[0] + "/..")

from config import SEED_URLS
from db import get_connection, init_db
from crawler.manager import CrawlManager


def main():
    init_db()
    conn = get_connection()

    manager = CrawlManager(conn)

    # Seed if queue is empty
    queue_count = conn.execute(
        "SELECT COUNT(*) FROM crawl_queue"
    ).fetchone()[0]

    if queue_count == 0:
        print("Empty queue — seeding with initial URLs...")
        manager.seed(SEED_URLS)

    manager.crawl()
    conn.close()


if __name__ == "__main__":
    main()

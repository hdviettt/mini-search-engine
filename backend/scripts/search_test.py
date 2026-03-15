"""Test search queries from the command line."""
import sys
sys.path.insert(0, sys.path[0] + "/..")

from db import get_connection
from search.engine import search


def main():
    conn = get_connection()

    queries = [
        "search engine optimization",
        "robots.txt",
        "PageRank algorithm",
        "digital marketing",
        "geotargeting",
    ]

    for query in queries:
        print(f'\n{"=" * 60}')
        print(f'Query: "{query}"')
        print("=" * 60)
        result = search(conn, query)
        print(f"  {result['total_results']} results in {result['time_ms']:.1f}ms\n")
        for i, r in enumerate(result["results"][:5], 1):
            print(f"  {i}. {r.title[:55]}")
            print(f"     Score: {r.final_score} (BM25: {r.bm25_score}, PR: {r.pagerank_score})")
            print(f"     {r.snippet[:80]}...")
            print()

    conn.close()


if __name__ == "__main__":
    main()

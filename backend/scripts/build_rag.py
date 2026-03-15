"""Build the RAG pipeline: chunk pages and generate embeddings."""
import sys
sys.path.insert(0, sys.path[0] + "/..")

from db import get_connection
from rag.chunker import chunk_all_pages
from rag.embedder import embed_all_chunks


def main():
    conn = get_connection()
    chunk_all_pages(conn)
    embed_all_chunks(conn)
    conn.close()


if __name__ == "__main__":
    main()

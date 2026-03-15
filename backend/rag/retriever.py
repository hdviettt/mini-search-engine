"""Hybrid retrieval: combine vector search + BM25 keyword search."""
import psycopg

from rag.embedder import embed_query
from ranker.bm25 import search_bm25


def vector_search(conn: psycopg.Connection, query_embedding: list[float], top_k: int = 10) -> list[dict]:
    """Find the most similar chunks using cosine distance."""
    rows = conn.execute(
        """SELECT c.id, c.page_id, c.content, c.chunk_idx,
                  1 - (c.embedding <=> %s::vector) as similarity,
                  p.title, p.url
           FROM chunks c
           JOIN pages p ON c.page_id = p.id
           WHERE c.embedding IS NOT NULL
           ORDER BY c.embedding <=> %s::vector
           LIMIT %s""",
        (str(query_embedding), str(query_embedding), top_k),
    ).fetchall()

    return [
        {
            "chunk_id": row[0],
            "page_id": row[1],
            "content": row[2],
            "chunk_idx": row[3],
            "similarity": row[4],
            "title": row[5],
            "url": row[6],
        }
        for row in rows
    ]


def hybrid_retrieve(conn: psycopg.Connection, queries: list[str], top_k: int = 8) -> list[dict]:
    """Combine vector search (from multiple fan-out queries) with BM25 keyword search.

    Returns deduplicated chunks ranked by combined score.
    """
    # --- Vector search across all fan-out queries ---
    vector_results: dict[int, dict] = {}  # chunk_id -> result

    for query in queries:
        embedding = embed_query(query)
        if embedding is None:
            continue

        chunks = vector_search(conn, embedding, top_k=10)
        for chunk in chunks:
            cid = chunk["chunk_id"]
            if cid not in vector_results or chunk["similarity"] > vector_results[cid]["similarity"]:
                vector_results[cid] = chunk

    # --- BM25 keyword search (page-level) ---
    # Use the original query (first in list) for keyword search
    bm25_scores = search_bm25(conn, queries[0])

    # Get chunks from top BM25 pages
    bm25_page_ids = sorted(bm25_scores, key=bm25_scores.get, reverse=True)[:10]

    bm25_chunks: dict[int, dict] = {}
    if bm25_page_ids:
        placeholders = ",".join(["%s"] * len(bm25_page_ids))
        rows = conn.execute(
            f"""SELECT c.id, c.page_id, c.content, c.chunk_idx, p.title, p.url
                FROM chunks c
                JOIN pages p ON c.page_id = p.id
                WHERE c.page_id IN ({placeholders})
                ORDER BY c.page_id, c.chunk_idx""",
            bm25_page_ids,
        ).fetchall()

        for row in rows:
            cid = row[0]
            bm25_chunks[cid] = {
                "chunk_id": cid,
                "page_id": row[1],
                "content": row[2],
                "chunk_idx": row[3],
                "title": row[4],
                "url": row[5],
                "bm25_page_score": bm25_scores.get(row[1], 0),
            }

    # --- Merge and score ---
    all_chunk_ids = set(vector_results.keys()) | set(bm25_chunks.keys())
    merged = []

    # Normalize vector similarities
    max_sim = max((r["similarity"] for r in vector_results.values()), default=1)
    min_sim = min((r["similarity"] for r in vector_results.values()), default=0)
    sim_spread = max_sim - min_sim if max_sim != min_sim else 1

    # Normalize BM25 page scores
    max_bm25 = max((r["bm25_page_score"] for r in bm25_chunks.values()), default=1)
    min_bm25 = min((r["bm25_page_score"] for r in bm25_chunks.values()), default=0)
    bm25_spread = max_bm25 - min_bm25 if max_bm25 != min_bm25 else 1

    for cid in all_chunk_ids:
        vec = vector_results.get(cid)
        bm = bm25_chunks.get(cid)

        # Normalized scores (0-1)
        vec_score = (vec["similarity"] - min_sim) / sim_spread if vec else 0
        bm_score = (bm["bm25_page_score"] - min_bm25) / bm25_spread if bm else 0

        # Combined: 60% vector + 40% keyword
        combined = 0.6 * vec_score + 0.4 * bm_score

        # Use whichever result has the data
        chunk_data = vec or bm
        chunk_data["vector_score"] = vec_score
        chunk_data["keyword_score"] = bm_score
        chunk_data["combined_score"] = combined

        merged.append(chunk_data)

    # Sort by combined score, deduplicate by page_id (keep best chunk per page)
    merged.sort(key=lambda x: x["combined_score"], reverse=True)

    seen_pages = set()
    deduped = []
    for chunk in merged:
        if chunk["page_id"] not in seen_pages:
            seen_pages.add(chunk["page_id"])
            deduped.append(chunk)
        if len(deduped) >= top_k:
            break

    return deduped

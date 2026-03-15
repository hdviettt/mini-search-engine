"""Generate embeddings using Ollama (nomic-embed-text) with batching."""
import httpx
import psycopg

OLLAMA_BASE_URL = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"
BATCH_SIZE = 50


def _get_embeddings_batch(texts: list[str]) -> list[list[float]] | None:
    """Get embedding vectors for multiple texts in one request."""
    try:
        response = httpx.post(
            f"{OLLAMA_BASE_URL}/api/embed",
            json={"model": EMBED_MODEL, "input": texts},
            timeout=120,
        )
        response.raise_for_status()
        return response.json()["embeddings"]
    except Exception as e:
        print(f"  Batch embedding error: {e}")
        return None


def embed_query(text: str) -> list[float] | None:
    """Get embedding for a single search query."""
    result = _get_embeddings_batch([text])
    return result[0] if result else None


def embed_all_chunks(conn: psycopg.Connection):
    """Generate embeddings for all chunks that don't have one yet, using batched requests."""
    print("Generating embeddings (batched)...")

    chunks = conn.execute(
        "SELECT id, content FROM chunks WHERE embedding IS NULL ORDER BY id"
    ).fetchall()

    print(f"  {len(chunks)} chunks to embed (batch size {BATCH_SIZE})...")

    for batch_start in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[batch_start:batch_start + BATCH_SIZE]
        texts = [content[:1500] for _, content in batch]
        ids = [chunk_id for chunk_id, _ in batch]

        embeddings = _get_embeddings_batch(texts)
        if embeddings is None:
            continue

        for chunk_id, embedding in zip(ids, embeddings):
            conn.execute(
                "UPDATE chunks SET embedding = %s::vector WHERE id = %s",
                (str(embedding), chunk_id),
            )

        conn.commit()
        done = min(batch_start + BATCH_SIZE, len(chunks))
        print(f"  Embedded {done}/{len(chunks)} chunks...")

    embedded_count = conn.execute(
        "SELECT COUNT(*) FROM chunks WHERE embedding IS NOT NULL"
    ).fetchone()[0]
    print(f"  {embedded_count} chunks have embeddings.")
    print("Embedding complete.")

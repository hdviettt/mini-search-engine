"""Generate embeddings using Voyage API."""
import httpx
import psycopg

from config import VOYAGE_API_KEY, VOYAGE_MODEL

BATCH_SIZE = 50
VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"

# Fallback to Ollama if no Voyage key
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "nomic-embed-text"


def _embed_voyage(texts: list[str], input_type: str = "document") -> list[list[float]] | None:
    """Get embeddings from Voyage API."""
    if not VOYAGE_API_KEY:
        return None
    try:
        response = httpx.post(
            VOYAGE_URL,
            headers={"Authorization": f"Bearer {VOYAGE_API_KEY}"},
            json={"model": VOYAGE_MODEL, "input": texts, "input_type": input_type},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        return [item["embedding"] for item in data["data"]]
    except Exception as e:
        print(f"  Voyage embed error: {e}")
        return None


def _embed_ollama(texts: list[str]) -> list[list[float]] | None:
    """Fallback: get embeddings from local Ollama."""
    try:
        response = httpx.post(
            f"{OLLAMA_BASE_URL}/api/embed",
            json={"model": OLLAMA_MODEL, "input": texts},
            timeout=120,
        )
        response.raise_for_status()
        return response.json()["embeddings"]
    except Exception as e:
        print(f"  Ollama embed error: {e}")
        return None


def _get_embeddings_batch(texts: list[str], input_type: str = "document") -> list[list[float]] | None:
    """Get embeddings — Voyage first, Ollama fallback."""
    result = _embed_voyage(texts, input_type)
    if result:
        return result
    return _embed_ollama(texts)


def embed_query(text: str) -> list[float] | None:
    """Get embedding for a single search query."""
    result = _get_embeddings_batch([text], input_type="query")
    return result[0] if result else None


def embed_queries(texts: list[str]) -> list[list[float] | None]:
    """Get embeddings for multiple search queries in one batch."""
    result = _get_embeddings_batch(texts, input_type="query")
    if result and len(result) == len(texts):
        return result
    return [None] * len(texts)


def _ensure_vector_dimension(conn: psycopg.Connection, dim: int):
    """Ensure the embedding column matches the expected dimension. Re-creates if needed."""
    try:
        # Check current dimension by looking at a sample
        row = conn.execute("SELECT embedding FROM chunks WHERE embedding IS NOT NULL LIMIT 1").fetchone()
        if row and row[0]:
            current_dim = len(row[0]) if isinstance(row[0], (list, tuple)) else None
            # If using pgvector, dimension is encoded in the type
            if current_dim and current_dim != dim:
                print(f"  Dimension mismatch: stored={current_dim}, needed={dim}. Clearing old embeddings...")
                conn.execute("UPDATE chunks SET embedding = NULL")
                conn.commit()
    except Exception:
        pass

    # Alter column to match dimension
    try:
        conn.execute(f"ALTER TABLE chunks ALTER COLUMN embedding TYPE vector({dim})")
        conn.commit()
        print(f"  Embedding column set to vector({dim})")
    except Exception:
        conn.rollback()


def embed_all_chunks(conn: psycopg.Connection, progress_callback=None):
    """Generate embeddings for all chunks that don't have one yet."""
    print("Generating embeddings (batched)...")

    # Determine expected dimension from a test embedding
    test = _get_embeddings_batch(["test"], input_type="query")
    if test:
        dim = len(test[0])
        print(f"  Embedding dimension: {dim}")
        _ensure_vector_dimension(conn, dim)

    chunks = conn.execute(
        "SELECT id, content FROM chunks WHERE embedding IS NULL ORDER BY id"
    ).fetchall()

    total = len(chunks)
    print(f"  {total} chunks to embed (batch size {BATCH_SIZE})...")

    for batch_start in range(0, total, BATCH_SIZE):
        batch = chunks[batch_start:batch_start + BATCH_SIZE]
        texts = [content[:1500] for _, content in batch]
        ids = [chunk_id for chunk_id, _ in batch]

        embeddings = _get_embeddings_batch(texts, input_type="document")
        if embeddings is None:
            continue

        for chunk_id, embedding in zip(ids, embeddings):
            conn.execute(
                "UPDATE chunks SET embedding = %s::vector WHERE id = %s",
                (str(embedding), chunk_id),
            )

        conn.commit()
        done = min(batch_start + BATCH_SIZE, total)
        print(f"  Embedded {done}/{total} chunks...")

        if progress_callback:
            preview = texts[0][:80] if texts else ""
            progress_callback({
                "chunks_done": done,
                "chunks_total": total,
                "current_chunk_preview": preview,
            })

    embedded_count = conn.execute(
        "SELECT COUNT(*) FROM chunks WHERE embedding IS NOT NULL"
    ).fetchone()[0]
    print(f"  {embedded_count} chunks have embeddings.")
    print("Embedding complete.")

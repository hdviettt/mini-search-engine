"""Split pages into semantic chunks for vector search."""
import re

import psycopg


def _split_into_chunks(text: str, max_tokens: int = 300) -> list[str]:
    """Split text into chunks of roughly max_tokens words, breaking at paragraph/sentence boundaries."""
    if not text:
        return []

    # Split into paragraphs first (double newline or long whitespace gaps)
    paragraphs = re.split(r"\n\s*\n|\.\s{2,}", text)

    chunks = []
    current_chunk = []
    current_length = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        words = para.split()
        para_length = len(words)

        # If this paragraph alone exceeds max_tokens, split it by sentences
        if para_length > max_tokens:
            sentences = re.split(r"(?<=[.!?])\s+", para)
            for sentence in sentences:
                sent_words = sentence.split()
                sent_length = len(sent_words)

                if current_length + sent_length > max_tokens and current_chunk:
                    chunks.append(" ".join(current_chunk))
                    current_chunk = []
                    current_length = 0

                current_chunk.extend(sent_words)
                current_length += sent_length
        else:
            # If adding this paragraph exceeds limit, start a new chunk
            if current_length + para_length > max_tokens and current_chunk:
                chunks.append(" ".join(current_chunk))
                current_chunk = []
                current_length = 0

            current_chunk.extend(words)
            current_length += para_length

    # Don't forget the last chunk
    if current_chunk:
        chunks.append(" ".join(current_chunk))

    # Filter out very short chunks (less than 20 words)
    chunks = [c for c in chunks if len(c.split()) >= 20]

    return chunks


def chunk_page(conn: psycopg.Connection, page_id: int, title: str, body_text: str):
    """Chunk a single page and store — called right after crawling."""
    text = (title or "") + ". " + (body_text or "")
    page_chunks = _split_into_chunks(text)

    # Remove old chunks for this page
    conn.execute("DELETE FROM chunks WHERE page_id = %s", (page_id,))

    for chunk_idx, content in enumerate(page_chunks):
        conn.execute(
            """INSERT INTO chunks (page_id, chunk_idx, content)
               VALUES (%s, %s, %s)""",
            (page_id, chunk_idx, content),
        )

    conn.commit()


def chunk_all_pages(conn: psycopg.Connection):
    """Split all crawled pages into chunks and store in the chunks table."""
    print("Chunking pages...")

    conn.execute("DELETE FROM chunks WHERE embedding IS NULL OR embedding IS NOT NULL")
    conn.commit()

    pages = conn.execute("SELECT id, title, body_text FROM pages").fetchall()
    total_chunks = 0

    for i, (page_id, title, body_text) in enumerate(pages):
        text = (title or "") + ". " + (body_text or "")
        page_chunks = _split_into_chunks(text)

        for chunk_idx, content in enumerate(page_chunks):
            conn.execute(
                """INSERT INTO chunks (page_id, chunk_idx, content)
                   VALUES (%s, %s, %s) ON CONFLICT (page_id, chunk_idx) DO NOTHING""",
                (page_id, chunk_idx, content),
            )
            total_chunks += 1

        if (i + 1) % 100 == 0:
            conn.commit()
            print(f"  Chunked {i + 1}/{len(pages)} pages ({total_chunks} chunks)...")

    conn.commit()
    print(f"  {total_chunks} chunks created from {len(pages)} pages.")
    print("Chunking complete.")

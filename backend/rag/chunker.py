"""Split pages into semantic chunks for vector search."""
import logging
import re

import psycopg

log = logging.getLogger(__name__)


# Minimum words for a chunk to be worth embedding and retrieving.
MIN_CHUNK_WORDS = 25

# Above this share of digits the text is a grid of numbers, not prose.
MAX_DIGIT_RATIO = 0.18

# Prose uses longer words than a results table does.
MIN_AVG_WORD_LEN = 3.4

# Fragments of a reference list. "^" is the Wikipedia citation backlink.
_CITATION_NOISE = re.compile(
    r'(\^\s*"|retrieved\s+\d|archived from the original|\bISBN\b|\bdoi:)',
    re.IGNORECASE,
)

# Column headers that mark a squad or fixture table.
_TABLE_HEADER = re.compile(
    r"\b(pos\s+nat\s+player|p\s+w\s+d\s+l|gp\s+g\s+a\b|apps?\s+goals)\b",
    re.IGNORECASE,
)


def is_noise_fragment(para: str) -> bool:
    """Is this paragraph table or reference debris rather than text?

    Applied per paragraph, before paragraphs are accumulated into chunks. Doing
    it only after accumulation loses good prose: the splitter packs a page into
    300-token chunks, so one squad table merged into the same chunk as a real
    paragraph would take that paragraph down with it.

    No length floor here. A short paragraph is fine, it merges with its
    neighbours; length is judged on the finished chunk.
    """
    if not para or not para.strip():
        return True
    text = para.strip()
    if _TABLE_HEADER.search(text) or _CITATION_NOISE.search(text):
        return True
    if sum(ch.isdigit() for ch in text) / max(len(text), 1) > MAX_DIGIT_RATIO:
        return True
    words = text.split()
    alpha_words = [w for w in words if any(ch.isalpha() for ch in w)]
    if not alpha_words:
        return True
    if sum(len(w) for w in alpha_words) / len(alpha_words) < MIN_AVG_WORD_LEN:
        return True
    return False


def is_useful_chunk(content: str) -> bool:
    """Is this chunk worth embedding and retrieving?

    There was no gate here at all, so every fragment of a page became a chunk,
    tables and reference lists included. Those are numerous, semantically
    empty, and they win retrievals: asking "how does var work" returned Paris
    Saint-Germain season tables and a citation fragment, while the "Video
    assistant referee" article, fully chunked and fully embedded, was nowhere.
    A vector store full of "Pos Nat Player Total" cannot answer anything, and
    it dilutes everything stored beside it.
    """
    if not content:
        return False
    text = content.strip()
    words = text.split()
    if len(words) < MIN_CHUNK_WORDS:
        return False
    if _TABLE_HEADER.search(text) or _CITATION_NOISE.search(text):
        return False
    if sum(ch.isdigit() for ch in text) / max(len(text), 1) > MAX_DIGIT_RATIO:
        return False
    alpha_words = [w for w in words if any(ch.isalpha() for ch in w)]
    if not alpha_words:
        return False
    if sum(len(w) for w in alpha_words) / len(alpha_words) < MIN_AVG_WORD_LEN:
        return False
    # Prose has sentences. A grid of cells has almost no terminal punctuation.
    if text.count(".") + text.count("!") + text.count("?") < 1:
        return False
    return True


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
        if is_noise_fragment(para):
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

    # One gate, applied here, so chunk_page and chunk_all_pages cannot
    # disagree about what is worth storing.
    return [c for c in chunks if is_useful_chunk(c)]


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
    log.info("Chunking pages...")

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
            log.info(f"  Chunked {i + 1}/{len(pages)} pages ({total_chunks} chunks)...")

    conn.commit()
    log.info(f"  {total_chunks} chunks created from {len(pages)} pages.")
    log.info("Chunking complete.")

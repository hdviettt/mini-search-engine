import psycopg
from config import DATABASE_URL

SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS pages (
    id           SERIAL PRIMARY KEY,
    url          TEXT UNIQUE NOT NULL,
    domain       TEXT NOT NULL,
    title        TEXT,
    body_text    TEXT,
    status_code  INTEGER,
    content_hash TEXT,
    crawled_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS links (
    id         SERIAL PRIMARY KEY,
    source_id  INTEGER NOT NULL REFERENCES pages(id),
    target_url TEXT NOT NULL,
    target_id  INTEGER REFERENCES pages(id),
    UNIQUE(source_id, target_url)
);

CREATE TABLE IF NOT EXISTS crawl_queue (
    id       SERIAL PRIMARY KEY,
    url      TEXT UNIQUE NOT NULL,
    depth    INTEGER DEFAULT 0,
    status   TEXT DEFAULT 'pending',
    added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS terms (
    id   SERIAL PRIMARY KEY,
    term TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS postings (
    term_id   INTEGER NOT NULL REFERENCES terms(id),
    page_id   INTEGER NOT NULL REFERENCES pages(id),
    term_freq INTEGER NOT NULL,
    PRIMARY KEY (term_id, page_id)
);

CREATE TABLE IF NOT EXISTS doc_stats (
    page_id    INTEGER PRIMARY KEY REFERENCES pages(id),
    doc_length INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS corpus_stats (
    key   TEXT PRIMARY KEY,
    value REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS pagerank (
    page_id INTEGER PRIMARY KEY REFERENCES pages(id),
    score   REAL NOT NULL DEFAULT 0.0
);

-- Chunks: pages split into ~300-token paragraphs with vector embeddings
CREATE TABLE IF NOT EXISTS chunks (
    id        SERIAL PRIMARY KEY,
    page_id   INTEGER NOT NULL REFERENCES pages(id),
    chunk_idx INTEGER NOT NULL,
    content   TEXT NOT NULL,
    embedding vector(768),
    UNIQUE(page_id, chunk_idx)
);

CREATE TABLE IF NOT EXISTS ai_cache (
    query_normalized TEXT PRIMARY KEY,
    overview_text    TEXT NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_postings_term ON postings(term_id);
CREATE INDEX IF NOT EXISTS idx_postings_page ON postings(page_id);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);
CREATE INDEX IF NOT EXISTS idx_crawl_queue_status ON crawl_queue(status);
CREATE INDEX IF NOT EXISTS idx_chunks_page ON chunks(page_id);
"""


def get_connection() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL)


def init_db():
    with get_connection() as conn:
        conn.execute(SCHEMA_SQL)
        conn.commit()
    print("Database schema initialized.")


if __name__ == "__main__":
    init_db()

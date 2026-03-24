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
    term_id    INTEGER NOT NULL REFERENCES terms(id),
    page_id    INTEGER NOT NULL REFERENCES pages(id),
    term_freq  INTEGER NOT NULL,
    title_freq INTEGER NOT NULL DEFAULT 0,
    body_freq  INTEGER NOT NULL DEFAULT 0,
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

-- Query log: track every search for analytics and quality measurement
CREATE TABLE IF NOT EXISTS query_log (
    id            SERIAL PRIMARY KEY,
    query         TEXT NOT NULL,
    results_count INTEGER,
    time_ms       REAL,
    has_overview   BOOLEAN DEFAULT false,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- NER: entities extracted from crawled pages
CREATE TABLE IF NOT EXISTS entities (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    canonical   TEXT,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, entity_type)
);

CREATE TABLE IF NOT EXISTS page_entities (
    page_id   INTEGER NOT NULL REFERENCES pages(id),
    entity_id INTEGER NOT NULL REFERENCES entities(id),
    frequency INTEGER DEFAULT 1,
    in_title  BOOLEAN DEFAULT false,
    PRIMARY KEY (page_id, entity_id)
);

CREATE TABLE IF NOT EXISTS entity_aliases (
    id        SERIAL PRIMARY KEY,
    entity_id INTEGER NOT NULL REFERENCES entities(id),
    alias     TEXT NOT NULL,
    UNIQUE(entity_id, alias)
);

-- Performance indexes added in Phase 1
CREATE INDEX IF NOT EXISTS idx_pages_domain ON pages(domain);
CREATE INDEX IF NOT EXISTS idx_pages_crawled_at ON pages(crawled_at);
CREATE INDEX IF NOT EXISTS idx_ai_cache_created ON ai_cache(created_at);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
CREATE INDEX IF NOT EXISTS idx_entities_canonical ON entities(canonical);
CREATE INDEX IF NOT EXISTS idx_page_entities_page ON page_entities(page_id);
CREATE INDEX IF NOT EXISTS idx_page_entities_entity ON page_entities(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_alias ON entity_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_query_log_created ON query_log(created_at);
CREATE INDEX IF NOT EXISTS idx_query_log_query ON query_log(query);
"""


def get_connection() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL)


MIGRATIONS_SQL = """
-- Phase 1 migrations: add columns to existing tables
ALTER TABLE postings ADD COLUMN IF NOT EXISTS title_freq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE postings ADD COLUMN IF NOT EXISTS body_freq INTEGER NOT NULL DEFAULT 0;
"""


def init_db():
    with get_connection() as conn:
        conn.execute(SCHEMA_SQL)
        conn.commit()
        # Run migrations for existing tables that need new columns
        try:
            conn.execute(MIGRATIONS_SQL)
            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"Migration note: {e}")
    print("Database schema initialized.")


if __name__ == "__main__":
    init_db()

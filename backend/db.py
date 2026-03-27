import psycopg
from config import DATABASE_URL

SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS pages (
    id                   SERIAL PRIMARY KEY,
    url                  TEXT UNIQUE NOT NULL,
    domain               TEXT NOT NULL,
    title                TEXT,
    body_text            TEXT,
    status_code          INTEGER,
    content_hash         TEXT,
    crawled_at           TIMESTAMPTZ DEFAULT NOW(),
    last_checked_at      TIMESTAMPTZ,
    indexed_at           TIMESTAMPTZ,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    is_dead              BOOLEAN NOT NULL DEFAULT false
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
CREATE INDEX IF NOT EXISTS idx_crawl_queue_status_depth ON crawl_queue(status, depth);
CREATE INDEX IF NOT EXISTS idx_pages_last_checked_at ON pages(last_checked_at);
CREATE INDEX IF NOT EXISTS idx_pages_is_dead ON pages(is_dead) WHERE is_dead = true;
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

-- Crawl schedules: persistent recurring crawl configuration
CREATE TABLE IF NOT EXISTS crawl_schedules (
    id             TEXT PRIMARY KEY,
    strategy       TEXT NOT NULL DEFAULT 'seed',
    seed_urls      TEXT[] NOT NULL DEFAULT '{}',
    max_pages      INTEGER NOT NULL DEFAULT 50,
    max_depth      INTEGER NOT NULL DEFAULT 1,
    interval_hours REAL NOT NULL DEFAULT 24.0,
    enabled        BOOLEAN NOT NULL DEFAULT true,
    last_run_at    TIMESTAMPTZ,
    next_run_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Stats snapshots: periodic capture of aggregate metrics for time-series charts
CREATE TABLE IF NOT EXISTS stats_snapshots (
    id              SERIAL PRIMARY KEY,
    snapshot_at     TIMESTAMPTZ DEFAULT NOW(),
    pages_crawled   INTEGER,
    terms_indexed   INTEGER,
    postings_count  INTEGER,
    chunks_count    INTEGER,
    chunks_embedded INTEGER,
    avg_doc_length  REAL,
    queries_total   INTEGER,
    avg_latency_ms  REAL
);
CREATE INDEX IF NOT EXISTS idx_stats_snapshots_at ON stats_snapshots(snapshot_at);

-- Performance indexes added in Phase 1
CREATE INDEX IF NOT EXISTS idx_pages_domain ON pages(domain);
CREATE INDEX IF NOT EXISTS idx_pages_crawled_at ON pages(crawled_at);
CREATE INDEX IF NOT EXISTS idx_ai_cache_created ON ai_cache(created_at);
CREATE INDEX IF NOT EXISTS idx_query_log_created ON query_log(created_at);
CREATE INDEX IF NOT EXISTS idx_query_log_query ON query_log(query);
"""


def get_connection() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL)


MIGRATIONS_SQL = """
-- Phase 1 migrations: add columns to existing tables
ALTER TABLE postings ADD COLUMN IF NOT EXISTS title_freq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE postings ADD COLUMN IF NOT EXISTS body_freq INTEGER NOT NULL DEFAULT 0;

-- Phase 2 migrations: page health tracking and performance indexes
ALTER TABLE pages ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS indexed_at TIMESTAMPTZ;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS is_dead BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_crawl_queue_status_depth ON crawl_queue(status, depth);
CREATE INDEX IF NOT EXISTS idx_pages_last_checked_at ON pages(last_checked_at);
CREATE INDEX IF NOT EXISTS idx_pages_is_dead ON pages(is_dead) WHERE is_dead = true;
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

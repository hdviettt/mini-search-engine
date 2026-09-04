import logging
import os
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg_pool import ConnectionPool

from config import DATABASE_URL, VOYAGE_DIMENSIONS

log = logging.getLogger(__name__)

# This module is the only place the schema is defined. Do not inline
# CREATE TABLE anywhere else — three copies had already drifted apart.
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
    embedding vector({embedding_dim}),
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


def _schema_sql() -> str:
    """Schema with the embedding dimension filled in.

    A plain str.format() would choke on the `DEFAULT '{}'` array literal
    further down, so substitute the one placeholder directly.
    """
    return SCHEMA_SQL.replace("{embedding_dim}", str(VOYAGE_DIMENSIONS))


_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    """Process-wide connection pool, opened on first use.

    `check` is what stops the pool handing out corpses. When the database
    restarts — a failover, a redeploy, a platform stop — every connection
    already in the pool is dead, and without a check the next request gets
    one and fails with `SSL error: unexpected eof while reading`. The check
    costs one round trip and turns that into a transparent reconnect.

    `max_lifetime` retires connections before a proxy or the server decides
    to, so the recycling happens on our schedule instead of mid-query.
    """
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            DATABASE_URL,
            min_size=1,
            max_size=10,
            timeout=30,
            open=True,
            check=ConnectionPool.check_connection,
            max_lifetime=30 * 60,
            max_idle=5 * 60,
        )
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def db_conn() -> Iterator[psycopg.Connection]:
    """Pooled connection. Use for anything serving a request."""
    with get_pool().connection() as conn:
        yield conn


def get_db() -> Iterator[psycopg.Connection]:
    """FastAPI dependency wrapping the pool."""
    with get_pool().connection() as conn:
        yield conn


# Seconds to wait for a TCP connection before giving up. Without this psycopg
# inherits the OS timeout, which on an unreachable host is about 130 seconds —
# and startup makes three of these calls in sequence, so a dead database turned
# boot into a six-minute hang with no error until the very end.
CONNECT_TIMEOUT = int(os.getenv("DB_CONNECT_TIMEOUT", "10"))


def get_connection() -> psycopg.Connection:
    """Standalone connection for CLI scripts and long-running background jobs.

    Deliberately not pooled: a crawl holds its connection for minutes and
    would starve the request pool.
    """
    return psycopg.connect(DATABASE_URL, connect_timeout=CONNECT_TIMEOUT)


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
    """Create the schema and apply migrations. Idempotent — safe on every boot.

    The two blocks run independently on purpose. They used to share a
    try-block, so when the CREATE EXTENSION at the top of the schema failed
    (it needs privileges not every deployment has), the ALTER TABLEs below it
    never ran. That is how production ended up without `pages.last_checked_at`
    while the query path had already started selecting it.
    """
    with get_connection() as conn:
        try:
            conn.execute(_schema_sql())
            conn.commit()
        except Exception:
            conn.rollback()
            log.warning("Schema creation skipped or partially applied", exc_info=True)

        try:
            conn.execute(MIGRATIONS_SQL)
            conn.commit()
        except Exception:
            conn.rollback()
            log.warning("Migrations skipped or partially applied", exc_info=True)

    log.info("Database schema initialized (embedding dim %s).", VOYAGE_DIMENSIONS)


if __name__ == "__main__":
    from logging_config import setup_logging

    setup_logging()
    init_db()

# Query Logging: Measuring Search Quality

You can't improve what you can't measure. The query log captures every search request, enabling analytics, quality measurement, and future learning-to-rank systems.

## Schema

```sql
CREATE TABLE query_log (
    id            SERIAL PRIMARY KEY,
    query         TEXT NOT NULL,
    results_count INTEGER,        -- how many results were found
    time_ms       REAL,           -- how long the search took
    has_overview  BOOLEAN DEFAULT false,  -- whether AI Overview was generated
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

Indexed on `created_at` (time-range queries) and `query` (lookup by query text).

## What Gets Logged

Both search endpoints log every query:
- `POST /api/search/explain` — the main frontend search (with pipeline trace)
- `GET /api/search` — the basic search endpoint

Each log entry captures: query text, result count, latency in milliseconds.

## What This Enables

### Now
- **Popular queries**: `SELECT query, COUNT(*) FROM query_log GROUP BY query ORDER BY 2 DESC`
- **Zero-result queries**: `SELECT query FROM query_log WHERE results_count = 0` — reveals gaps in the index
- **Latency monitoring**: `SELECT AVG(time_ms) FROM query_log WHERE created_at > NOW() - INTERVAL '1 hour'`

### Future (Phase 2+)
- **Click-through rate**: Add `clicked_url` column, compute CTR per query-result pair
- **A/B testing**: Add `experiment_id` column, compare metrics across variants
- **Learning to Rank**: Use click data to train ranking models (LambdaMART, etc.)
- **Query suggestions**: Surface popular queries as autocomplete candidates

## Files

- `backend/db.py` — `query_log` table definition
- `backend/api/playground.py` — Logging in `/api/search/explain`
- `backend/main.py` — Logging in `/api/search`

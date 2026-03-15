# Database Performance Lessons

Building this search engine taught us several database performance lessons the hard way. These apply to any application that does heavy database work.

## Lesson 1: COPY vs INSERT

### The Problem

Our first indexer inserted postings one at a time:

```python
# Slow: 1 million individual INSERT statements
for term_id, page_id, freq in postings:
    conn.execute("INSERT INTO postings VALUES (%s, %s, %s)", (term_id, page_id, freq))
```

With 1,057,023 postings, this took so long we had to kill it.

### Why It's Slow

Each `INSERT` is a separate round-trip:

```
Python → Network → Postgres: "INSERT INTO postings VALUES (1, 5, 3)"
Python ← Network ← Postgres: "OK"
Python → Network → Postgres: "INSERT INTO postings VALUES (1, 8, 1)"
Python ← Network ← Postgres: "OK"
... repeat 1,057,023 times
```

Even on localhost, each round-trip takes ~0.1ms. Multiply by 1 million: ~100 seconds just in network overhead, plus transaction overhead per statement.

### The Fix: COPY

PostgreSQL's `COPY` command streams data in bulk:

```python
# Fast: streams all data in one operation
with cursor.copy("COPY postings (term_id, page_id, term_freq) FROM STDIN") as copy:
    for line in data:
        copy.write(line.encode())
```

```
Python → Network → Postgres: [stream of 1,057,023 rows as raw data]
Python ← Network ← Postgres: "COPY 1057023"
```

One round-trip. One transaction. Orders of magnitude faster.

### The Rule

**Any time you're inserting more than ~1000 rows, use bulk operations.** This applies to every database:
- PostgreSQL: `COPY`
- MySQL: `LOAD DATA INFILE`
- SQLite: wrap everything in a single `BEGIN`/`COMMIT` transaction
- ORMs: use bulk_create / bulk_insert methods

## Lesson 2: Connection Locking

### The Problem

We ran the indexer while the crawler was still running. The indexer started with:

```sql
DELETE FROM postings;
DELETE FROM terms;
```

These `DELETE` statements acquired locks on the tables. The crawler, also writing to the database, was blocked. Both processes hung — deadlock.

When we tried to fix it with `TRUNCATE` (which acquires an even stronger lock), that also hung because the stale connections from the killed processes still held locks.

### The Fix

```sql
-- Kill stale connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'searchengine' AND pid <> pg_backend_pid();

-- Now TRUNCATE works
TRUNCATE postings, terms, doc_stats, corpus_stats CASCADE;
```

### The Rule

1. **Don't run conflicting write operations concurrently** — if two processes write to the same tables, one will block the other.
2. **Kill stale connections before retrying** — crashed Python scripts leave zombie database connections that hold locks.
3. **Use TRUNCATE instead of DELETE for full table clears** — `DELETE` scans every row and logs each deletion. `TRUNCATE` instantly resets the table. Much faster, but it's a more aggressive lock (no other operation can touch the table).

## Lesson 3: TRUNCATE vs DELETE

| | DELETE | TRUNCATE |
|---|---|---|
| Speed | Slow (row-by-row) | Instant |
| WHERE clause | Yes (`DELETE WHERE id > 100`) | No (all or nothing) |
| Triggers | Fires row-level triggers | Does not fire triggers |
| MVCC/WAL | Logs every row deletion | Minimal logging |
| Lock level | Row-level locks | Access exclusive lock (blocks everything) |
| Rollback | Can be rolled back | Can be rolled back in PostgreSQL (not all DBs) |

**Use DELETE when:** you need to remove specific rows, or other processes need concurrent access.
**Use TRUNCATE when:** you're clearing the entire table and can briefly block other access.

## Lesson 4: Transactions Matter

### The Problem (Conceptual)

Without explicit transaction management, each INSERT auto-commits:

```python
# Each insert is its own transaction
conn.execute("INSERT INTO terms ...")  # BEGIN, INSERT, COMMIT
conn.execute("INSERT INTO terms ...")  # BEGIN, INSERT, COMMIT
conn.execute("INSERT INTO terms ...")  # BEGIN, INSERT, COMMIT
```

Each COMMIT forces a disk write (fsync). Disk writes are slow — ~10ms each on spinning disks, ~0.1ms on SSDs. With 145,736 terms, that's thousands of fsyncs.

### The Fix

Wrap everything in one transaction:

```python
# One transaction for all inserts
conn.execute("BEGIN")
for term in terms:
    conn.execute("INSERT INTO terms ...")
conn.execute("COMMIT")  # One fsync at the end
```

### The Rule

**Batch your writes into transactions.** The ideal batch size depends on your use case:
- Too small (1 row per transaction): too much fsync overhead
- Too large (1 million rows in one transaction): uses lots of memory and blocks other writers
- Sweet spot: 1,000 - 100,000 rows per transaction

## Lesson 5: Parameterized Queries

Throughout our codebase, we use parameterized queries:

```python
# GOOD: parameterized (safe)
conn.execute("SELECT * FROM pages WHERE url = %s", (url,))

# BAD: string formatting (SQL injection vulnerability)
conn.execute(f"SELECT * FROM pages WHERE url = '{url}'")
```

If `url` contained `'; DROP TABLE pages; --`, the bad version would destroy your data. The parameterized version treats it as a literal string.

**This is non-negotiable.** Always parameterize. No exceptions. Even for internal tools where "no one will inject SQL" — it's a habit that prevents disasters.

## Summary

| Lesson | Slow Way | Fast Way | Speedup |
|--------|----------|----------|---------|
| Bulk inserts | Individual INSERTs | COPY | 100-1000x |
| Table clearing | DELETE all rows | TRUNCATE | 100x+ |
| Transaction batching | Auto-commit per row | Single transaction | 10-100x |
| Connection management | Leave zombie connections | Terminate stale PIDs | Unblocks everything |

# Crawler & Indexer Quality Roadmap

The crawler and indexer determine the quality ceiling for everything downstream — BM25 ranking, neural re-ranking, AI Overview, snippets. This document outlines the current issues and the fix plan.

## Current State

- **3,157 pages** crawled from 9 domains (mostly Wikipedia)
- **194K terms**, **2.9M postings** in the inverted index
- **36K chunks**, **35K embedded** for vector search
- Avg document length: 2,857 tokens

## Known Issues

### 1. Stale Data (~900 pages)
Pages crawled before the parser rewrite still have Wikipedia sidebar noise in body_text. The new parser strips boilerplate (navboxes, infoboxes, references, external links) but only applies to newly crawled pages.

### 2. No Incremental Indexing
Every crawl requires a full index rebuild. During rebuild (~2 min), all postings are deleted and search returns 0 results. This is the biggest architectural gap.

### 3. No Freshness Signal
A page crawled 2 weeks ago scores the same as one crawled today. Football information changes rapidly — transfers, match results, injuries.

### 4. No Re-crawl Strategy
Pages are crawled once and never revisited. Updated Wikipedia articles are never re-indexed.

### 5. No Content Quality Filter
Stub pages (<100 words), redirect pages, and near-duplicates are all indexed, polluting search results.

## Fix Plan (ordered by impact)

### Issue #38: Incremental Indexing
**The most important fix.** Index pages during crawl — no rebuild step.

Current: `Crawl → Stop → DELETE all postings → Rebuild → Search works again`
Target: `Crawl page → Index immediately → Search always works`

New function `index_page(conn, page_id, title, body_text)` that:
1. Deletes old postings for this page_id
2. Tokenizes title + body with stemming + BM25F
3. Upserts term IDs (ON CONFLICT)
4. Inserts postings
5. Updates doc_stats and corpus_stats incrementally

Called inside the crawl loop after each page is saved. Full rebuild becomes optional.

### Issue #39: Re-crawl Stale Pages
Re-fetch all existing URLs with the new parser. ~30 min job. Immediate quality improvement for 900+ pages.

### Issue #40: Content Quality Filter
Before indexing, check:
- body_text ≥ 100 words
- content_hash is unique
- Title is not "Page not found" / "Error"
- Not a redirect page

### Issue #41: Freshness Signal
After score combination, multiply by freshness:
```python
days_old = (now - crawled_at).days
freshness = max(0.8, 1.0 - days_old * 0.01)
score *= freshness
```

### Issue #42: Scheduled Re-crawling
Persist schedules in PostgreSQL. Two strategies:
- Weekly: re-crawl top 500 pages by PageRank
- Daily: seed URLs depth=1 for new content

Depends on incremental indexing (#38).

## Dependency Graph

```
#38 Incremental Indexing (foundation)
    ↓
#39 Re-crawl stale pages (uses incremental indexing)
    ↓
#40 Quality filter (applied during incremental indexing)
    ↓
#41 Freshness signal (uses crawled_at in ranking)
    ↓
#42 Scheduled re-crawling (depends on #38 + #39 patterns)
```

## Files Involved

| File | Changes |
|------|---------|
| `backend/indexer/indexer.py` | New `index_page()` function |
| `backend/crawler/manager.py` | Call `index_page()` after each page |
| `backend/crawler/parser.py` | Already improved (boilerplate stripping) |
| `backend/search/engine.py` | Freshness multiplier |
| `backend/api/playground.py` | Refresh endpoint, schedule endpoints |
| `backend/db.py` | crawl_schedules table |

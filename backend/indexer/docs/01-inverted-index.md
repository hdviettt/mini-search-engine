# The Inverted Index

The inverted index is the core data structure of every search engine. It's what makes search fast.

## The Problem

Without an index, searching for "robots.txt" across 750 pages means scanning every page's text, one by one. At 24.5 MB of text, this is slow and gets worse as you add more pages.

## The Solution: Flip It

Instead of storing "page → words", store "word → pages":

```
Traditional (forward index):
  Page 1 → [search, engine, optimization, seo, ranking, ...]
  Page 2 → [robots, txt, crawl, sitemap, ...]
  Page 3 → [pagerank, algorithm, link, authority, ...]

Inverted index:
  "search"   → [Page 1, Page 4, Page 17, Page 203, ...]
  "robots"   → [Page 2, Page 4, Page 89, ...]
  "pagerank" → [Page 3, Page 4, Page 156, ...]
```

Now searching for "robots" is a single lookup — instantly returns the list of pages containing it.

## What We Built

Our inverted index has three tables:

### `terms` — the vocabulary
Every unique word across all pages gets an ID.

```
id=1    term="search"
id=2    term="engine"
id=3    term="optimization"
id=4    term="robots"
...
```

We indexed **145,736 unique terms** from 750 Wikipedia pages.

### `postings` — the actual index
For each term, which pages contain it and how many times.

```
term_id=4 (robots)  page_id=2   term_freq=15
term_id=4 (robots)  page_id=4   term_freq=3
term_id=4 (robots)  page_id=89  term_freq=1
```

This is called the **postings list** — it's what gets looked up when you search. We created **1,057,023 postings** (each term-page pair is one posting).

### `doc_stats` — document lengths
Each page's total token count. BM25 needs this to normalize scores — longer documents shouldn't automatically score higher just because they contain more words.

## The Tokenization Pipeline

Before indexing, text goes through tokenization:

```
Raw text: "Search Engine Optimization (SEO) is the process..."
     ↓ lowercase
"search engine optimization (seo) is the process..."
     ↓ remove non-alphanumeric
"search engine optimization  seo  is the process "
     ↓ split on whitespace
["search", "engine", "optimization", "seo", "is", "the", "process"]
     ↓ remove stopwords ("is", "the" are too common to be useful)
["search", "engine", "optimization", "seo", "process"]
```

### Why Remove Stopwords?

Words like "the", "is", "and" appear in almost every document. They don't help distinguish relevant pages from irrelevant ones. Including them would:
- Bloat the index (millions of useless postings)
- Slow down queries (every search would match almost every page)
- Add noise to relevance scoring

### What We Don't Do (Yet)

- **Stemming** — reducing words to their root form ("running" → "run", "optimization" → "optim"). This improves recall (finding more matches) but can reduce precision. We skipped it for simplicity.
- **Phrase indexing** — storing word positions so you can search for exact phrases like "search engine optimization" as a three-word unit, not three separate words.

## How Google's Index Differs

Our index is simple and works at small scale. Google's index:

- **Distributed** — the index is split across thousands of machines worldwide. No single server holds the full index.
- **Tiered** — important pages are in a "hot" tier (fast SSDs, more replicas). Obscure pages are in a "cold" tier.
- **Real-time** — new pages get indexed within minutes. Our index requires a full rebuild.
- **Rich signals** — Google's index stores not just term frequency but also: position in page, font size, whether it's in a heading, anchor text from incoming links, and hundreds of other signals.
- **Knowledge Graph** — beyond text matching, Google understands entities ("Apple" the company vs "apple" the fruit) and relationships between them.

## Performance Lesson

Our first indexer version used individual `INSERT` statements — one database round-trip per posting. With 1 million postings, this was painfully slow.

The fix: use PostgreSQL's `COPY` command for bulk loading. Instead of 1 million individual inserts, we stream all the data in one operation. This is a fundamental database performance lesson:

```
Slow:  1,000,000 × INSERT (one round-trip each)
Fast:  1 × COPY (streams all data at once)
```

This same principle applies to any database-heavy application: batch your writes.

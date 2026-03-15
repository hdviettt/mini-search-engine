# Mini Search Engine with AI Overviews

A search engine built from scratch — crawler, indexer, ranker, and AI-generated overviews. Built to deeply understand how search engines work under the hood.

## Architecture

```
[User] → Next.js (frontend) → FastAPI (backend) → PostgreSQL
                                    ↓
                              Claude API (AI Overviews)
```

### Search Pipeline

1. **Crawler** — BFS web crawler with robots.txt compliance and rate limiting
2. **Indexer** — Inverted index with tokenization and stopword removal
3. **Ranker** — BM25 text relevance + PageRank link authority
4. **AI Overviews** — Claude-powered summaries from top search results

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js (React) |
| Backend | FastAPI (Python) |
| Database | PostgreSQL |
| AI | Claude API (Sonnet) |
| Hosting | Railway |

## Project Structure

```
search-engine/
├── backend/
│   ├── crawler/        # web crawler (fetcher, parser, BFS manager)
│   ├── indexer/        # inverted index builder + tokenizer
│   ├── ranker/         # BM25 + PageRank scoring
│   ├── search/         # query engine (score combination, snippets)
│   ├── ai_overview/    # Claude API integration + caching
│   ├── api/            # FastAPI endpoints
│   ├── scripts/        # CLI tools (crawl, index, pagerank)
│   ├── config.py       # settings
│   ├── db.py           # database schema + connection
│   ├── models.py       # Pydantic models
│   └── main.py         # FastAPI entry point
│
└── frontend/           # Next.js app (coming soon)
```

## How It Works

### Crawling
The crawler uses breadth-first search to discover and fetch web pages. It respects `robots.txt`, enforces rate limiting (1.5s delay between requests), and scopes to whitelisted domains. The crawl queue is persisted in PostgreSQL so crawls can be stopped and resumed.

### Indexing
Pages are tokenized (lowercase, stopword removal) and stored in an inverted index. Each term maps to the documents it appears in, along with term frequency — the core data structure that makes search fast.

### Ranking
Results are scored using two signals:
- **BM25** (70% weight) — measures how relevant a document's text is to the query
- **PageRank** (30% weight) — measures a page's authority based on incoming links

### AI Overviews
For queries with 3+ results, the top 5 results are sent to Claude to generate a concise summary with source citations — similar to Google's AI Overviews.

## Setup

### Prerequisites
- Python 3.12+
- PostgreSQL (or Docker)
- Node.js 18+ (for frontend)

### Backend

```bash
cd backend
pip install -e .

# Start local Postgres with Docker
docker run -d --name search-pg \
  -e POSTGRES_USER=searchengine \
  -e POSTGRES_PASSWORD=searchengine \
  -e POSTGRES_DB=searchengine \
  -p 5432:5432 postgres:16

# Initialize database
python db.py

# Run the crawler
python scripts/crawl.py

# Build the index
python scripts/index.py

# Compute PageRank
python scripts/pagerank.py

# Start the API server
uvicorn main:app --reload
```

## Status

🚧 Under active development — Phase 1 (Crawler + Storage)

## Author

Built by [Viet](https://github.com/hdviettt) — AI Leader at SEONGON, Vietnam's largest SEO agency.

# VietSearch — Search Engine Built from Scratch

An interactive search engine that visually demonstrates how search works under the hood. Crawl the web, build an inverted index, rank with BM25 + PageRank, and generate AI overviews — all visible on a live canvas UI.

**Live demo**: [search.hoangducviet.work](https://search.hoangducviet.work)

## Architecture

```
User → Next.js (React Flow canvas) → FastAPI → PostgreSQL (pgvector)
                                        ↓
                                  Groq API (LLM) + Voyage AI (embeddings)
```

## How It Works

### Build Pipeline
1. **Crawler** — BFS web crawler with robots.txt compliance, rate limiting (1.5s/req), scoped to Wikipedia, BBC Sport, and ESPN soccer
2. **Indexer** — Inverted index with tokenization and stopword removal
3. **Embedder** — Pages chunked into ~300-token paragraphs, embedded with Voyage AI, stored as pgvector

### Query Pipeline
4. **BM25** — Text relevance scoring (term frequency, IDF, length normalization)
5. **PageRank** — Link authority scoring (iterative, damping=0.85, handles dangling nodes)
6. **Ranking** — Combined score: 70% BM25 + 30% PageRank, min-max normalized
7. **AI Overview** — Query fan-out → hybrid retrieval (vector + keyword) → streamed LLM synthesis via Groq

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, React Flow, Tailwind v4, TypeScript |
| Backend | FastAPI, Python 3.12+ |
| Database | PostgreSQL + pgvector |
| LLM | Groq (Llama 3.3 70B) |
| Embeddings | Voyage AI (voyage-3-lite, 768d) |
| Hosting | Railway |

## Project Structure

```
search-engine/
├── backend/
│   ├── crawler/        # BFS web crawler (fetcher, parser, queue manager)
│   ├── indexer/        # inverted index builder + tokenizer
│   ├── ranker/         # BM25 + PageRank scoring
│   ├── search/         # query engine (score combination, snippets)
│   ├── rag/            # hybrid retrieval — chunker, embedder, retriever, query fan-out
│   ├── ai_overview/    # Groq LLM integration, streaming SSE, response caching
│   ├── api/            # playground endpoints + WebSocket for live progress
│   ├── scripts/        # CLI tools (crawl, index, pagerank, build_rag)
│   ├── config.py       # settings + domain allowlists
│   ├── db.py           # schema (9 tables) + connection
│   ├── models.py       # Pydantic models
│   └── main.py         # FastAPI entry point
│
└── frontend/
    ├── app/            # Next.js app router (single-page canvas)
    ├── components/
    │   ├── canvas/     # React Flow nodes, edges, layout, search overlay
    │   └── playground/ # detail panels, live logs, data explorer, tuning
    ├── hooks/          # useResizable
    └── lib/            # API client, types, WebSocket hook
```

## Frontend

The UI is a **React Flow canvas** that visualizes the entire search pipeline as a node graph:

- **Build-time flow** (left) — Crawler → Indexer → Embedder → data stores
- **Query-time flow** (right) — Tokenize → Index Lookup → BM25 → PageRank → Combine → Results → AI Overview
- **Live animation** — search a query and watch data flow through each pipeline stage
- **Clickable nodes** — open detail panels showing real data (crawl progress, BM25 scores, PageRank values, RAG traces)
- **WebSocket** — real-time progress during crawl/index/embed jobs
- **Search panel** — Google-style results with score breakdowns

## Setup

### Prerequisites
- Python 3.12+
- PostgreSQL 16+ with pgvector extension
- Node.js 18+

### Backend

```bash
cd backend
pip install -e .

# Start Postgres with pgvector
docker run -d --name search-pg \
  -e POSTGRES_USER=searchengine \
  -e POSTGRES_PASSWORD=searchengine \
  -e POSTGRES_DB=searchengine \
  -p 5432:5432 pgvector/pgvector:pg16

# Set up environment
cp .env.example .env  # add GROQ_API_KEY, VOYAGE_API_KEY

# Initialize database
python db.py

# Build the search index
python scripts/crawl.py        # crawl web pages
python scripts/index.py        # build inverted index
python scripts/pagerank.py     # compute PageRank
python scripts/build_rag.py    # chunk + embed for RAG

# Start API server
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Author

Built by [Viet](https://github.com/hdviettt) — AI Leader at SEONGON, Vietnam's largest SEO agency.

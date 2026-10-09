# Mini Search Engine

### A search engine built from scratch to understand how Google really works.

![Demo](docs/demo.gif)

---

A mini search engine built from scratch that covers the core pipeline behind Google Search — **Crawling, Indexing, Ranking** — plus **Neural Reranking** and **AI Overviews**.

## The Pipeline

Two pipelines that share nothing but a database. The build path runs offline and
fills Postgres; the query path reads it.

![Build pipeline](docs/diagrams/01-build-pipeline.svg)

![Query pipeline](docs/diagrams/02-query-pipeline.svg)


### What each piece does

| Stage | What it does | How | Numbers |
|-------|-------------|-----|---------|
| **Crawler** | Downloads web pages | BFS traversal, robots.txt compliance, 1.5s rate limiting, dead page tracking | ~1,000+ pages from Wikipedia, BBC Sport, ESPN, FBref, Transfermarkt |
| **Indexer** | Maps every word to the pages containing it | Tokenization (Porter stemmer) → stopword removal → inverted index via PostgreSQL COPY | 100K+ terms, 1M+ postings |
| **PageRank** | Scores page authority from link structure | Iterative algorithm (d=0.85, 20 iterations), handles dangling nodes | Scores for all live pages |
| **Chunker + Embedder** | Prepares pages for semantic search | Split into ~300-token chunks, embed with Voyage AI voyage-3-lite, store as pgvector | ~15,000+ chunks (512d vectors) |
| **BM25** | Scores text relevance | BM25F with 4× title weight, term frequency × inverse document frequency × length normalization | k1=1.2, b=0.75 |
| **Neural Reranker** | Refines top results with a cross-encoder | ONNX inference with ms-marco-MiniLM-L-6-v2 (22M params), runs locally on CPU | Reranks top 40 candidates, ~10 ms each |
| **Ranking** | Combines signals | 80% BM25 + 20% PageRank, exponential freshness decay, 7-day recency bonus | min-max normalized, tunable live in the UI |
| **Spell correction** | Fixes typos before searching | Levenshtein edit-distance ≤ 2, vocabulary from page titles + indexed stems | Proper nouns protected via terms table |
| **AI Overview** | Generates a summary with citations | Co-occurrence fan-out → hybrid retrieval (vector + keyword) → Groq streaming with retry | `openai/gpt-oss-120b`, cached 24h |
| **AI Chat** | Follow-up conversation with context | Multi-turn chat grounded in retrieved chunks, inline citations | Groq streaming |

## The UI

The frontend is a **React Flow canvas** that visualizes the entire pipeline as an interactive node graph. Search a query and watch data flow through each stage in real-time.

- **Left side**: Build pipeline (crawler → indexer → stores)
- **Right side**: Query pipeline (tokenize → lookup → rank → results)
- **Click any node** to see real data — actual postings from the inverted index, PageRank scores, RAG chunks
- **Live WebSocket** progress during crawl/index/embed jobs
- **Google-style results** with score breakdowns, AI Overview with citations, and follow-up chat
- **DuckDuckGo-style hero** with live dashboard charts on the landing page

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, React Flow, Tailwind v4, TypeScript |
| Backend | FastAPI, Python 3.12+ |
| Database | PostgreSQL 16 + pgvector |
| Reranking | ONNX Runtime (ms-marco-MiniLM-L-6-v2, 22M params, CPU) |
| LLM | Groq API (`openai/gpt-oss-120b`) |
| Embeddings | Voyage AI API (voyage-3-lite, 512d) |
| Hosting | Railway |

## Project Structure

```
backend/
├── crawler/        # BFS web crawler (fetcher, parser, queue manager)
├── indexer/        # inverted index builder + tokenizer
│   └── docs/       # technical write-ups on indexing decisions
├── ranker/         # BM25F + PageRank + ONNX neural reranker
├── search/         # query engine, spell correction, pipeline explainer
├── rag/            # chunker, embedder, retriever, query fan-out
├── ai_overview/    # Groq streaming, response caching, follow-up chat
├── api/            # REST endpoints + WebSocket jobs + scheduling
└── scripts/        # CLI: crawl, index, pagerank, build_rag

frontend/
├── app/            # Next.js app router (search + explore + dashboard)
├── components/
│   ├── canvas/     # React Flow nodes, edges, detail panels
│   └── playground/ # control panels for live tuning
├── hooks/          # useSearchEngine, useWebSocket, useResizable
└── lib/            # API client, types, hooks
```

## Running locally

### Prerequisites
- Python 3.12+
- Node.js 18+
- PostgreSQL 16+ with pgvector
- API keys: [Groq](https://console.groq.com), [Voyage AI](https://dash.voyageai.com)

### Endpoint access

Read endpoints — search, explore, stats — are public.

Operational endpoints — crawl, index rebuild, embedding rebuild, PageRank recompute,
schedules — require `X-API-Key` matching the `ADMIN_API_KEY` environment variable.
If `ADMIN_API_KEY` is unset, those endpoints return `503` rather than running unprotected.

The playground's Operations tab has a field for the key. It is entered once and
kept in that browser's `localStorage` — deliberately not a `NEXT_PUBLIC_*`
variable, which would be inlined into the client bundle and visible to every
visitor.

### Backend

```bash
cd backend
pip install -e .

# Download the ONNX cross-encoder used for neural reranking (~90 MB).
# Skip this and search still works, but reranking is disabled.
python scripts/download_model.py

# Start Postgres with pgvector
# The named volume is not optional. Without -v the data lives in the
# container's writable layer, and `docker rm` takes the whole index with it.
docker run -d --name search-pg \
  -v search-pgdata:/var/lib/postgresql/data \
  -e POSTGRES_USER=searchengine \
  -e POSTGRES_PASSWORD=searchengine \
  -e POSTGRES_DB=searchengine \
  -p 5432:5432 pgvector/pgvector:pg16

# Configure
cp .env.example .env  # add GROQ_API_KEY, VOYAGE_API_KEY, ADMIN_API_KEY

# Initialize database
python db.py

# Build the entire search index (run in order)
python scripts/crawl.py        # ~25 min (rate limited)
python scripts/index.py        # ~2 sec
python scripts/pagerank.py     # ~1 sec
python scripts/build_rag.py    # ~5 min (API calls)

# Start
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000).


## Development

```bash
cd backend
pytest tests -q     # 105 tests: tokenizer, ranking maths, SSRF guard, auth, request
                    # bounds, crawl filters, indexer lock ordering
ruff check .
```

CI runs ruff + pytest on the backend and tsc + eslint on the frontend.
[`CLAUDE.md`](CLAUDE.md) documents the architecture, the invariants, and the
mistakes already made once — it is what an agent (or a person) reads before
changing anything here.


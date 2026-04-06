# Mini Search Engine

### A search engine built from scratch to understand how Google really works.

**[Live Demo](https://search.hoangducviet.work)**

![Demo](https://pub-21eb6bdd475e49679838e54eabfd619a.r2.dev/1774634267074-search-engine-demo.gif)

---

A mini search engine built from scratch that covers the core pipeline behind Google Search — **Crawling, Indexing, Ranking** — plus **Neural Reranking**, **AI Overviews**, and **Sports OneBox**.

## The Pipeline

This is what Google does every time you search something. I built each piece.

```
                        BUILD (offline)                                    QUERY (online)
        ┌──────────────────────────────────────┐        ┌──────────────────────────────────────────────┐
        │                                      │        │                                              │
        │   Crawler ──→ Pages DB ──┬──→ Indexer │        │   Search Query                               │
        │   (BFS,       (1000+     │           │        │       │                                      │
        │   robots.txt,  pages)    ├──→ PageRank│        │       ├──→ Spell Check ──→ Tokenize          │
        │   rate limit)            │           │        │       │                      │               │
        │                          └──→ Chunker │        │       │              Index Lookup ──→ BM25   │
        │                               │      │        │       │                                │     │
        │                          Embedder     │        │       ├──→ PageRank Lookup             │     │
        │                               │      │        │       │        │                       │     │
        │                               ▼      │        │       │        ▼                       │     │
        │   ┌─────────┐ ┌──────────┐ ┌───────┐ │        │       │  Combine Scores ──→ Rerank (Top 5)   │
        │   │Inverted │ │PageRank  │ │Vector │ │        │       │                        │             │
        │   │ Index   │ │ Scores   │ │ Store │ │◄───────┤       │                    Results           │
        │   └─────────┘ └──────────┘ └───────┘ │        │       │                        │             │
        └──────────────────────────────────────┘        │       ├──→ Fan-out ──→ Hybrid Retrieval      │
                    ▲                                   │       │                    │             │   │
                    │             Databases are the     │       │               AI Overview        │   │
                    │                  bridge            │       │                    │             │   │
                    └───────────────────────────────────┤       └──→ Sports Detection (OneBox)    │   │
                                                        └──────────────────────────────────────────────┘
```

### What each piece does

| Stage | What it does | How | Numbers |
|-------|-------------|-----|---------|
| **Crawler** | Downloads web pages | BFS traversal, robots.txt compliance, 1.5s rate limiting, dead page tracking | ~1,000+ pages from Wikipedia, BBC Sport, ESPN, FBref, Transfermarkt |
| **Indexer** | Maps every word to the pages containing it | Tokenization (Porter stemmer) → stopword removal → inverted index via PostgreSQL COPY | 100K+ terms, 1M+ postings |
| **PageRank** | Scores page authority from link structure | Iterative algorithm (d=0.85, 20 iterations), handles dangling nodes | Scores for all live pages |
| **Chunker + Embedder** | Prepares pages for semantic search | Split into ~300-token chunks, embed with Voyage AI voyage-3-lite, store as pgvector | ~15,000+ chunks (512d vectors) |
| **BM25** | Scores text relevance | BM25F with 4× title weight, term frequency × inverse document frequency × length normalization | k1=1.2, b=0.75 |
| **Neural Reranker** | Refines top results with a cross-encoder | ONNX inference with ms-marco-MiniLM-L-6-v2 (22M params), runs locally on CPU | Reranks top 5 candidates |
| **Ranking** | Combines signals | 80% BM25 + 20% PageRank, exponential freshness decay, 7-day recency bonus | min-max normalized, tunable live in the UI |
| **Spell correction** | Fixes typos before searching | Levenshtein edit-distance ≤ 2, vocabulary from page titles + indexed stems | Proper nouns protected via terms table |
| **AI Overview** | Generates a summary with citations | Co-occurrence fan-out → hybrid retrieval (vector + keyword) → Groq streaming with retry | Llama 3.3 70B, cached 24h |
| **AI Chat** | Follow-up conversation with context | Multi-turn chat grounded in retrieved chunks, inline citations | Groq streaming |
| **Sports OneBox** | Live match cards above results | Keyword detection for teams/leagues → API-Football integration | Live scores, standings, fixtures |

## The UI

The frontend is a **React Flow canvas** that visualizes the entire pipeline as an interactive node graph. Search a query and watch data flow through each stage in real-time.

- **Left side**: Build pipeline (crawler → indexer → stores)
- **Right side**: Query pipeline (tokenize → lookup → rank → results)
- **Click any node** to see real data — actual postings from the inverted index, PageRank scores, RAG chunks
- **Live WebSocket** progress during crawl/index/embed jobs
- **Google-style results** with score breakdowns, AI Overview with citations, and follow-up chat
- **DuckDuckGo-style hero** with live dashboard charts on the landing page
- **Sports OneBox** — live match cards, standings, and fixtures for sports queries

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, React Flow, Tailwind v4, TypeScript |
| Backend | FastAPI, Python 3.12+ |
| Database | PostgreSQL 16 + pgvector |
| Reranking | ONNX Runtime (ms-marco-MiniLM-L-6-v2, 22M params, CPU) |
| LLM | Groq API (Llama 3.3 70B via `llama-3.3-70b-versatile`) |
| Embeddings | Voyage AI API (voyage-3-lite, 512d) |
| Sports Data | API-Football |
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
├── sports/         # sports query detection + API-Football integration
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

## Run It Yourself

### Prerequisites
- Python 3.12+
- Node.js 18+
- PostgreSQL 16+ with pgvector
- API keys: [Groq](https://console.groq.com), [Voyage AI](https://dash.voyageai.com)

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

# Configure
cp .env.example .env  # add your GROQ_API_KEY and VOYAGE_API_KEY

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


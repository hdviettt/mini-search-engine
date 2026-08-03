# Mini Search Engine — working notes

A search engine built from scratch: crawler → inverted index → BM25F + PageRank
→ ONNX cross-encoder rerank → AI Overview over RAG. FastAPI backend, Next.js
frontend, PostgreSQL + pgvector.

This file is what you read before changing anything. It covers the parts that
are not obvious from the code and the mistakes that have already been made once.

---

## Layout

```
backend/
  crawler/     BFS crawler — fetcher (SSRF guard, robots, rate limit), parser, manager
  indexer/     tokenizer, Porter stemmer, inverted index builder
  ranker/      bm25.py (BM25F), pagerank.py, reranker.py (ONNX cross-encoder)
  search/      engine.py (what users get), explainer.py (instrumented, for the canvas),
               ranking.py (scoring shared by both), spellcheck.py
  rag/         chunker, embedder (Voyage), retriever, query fan-out
  ai_overview/ Groq streaming generation + follow-up chat
  api/         playground.py (routes), jobs.py (background crawl/index/embed)
  auth.py      API key dependency for operational routes
  db.py        schema + connection pool
eval/          labeled query set + nDCG/MRR harness
frontend/      Next.js app; React Flow canvas visualising the pipeline
```

## Two pipelines

**Build (offline).** `crawler` fetches → `parser` extracts text and links →
`is_quality_page` gate → `indexer.index_page` writes postings → `rag.chunker`
splits into ~300-token chunks → `rag.embedder` fills embeddings →
`ranker.pagerank` recomputes authority over the link graph.

**Query (online).** `search.engine.search()`:

1. `tokenize` → stem, drop stopwords
2. `search_bm25` → BM25F scores for every matching page
3. take the top `CANDIDATE_POOL` (500) by BM25 — everything below is bounded by this
4. PageRank + freshness for the pool only
5. cross-encoder reranks the top `RERANK_TOP_K` (5)
6. per-domain dedup across the **whole pool**, then slice the requested page

---

## Invariants

Break these and something quietly rots.

**Schema lives only in `db.py`.** Three copies of `CREATE TABLE` had drifted
apart before they were consolidated. Never inline a `CREATE TABLE IF NOT EXISTS`
in a request handler to "make sure it exists".

**Every route that writes, crawls, or spends money goes on the `admin` router**
in `api/playground.py`, never `router`. `admin` carries
`Depends(require_api_key)`. Read routes stay public — they are the demo.

**`crawler.fetcher.is_safe_url` is not optional and not configurable.** It
blocks private, loopback and link-local addresses, and re-checks after every
redirect. `restrict_domains=false` in a request widens the crawl to any *public*
domain; it can never reach an internal one. Seeds go through the same gate as
discovered links.

**Scoring lives in `search/ranking.py`.** `engine.py` and `explainer.py` both
rank. When each carried its own freshness formula they drifted, and the
playground canvas explained scoring the engine was not doing. Change the
formula in one place.

**Bounded queries only.** Never build `IN (%s, %s, …)` from an unbounded list —
a common term matches thousands of pages. Use `= ANY(%s)` against a pool that
is already capped.

**No N+1 in the query path.** Fetch page rows for a whole slice with one
`= ANY(%s)`, not one query per result.

**Dependencies are declared in `backend/pyproject.toml` and nowhere else.**
The Dockerfile installs with `pip install .`. A second hardcoded list in the
Dockerfile is exactly why `pip install -e .` was broken for months while the
deployed image worked.

**`logging`, never `print`,** outside `backend/scripts/` (those are CLIs and
stdout is correct there).

---

## Gotchas

**Embedding dimension.** `db.py` builds the `chunks.embedding` column from
`config.VOYAGE_DIMENSIONS`. `rag/embedder.py` additionally auto-`ALTER`s the
column to whatever the provider actually returns — Voyage voyage-3-lite is 512,
the Ollama fallback is 768. If vector search silently returns nothing, check
the column type first.

**The reranker fails soft.** A missing model means `rerank()` returns
candidates with `rerank_score: None` and search still works, just worse. It
logs a warning; it does not raise. Run `python scripts/download_model.py`.
`RERANK_ENABLED=false` disables it deliberately — that is how you measure what
it is worth.

**`explain` is a separate code path.** `/api/search/explain` calls
`search.explainer`, not `search.engine`. It exists to feed the canvas with
per-stage traces. If you change ranking, change both — or better, change
`search/ranking.py` and let both pick it up.

**Placeholders do not work inside SQL string literals.** `INTERVAL '%s days'`
is not a parameter, it is the literal text `%s`. Use `make_interval(days => %s)`.
That mistake silently broke `/api/stats/history` on every call.

**Background jobs use `get_connection()`, not the pool.** A crawl holds its
connection for minutes and would starve request traffic. Request handlers use
`Depends(get_db)`.

**`total_results` is the BM25 match count**, not the number of pages you can
actually page through — pagination is bounded by `CANDIDATE_POOL`. This is
deliberate and standard, but do not treat the two as the same number.

---

## Commands

```bash
cd backend

pip install -e ".[dev]"           # deps come from pyproject.toml
python scripts/download_model.py  # ONNX cross-encoder, ~90 MB
python db.py                      # create schema

python scripts/crawl.py           # ~25 min, rate limited
python scripts/index.py
python scripts/pagerank.py
python scripts/build_rag.py       # needs VOYAGE_API_KEY

uvicorn main:app --reload

pytest tests -q
ruff check .
```

Quality measurement, with the API running:

```bash
python eval/run.py --baseline                  # record the current behaviour
python eval/run.py --compare eval/baseline.json
RERANK_ENABLED=false uvicorn main:app          # then re-run to price the reranker
```

Environment lives in `backend/.env` — see `backend/.env.example`.
`ADMIN_API_KEY` is required for operational routes; unset means 503, never open.

The frontend never ships the key. `AdminKeyGate` in the Operations tab takes it
once and stores it in `localStorage`; `adminFetch` in `lib/api.ts` attaches it.
A `NEXT_PUBLIC_*` variable would be inlined into the bundle and public.

---

## Open questions the eval harness exists to answer

- Does the cross-encoder earn its 100-150 ms? (`search/ranking.py: RERANK_TOP_K`)
- Is `RANK_ALPHA = 0.8` the right BM25/PageRank split? (`config.py`)
- `RERANK_MIN_SCORE = -8.0` is a magic number picked by eye. What does the data say?
- Is `CANDIDATE_POOL = 500` deep enough to not lose good results?

Do not tune these by feel. Change one, run `eval/run.py --compare`, keep the
number that wins.

---

## Working style

- Small commits, terse subject ≤ 70 chars, body explains *why*.
- Add a test with the fix, not after it. `tests/` covers pure functions —
  tokenizer, stemmer, ranking maths, SSRF guard, auth, request bounds.
- CI runs ruff + pytest on the backend and tsc + eslint on the frontend.
  Frontend eslint has known warnings (React data-fetching idiom in the
  playground components); errors are the gate, warnings are tracked debt.
- If a change affects ranking, the eval delta belongs in the PR description.

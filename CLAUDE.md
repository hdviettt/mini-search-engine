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

**Unlayered CSS beats every Tailwind utility.** Tailwind v4 puts utilities in
a cascade layer, and any rule outside a layer outranks the whole layer. A bare
`h3 { color: … }` in `globals.css` silently overrode `text-[var(--link-blue)]`
on every heading in the app and turned the search result titles black. Element
selectors in `globals.css` belong inside `@layer base`.

**Background jobs use `get_connection()`, not the pool.** A crawl holds its
connection for minutes and would starve request traffic. Request handlers use
`Depends(get_db)`.

**`total_results` is the BM25 match count**, not the number of pages you can
actually page through — pagination is bounded by `CANDIDATE_POOL`. This is
deliberate and standard, but do not treat the two as the same number.

---

## Design system

The frontend runs the same Material 3 system as the blog at hoangducviet.work,
so the two properties read as one product. Tokens live in
`frontend/app/globals.css`.

- **Primary is SEONGON Prosperous Blue `#004AEF`** (`hsl(221 100% 47%)`), with a
  lighter tint on dark surfaces. Change `--md-sys-color-primary`; everything
  else derives from it.
- **Light by default**, dark via `data-theme="dark"`. An inline script in
  `layout.tsx` sets the attribute before first paint so a reader who chose dark
  never sees a white flash.
- **Never hardcode a hex.** Use the M3 roles (`--md-sys-color-*`) or the app
  aliases (`--bg`, `--text`, `--accent`, `--border`, …) which map onto them.
  The aliases exist so the original components did not need rewriting.
- **Type** — M3 scale utilities (`.md-headline-*`, `.md-title-*`, `.md-body-*`,
  `.md-label-*`). Google Sans Flex, loaded via `<link>`; JetBrains Mono for
  code and tabular numbers.
- **Shape** — the M3 corner scale (4/8/12/16/28), not sharp corners.
- **Components** — `.md-btn` (+ `-filled`/`-tonal`/`-outlined`/`-text`,
  `-sm`/`-lg`/`-pill`), `.md-card` (+ `-filled`), `.md-field` (+ `-dense`).
  Hairline edges, no elevation at rest, a state layer on hover.

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

## Measured baseline

First run against production, 50 labelled queries (`eval/baseline.json`):

```
nDCG@10  0.7394   MRR  0.6259   zero-result precision  0.40
latency  p50 1325 ms   p95 2180 ms

stopword_heavy 0.9598 · multi_term 0.8172 · entity 0.7525
informational  0.7217 · navigational 0.6402 · misspelled 0.6218
```

**Does the cross-encoder earn its keep? Yes — and it costs 8×, not the
100-150 ms this file used to claim.** With `RERANK_ENABLED=false`: nDCG drops to
0.5689 (−23%), MRR to 0.3407 (−46%), and p50 falls from 1325 ms to 167 ms. Some
queries collapse entirely without it (`kylian mbappe` 1.000 → 0.000). Keep it on;
the latency figure in any comment claiming otherwise is wrong.

Read that number together with defect 0 below: the stage earns its 23% mostly by
*deleting* weak candidates, not by reordering strong ones.

## Known defects the measurement surfaced

Ranked by what the numbers say, not by feel. Fix one, re-run
`eval/run.py --compare eval/baseline.json`, keep the change only if it wins.

0. **`RERANK_MIN_SCORE = -8.0` deletes 60% of everything the reranker scores.**
   Measured over all 50 queries: the cross-encoder scores 240 candidates and
   144 of them are removed from the result set entirely, not demoted. Ten
   queries with real answers lose their *whole* reranked head — `offside rule`,
   `what is a hat trick`, `goalkeeper position`, `var video assistant referee`,
   `football transfer market`, `what is a clean sheet`,
   `football formation 4 4 2`, `youngest player to win ballon d'or`,
   `how football tactics work`, `serie a`. Only 2 queries of 50 keep all five.

   This is why the reranker is worth 23% nDCG: most of that is the filter
   throwing out bad candidates, not the model reordering good ones. That is a
   defensible design, but it is not what "reranking" implies, and the threshold
   was tuned by eye. Before changing it, note that it also drives zero-result
   precision — a higher `RERANK_MIN_SCORE` would raise 0.40 and cost recall.
   Measure both.

1. **No minimum-should-match.** BM25 admits any document matching any term, so
   `kubernetes ingress controller annotations` returns 1,429 football pages.
   Zero-result precision is 0.40 — three of five nonsense queries leak.
2. **No phrase or proximity signal.** `serie a` loses "a" to the stopword list
   and searches the single stem `seri`; top result is LDU Quito.
3. **Spell correction is wired to `/api/search/explain` but not `/api/search`.**
   It has never run for a real query. `bundesliaga` returns nothing.
4. **No domain signal in the ranker.** `bbc sport football` names a host; BM25F
   scores title and body only, so it can never reach it.

Still open, still tuned by eye: `RANK_ALPHA = 0.8`, `RERANK_MIN_SCORE = -8.0`,
`CANDIDATE_POOL = 500`.

The evaluation does not yet separate a coverage gap (page was never crawled)
from a ranking failure (page exists, ranked too low). Some zero scores above are
the former.

## This repo is the measuring stick for a separate project

A from-scratch cross-encoder is being built in its own repository: transformer
encoder written by hand, trained as a reranker, then measured here against
`ms-marco-MiniLM-L-6-v2`.

That project depends on three things in this one staying stable:

- `eval/queries.yaml` — the 50 labelled queries. Adding to it is fine; editing
  or removing an existing query invalidates the comparison.
- `eval/baseline.json` — the reference run. Do not regenerate it casually.
- `RERANK_ENABLED` — the switch that isolates the reranker's contribution.

To score a replacement model, point it at the same `eval/run.py --compare`
path. A model that loses to the off-the-shelf one is a valid result; it was
trained on 500K labelled Microsoft pairs.

---

## Working style

- Small commits, terse subject ≤ 70 chars, body explains *why*.
- Add a test with the fix, not after it. `tests/` covers pure functions —
  tokenizer, stemmer, ranking maths, SSRF guard, auth, request bounds.
- CI runs ruff + pytest on the backend and tsc + eslint on the frontend.
  Frontend eslint has known warnings (React data-fetching idiom in the
  playground components); errors are the gate, warnings are tracked debt.
- If a change affects ranking, the eval delta belongs in the PR description.

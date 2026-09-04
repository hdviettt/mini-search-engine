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

**Terms are upserted in sorted order, and that is load-bearing.**
`ON CONFLICT DO UPDATE` takes an exclusive row lock even when the write is a
no-op, so two pages sharing vocabulary deadlock if they take those locks in
different orders. Iterating a `Counter` gives insertion order, which is
page-dependent. `sorted(all_counts)` in `indexer.index_page` gives every
transaction the same global lock order. This is not a style preference: the
unsorted version killed a scheduled crawl one page in on 2026-09-04, and
`tests/test_indexer_lock_order.py` fails if it comes back.

**One crawl writes the index at a time.** `api.jobs.acquire_indexer_lock` takes
a Postgres advisory lock around the whole build path. Advisory rather than a
`threading.Lock` because it has to hold across processes and replicas. A
scheduled run that cannot get it skips and waits for its next tick — but it must
still fall through to `_start_timer`, because that reschedule is the only thing
keeping the schedule alive. An early `return` there silently retires it forever.

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

**Never enable Railway's app sleeping on the Postgres service.** It stops the
container when HTTP traffic goes quiet, but database clients speak raw TCP on
5432, so the signal Railway watches is not the signal that matters. The result
is a database hard-killed and crash-recovered in a loop — `database system was
not properly shut down`, then `FATAL: the database system is starting up` on
every reconnect. It cost a day of 500s in September 2026. The backend sets
`sleepApplication: false` in `backend/railway.json`; Postgres has no repo, so
that one is a dashboard setting and has to be checked by hand.

**`/health` touches the database; `/health/live` does not.** Railway's
healthcheck points at `/health/live`, deliberately: `/health` returns 503 when
Postgres is unreachable, and restarting the API does not fix a broken database
— it just adds a crash loop to the outage. `/health` is for external uptime
monitoring, which is what should page you. It used to be a hardcoded
`{"status": "ok"}`, which is why nothing noticed the outage above.

**Two classes of Wikipedia page are excluded from the crawl, for the same
reason.** `_is_wikipedia_meta_page` drops the non-article namespaces (`Help:`,
`File:`, `Category:`, …) and `_is_wikipedia_citation_page` drops the
citation-identifier articles (`ISBN`, `Digital object identifier`, `Wayback
Machine`, …). Both are linked from nearly every article, so both accumulate
enormous in-degree and take over PageRank. With them in, the top of the graph
was `Help:Category` and `Wikipedia:Protection policy`; remove only the
namespaces and `ISBN` and `DOI` move straight into the vacancy. With both gone,
`Association football` ranks first, which is what a football corpus should look
like. `scripts/purge_wiki_meta.py` cleans pages crawled before the filters
existed — the crawler fix stops new ones, it does not remove old ones.

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

**`eval/baseline.json` is deliberately not regenerated.** It is the reference
the from-scratch cross-encoder is measured against, and its fixture is frozen
against these numbers. Record current behaviour here instead.

### Current, after `RERANK_TOP_K` 5 → 40

```
nDCG@10  0.8884   MRR  0.8370   zero-result precision  0.60
latency  p50 408-468 ms   p95 656-926 ms
```

**+0.1490 nDCG@10, +0.2111 MRR, +0.20 zero-result precision — and roughly
three times faster than the recorded baseline.**

Zero-result precision moving is the surprise. Defect 1 says that failure is
upstream in BM25, and it is; but a deeper rerank hands `RERANK_MIN_SCORE`
enough candidates to throw the junk out of a nonsense query, so two of the five
now come back empty instead of leaking. The reranker cannot fix the recall
problem, only the visible symptom.

### After removing Wikipedia's furniture from the link graph

Measured against production on 2026-09-05, after the meta-namespace and
citation-identifier filters and `scripts/purge_wiki_meta.py` (169 pages,
24,594 links and 6,460 queued URLs removed):

```
nDCG@10  0.9101   MRR  0.8370   zero-result precision  0.60
latency  p50 538 ms   p95 840 ms   empty responses 1 (was 8)

entity 0.9895 · informational 0.9537 · navigational 0.9257
multi_term 0.8866 · stopword_heavy 1.0000 · misspelled 0.5707
```

**+0.1707 nDCG@10 and +0.2111 MRR against the frozen baseline**, and +0.0217
nDCG@10 against the depth-40 run above at identical MRR. Entity, informational
and navigational all gain more than 0.23 — which is what you would expect from
deleting pages that were absorbing authority without ever being a useful
answer.

**Quote the keyword counter beside this, as always.** A five-line function
scores 0.7551 on this eval. The gain is real but the ruler still rewards
string overlap.

**One intent went backwards: misspelled, 0.6218 → 0.5707.** `premeir league`
fell from 0.631 to 0.000. That is defect 3 below, not a new fault — spell
correction never runs on `/api/search`, so the query searches the single stem
`leagu`, and which league pages surface is luck. The purge changed the luck.
Fixing defect 3 is the way to move that number; do not tune anything else at it.

### Choosing the depth

Five depths, deployed and measured. Every row is two eval runs; the last three
were taken on a warm instance after twenty priming queries.

| `RERANK_TOP_K` | nDCG@10 | MRR | zero-result | p50 |
|---|---|---|---|---|
| 5 (baseline) | 0.7394 | 0.6259 | 0.40 | 1325 ms · cold |
| 10 | 0.8476 | 0.7259 | 0.40 | 834-941 ms · cold |
| 20 | **0.8920** | 0.8074 | 0.40 | **295-311 ms** |
| **40** | 0.8884 | **0.8370** | **0.60** | 408-468 ms |
| 80 | 0.8941 | 0.8074 | 0.60 | 4671-4798 ms |

**Quality reproduces exactly. Latency does not, and the first two rows are
worthless as timings** — they were taken minutes after a redeploy, and cold
instance state swamps everything else. The reranker itself costs about 10 ms
per candidate timed directly with the weights loaded; the deployed cost is
nearer 10-15 ms per candidate up to 40, then something else takes over.

40 is the pick: the best MRR of any depth and the zero-result improvement, for
0.0036 of nDCG@10 against depth 20. That difference is real but trivial, and it
is the only column where 20 wins.

**The cliff between 40 and 80 is not the model.** Ten times the latency for no
quality is the wrong shape for inference, which is linear in candidates. The
likely cause is `SELECT id, url, title, body_text FROM pages WHERE id = ANY(%s)`
in `search/engine.py` pulling eighty full page bodies. Nobody has confirmed
that. Do not raise the depth past 40 without re-measuring, and if deeper is ever
wanted, look at that query first.

**Does the cross-encoder earn its keep? Yes — and it costs 8×, not the
100-150 ms this file used to claim.** With `RERANK_ENABLED=false`: nDCG drops to
0.5689 (−23%), MRR to 0.3407 (−46%), and p50 falls from 1325 ms to 167 ms. Some
queries collapse entirely without it (`kylian mbappe` 1.000 → 0.000). Keep it on.

**That 1,158 ms is an end-to-end gap, not the model's compute.** Timed directly
with the weights already loaded, the cross-encoder costs about 10 ms per
candidate and scales near-linearly: 42 ms for 5, 94 ms for 10, 196 ms for 20.
This file previously said the "~100-150 ms for 10 candidates" comment in
`reranker.py` was wrong; the comment was right, and conflating it with the p50
gap was the mistake. Whatever accounts for the rest of that second — cold
starts, a slower shared CPU, per-request setup — has not been isolated, and
budgeting for a deeper rerank should use the per-candidate figure, not the gap.

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

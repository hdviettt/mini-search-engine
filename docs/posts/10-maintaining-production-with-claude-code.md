# What it takes to let an agent maintain production

*Part 10 of Building a Mini Search Engine*

The search engine in this series has been live for months. I write most of it
with Claude Code. That combination sounds like it should be the interesting part
— and it is not. The interesting part is what had to be true before it was safe.

I found out by auditing my own repository properly for the first time.

## What the audit found

The backend had an unauthenticated endpoint that accepted a URL and fetched it.

```
POST /api/crawl/start
  → job_manager.start_crawl(seed_urls, …)
  → manager.seed(urls)          # never scope-checked
  → fetcher.fetch(url)          # httpx.get, follow_redirects=True
  → stored in `pages`, readable via /api/explore/page/{id}
```

No credential anywhere in that chain. Seed URLs skipped the scope check
entirely — it was only ever applied to links discovered *during* a crawl, never
to the seeds a caller supplied. Nothing blocked private or link-local
addresses. The response came back out through the explore endpoint.

That is server-side request forgery with read-back, on a public service, and it
had been live the whole time I was writing posts about how the crawler works.

It was not alone:

- `POST /api/embedding/rebuild` — unauthenticated, and it calls a paid
  embeddings API in a loop. Anyone could spend my credits.
- `max_pages` and `iterations` had no upper bound. One request could pin the
  process for hours.
- `pip install -e .` did not work. The code imported `numpy`, `onnxruntime` and
  `tokenizers`; `pyproject.toml` declared none of them. The Dockerfile carried
  its own hardcoded list, so the deployed image was fine while every fresh clone
  broke at step one. Two sources of truth, one of them wrong, invisible because
  production never used it.
- `/api/search` returned HTTP 500 in production. `pages.last_checked_at` did not
  exist, because applying migrations was a manual step somebody had to remember,
  and nobody had.
- Pagination was accepted and ignored. Page 2 returned page 1.
- The playground visualiser and the search engine each carried their own copy of
  the freshness formula. They had drifted. The canvas was explaining scoring the
  engine was not performing.

None of this is exotic. It is the ordinary sediment of a project built fast by
one person, and every item was findable by reading the code carefully once.

## The agent did not cause any of it, and would not have caught it either

This is the part worth being precise about, because the easy story — "AI wrote
insecure code" — is wrong, and the comfortable story — "the agent will catch it"
— is also wrong.

An agent works from the patterns already in the repository. When
`api/playground.py` contains fifteen routes with no authentication, adding a
sixteenth without authentication is not a lapse in judgement. It is consistency.
The file *is* the specification. Every convention in a codebase, including the
mistakes, is training data for the next change.

So the question is not whether the agent is careful. It is whether the repository
states what it expects — and mine did not state anything at all.

## What actually made it safe

Four things, in this order. None of them are about prompting.

**A file that states the invariants.** `CLAUDE.md` at the root, and it is not a
description of the architecture. It is the list of things that must stay true:

> Every route that writes, crawls, or spends money goes on the `admin` router,
> never `router`. `admin` carries `Depends(require_api_key)`. There is no
> per-route auth decorator — putting a write route on `router` silently ships it
> unauthenticated.

> Schema lives only in `db.py`. Three copies of `CREATE TABLE` had drifted apart
> before they were consolidated. Never inline one in a request handler.

> `crawler.fetcher.is_safe_url` is not optional and not configurable.

Each of those sentences exists because the opposite already happened. A file
that describes what the code *does* is redundant with the code. A file that
records what already went wrong is not recoverable from reading it.

**Structure that makes the wrong thing hard.** Documentation is a suggestion; a
separate router with the dependency attached is a wall. Operational routes moved
to `admin = APIRouter(dependencies=[Depends(require_api_key)])`. There is now no
way to add an authenticated-by-accident route, because auth is a property of the
router, not of remembering a decorator. Unset the key and every protected route
returns 503 — an unset credential must never mean "open to everyone".

**Tests on the parts that have no dependencies.** Eighty-nine of them, all on
pure functions: the tokenizer, the stemmer, the ranking maths, the SSRF guard,
request bounds, the evaluation metrics. No database, no network, sub-second.
The SSRF test is the fence that stops the hole coming back:

```python
@pytest.mark.parametrize("url", [
    "http://169.254.169.254/latest/meta-data/",  # cloud metadata
    "http://127.0.0.1:8000/admin",
    "http://10.0.0.5/",
    "http://[::1]/",
])
def test_rejects_non_public_addresses(url):
    assert is_safe_url(url) is False
```

**A measurement that disagrees with me.** Tests catch what I thought to assert.
The evaluation from [part 9](09-measuring-the-search-engine.md) catches what I
was wrong about — and being wrong is the failure mode that matters when
something else is writing the code. Fifty labelled queries, nDCG and MRR by
intent, a saved baseline, and a comparison on every change to ranking. Without
it, "this change improved search" is an opinion.

## The skills encode the mistakes

Claude Code lets you commit procedures alongside the code. I have two, and both
exist because something shipped.

`add-search-endpoint` walks the three decisions every route needs: which router
(auth), where the database connection comes from, what bounds the input. It
exists because operational routes were added to the public router.

`measure-ranking-change` requires a baseline, one change at a time, and an
honest report of the by-intent trade — a change that lifts entity queries while
sinking informational ones is a trade, not an improvement. It exists because the
ranking constants were tuned by eye. `RERANK_MIN_SCORE = -8.0` is still a number
I picked by looking at a few results.

Neither is clever. They are checklists. Their value is that they live in the
repository, so the next session gets them without me remembering to explain
anything.

## The trap nobody saw coming

While restyling the frontend, every search result title rendered black instead of
the link colour. The token was correct. The utility class was correct. Measuring
the computed style was the only way to see it:

```
--link-blue: hsl(221 100% 47%)   ← correct
h3 computed color: rgb(10, 10, 10)   ← black
```

Tailwind v4 puts utilities in a cascade layer, and unlayered CSS outranks the
entire layer. A bare `h3 { color: … }` in `globals.css` — three lines of base
styling — silently beat `text-[var(--link-blue)]` on every heading in the
application.

I wrote that CSS. No test covers it. Nothing would have flagged it. I found it
because the screenshot looked wrong and I measured instead of guessing.

That one is in `CLAUDE.md` now too.

## What this actually is

"Maintained by an agent" is not a property of the agent. It is a property of the
repository: stated invariants, structure that makes the wrong thing hard, tests
on what can be tested cheaply, and a measurement that can contradict you.

Those four things are what let anyone — a colleague, a future me, a model —
change a system without quietly breaking it. The agent just makes the absence of
them expensive faster.

The repository is at
[github.com/hdviettt/mini-search-engine](https://github.com/hdviettt/mini-search-engine),
including `CLAUDE.md`, the skills, and the evaluation.

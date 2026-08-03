# What 50 queries revealed about a search engine

*Part 9 of Building a Mini Search Engine*

Ask this search engine — which has only ever crawled football pages — about
Kubernetes:

```
kubernetes ingress controller annotations   →  1,429 results
```

It has never seen a Kubernetes page. It returns 1,429 of them anyway, and it
does so confidently, with scores, in the same layout as a good answer.

That result had been sitting there since the first version of the ranker. It
survived eight parts of this series. No amount of typing queries and reading the
first few results would ever have surfaced it, because nobody types a Kubernetes
query into a football engine. Failures like that are only visible to a
measurement designed to look for them.

So: fifty labelled queries across six intent types — entity lookups,
informational questions, navigational queries, multi-term queries, misspellings,
and queries that should return nothing at all. nDCG@10 and MRR per query, broken
down by intent so a weakness can be traced to a *kind* of query instead of
disappearing into an average.

Here is the scoreboard.

```
nDCG@10                0.7394
MRR                    0.6259
zero-result precision  0.4000
latency p50            1325 ms
latency p95            2180 ms

by intent
  stopword_heavy   0.9598  ████████████████████
  multi_term       0.8172  █████████████████
  entity           0.7525  ███████████████
  informational    0.7217  ██████████████
  navigational     0.6402  █████████████
  misspelled       0.6218  ████████████
```

Four mechanisms explain almost all of the gap. Each one is a property of how
classical retrieval works, not a coding error — which is why each survived so
long.

---

## 1. Any-term matching, and the 1,429 Kubernetes pages

BM25 admits a document if it contains **any** query term. There is no
requirement that a document match some minimum share of the query. The score is
a sum over matched terms; unmatched terms contribute nothing, and nothing
penalises their absence.

Query each term of that Kubernetes query separately against the index and the
result set explains itself:

| term | documents in this football index |
|---|---:|
| `kubernetes` | 0 |
| `ingress` | 0 |
| `annotations` | 20 |
| **`controller`** | **1,422** |
| | |
| *full query* | **1,429** |

Every term that actually *defines* the query matches nothing. The entire result
set is `controller` — an ordinary English word that appears across 1,422 football
pages, in the sense of a midfielder who controls the game, or a club's financial
controller. The query is answered by its least meaningful word.

The other leaks are the same shape:

| query | terms that matched | terms that matched nothing | results |
|---|---|---|---:|
| `sourdough starter hydration ratio` | `starter` 226, `ratio` 284 | `sourdough`, `hydration` | 504 |
| `quantum chromodynamics lagrangian` | `quantum` 20 | `chromodynamics`, `lagrangian` | 20 |

Production engines guard against this with a *minimum-should-match* rule: a
query of N terms must match some fraction of them before a document qualifies at
all. Elasticsearch exposes it as a first-class parameter. Without one, an index
will confidently answer questions about subjects it has never seen — and the
more common the incidental words in a query, the more confident it looks.

Only two of the five deliberate nonsense queries returned nothing: pure gibberish
(`zzzzqqqxyw`) and pure punctuation. Anything made of real English words gets
through.

---

## 2. The stemmer eats "Serie A"

```
serie a  →  LDU Quito · Jimmy McGovern · Serie BKT football
```

Two words, a major football competition, and not one relevant result. The cause
is upstream of the ranker, in tokenisation:

```
"serie a"
   │  lowercase, strip punctuation
   ▼
["serie", "a"]
   │  drop stopwords          ← "a" is a stopword, correctly
   ▼
["serie"]
   │  Porter stemmer
   ▼
["seri"]                       ← identical to the stem of "series"
```

The index agrees. Searching each form alone:

| query | results |
|---|---:|
| `serie` | 1,912 |
| `series` | 1,913 |

One document apart. To this engine, *Serie A* and *series* are the same word,
and the "A" that distinguishes the competition from a common noun was discarded
before scoring began — correctly, by a stopword list that is right for prose and
wrong for proper nouns.

Nothing downstream can recover it. Bag-of-words scoring has no concept of
adjacency: there is no phrase matching and no term-proximity signal anywhere in
the ranker. A two-word proper noun where one word is a stopword is, structurally,
invisible.

This is why real engines carry phrase handling, n-gram indexes, or entity
dictionaries. Each exists to solve a case that unigram BM25 cannot represent at
all.

---

## 3. Navigational queries have no path to their target

```
bbc sport football  →  Liverpool F.C. · Premier League
```

The BBC pages are in the index. The crawler seeded them. The query names the
site almost exactly — and still cannot reach it.

Ranking here is BM25F over two fields, title and body, blended with PageRank:

```
score = 0.8 × BM25F(title⁴, body) + 0.2 × PageRank
```

The URL is not a field. The domain is not a signal. A query that is effectively
a hostname gets scored as a topic query, so it retrieves the most
football-central pages instead of the site being named.

Navigational intent is roughly a third of real search traffic, and it is the one
class of query where the user has already told you the answer. Serving it needs
a signal the ranker does not have.

---

## 4. The cross-encoder is worth 23% of nDCG, and costs 8× the latency

The most expensive stage in the query path re-scores the top five candidates
with a cross-encoder — `ms-marco-MiniLM-L-6-v2`, 22M parameters, ONNX on CPU.
Unlike a bi-encoder, it encodes the `(query, document)` pair jointly, so it can
judge relevance that vector similarity misses.

Turning it off and re-running the identical fifty queries isolates exactly what
it contributes:

| | reranker on | reranker off | delta |
|---|---:|---:|---:|
| nDCG@10 | 0.7394 | 0.5689 | **−23%** |
| MRR | 0.6259 | 0.3407 | **−46%** |
| latency p50 | 1,325 ms | 167 ms | **−1,158 ms** |
| latency p95 | 2,180 ms | 401 ms | −1,779 ms |

MRR is the harsher measure — it asks where the *correct* answer landed, not
whether something related appeared somewhere — and it nearly halves. Some
queries depend on the stage entirely:

```
kylian mbappe                     1.000 → 0.000
world cup final results history   1.000 → 0.000
what is a hat trick               0.969 → 0.333
how football tactics work         0.631 → 0.000
```

Without reranking, `kylian mbappe` surfaces no relevant result in its top ten.
BM25 finds documents that *mention* the words. The cross-encoder is what
identifies which of them is *about* him.

The cost is the other half of the finding. The code comment describing this
stage claimed "~100-150 ms for 10 candidates." Measured end to end, it is
**1.16 seconds at p50** — an eight-fold increase. That figure is taken over the
public internet to a small container, so it is not pure model time, but the
reranker was the only variable changed between the two runs.

Both halves matter. A stage that lifts relevance by a quarter is worth keeping.
A stage that costs a second is worth batching, caching, or moving off the
critical path — and neither decision is possible while the number in the
documentation is an order of magnitude wrong.

---

## Where the failures live

```
 query
   │
   ├─ spell correction ····· wired to /search/explain, not /search   ← never runs
   │
   ├─ tokenise + stem ······ "serie a" → "seri"                      ← §2
   │
   ├─ BM25F (title⁴, body) · any-term match, no minimum              ← §1
   │                         no URL or domain field                  ← §3
   ├─ PageRank blend
   │
   └─ cross-encoder ········ +23% nDCG, +1.16s                       ← §4
```

The spell corrector deserves its own line. It exists, it works — Levenshtein
distance ≤ 2 against a vocabulary of page titles and indexed stems, with proper
nouns protected — and it is attached to `/api/search/explain`, the endpoint that
feeds the pipeline visualiser. The endpoint that serves actual searches never
calls it. `bundesliaga` returns zero results in 190 ms: fast, and wrong. The
feature has been demonstrated many times and has never once run for a real
query.

---

## What the numbers changed

The intuition before measuring was that the engine was in reasonable shape and
the remaining work was features: better AI Overviews, more sources, a knowledge
graph. Fifty queries and twenty minutes redirected all of it. The four highest
-value changes are all corrections, and none would have been chosen from a demo:

1. **Minimum-should-match** — so a query has to be *about* something the index
   contains.
2. **Phrase and proximity scoring** — so two-word entities survive the stopword
   list.
3. **Wire spell correction into `/api/search`** — where it was always meant to be.
4. **A URL/domain signal** — so navigational queries can reach the site they name.

## What this measurement is not

Fifty queries, labelled by substring match against result titles and URLs —
stable across re-crawls, which change page IDs, but coarse. Relevance is graded 3
for "this is the page the query asks for" and 1 for "related and reasonable",
judged by one person. Independent judgements over a larger set would be a better
instrument.

It also does not yet separate a *coverage* gap from a *ranking* gap. When
`bundesliga` returns Bundesliga managers instead of the league page, the
measurement cannot say whether the league page ranked too low or was never
crawled. Those are different problems with different fixes, and they currently
score the same.

But a coarse instrument that runs in twenty minutes and disagrees with you is
worth more than a rigorous one that never gets built. Every finding above came
out of the first run.

The engine sits at 0.7394. The useful part is not the number — it is that there
is now a way to tell whether the next change was an improvement or merely a
change.

---

*The evaluation, the labelled query set, and the engine are at
[github.com/hdviettt/mini-search-engine](https://github.com/hdviettt/mini-search-engine).*

# I measured my own search engine

*Part 9 of Building a Mini Search Engine*

For eight parts of this series I built pieces — a crawler, an inverted index,
BM25F, PageRank, a cross-encoder reranker, AI Overviews — and judged each one
the way most side projects get judged. I typed a query I cared about, looked at
the first few results, and decided it felt right.

That is not measurement. It is a demo.

So I wrote an evaluation and pointed it at my own production instance. Fifty
labelled queries across six intent types: entity lookups, informational
questions, navigational queries, multi-term queries, misspellings, and queries
that should return nothing at all. For each one I recorded nDCG@10, MRR, and
latency, then broke the numbers down by intent so a regression could be traced
to a *kind* of query rather than an average.

Here is what the engine I have been writing about for eight parts actually
scores.

```
nDCG@10               0.7394
MRR                   0.6259
zero-result precision 0.4000
latency p50           1325 ms
latency p95           2180 ms

by intent
  stopword_heavy      0.9598
  multi_term          0.8172
  entity              0.7525
  informational       0.7217
  navigational        0.6402
  misspelled          0.6218
```

Three of those numbers surprised me, and one of them told me something I had
been asserting in my own documentation without ever checking.

## The reranker earns its keep, and costs eight times what I claimed

The neural reranker is the most expensive thing in the query path. A
cross-encoder — `ms-marco-MiniLM-L-6-v2`, 22M parameters, ONNX on CPU — takes
the top five candidates from BM25 + PageRank and re-scores each `(query,
document)` pair jointly. Unlike a bi-encoder, it sees the query and the document
together, so it can catch relevance that vector similarity misses.

My own code comments described the cost as *"~100-150ms for 10 candidates."* I
wrote that. I never verified it.

The evaluation has a switch for exactly this question: set
`RERANK_ENABLED=false`, redeploy, run the same fifty queries, compare. The
result:

```
                    with      without     delta
nDCG@10           0.7394       0.5689    -0.1705
MRR               0.6259       0.3407    -0.2852
latency p50       1325 ms       167 ms    -1158 ms
latency p95       2180 ms       401 ms    -1779 ms
```

Two findings, pulling in opposite directions.

The reranker is doing real work. Removing it costs **23% of nDCG and 46% of
MRR**. MRR is the harsher measure — it asks where the *right* answer landed, not
whether something related showed up — and it nearly halves. The per-query
breakdown is blunt about which queries depend on it:

```
-1.0000  'kylian mbappe'                        1.000 → 0.000
-1.0000  'world cup final results history'      1.000 → 0.000
-0.6358  'what is a hat trick'                  0.969 → 0.333
-0.6309  'how football tactics work'            0.631 → 0.000
-0.5000  'var video assistant referee'          1.000 → 0.500
```

Without reranking, `kylian mbappe` does not surface a single relevant result in
its top ten. BM25 finds documents that mention the words; the cross-encoder is
what knows which of them is *about* him.

And the cost is not 100-150ms. It is **1.16 seconds at p50**, an eight-fold
increase in end-to-end latency. That measurement is taken over the public
internet from Vietnam to a small Railway container, so it is not pure model
time — but the only variable that changed between the two runs was the
reranker, so the delta is attributable to it. On this hardware, at this
concurrency, a 22M-parameter cross-encoder over five candidates costs a second.

I would still ship it. A search engine that returns nothing useful in 167ms has
not saved anyone any time. But I had been quoting a number that was an order of
magnitude wrong, in a comment, in my own repository, for months — and no amount
of typing queries and squinting at results would ever have caught it.

## Three of five nonsense queries return results

The set includes five queries that have no business matching anything in a
corpus of football pages. Only two of them return nothing.

```
'zzzzqqqxyw'                                 0 results   ok
'!!!! ???? .....'                            0 results   ok
'quantum chromodynamics lagrangian'         20 results   leak
'sourdough starter hydration ratio'        504 results   leak
'kubernetes ingress controller annotations' 1429 results  leak
```

Fourteen hundred results for a Kubernetes query, on a search engine that has
only ever crawled football.

The cause is structural, not a bug. BM25 scores any document containing *any*
query term. "Controller", "annotations", "ratio", "starter" — all ordinary
English words that appear across thousands of football pages. Each contributes a
little score, the document clears zero, and it enters the result set. Nothing in
the pipeline ever asks whether the document is plausibly *about* the query.

Production engines solve this with a minimum-should-match requirement: a query
of N terms must match some fraction of them before a document qualifies. I never
implemented one, because with hand-typed queries I only ever searched for things
the corpus contained. The failure mode is invisible unless you deliberately
search for something absent.

## "serie a" returns LDU Quito

The single most useful thing the evaluation surfaced is that entity queries of
two short words fall apart.

```
serie a            → LDU Quito, Jimmy McGovern, Serie BKT football
bundesliga         → Ralf Rangnick, Benjamin Šeško
bbc sport football → Liverpool F.C., Premier League
```

Each failure has a different cause, and each one is a hole I built myself.

**`serie a`** is destroyed by my own tokenizer. "A" is in the stopword list — as
it should be, for prose. After stemming, the query is effectively the single
token `seri`. There is no phrase handling and no term-proximity signal anywhere
in the ranker, so "Serie A" the competition and "series" the word are
indistinguishable. Bag-of-words scoring has no concept of a two-word proper
noun.

**`bbc sport football`** is a navigational query: the user is naming a site, not
a topic. BM25F scores title and body. Nothing in the ranker looks at the domain,
so a query that is literally a hostname retrieves by topic instead. The BBC pages
are in the index; the query has no path to them.

**`bundesliga`** returns Bundesliga *people* rather than the competition page,
which is the ordinary consequence of a depth-limited crawl plus link-based
authority: a heavily-linked manager page outranks the league page.

## Spell correction was never wired to search

The misspelled bucket scores 0.6218, and `bundesliaga` returns zero results in
190ms — fast, and completely wrong.

I built a spell corrector. Levenshtein distance ≤ 2 against a vocabulary drawn
from page titles and indexed stems, with proper nouns protected via the terms
table. It works. It is wired into `/api/search/explain`, the endpoint that feeds
the pipeline visualiser, because that is where I was working when I built it.

It was never wired into `/api/search`, the endpoint that actual searches use.

Every time I demoed spell correction, I demoed it in the playground, where it
works. The feature exists, is tested by hand, and has never once run for a real
query.

## What the numbers changed

Before this, my mental model was that the engine was in decent shape and the
remaining work was features — better AI Overviews, more sources, a knowledge
graph. Fifty queries and twenty minutes say otherwise. The next four things
worth doing are all corrections, and I would not have picked any of them from
intuition:

1. **Minimum-should-match**, so a query about Kubernetes stops matching 1,429
   football pages.
2. **Phrase and proximity scoring**, so `serie a` survives the tokenizer.
3. **Wire spell correction into `/api/search`**, where it was supposed to be.
4. **A domain signal in the ranker**, so navigational queries can reach the site
   they name.

None of them are visible from the demo. All of them are obvious from the numbers.

## What this measurement is not

It is fifty queries, labelled by substring match against result titles and URLs —
robust to re-crawls, which change page IDs, but coarse. Relevance is graded 3 for
"this is the page the query asks for" and 1 for "reasonable and related", judged
by me. A larger set with independent judgements would be a better instrument.

Some of the zero scores are also coverage gaps rather than ranking failures: if
the crawler never fetched the Serie A page, no amount of ranking can surface it.
The evaluation does not currently separate the two, and it should.

But a coarse instrument that runs in twenty minutes and disagrees with me is
worth more than a perfect one I never build. Every finding above came from the
first run.

The engine is at 0.7394. Now there is a number to beat, and a way to tell whether
a change was an improvement or just a change.

---

*The evaluation, the labelled query set, and the search engine itself are at
[github.com/hdviettt/mini-search-engine](https://github.com/hdviettt/mini-search-engine).*

# Building a Mini Search Engine #9: Measuring Search Quality

## TL;DR

I never actually measured this search engine, I just typed queries I liked and decided the results looked fine. Fifty labelled queries later it turns out my football engine returns 1,429 results for a Kubernetes question, cannot tell "Serie A" apart from the word "series", and has a spell checker wired to the wrong endpoint that has never run once. The reranker is worth 23% of nDCG and costs eight times the latency I claimed in my own code comment.

---

> **Update, months later: the ruler in this post is bent, and I want to say so before you read the numbers.**
>
> I built a second project that needed a trustworthy way to compare two rerankers, and it used this evaluation. The first thing it found was that a five-line function which counts query words in the title scores **0.7551** here. That beats the entire pipeline this post measures at 0.7394.
>
> The reason is in the labels. I graded a result by checking whether its title or url contains a substring I wrote by hand, and the substrings are entity names. "Cristiano Ronaldo" is exactly what appears in the title of a page about Cristiano Ronaldo. So the metric rewards string overlap by construction, and 88% of everything it marks relevant contains a literal query term.
>
> Scored against MS MARCO's own human judgments instead, that same keyword counter trails a real cross-encoder by 0.147. Here it trails by 0.037. This evaluation was compressing the difference between a good reranker and a bad one, which is the one job a reranking evaluation has.
>
> Everything below still holds as *relative* measurement. The defects it found were real, the reranker ablation was real, and the fixes measured against it moved production from 0.7394 to 0.8884. But the absolute numbers are worth less than I thought when I wrote them, and quoting one without the keyword baseline next to it would be misleading. I would rather leave that here than quietly edit the figures.

Over eight parts I built every stage of this thing. A crawler, an inverted index, BM25, PageRank, a neural reranker, AI Overviews. I judged each one the same way: type a query I cared about, look at the first few results, decide it looked right.

That is a demo, not a measurement. So I finally sat down and measured it.

The first thing I found was this. My search engine has only ever crawled football pages. I asked it about Kubernetes:

`kubernetes ingress controller annotations` returns **1,429 results**.

It has never seen a Kubernetes page in its life. It returns 1,429 of them anyway, with scores, in the same layout as a good answer. That result had been sitting there since the very first version of the ranker, and no amount of typing football queries would ever have found it.

## 1. How I measured it

Fifty queries, labelled by hand, across six kinds of intent:

- **Entity** - `lionel messi`, `premier league`, `ballon d'or`
- **Informational** - `offside rule`, `how football tactics work`
- **Navigational** - `bbc sport football`, `fbref premier league stats`
- **Multi-term** - `real madrid champions league titles`
- **Misspelled** - `lionel mesi`, `premeir league`
- **Zero-result** - queries that should return nothing at all

For each query I recorded two numbers. **nDCG@10** asks whether the good results are near the top. **MRR** asks a harsher question: where did the single correct answer land? A page that is related but not the answer earns partial credit in nDCG and nothing in MRR.

Then I broke both down by intent. An average hides which kind of query is broken. A breakdown points at it.

## 2. The scoreboard

- nDCG@10: **0.7394**
- MRR: **0.6259**
- Zero-result precision: **0.40**
- Latency p50: **1,325 ms**

By intent:

```render
<svg viewBox="0 0 640 210" width="100%" style="max-width:640px;margin:0 auto;display:block;font-family:inherit">
  <g font-size="12" fill="var(--article-text, #5f656d)">
    <text x="0" y="16">stopword heavy</text><text x="0" y="46">multi-term</text>
    <text x="0" y="76">entity</text><text x="0" y="106">informational</text>
    <text x="0" y="136">navigational</text><text x="0" y="166">misspelled</text>
  </g>
  <g>
    <rect x="120" y="5"   width="422" height="14" rx="3" fill="hsl(var(--md-sys-color-primary, 221 100% 47%))"/>
    <rect x="120" y="35"  width="359" height="14" rx="3" fill="hsl(var(--md-sys-color-primary, 221 100% 47%))"/>
    <rect x="120" y="65"  width="331" height="14" rx="3" fill="hsl(var(--md-sys-color-primary, 221 100% 47%))"/>
    <rect x="120" y="95"  width="317" height="14" rx="3" fill="hsl(var(--md-sys-color-primary, 221 100% 47%))"/>
    <rect x="120" y="125" width="282" height="14" rx="3" fill="hsl(var(--md-sys-color-primary, 221 100% 47%))" opacity="0.55"/>
    <rect x="120" y="155" width="274" height="14" rx="3" fill="hsl(var(--md-sys-color-primary, 221 100% 47%))" opacity="0.55"/>
  </g>
  <g font-size="12" font-weight="500" fill="var(--article-heading, #1f2124)">
    <text x="552" y="16">0.960</text><text x="489" y="46">0.817</text><text x="461" y="76">0.753</text>
    <text x="447" y="106">0.722</text><text x="412" y="136">0.640</text><text x="404" y="166">0.622</text>
  </g>
  <line x1="120" y1="188" x2="560" y2="188" stroke="var(--article-border, #e1e6ec)"/>
  <g font-size="11" fill="var(--article-text, #5f656d)">
    <text x="114" y="203">0</text><text x="333" y="203">0.5</text><text x="552" y="203">1.0</text>
  </g>
</svg>
```

Stopword-heavy questions score highest, which surprised me. The two weakest buckets are navigational and misspelled, and both turned out to have a single structural cause each.

## 3. Any term is enough

BM25 lets a document in if it contains **any** query term. There is no rule saying a document must match some minimum share of the query. The score adds up whatever matched, and nothing anywhere penalises what did not.

Run each term of that Kubernetes query separately against my index and the result set explains itself:

- `kubernetes` - 0 documents
- `ingress` - 0 documents
- `annotations` - 20 documents
- `controller` - **1,422 documents**

```render
<svg viewBox="0 0 640 200" width="100%" style="max-width:640px;margin:0 auto;display:block;font-family:inherit">
  <g font-size="13" font-family="ui-monospace,monospace" fill="var(--article-text, #5f656d)">
    <text x="0" y="24">kubernetes</text><text x="0" y="58">ingress</text>
    <text x="0" y="92">annotations</text><text x="0" y="126">controller</text>
  </g>
  <g>
    <rect x="118" y="12" width="2" height="16" fill="var(--article-border, #cbd2da)"/>
    <rect x="118" y="46" width="2" height="16" fill="var(--article-border, #cbd2da)"/>
    <rect x="118" y="80" width="7" height="16" rx="2" fill="hsl(var(--md-sys-color-primary, 221 100% 47%))" opacity="0.45"/>
    <rect x="118" y="114" width="420" height="16" rx="2" fill="hsl(var(--md-sys-color-primary, 221 100% 47%))"/>
  </g>
  <g font-size="12" fill="var(--article-text, #5f656d)">
    <text x="130" y="25">0</text><text x="130" y="59">0</text><text x="135" y="93">20</text>
  </g>
  <text x="548" y="127" font-size="13" font-weight="600" fill="var(--article-heading, #1f2124)">1,422</text>
  <line x1="0" y1="152" x2="620" y2="152" stroke="var(--article-border, #e1e6ec)"/>
  <text x="0" y="175" font-size="13" fill="var(--article-heading, #1f2124)">
    Full query returns <tspan font-weight="600">1,429</tspan> results.
  </text>
  <text x="0" y="192" font-size="12.5" fill="var(--article-text, #5f656d)">
    Every word that defines the question matched nothing.
  </text>
</svg>
```

Every term that actually defines the query matches zero documents. The entire result set comes from `controller`, an ordinary English word sitting in 1,422 football pages, meaning the midfielder who controls the game or a club's financial controller. The query gets answered by its least meaningful word.

The other nonsense queries fail the same way. `sourdough starter hydration ratio` returns 504 results, all of them from `starter` (226) and `ratio` (284). `sourdough` and `hydration` match nothing. Real search engines guard against this with a minimum-should-match rule: a query of N terms has to match some fraction of them before a document qualifies at all.

**This is why stuffing a page with loosely related terms does nothing.** Matching a query term is what gets a page into the candidate pool. It costs almost nothing and it is worth almost nothing. Everything that decides ranking happens after that.

## 4. The stemmer eats "Serie A"

Searching `serie a` returns LDU Quito, then a Jimmy McGovern page, then something about Serie BKT. Two words, one of Europe's major leagues, and not a single relevant result.

The damage happens before the ranker ever runs:

```render
<svg viewBox="0 0 640 250" width="100%" style="max-width:600px;margin:0 auto;display:block;font-family:inherit">
  <g font-family="ui-monospace,monospace" font-size="14" fill="var(--article-heading, #1f2124)">
    <text x="0" y="20">"serie a"</text>
    <text x="0" y="80">["serie", "a"]</text>
    <text x="0" y="140">["serie"]</text>
    <text x="0" y="200">["seri"]</text>
  </g>
  <g stroke="var(--article-border, #cbd2da)" stroke-width="1.5">
    <line x1="8" y1="30" x2="8" y2="62"/><line x1="8" y1="90" x2="8" y2="122"/><line x1="8" y1="150" x2="8" y2="182"/>
  </g>
  <g font-size="12.5" fill="var(--article-text, #5f656d)">
    <text x="24" y="52">lowercase, strip punctuation</text>
    <text x="24" y="112">drop stopwords</text>
    <text x="24" y="172">Porter stemmer</text>
  </g>
  <text x="150" y="112" font-size="12.5" fill="hsl(var(--md-sys-color-primary, 221 100% 47%))">"a" is a stopword. Correctly.</text>
  <line x1="330" y1="0" x2="330" y2="230" stroke="var(--article-border, #e1e6ec)" stroke-dasharray="3 3"/>
  <g font-family="ui-monospace,monospace" font-size="14" fill="var(--article-heading, #1f2124)">
    <text x="360" y="20">"series"</text>
    <text x="360" y="200">["seri"]</text>
  </g>
  <line x1="368" y1="30" x2="368" y2="182" stroke="var(--article-border, #cbd2da)" stroke-width="1.5"/>
  <text x="384" y="112" font-size="12.5" fill="var(--article-text, #5f656d)">same stem</text>
  <text x="0" y="238" font-size="13" fill="var(--article-heading, #1f2124)">
    In the index: <tspan font-family="ui-monospace,monospace">serie</tspan> = 1,912 documents,
    <tspan font-family="ui-monospace,monospace">series</tspan> = 1,913. One apart.
  </text>
</svg>
```

The index confirms it. `serie` returns 1,912 documents and `series` returns 1,913, one document apart. To my engine, Serie A the competition and "series" the common noun are the same word. The "A" that separates them was thrown away before scoring started, by a stopword list that is completely right for prose and completely wrong for proper nouns.

Nothing downstream can recover it. There is no phrase matching and no term-proximity signal anywhere in my ranker, so bag-of-words scoring has no way to represent a two-word name at all.

**This is why brands built from common words are harder to rank.** If half your brand name is a stopword, an index like this cannot tell your name from ordinary prose. It is also why exact placement in titles and anchors matters far more for those names than for a coined word that is already unique in the index.

## 5. Brand queries have no path to the brand

Searching `bbc sport football` returns Liverpool and Premier League pages. The BBC pages are in my index. The crawler seeded them. The query names the site almost exactly, and still cannot reach it.

My ranking is BM25F over two fields, title and body, blended with PageRank at 80/20. The URL is not a field. The domain is not a signal. So a query that is effectively a hostname gets scored as a topic query, and returns the most football-central pages instead of the site being named.

**Navigational intent is roughly a third of real search traffic**, and it is the one case where the user has already told you the answer. Serving it needs a signal my content pipeline never produces. That is the mechanical reason brand strength behaves like a ranking factor that has nothing to do with how good your content is.

## 6. What the reranker is actually worth

Part 7 covered neural reranking as an idea. This is the measured version.

The cross-encoder re-scores my top five candidates. It reads the query and the document together, which lets it judge relevance that keyword overlap misses. It is also the single most expensive stage in the query path.

So I turned it off and ran the identical fifty queries.

```render
<svg viewBox="0 0 640 230" width="100%" style="max-width:620px;margin:0 auto;display:block;font-family:inherit">
  <g font-size="13" font-weight="500" fill="var(--article-heading, #1f2124)">
    <text x="0" y="18">nDCG@10</text><text x="0" y="98">MRR</text><text x="0" y="178">latency p50</text>
  </g>
  <g font-size="11.5" fill="var(--article-text, #5f656d)">
    <text x="0" y="40">on</text><text x="0" y="64">off</text>
    <text x="0" y="120">on</text><text x="0" y="144">off</text>
    <text x="0" y="200">on</text><text x="0" y="224">off</text>
  </g>
  <g>
    <rect x="90" y="28"  width="370" height="15" rx="2" fill="hsl(var(--md-sys-color-primary, 221 100% 47%))"/>
    <rect x="90" y="52"  width="284" height="15" rx="2" fill="hsl(var(--md-sys-color-primary, 221 100% 47%))" opacity="0.4"/>
    <rect x="90" y="108" width="313" height="15" rx="2" fill="hsl(var(--md-sys-color-primary, 221 100% 47%))"/>
    <rect x="90" y="132" width="170" height="15" rx="2" fill="hsl(var(--md-sys-color-primary, 221 100% 47%))" opacity="0.4"/>
    <rect x="90" y="188" width="440" height="15" rx="2" fill="#c2410c"/>
    <rect x="90" y="212" width="55"  height="15" rx="2" fill="#c2410c" opacity="0.4"/>
  </g>
  <g font-size="12" fill="var(--article-heading, #1f2124)">
    <text x="470" y="41">0.7394</text><text x="384" y="65">0.5689</text>
    <text x="413" y="121">0.6259</text><text x="270" y="145">0.3407</text>
    <text x="540" y="201">1,325 ms</text><text x="155" y="225">167 ms</text>
  </g>
</svg>
```

Two findings, pointing in opposite directions.

The reranker is doing real work. Removing it costs 23% of nDCG and 46% of MRR. Some queries fall apart completely without it. `kylian mbappe` goes from a perfect 1.000 to **0.000**, meaning not one relevant result in the top ten. `world cup final results history` does the same.

The cost is the other half. The comment in my own code said this stage takes "around 100 to 150ms". Measured end to end, it is **1,158 ms**, roughly eight times the latency of the whole engine without it. I wrote that comment. I never checked it.

**This is where "write for the question, not the keyword" gets paid.** BM25 finds pages that mention the words. The reranker decides which of those pages is about the question. Judging by these numbers, the second stage is doing considerably more work than the first.

## 7. What I am fixing

Before measuring, I assumed the engine was in decent shape and the next work was features. More sources, better AI Overviews, a knowledge graph. Fifty queries and twenty minutes redirected all of it. The four highest-value changes are all corrections:

1. **Minimum-should-match**, so a query has to be about something my index actually contains.
2. **Phrase and proximity scoring**, so two-word names survive the stopword list.
3. **Wire spell correction into the search endpoint.** I built a spell corrector. It is attached to the endpoint that feeds my pipeline visualiser, not the one that serves real searches. It has never once run for a real query, which is why `bundesliaga` returns nothing in 190ms.
4. **A domain signal**, so navigational queries can reach the site they name.

None of these were visible from the demo. All of them are obvious from the numbers.

## 8. What this measurement is not

Fifty queries is a small set, and I labelled them myself by matching text in result titles and URLs. That survives a re-crawl, which changes page IDs, but it is coarse. Independent judgements over a larger set would be a better instrument.

It also cannot yet tell a coverage gap from a ranking gap. When `bundesliga` returns Bundesliga managers instead of the league page, I do not know whether the league page ranked too low or was simply never crawled. Those are different problems with different fixes, and right now they score the same.

But a rough instrument that runs in twenty minutes and disagrees with me is worth much more than a rigorous one I never build. Every finding above came out of the first run.

The engine sits at 0.7394. The number itself is not the useful part. The useful part is that I can now tell whether the next change was an improvement or just a change.

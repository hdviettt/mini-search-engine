# BM25: I Built a Search Engine to Understand How Google Ranks Pages

Every time you Google something, an algorithm decides which pages you see first. The foundation of that algorithm — the one Google started from — is called **BM25**. I built a search engine from scratch to understand how it actually works, and I'm going to show you everything I learned.

This isn't theory. I'll show you real code, real data, and real scoring breakdowns from a working search engine indexing 1,000+ Wikipedia football pages.

## What BM25 Actually Does

BM25 answers one question: **"Given this search query, how relevant is this document?"**

It scores every document in your index against the query and returns a number. Higher number = more relevant. It considers three things:

1. **Does the document contain the query terms?** (term frequency)
2. **How rare are those terms across all documents?** (inverse document frequency)
3. **How long is the document?** (length normalization)

That's it. Three signals, combined into one formula. Let's break it down.

## The Formula

For a query $Q$ with terms $q_1, q_2, \dots, q_n$, the BM25 score of a document $d$ is:

$$
\text{score}(d, Q) = \sum_{i=1}^{n} \text{IDF}(q_i) \cdot \frac{tf(q_i, d) \cdot (k_1 + 1)}{tf(q_i, d) + k_1 \cdot \left(1 - b + b \cdot \dfrac{|d|}{\text{avgdl}}\right)}
$$

Where:
- $tf(q_i, d)$ = frequency of term $q_i$ in document $d$
- $|d|$ = length of document $d$ (in tokens)
- $\text{avgdl}$ = average document length across the corpus
- $k_1 = 1.2$ = term frequency saturation parameter
- $b = 0.75$ = length normalization parameter

Let me explain each piece.

### IDF — How Rare Is This Term?

$$
\text{IDF}(q_i) = \ln\!\left(\frac{N - n(q_i) + 0.5}{n(q_i) + 0.5} + 1\right)
$$

- $N$ = total documents in the index
- $n(q_i)$ = number of documents containing term $q_i$

- `N` = total documents in the index
- `df` = number of documents containing term `t`

If a term appears in almost every document, it tells you nothing. The word "wikipedia" appears in 700 of our 750 pages — knowing a page contains "wikipedia" is useless. But "geotargeting" appears in only 14 pages. If someone searches for "geotargeting" and a document contains it, that's a strong signal.

From our actual index:
- **"geotargeting"** → df=14, IDF ≈ 3.9 (strong signal)
- **"search"** → df=600+, IDF ≈ 0.2 (weak signal)

IDF is the mathematical reason **long-tail keywords are easier to rank for** — fewer competing documents means higher IDF per term.

### TF — How Many Times Does It Appear?

A page that mentions "robots.txt" 15 times is probably more about robots.txt than a page that mentions it once. But there's a catch — mentioning a word 100 times isn't 100x more relevant. BM25 handles this with **saturation**.

The `k1` parameter (default: 1.2) controls this:

```
tf=1  → ~55% of max contribution
tf=2  → ~73%
tf=5  → ~88%
tf=10 → ~94%
tf=50 → ~99%
```

After about 5 occurrences, additional mentions barely help. This is what prevents keyword stuffing from gaming the algorithm.

### Length Normalization — Short and Focused Beats Long and Rambling

The denominator of the BM25 formula contains the length normalization term:

$$
k_1 \cdot \left(1 - b + b \cdot \frac{|d|}{\text{avgdl}}\right)
$$

- $|d|$ = document length (total tokens in this document)
- $\text{avgdl}$ = average document length across all documents (3,736 tokens in our index)
- $b$ = how much length matters (default: 0.75)

A 2,000-word article about robots.txt is more focused than a 70,000-word article that mentions robots.txt in passing. The `b` parameter penalizes longer documents because they're more likely to contain a term by chance.

- `b=0` → no penalty for long documents
- `b=1` → full penalty
- `b=0.75` → the standard middle ground

## The Implementation

Here's the actual BM25 implementation from our search engine, in 30 lines of Python:

```python
import math
from indexer.tokenizer import tokenize

BM25_K1 = 1.2
BM25_B = 0.75

def search_bm25(conn, query, k1=None, b=None):
    k1 = k1 or BM25_K1
    b = b or BM25_B

    query_terms = tokenize(query)
    if not query_terms:
        return {}

    # Load corpus stats
    stats = dict(conn.execute("SELECT key, value FROM corpus_stats").fetchall())
    total_docs = stats.get("total_docs", 0)
    avg_doc_length = stats.get("avg_doc_length", 1)

    scores = {}

    for term in query_terms:
        # Look up term in the vocabulary
        row = conn.execute("SELECT id FROM terms WHERE term = %s", (term,)).fetchone()
        if row is None:
            continue
        term_id = row[0]

        # How many documents contain this term?
        df = conn.execute(
            "SELECT COUNT(*) FROM postings WHERE term_id = %s", (term_id,)
        ).fetchone()[0]

        # IDF: rarer terms get higher weight
        idf = math.log((total_docs - df + 0.5) / (df + 0.5) + 1)

        # Get all documents containing this term
        postings = conn.execute(
            """SELECT p.page_id, p.term_freq, d.doc_length
               FROM postings p
               JOIN doc_stats d ON p.page_id = d.page_id
               WHERE p.term_id = %s""",
            (term_id,),
        ).fetchall()

        for page_id, tf, doc_length in postings:
            numerator = tf * (k1 + 1)
            denominator = tf + k1 * (1 - b + b * (doc_length / avg_doc_length))
            term_score = idf * (numerator / denominator)
            scores[page_id] = scores.get(page_id, 0) + term_score

    return scores
```

That's the entire algorithm. No machine learning, no neural networks — just math on an inverted index.

## The Inverted Index: What Makes It Fast

BM25 doesn't scan every document for every query. It uses an **inverted index** — a precomputed mapping from terms to documents:

```
"ronaldo"  → [page_42, page_108, page_215, page_389, ...]
"messi"    → [page_42, page_67, page_108, page_301, ...]
"worldcup" → [page_12, page_42, page_108, page_500, ...]
```

When you search for "ronaldo", the engine does a single lookup to find every page containing that word. No scanning required. This is why search is O(1) per term instead of O(N) per document.

### Building the Index

Every crawled page goes through a tokenization pipeline:

```python
def tokenize(text):
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    tokens = text.split()
    return [t for t in tokens if t not in STOPWORDS and len(t) > 1]
```

```
"Cristiano Ronaldo scored 960+ goals!"
  → lowercase  → "cristiano ronaldo scored 960+ goals!"
  → clean      → "cristiano ronaldo scored 960  goals"
  → split      → ["cristiano", "ronaldo", "scored", "960", "goals"]
  → stopwords  → ["cristiano", "ronaldo", "scored", "960", "goals"]
```

Then we store the results in three tables:

```sql
-- Vocabulary: every unique term
CREATE TABLE terms (
    id   SERIAL PRIMARY KEY,
    term TEXT UNIQUE NOT NULL
);

-- Inverted index: which documents contain which terms
CREATE TABLE postings (
    term_id   INTEGER REFERENCES terms(id),
    page_id   INTEGER REFERENCES pages(id),
    term_freq INTEGER NOT NULL,
    PRIMARY KEY (term_id, page_id)
);

-- Document lengths for BM25 normalization
CREATE TABLE doc_stats (
    page_id    INTEGER PRIMARY KEY REFERENCES pages(id),
    doc_length INTEGER NOT NULL
);
```

Our index over ~1,100 Wikipedia pages has **145,736 unique terms** and **1,057,023 postings** (term-document pairs).

## Real Search Results: What BM25 Gets Right and Wrong

### Query: "robots.txt"

| Rank | Page | BM25 Score | Why |
|------|------|-----------|-----|
| 1 | Wayback Machine | 11.82 | Mentions robots.txt many times in context of web archiving |
| 2 | robots.txt (the article) | 12.82 | Highest raw BM25, but lower PageRank |
| 4 | SEO | 10.05 | Mentions it, but the page is 37K chars — length penalty hurts |

Notice: the robots.txt article has the **highest** BM25 score (12.82) but ranks #2 overall. That's because our engine combines BM25 with PageRank (more on that below).

### Query: "search engine optimization"

The actual SEO article ranks #4, not #1. Why? Category pages have the exact phrase in a shorter document — length normalization gives them an edge. This is a known BM25 weakness: it has no concept of "this page is *about* SEO" vs "this page *mentions* SEO."

## Beyond BM25: Combining Signals

Raw BM25 scores are useful but incomplete. A page can have high BM25 because it repeats a term, but low authority because nobody links to it. Our engine combines BM25 with PageRank:

$$
\text{final}(d) = \alpha \cdot \hat{S}_{\text{BM25}}(d) + (1 - \alpha) \cdot \hat{S}_{\text{PR}}(d) \qquad \alpha = 0.7
$$

Where $\hat{S}$ denotes min-max normalized scores mapped to $[0, 1]$. Without normalization, BM25 (range 0–15) would completely dominate PageRank (range 0–0.001).

This is exactly what early Google did: BM25 for relevance, PageRank for authority, combined with a tunable weight.

## What This Means for SEO

### Content Length
BM25's length normalization is why **"write 10,000-word articles" isn't always good advice.** A focused 2,000-word article that thoroughly covers a topic can outrank a 10,000-word article that mentions it briefly. The math literally penalizes unfocused length.

### Keyword Density
There's a sweet spot. Mentioning your keyword 3–5 times is useful. Mentioning it 50 times gives almost no additional BM25 benefit — and Google has separate spam penalties on top of that.

### Long-Tail Keywords
If you write about a niche topic (high IDF), your content naturally ranks more easily. Fewer competing documents means each term match carries more weight. This is the mathematical basis for the long-tail keyword strategy.

## How Google Has Evolved Beyond BM25

Google still uses BM25-like signals, but it's now one input among thousands:

- **Semantic understanding** — BERT and MUM models understand meaning, not just keyword matching
- **User signals** — click-through rate, dwell time, bounce rate
- **Entity matching** — "Apple CEO" → Tim Cook, without needing the exact words
- **Freshness** — newer content boosted for time-sensitive queries
- **E-E-A-T** — Experience, Expertise, Authoritativeness, Trustworthiness
- **Hundreds more** — location, device, search history, page speed, mobile-friendliness

BM25 is the foundation. Modern search is a machine learning model where BM25 is just one feature. But understanding it tells you *why* the basics of SEO work: relevant content, appropriate length, targeting terms people actually search for.

## Try It Yourself

The full search engine is open source and live at [search.hoangducviet.work](https://search.hoangducviet.work). Click "Explore" after searching to see the BM25 scoring step by step — you can watch the algorithm score each document in real time.

Source code: [github.com/hdviettt/mini-search-engine](https://github.com/hdviettt/mini-search-engine)

---

*Built with Python, PostgreSQL, Next.js, and a lot of curiosity about how search actually works.*

# PageRank: The Link Authority Algorithm

PageRank is the algorithm that made Google. Invented by Larry Page and Sergey Brin at Stanford in 1998, it measures a page's importance based on who links to it.

## The Core Idea

**A page is important if important pages link to it.**

It's a recursive definition — and that's what makes it powerful. Instead of just counting links (which is easy to game), PageRank considers the quality of the linking pages.

Think of it like academic citations:
- A paper cited by 100 unknown researchers → somewhat important
- A paper cited by 3 Nobel laureates → very important

The same applies to web pages:
- A page linked by 100 spam blogs → low authority
- A page linked by 3 major news sites → high authority

## The Formula

Every page starts with equal rank:

$$PR_0(p) = \frac{1}{N}$$

Then for each iteration, every page's rank is recalculated:

$$PR(p) = \frac{1 - d}{N} + d \cdot \frac{D}{N} + d \sum_{i \in L(p)} \frac{PR(i)}{C(i)}$$

- $N$ — total number of pages
- $d = 0.85$ — damping factor (probability a random surfer follows a link vs jumping to a random page)
- $L(p)$ — the set of pages that link to page $p$
- $PR(i)$ — the current PageRank of a linking page $i$
- $C(i)$ — the number of outbound links from page $i$
- $D = \sum_{j:\, C(j)=0} PR(j)$ — total rank held by dangling nodes (pages with no outlinks)

Repeat ~20 times until scores converge.

> **Note:** Google's original 1998 formula omits the $d \cdot \frac{D}{N}$ term, assuming every page has at least one outlink. In a bounded crawl like ours, many pages are dead ends (their outlinks point to pages we haven't crawled), so we add this term to redistribute their rank evenly instead of losing it.

### Breaking It Down

#### Link Contributions — $d \sum \frac{PR(i)}{C(i)}$

The core of PageRank. For every page that links to you, take its rank and divide by how many outlinks it has. A link from a high-rank page with few outlinks is the most valuable — it passes a large fraction of a large number.

#### Random Jump — $\frac{1 - d}{N}$

A small guaranteed baseline for every page. Models the 15% chance a random surfer gets bored and teleports to any page at random. Without this, rank gets trapped in loops and pages with zero inlinks have zero rank.

#### Dangling Redistribution — $d \cdot \frac{D}{N}$

Dead-end pages (no outlinks in the crawled set) would lose their rank into the void. Instead, we collect it all into $D$ and spread it evenly. This preserves total rank across iterations and keeps the algorithm stable on bounded crawls.

## Implementation

### Step 1: Build the Link Graph

Before computing any scores, we need to know who links to whom. We query all links from our database and build two lookup maps — one for outbound links and one for inbound links.

```python
outlinks = {pid: [] for pid in page_ids}   # page -> pages it links TO
inlinks  = {pid: [] for pid in page_ids}   # page -> pages that link TO IT

rows = conn.execute(
    """SELECT DISTINCT l.source_id, p.id
       FROM links l
       JOIN pages p ON p.url = l.target_url
       WHERE l.source_id IN (SELECT id FROM pages)"""
).fetchall()

for source_id, target_id in rows:
    outlinks[source_id].append(target_id)
    inlinks[target_id].append(source_id)
```

We only count links where **both** source and target exist in our crawled set. Links pointing to pages we haven't crawled are ignored.

### Step 2: Initialize

Every page starts with equal rank — no page is assumed more important than any other.

$$PR_0(p) = \frac{1}{N}$$

```python
n = len(page_ids)
rank = {pid: 1.0 / n for pid in page_ids}
# 750 pages → each starts with rank = 1/750 ≈ 0.00133
```

### Step 3: Iterate

Each iteration redistributes rank through the link graph, applying the formula from above:

```python
d = 0.85

for iteration in range(20):
    new_rank = {}
    dangling_sum = sum(rank[pid] for pid in page_ids if len(outlinks[pid]) == 0)

    for pid in page_ids:
        r = (1 - d) / n                                    # random jump
        r += d * dangling_sum / n                           # dangling redistribution
        for linker in inlinks[pid]:
            r += d * rank[linker] / len(outlinks[linker])   # link contributions
        new_rank[pid] = r

    rank = new_rank
```

There are three forces inside this formula. Each one has a direct consequence for how search engines evaluate your website.

---

#### Force 1: Link Contributions — Backlinks as Currency

$$d \sum_{i \in L(p)} \frac{PR(i)}{C(i)}$$

This is the heart of PageRank. For every page $i$ that links to page $p$, we take that linker's rank $PR(i)$ and divide it by its total number of outbound links $C(i)$. Then we sum all those fractions.

**What this means conceptually:** each link is a vote, but not all votes are equal. A page with high rank casts a strong vote. And that vote is *split* among all the pages it links to.

**Why this matters for SEO:**

Every link from another site is a "vote" for your page. This is why **link building** is a core SEO strategy. But look at the formula — the vote's value depends on two things:

1. **The linker's own authority** $PR(i)$ — a link from The New York Times passes far more rank than a link from a new blog, because $PR(\text{nytimes})$ is enormous. One link from a high-authority domain can outweigh thousands of links from low-authority sites.

2. **How many outlinks the linker has** $C(i)$ — if a page links to 10 sites, each gets $\frac{1}{10}$ of the rank. If it links to 1,000 sites, each gets $\frac{1}{1000}$. This is **link equity splitting**. It's why adding hundreds of links to your footer or sidebar dilutes their value — and why a focused blogroll of 5 curated links passes far more authority per link than a mega-directory of 500.

This also explains why **internal linking** is so important. Your homepage usually has the highest PageRank (most external links point there). Every internal link from the homepage distributes some of that authority deeper:

```
Good: Homepage → Category → Product (3 clicks, rank flows strongly)
Bad:  Homepage → ... → ... → ... → Product (6 clicks, rank diluted at each hop)
```

The formula shows why flat site architecture wins — each additional hop divides the rank further through the $\frac{PR(i)}{C(i)}$ term.

---

#### Force 2: The Random Jump — Why Every Page Gets a Chance

$$\frac{1 - d}{N}$$

This term gives every page a small, guaranteed base rank regardless of whether anything links to it. With $d = 0.85$ and $N = 750$:

$$\frac{1 - 0.85}{750} = \frac{0.15}{750} = 0.0002$$

**What this means conceptually:** imagine a person browsing the web by randomly clicking links. 85% of the time they follow a link on the current page. But 15% of the time, they get bored and type a completely random URL — landing on any page with equal probability. This "random jump" is the $\frac{1-d}{N}$ term.

Without it, pages with zero inlinks would have zero rank, and rank could get trapped in closed loops (A links to B, B links to A, neither links out — all rank accumulates there forever). The random jump breaks these traps.

**Why this matters for SEO:**

The damping factor $d = 0.85$ is the boundary between "link-driven" and "baseline" ranking. It means:

- **New pages aren't invisible.** Even with zero backlinks, a page gets a tiny base rank. This is why freshly published content can still appear in search results — it isn't ranked zero.
- **Links are still dominant.** 85% of rank flows through links. The base rank is tiny ($0.0002$ in our example). You can't rank well on the random jump alone — you need real backlinks to compete.
- **Manipulative link loops don't work.** Before the random surfer model, early link-based algorithms could be gamed by creating tight link circles. The 15% random jump ensures rank always leaks out of these loops, making them much less effective.

---

#### Force 3: Dangling Redistribution — Handling Dead Ends

$$d \cdot \frac{D}{N}$$

Where $D = \sum_{j : C(j) = 0} PR(j)$ is the total rank held by pages with no outlinks.

**What this means conceptually:** some pages are dead ends — they link to nothing in our crawled set. If we ignored them, their rank would simply vanish each iteration. The total rank across all pages would shrink, and the algorithm would slowly collapse toward zero.

Instead, we collect all the rank from dead-end pages into $D$ and redistribute it evenly — as if the random surfer, when hitting a dead end, teleports to a random page.

**Why this matters for SEO:**

In our 750-page Wikipedia crawl, many pages link to articles we haven't crawled (their outlinks point outside our set). These "dangling nodes" hold real rank — if we let it disappear, we'd undercount the authority of the entire graph.

This is also relevant for real search engines. Pages behind login walls, pages that only link to external domains, or pages that have been removed but still receive inlinks — all of these create dangling rank. The redistribution mechanism ensures the link graph's total authority is conserved, not lost at dead ends.

---

### Step 4: Converge

We run 20 iterations. After ~15, score changes become negligible — the rank distribution has stabilized.

```python
for pid, score in rank.items():
    conn.execute(
        "INSERT INTO pagerank (page_id, score) VALUES (%s, %s)",
        (pid, score),
    )
```

## Combining PageRank with BM25

BM25 tells us *relevance* — does the page match the query? PageRank tells us *authority* — do other pages trust it? Neither signal is sufficient alone:

- **BM25 only:** a spam page stuffed with keywords could rank #1
- **PageRank only:** The New York Times homepage would rank #1 for every query

We need both. The question is how to combine them.

### The Problem: Different Scales

Raw BM25 scores range from ~0 to ~15. Raw PageRank scores range from ~0.0001 to ~0.1. If we just added them, BM25 would dominate completely and PageRank would be meaningless. So we normalize both to a $[0, 1]$ range first using min-max normalization:

$$\hat{x} = \frac{x - \min(X)}{\max(X) - \min(X)}$$

```python
def _normalize_scores(scores):
    """Min-max normalize scores to [0, 1] range."""
    min_s = min(scores.values())
    max_s = max(scores.values())
    spread = max_s - min_s
    if spread == 0:
        return {k: 1.0 for k in scores}
    return {k: (v - min_s) / spread for k, v in scores.items()}
```

After normalization, the best BM25 result scores 1.0 and the best PageRank result scores 1.0 — now they're comparable.

### The Combined Score

$$S(p, q) = \alpha \cdot \widehat{BM25}(p, q) + (1 - \alpha) \cdot \widehat{PR}(p)$$

Where $\alpha = 0.7$ and $\widehat{\cdot}$ denotes normalized scores.

```python
alpha = 0.7  # 70% relevance, 30% authority

norm_bm25 = _normalize_scores(bm25_scores)
norm_pr   = _normalize_scores(pagerank_scores)

combined = {}
for page_id in bm25_scores:
    combined[page_id] = alpha * norm_bm25.get(page_id, 0) \
                      + (1 - alpha) * norm_pr.get(page_id, 0)
```

**What $\alpha$ controls:** the balance between "does this page answer the query?" and "is this page trustworthy?"

- $\alpha = 1.0$ → pure text relevance, links ignored entirely
- $\alpha = 0.0$ → pure link authority, query terms ignored entirely
- $\alpha = 0.7$ → our choice: relevance leads, but authority breaks ties and elevates trustworthy results

**Why this matters for SEO:**

This formula is why **content quality and backlinks are both essential** — and why one without the other isn't enough:

- A page with perfect keyword targeting ($\widehat{BM25} = 1.0$) but zero authority ($\widehat{PR} = 0.0$) scores $0.7 \times 1.0 + 0.3 \times 0.0 = 0.70$
- A page with moderate relevance ($\widehat{BM25} = 0.6$) and strong authority ($\widehat{PR} = 1.0$) scores $0.7 \times 0.6 + 0.3 \times 1.0 = 0.72$ — it **wins**

This is exactly what we observed: the Wayback Machine article ranked #1 for "robots.txt" over the actual robots.txt article. It had slightly lower BM25 relevance but 10x higher PageRank — enough for the authority signal to tip the combined score.

The $\alpha$ weight also explains a common SEO frustration: small sites with excellent, highly relevant content lose to big-brand sites with mediocre content but massive backlink profiles. The authority term $(1 - \alpha) \cdot \widehat{PR}$ acts as a persistent advantage for well-linked domains that can only be overcome by a significant relevance gap.

## What We Observed

### Our graph: 750 pages, 39,993 links

Top pages by PageRank:

```
0.098  Help:Category            (linked from almost every page)
0.053  Wikipedia:Protection     (linked from many page headers)
0.027  Category:Articles with   (metadata category)
0.026  Wikipedia:What WP is not (policy page linked everywhere)
0.002  Search engine optim.     (our seed page)
```

### Why Wikipedia Meta Pages Win

Wikipedia meta pages (Help, Category, Protection policy) rank highest because **every article's header and footer links to them**. Going back to our formula — the $\sum \frac{PR(i)}{C(i)}$ term for Help:Category includes a contribution from nearly every page in the crawl. Even though each individual contribution is small (each article has many outlinks, so $C(i)$ is large), 750 small contributions add up to a dominant score.

Our SEO article (PageRank 0.002) has decent authority but not the highest — most of its inlinks come from pages we haven't crawled yet. If we crawled 100,000 pages, its PageRank would be much higher because it's a well-linked article.

### Dangling Nodes

Some pages link to nothing within our crawled set. These are "dangling nodes" — their rank gets redistributed evenly across all pages via the $d \cdot \frac{D}{N}$ term. In our 750-page crawl, this redistribution is significant because many Wikipedia articles link heavily to pages outside our crawl boundary.

## Beyond Classic PageRank

Google still uses link signals, but modern link analysis has evolved far beyond the formula above:

- **Topical relevance** — a link from an SEO blog to an SEO article passes more value than a link from a cooking blog. Classic PageRank treats all links equally; modern algorithms weight links by topic similarity.
- **Spam detection** — link farms exploit the $\sum \frac{PR(i)}{C(i)}$ term by creating thousands of fake pages that all link to a target. Google detects these networks and discounts or penalizes them.
- **Anchor text** — the clickable text of a link helps Google understand what the target page is about, adding a relevance signal that pure PageRank doesn't capture.
- **NoFollow links** — the `rel="nofollow"` attribute tells search engines not to pass PageRank through a link. This effectively sets $\frac{PR(i)}{C(i)} = 0$ for that specific link. Used for paid links, user-generated content, and pages you don't want to endorse.
- **Link freshness** — newer links may carry more weight than old ones, adding a time-decay factor the original formula doesn't have.
- **Domain authority** — Google evaluates entire domains, not just individual pages. A strong domain lifts all its pages, similar to a "domain-level PageRank" that feeds into page-level scores.

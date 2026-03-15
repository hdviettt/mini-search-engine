# PageRank: The Link Authority Algorithm

PageRank is the algorithm that made Google. Invented by Larry Page and Sergey Brin at Stanford in 1998, it measures a page's importance based on who links to it.

## The Core Idea

**A page is important if important pages link to it.**

It's a recursive definition — and that's what makes it powerful. Instead of just counting links (which is easy to game), PageRank considers the quality of the linking pages.

## The Analogy

Think of it like academic citations:
- A paper cited by 100 unknown researchers → somewhat important
- A paper cited by 3 Nobel laureates → very important

The same applies to web pages:
- A page linked by 100 spam blogs → low authority
- A page linked by 3 major news sites → high authority

## The Algorithm

### Step 1: Initialize
Every page starts with equal rank: `1/N` (where N = total pages).

```
750 pages → each starts with rank = 1/750 = 0.00133
```

### Step 2: Iterate
For each page, calculate its new rank:

```
rank(page) = (1-d)/N + d × SUM(rank(linker) / outlinks(linker))
```

Where:
- `d = 0.85` — damping factor (probability of following a link vs jumping randomly)
- `outlinks(linker)` — how many pages the linking page links to

### Step 3: Repeat
Run 20 iterations. Scores converge — after ~15 iterations, changes are negligible.

### The Damping Factor (d = 0.85)

Imagine a "random surfer" clicking links on the web:
- **85% of the time** → they follow a random link on the current page
- **15% of the time** → they get bored and jump to a completely random page

This prevents rank from getting "stuck" in loops and ensures every page gets at least some minimal rank.

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

Wikipedia meta pages (Help, Category, Protection policy) rank highest because **every article's header and footer links to them**. In a 750-page crawl, a page that appears in every article's navigation receives ~750 inlinks.

Our SEO article (PageRank 0.002) has decent authority but not the highest — most of its inlinks come from pages we haven't crawled yet. If we crawled 100,000 pages, its PageRank would be much higher because it's a well-linked article.

### Dangling Nodes

Some pages link to nothing within our crawled set (their outlinks go to pages we haven't crawled). These are "dangling nodes" — their rank gets distributed evenly across all pages. This is a necessary mathematical fix to keep the algorithm stable.

## How PageRank Combines with BM25

In our search engine:

```
final_score = 0.7 × normalized_BM25 + 0.3 × normalized_PageRank
```

This means:
- **70% of the score** is about relevance (does the page contain the query terms?)
- **30% of the score** is about authority (do other pages link to it?)

This is why the Wayback Machine article ranked #1 for "robots.txt" — it had strong BM25 relevance AND higher PageRank than the actual robots.txt article.

## Why PageRank Matters for SEO

### Backlinks Are Currency
Every link from another site is a "vote" for your page. This is why link building is a core SEO strategy. But not all votes are equal — a link from The New York Times passes far more PageRank than a link from a new blog.

### Internal Linking Distributes Authority
Your homepage usually has the highest PageRank (most external links point there). Internal links distribute that authority to deeper pages. This is why site architecture matters:

```
Good: Homepage → Category → Product (3 clicks, rank flows)
Bad:  Homepage → ... → ... → ... → Product (6 clicks, rank diluted)
```

### Link Equity "Splits"
If a page has 10 outlinks, each link passes 1/10 of its rank. Pages with fewer, more targeted links pass more authority per link. This is why adding hundreds of links to your footer or sidebar dilutes their value.

### NoFollow Links
The `rel="nofollow"` attribute tells search engines not to pass PageRank through a link. Used for:
- Paid/sponsored links (required by Google's guidelines)
- User-generated content (comments, forum posts)
- Pages you don't want to vouch for

### Google Has Evolved Beyond Classic PageRank

Google still uses link signals, but modern link analysis is much more sophisticated:
- **Topical relevance** — a link from an SEO blog to an SEO article passes more value than a link from a cooking blog
- **Spam detection** — link farms and paid link networks are detected and penalized
- **Anchor text** — the clickable text of a link helps Google understand what the target page is about
- **Link freshness** — newer links may carry more weight than old ones
- **Domain authority** — Google evaluates entire domains, not just individual pages

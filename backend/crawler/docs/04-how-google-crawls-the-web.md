# How Google Crawls the Web

## Our Crawler vs Google

Our crawler is **manual** — you run `python scripts/crawl.py`, it crawls, it stops. No schedule, no automation. If you want fresh data, run it again (it resumes from the Postgres queue).

Google's crawling is a **continuous, distributed system** running 24/7 across thousands of servers worldwide.

## Google's Architecture (Simplified)

```
              URL Scheduler (decides WHAT to crawl and WHEN)
                          |
          +---------------+---------------+
          |               |               |
      Crawler 1       Crawler 2       Crawler N
      (fetches)       (fetches)       (fetches)
          |               |               |
          +---------------+---------------+
                          |
                    Processing Pipeline
                   (parse, index, rank)
```

## What Triggers Google to Crawl?

### 1. Discovery — finding new URLs

- Following links from already-crawled pages (exactly what our crawler does)
- Reading `sitemap.xml` files (a list of URLs the site owner provides)
- URLs submitted manually via Google Search Console

### 2. Re-crawling — checking for changes

- Google revisits pages it already knows about on a schedule
- **Popular/important pages** (CNN homepage) get re-crawled every few minutes
- **Low-traffic blog posts** might get re-crawled every few weeks or months
- If a page changes frequently, Google learns to check it more often

### 3. The URL Scheduler — the brain

This is the part our crawler doesn't have. Google doesn't just BFS blindly. It **prioritizes**:

| Signal | Effect |
|--------|--------|
| PageRank (authority) | High-authority pages get crawled first and more often |
| Change frequency | Pages that change often get re-crawled more often |
| Freshness demand | News pages get crawled every few minutes |
| Crawl budget | Smaller/slower sites get fewer crawls per day |
| URL depth | Pages deeper in the site get lower priority |

## The Scale Difference

| | Our crawler | Google |
|---|---|---|
| Pages | 1,000 | 100+ billion |
| Servers | Your laptop | Thousands of distributed crawlers worldwide |
| Schedule | Manual (run once) | Continuous 24/7 |
| Re-crawling | None | Smart scheduling based on page importance |
| Rendering | HTML only | Full JavaScript rendering (separate queue) |

## Google's Two-Phase Crawl

```
Phase 1: Fetch HTML (fast)
    |
    v
Phase 2: Render JavaScript (slow, separate queue)
    |
    v
Index the final content
```

This is why JavaScript-heavy sites face delayed indexing — they have to wait for the rendering queue. Our crawler only does Phase 1.

## What This Means for SEO

- **Sitemaps matter** — they're a direct way to tell Google "these URLs exist, please crawl them." Without a sitemap, Google relies only on discovering links.
- **Crawl frequency isn't equal** — your homepage might get crawled daily, but a buried blog post might wait weeks. Internal linking to important pages helps.
- **Server speed affects crawl volume** — if your server is slow, Google crawls fewer pages per visit. Fast server = more pages crawled = faster indexing.
- **Fresh content signals** — sites that update frequently train Google to come back more often. This is partly why blogs and news sites get faster indexing.

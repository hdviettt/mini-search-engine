# How Web Crawling Works

This is the first stage of any search engine. Before you can search anything, you need to **discover and download web pages**. That's what a crawler does.

## The Pipeline

```
Seed URL
  → Fetcher (HTTP GET, respects robots.txt, rate limits)
    → Parser (HTML → clean text + links)
      → Manager (stores page, enqueues discovered links)
        → Repeat (BFS — breadth-first search)
```

## Three Components

### 1. Fetcher (`fetcher.py`)

The fetcher's job is simple: given a URL, download the HTML. But it must be **polite**:

- **robots.txt** — A file at the root of every website (e.g., `example.com/robots.txt`) that tells crawlers what they're allowed to access. Our fetcher checks this before every request. If a page is disallowed, we skip it.
- **Rate limiting** — We wait 1.5 seconds between requests to the same domain. Without this, we'd hammer the server and get blocked (or worse, crash a small site).
- **User-Agent** — We identify ourselves so site owners know who's crawling. Wikipedia blocked us when we used a bare bot name — we had to use a Mozilla-compatible format. This is a real-world lesson: **your User-Agent matters**.

```
Fetcher flow:
  1. Can we fetch this URL? (check robots.txt)
  2. Have we waited long enough? (rate limit)
  3. Send HTTP GET request
  4. Is the response HTML? (check Content-Type header)
  5. Return the response (or None if anything failed)
```

### 2. Parser (`parser.py`)

Raw HTML is messy — full of `<script>`, `<style>`, navigation bars, footers. The parser:

1. **Strips noise** — removes `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<noscript>` tags
2. **Extracts title** — from the `<title>` tag
3. **Extracts body text** — all remaining text content, whitespace collapsed
4. **Extracts links** — every `<a href>` becomes a potential URL to crawl next
5. **Hashes content** — MD5 hash for deduplication (two URLs can serve the same content)

Link normalization is critical:
- Relative URLs (`/wiki/SEO`) → absolute (`https://en.wikipedia.org/wiki/SEO`)
- Fragments stripped (`page.html#section` → `page.html`)
- Only `http`/`https` kept (no `javascript:`, `mailto:`, etc.)

### 3. Manager (`manager.py`)

The manager orchestrates the crawl using **breadth-first search (BFS)**:

```
Depth 0: Seed URL (Search Engine Optimization page)
Depth 1: All pages linked FROM the seed (~300+ links)
Depth 2: All pages linked from depth 1 pages
Depth 3: All pages linked from depth 2 pages
...
```

BFS ensures we crawl **close pages first** before going deeper. This matters because:
- Pages closer to the seed are usually more relevant
- It prevents the crawler from going down a rabbit hole into unrelated content

The crawl queue lives in PostgreSQL, which makes the crawler **resumable** — if it crashes or you stop it, just run it again and it picks up where it left off.

## Safety Mechanisms

| Mechanism | What it prevents |
|-----------|-----------------|
| Domain whitelist | Crawling the entire internet (we only crawl `en.wikipedia.org`) |
| Max depth (4) | Going too deep into irrelevant pages |
| Max pages (1000) | Running forever / using too much storage |
| Rate limiting (1.5s) | Getting blocked or overwhelming the server |
| robots.txt | Crawling pages the site owner doesn't want crawled |
| Content-Type check | Downloading PDFs, images, or other non-HTML files |
| Dedup (content hash) | Storing the same page twice under different URLs |

## What We Observed (Test Crawl — 10 Pages)

Starting from one seed URL (`Search_engine_optimization`):

- **3,014 links discovered** — one Wikipedia article links to thousands of pages
- **1,780 URLs queued** — only 10 crawled out of ~1,800 discovered
- **1 URL failed** — `Special:EditPage/...` returned non-HTML content
- **Page sizes: 2,719 to 69,804 chars** — huge variance in document length

## Why This Matters for SEO

### Crawl Budget

Google allocates a **crawl budget** to each site — the number of pages Googlebot will crawl per visit. If your site has:
- Slow server response → fewer pages crawled per visit
- Duplicate content → crawl budget wasted on the same content
- Orphan pages (no internal links) → crawler never finds them
- Thin pages (no useful content) → crawler deprioritizes your site

### Internal Linking

Internal links are how you **guide the crawler** to your important pages. In our test crawl, the SEO Wikipedia page linked to 300+ other pages. The crawler follows those links to discover new content. If your important page isn't linked from anywhere, it's invisible to search engines.

### robots.txt

We experienced this firsthand — Wikipedia's robots.txt blocked our initial User-Agent entirely. In SEO:
- Accidentally blocking Googlebot via robots.txt is one of the most common technical SEO mistakes
- `robots.txt` controls **crawling**, not **indexing** (a page can still appear in search results if other pages link to it)
- You can use `robots.txt` to prevent crawling of low-value pages (admin panels, search result pages, etc.)

### Page Rendering

Our crawler only handles static HTML. Modern sites use JavaScript to render content (React, Angular, etc.). Google has a **rendering queue** — it fetches the HTML first, then comes back later to execute JavaScript. Pages that rely on JavaScript for content face:
- Delayed indexing (Google has to render them separately)
- Potential content visibility issues (if JS fails to execute)

This is why server-side rendering (SSR) and static site generation (SSG) matter for SEO.

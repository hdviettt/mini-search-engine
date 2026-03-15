# BFS vs DFS: Why Breadth-First Search for Crawling

## The Two Approaches

### BFS (Breadth-First Search) — What we use

```
Depth 0: [SEO page]
Depth 1: [SERP page] [robots.txt page] [Bing page] [Geotargeting page] ...
Depth 2: [pages linked from depth 1] ...
```

BFS explores **all pages at one level before going deeper**. Like exploring every room on the ground floor before going upstairs.

### DFS (Depth-First Search) — What we don't use

```
SEO page → SERP page → Google page → Larry Page bio → Stanford University → ...
```

DFS follows **one path as deep as possible** before backtracking. Like walking into the first door you see, then the first door in that room, and so on.

## Why BFS Wins for Crawling

1. **Relevance decay** — Pages closer to your seed are usually more topically relevant. The SEO page links to SERP, robots.txt, PageRank — all SEO-related. But 4 hops away, you might be on a page about Stanford's campus dining.

2. **Link equity** — In SEO terms, pages closer to your homepage (fewer clicks away) are considered more important by Google. BFS naturally prioritizes these.

3. **Faster coverage** — BFS gives you a broad picture of the site quickly. After crawling depth 0 and 1, you already have the seed page plus its most important connections. DFS might go deep into one irrelevant branch.

4. **Google does this too** — Google uses a priority queue (not pure BFS), but the principle is similar: prioritize important, well-linked pages before diving deep into obscure ones.

## SEO Concept: Crawl Depth

**Crawl depth** = how many clicks from the homepage to reach a page.

```
Homepage (depth 0)
├── /products (depth 1)
│   ├── /products/shoes (depth 2)
│   │   └── /products/shoes/nike-air-max (depth 3)  ← still OK
│   └── /products/bags (depth 2)
└── /blog (depth 1)
    └── /blog/post-from-2019 (depth 2)
        └── /blog/post-from-2019/comment-page-3 (depth 3)  ← getting deep
```

SEO best practice: **keep important pages within 3 clicks of the homepage**. Pages buried at depth 5+ are:
- Less likely to be crawled
- Less likely to rank (lower perceived importance)
- Harder for users to find

This is why flat site architecture matters — and why our crawler has a `MAX_DEPTH` setting.

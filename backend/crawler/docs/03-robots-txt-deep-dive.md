# robots.txt Deep Dive

## What Is It

A plain text file at the root of every website (`example.com/robots.txt`) that tells crawlers what they can and can't access. It's a **suggestion**, not a wall — well-behaved bots respect it, malicious ones ignore it.

## Format

```
User-agent: *
Disallow: /admin/
Disallow: /search?
Allow: /search/about

User-agent: Googlebot
Allow: /

Sitemap: https://example.com/sitemap.xml
```

### Rules

- `User-agent` — which bot this rule applies to (`*` = all bots)
- `Disallow` — paths the bot should NOT crawl
- `Allow` — exceptions to Disallow rules (more specific rules win)
- `Sitemap` — tells bots where to find the sitemap
- `Crawl-delay` — seconds between requests (not respected by Google)

## What We Learned Building This

### The Bug We Hit

Our initial fetcher used Python's `urllib.robotparser.RobotFileParser.read()` to fetch robots.txt. But `.read()` uses urllib's **default User-Agent internally**, which Wikipedia blocks (returns a 403 or a text message instead of the actual robots.txt).

The fix: fetch robots.txt ourselves using `httpx` (with our custom User-Agent) and feed the content to the parser manually:

```python
# Before (broken):
parser.read()  # uses urllib's default User-Agent → blocked

# After (working):
resp = self.client.get(robots_url)  # uses our User-Agent
parser.parse(resp.text.splitlines())
```

This is a real-world lesson: **robots.txt handling has edge cases that matter**.

### Wikipedia's robots.txt

Wikipedia returns a single-line message instead of a real robots.txt when the User-Agent is unrecognized:
```
Please set a user-agent and respect our robot policy...
```

Our parser treated this as a robots.txt with no rules → `can_fetch()` returned `False` for everything. Zero pages crawled.

## Common SEO Mistakes with robots.txt

### 1. Accidentally blocking Googlebot
```
User-agent: *
Disallow: /
```
This blocks ALL crawlers from ALL pages. Sites sometimes do this on staging and forget to remove it on production.

### 2. Blocking CSS/JS files
```
Disallow: /static/
Disallow: /assets/
```
Google needs to render your page to understand it. If you block CSS/JS, Google sees a broken page and may rank it lower.

### 3. Confusing crawling with indexing
robots.txt prevents **crawling** (downloading the page), NOT **indexing** (appearing in search results). A page can still appear in Google if:
- Other sites link to it
- Google knows the URL exists (from sitemaps or links)
- The page doesn't have a `noindex` meta tag

To prevent indexing, use `<meta name="robots" content="noindex">` instead.

### 4. Using robots.txt for security
robots.txt is public — everyone can read it. Don't hide sensitive paths there:
```
# BAD: now everyone knows your admin panel exists
Disallow: /secret-admin-panel/
```

## How Google Handles robots.txt

1. Google caches robots.txt and re-fetches it periodically (roughly every 24 hours)
2. If robots.txt returns a 5xx error, Google **stops crawling** the entire site (conservative approach)
3. If robots.txt returns a 4xx error, Google assumes **no restrictions** (permissive approach)
4. Google ignores `Crawl-delay` — it uses its own crawl rate algorithms
5. Google respects `Allow` and `Disallow` with longest-match-wins semantics

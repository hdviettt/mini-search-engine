# Multi-Domain Crawling and Content Filtering

## Why We Switched

Our first crawl targeted a single domain (`en.wikipedia.org`) starting from one seed URL. This is how you learn the basics, but real search engines crawl thousands of domains. When we pivoted to football content, we needed to crawl Wikipedia, BBC Sport, and ESPN — each with different HTML structures, different robots.txt rules, and different content quality.

## Multi-Domain Architecture

### Before (single domain)
```
Seed: wikipedia.org/wiki/SEO
Allowed: [en.wikipedia.org]
→ Simple: everything on Wikipedia is in scope
```

### After (multi-domain)
```
Seeds: wikipedia.org/wiki/Association_football
       bbc.com/sport/football
       espn.com/soccer/
Allowed: [en.wikipedia.org, www.bbc.com, www.espn.com]
→ Complex: need path filtering per domain
```

### The Problem: Scope Explosion

Wikipedia alone has 6+ million articles. BBC covers all sports, news, entertainment. Without path filtering, our 1000-page limit would fill up with irrelevant content — cooking recipes from BBC, baseball from ESPN, Wikipedia articles about chemistry.

### The Solution: Path Patterns

We added `ALLOWED_PATH_PATTERNS` — a list of URL path substrings that must match:

```python
ALLOWED_PATH_PATTERNS = [
    "/wiki/",            # Wikipedia: any article
    "/sport/football",   # BBC: only football section
    "/soccer/",          # ESPN: only soccer section
]
```

A discovered URL must match its domain AND at least one path pattern to enter the crawl queue. This keeps the crawl focused on football content across all three domains.

## Spam Filtering

### The Football Spam Problem

Football content on the web is surrounded by:
- **Betting sites** — bet365, Betfair, William Hill link from everywhere
- **Clickbait** — "You won't BELIEVE what Messi did..."
- **SEO spam** — thin affiliate sites scraping match results
- **Fake news** — fabricated transfer rumors for ad revenue

### Our Approach: Domain Blocklist

```python
BLOCKED_DOMAINS = [
    "bet365.com", "betfair.com", "williamhill.com",
    "paddypower.com", "bwin.com", "draftkings.com", ...
]
```

Any outgoing link pointing to a blocked domain gets dropped — never enters the crawl queue.

### How Google Handles Content Quality

Google's approach is far more sophisticated:

1. **SpamBrain** — a machine learning system that detects spam content, spam links, and hacked sites. It analyzes content patterns, link patterns, and user behavior signals.

2. **E-E-A-T** — Experience, Expertise, Authoritativeness, Trustworthiness. For topics like health and finance ("Your Money or Your Life" topics), Google heavily weighs the credibility of the source.

3. **Manual actions** — Google has a team of human reviewers who can penalize sites that violate guidelines. These are visible in Google Search Console.

4. **Link spam detection** — identifying link farms, paid links, and manipulative link schemes. Links from known spam sites pass no PageRank.

5. **Content quality signals** — thin content, duplicate content, auto-generated content, and keyword stuffing are all detected algorithmically.

## SEO Implications

### For Site Owners
- **Neighborhood matters** — linking to spam sites can hurt your own rankings. Google evaluates the quality of your outbound links.
- **Topical relevance** — a football site linking to betting sites is common and somewhat expected, but excessive affiliate links signal low quality.
- **Domain reputation** — new domains start with low trust. Established domains (BBC, Wikipedia) have inherent authority.

### For SEO Practitioners
- **Link audits** — regularly check your backlink profile for spam links. Use Google's Disavow tool for toxic links you can't remove.
- **Content silos** — organize your site by topic (like BBC's `/sport/football/` path structure). This helps crawlers understand your site's topical focus.
- **International SEO** — different domains or subfolders for different markets (bbc.com vs bbc.co.uk). Path structure signals geographic and topical relevance.

## What We Learned

1. **Domain allowlisting isn't enough** — you also need path-level filtering to stay on topic
2. **Spam filtering starts at crawl time** — don't waste crawl budget on domains you know are junk
3. **Each domain has its own quirks** — different HTML structure, different rate limits, different robots.txt rules
4. **Real search engines do this at massive scale** — Google maintains blocklists of millions of spam domains, updated continuously

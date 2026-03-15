# Snippet Generation

The snippet is the preview text shown under each search result. It's the 1-2 lines of text that help you decide whether to click. Despite looking simple, good snippet generation is surprisingly tricky.

## What Our Snippets Do

```
Query: "Premier League standings"

Result: Premier League - Wikipedia
URL: https://en.wikipedia.org/wiki/Premier_League
Snippet: ...The Premier League is the top level of the English football
         league system. Contested by 20 clubs, it operates on a system
         of promotion and relegation...
```

### The Algorithm

```python
def generate_snippet(body_text, query_terms, max_length=200):
    1. Split body text into words
    2. Slide a 30-word window across the text
    3. For each window, count how many query terms appear
    4. Pick the window with the most matches
    5. Add "..." at start/end if we're not at the document boundary
    6. Truncate to max_length characters
```

### Why a Sliding Window?

The naive approach — just use the first 200 characters — gives you the page header and navigation text every time. Useless.

The sliding window finds the part of the document most relevant to the query. If you search "Messi goal" on a 10,000-word article, the snippet should show the paragraph that mentions Messi scoring, not the article's introduction.

## What Google Does Differently

### Dynamic Snippets
Google generates snippets on the fly for each query. The same page can show completely different snippets for different queries:

- Query "Messi age" → snippet shows his birth date
- Query "Messi goals" → snippet shows his goal statistics
- Query "Messi transfer" → snippet shows transfer history

### Meta Descriptions
If a page has a `<meta name="description">` tag, Google sometimes uses it as the snippet — but only if it's relevant to the query. If the meta description doesn't match, Google picks text from the page body instead.

```html
<meta name="description" content="Lionel Messi career statistics, biography, and latest news">
```

This is why meta descriptions matter for SEO — they're your chance to control the snippet (if Google uses it).

### Rich Snippets
For certain content types, Google shows enhanced snippets with structured data:

- **Recipes** — cooking time, rating, calories
- **Products** — price, availability, reviews
- **Events** — date, venue, ticket availability
- **Sports** — live scores, upcoming matches, league tables

These come from structured data markup (Schema.org) embedded in the HTML. For a football search engine, match results and league standings could be displayed as rich snippets — that's a future enhancement for our project.

### Featured Snippets (Position Zero)
For question-type queries ("who won the 2022 World Cup"), Google extracts a direct answer and displays it above all results. This is essentially a simpler, rule-based version of what AI Overviews do.

## What Our Snippets Get Wrong

1. **No query term highlighting** — Google bolds matching terms in snippets. We don't yet.
2. **No sentence boundary awareness** — our window can cut mid-sentence. Better snippets align with sentence boundaries.
3. **No meta description fallback** — we don't extract or use `<meta description>` from the HTML.
4. **Fixed window size** — 30 words regardless of context. Adaptive sizing would be better.

## SEO Implications

### Meta Descriptions
- Write unique meta descriptions for every important page
- Include target keywords naturally (they'll be bolded in SERPs)
- Keep them under 155 characters (Google truncates longer ones)
- Make them compelling — they're your ad copy in search results

### Content Structure
- Put key information early in the page (first 200 characters matter for naive snippet generators)
- Use clear, descriptive sentences that work as standalone snippets
- Answer questions directly in your content — Google may extract that sentence as a featured snippet

### Structured Data
- Implement Schema.org markup for content types that support rich snippets
- For football content: `SportsEvent`, `SportsTeam`, `Person` (for players)
- Rich snippets significantly increase click-through rates (up to 30% higher CTR)

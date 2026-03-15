# Tokenization and Stopwords

## What Is Tokenization?

Tokenization is the process of breaking raw text into discrete units (tokens) that the search engine can work with. It's the bridge between human-readable text and machine-searchable terms.

## Our Pipeline

```
"Search Engine Optimization (SEO) — a guide to ranking #1 on Google"
     ↓
Step 1: Lowercase
"search engine optimization (seo) — a guide to ranking #1 on google"
     ↓
Step 2: Remove non-alphanumeric characters
"search engine optimization  seo    a guide to ranking  1 on google"
     ↓
Step 3: Split on whitespace
["search", "engine", "optimization", "seo", "a", "guide", "to", "ranking", "1", "on", "google"]
     ↓
Step 4: Remove stopwords + single-character tokens
["search", "engine", "optimization", "seo", "guide", "ranking", "google"]
```

## Why Each Step Matters

### Lowercasing
"SEO", "Seo", and "seo" should all match the same query. Without lowercasing, a search for "seo" wouldn't find pages that use "SEO" (which is most of them).

### Removing special characters
Parentheses, dashes, quotes, and other punctuation aren't meaningful for search. "optimization" and "optimization)" should be the same token.

### Stopword removal
~130 common English words ("the", "is", "and", "of", "to", etc.) appear in nearly every document. They:
- Don't help distinguish relevant pages from irrelevant ones
- Would create massive postings lists that slow down every query
- Add noise to BM25 scoring

### Filtering single characters
Single characters ("a", "1", "i") are rarely useful search terms and add noise.

## What We Observed

From 750 Wikipedia pages (24.5 MB of raw text):
- **145,736 unique terms** after tokenization
- **Average document: 3,736 tokens**
- **1,057,023 total postings** (term-document pairs)

Without stopword removal, we'd have far fewer unique terms but millions more postings — most of them useless.

## SEO Relevance

### How Google Tokenizes

Google's tokenizer is far more sophisticated:

- **Language detection** — handles CJK (Chinese, Japanese, Korean) which have no spaces between words
- **Entity recognition** — "New York" is one token, not two
- **Synonym expansion** — "NYC" maps to "New York City"
- **Spelling correction** — "optimizaton" matches "optimization"
- **Stemming/Lemmatization** — "optimizing", "optimized", "optimization" all map to the same root

### What This Means for SEO Content

- **Keyword variations matter less than they used to** — Google understands that "SEO optimization" and "search engine optimization" mean the same thing
- **Exact match still has some weight** — a page with the exact query phrase in its title still gets a relevance boost
- **Stopwords in queries** — Google mostly ignores them, but they can matter for phrase matching ("the who" vs "who")
- **Content quality over keyword density** — because Google's tokenizer understands semantics, stuffing keywords doesn't work. Natural language that covers the topic thoroughly wins.

## Advanced Tokenization Techniques We Didn't Implement

### Stemming
Reduces words to their root form:
```
"running"      → "run"
"optimization" → "optim"
"searches"     → "search"
```
**Pros:** Higher recall (finds more relevant results).
**Cons:** Can over-stem ("university" and "universe" both become "univers").

### N-grams
Creates tokens from sequences of characters or words:
```
Bigrams: "search engine", "engine optimization"
Trigrams: "search engine optimization"
```
**Pros:** Enables phrase matching.
**Cons:** Explodes index size.

### Subword tokenization (BPE)
Used by modern LLMs, breaks words into frequent subword units:
```
"optimization" → ["optim", "ization"]
```
Not typically used in search engines but interesting conceptually.

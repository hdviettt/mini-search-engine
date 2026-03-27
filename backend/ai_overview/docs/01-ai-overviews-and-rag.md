# AI Overviews and Retrieval-Augmented Generation (RAG)

## What Are AI Overviews?

AI Overviews are AI-generated summaries that appear above traditional search results. Instead of making you click through 10 blue links, the search engine reads the top results and synthesizes an answer.

```
Query: "Who won the 2022 FIFA World Cup?"

+--------------------------------------------------+
| AI Overview                                       |
|                                                   |
| Argentina won the 2022 FIFA World Cup, defeating  |
| France in a penalty shootout in the final held    |
| in Qatar [1]. Lionel Messi scored twice in the    |
| final, winning the Golden Ball award [2].         |
|                                                   |
| Sources: [1] FIFA World Cup  [2] Lionel Messi     |
+--------------------------------------------------+

1. FIFA World Cup - Wikipedia
2. Lionel Messi - Wikipedia
3. 2022 FIFA World Cup final - Wikipedia
...
```

Google launched AI Overviews (powered by Gemini) in 2024. They now appear for a significant percentage of searches.

## How We Built Ours

Our AI Overviews use **Retrieval-Augmented Generation (RAG)** — a pattern where the AI doesn't answer from its own knowledge but from retrieved documents.

### The RAG Pipeline

```
User query: "Premier League top scorers"
    |
    v
Step 1: RETRIEVE — run the query through our search engine
    → Get top 5 results with BM25 + PageRank
    |
    v
Step 2: EXTRACT — pull text from top results
    → Take first ~1000 characters from each page
    → Label as [Source 1], [Source 2], etc.
    |
    v
Step 3: GENERATE — send to LLM with instructions
    → "Summarize these results in 2-4 sentences. Cite sources."
    |
    v
Step 4: CACHE — store the response
    → Same query within 24 hours gets cached result
    |
    v
AI Overview displayed above results
```

### Why RAG, Not Pure LLM?

We could skip the search engine entirely and just ask the LLM "who are the Premier League top scorers?" But:

1. **Hallucination** — LLMs make things up. By grounding the answer in actual search results, we reduce (but don't eliminate) hallucination.
2. **Freshness** — LLMs have a knowledge cutoff. Our crawled data can be more recent.
3. **Source attribution** — we can cite exactly which pages the answer came from. Pure LLM answers have no sources.
4. **Transparency** — the user can click through to verify the answer.

### Our Model: Llama 3.3 70B via Groq API

We use Groq's hosted inference API (`llama-3.3-70b-versatile`), which delivers near-instant responses on dedicated LPU hardware:

| Aspect | OpenAI/Claude API | Groq API (our choice) | Local (Ollama) |
|--------|------------------|-----------------------|---------------|
| Cost | Pay per query | Free tier, then pay | Free |
| Speed | ~1-3s | ~200ms (LPU hardware) | 20-30s (CPU) |
| Quality | High | High (70B model) | Lower (small models) |
| Availability | Needs internet | Needs internet | Works offline |
| Rate limits | High | 100 req/day free | None |

For a project serving real users, Groq gives us cloud-quality responses at near-zero latency — far better than running a small model locally. The free tier is sufficient for demo traffic.

## How Google Does AI Overviews

Google's implementation is much more sophisticated:

### Multi-Source Synthesis
Google doesn't just summarize the top result. It synthesizes information across multiple sources, cross-referencing facts and resolving contradictions:

```
Source 1 says: "Messi scored 672 goals for Barcelona"
Source 2 says: "Messi scored 672 club goals for Barcelona"
Source 3 says: "Messi's Barcelona tally: 672 goals in 778 appearances"
→ AI Overview: "Messi scored 672 goals in 778 appearances for Barcelona"
   (combines count from 1/2 with appearances from 3)
```

### Query-Dependent Behavior
Not every query gets an AI Overview. Google decides based on:
- **Informational queries** → likely to show AI Overview
- **Navigational queries** ("facebook login") → no AI Overview needed
- **Ambiguous queries** → may show but with caveats
- **YMYL queries** (health, finance) → more conservative, heavily caveated

### Safety and Quality
Google applies additional filters:
- **Fact checking** against the Knowledge Graph
- **Harmful content detection** — won't generate dangerous instructions
- **Recency verification** — flags if information might be outdated
- **Source quality weighting** — prefers authoritative sources

## The Prompt Engineering

Our prompt is simple but effective:

```
Based on the following search results for the query "{query}",
provide a concise, informative overview that directly answers
the query. Use 2-4 sentences. Cite sources as [1], [2], etc.
Only use information from the provided sources.
```

Key design decisions:
- **"2-4 sentences"** — constrains length. Without this, models tend to ramble.
- **"Cite sources as [1], [2]"** — forces attribution. Makes the overview verifiable.
- **"Only use information from the provided sources"** — reduces hallucination. The model should synthesize, not invent.
- **Temperature 0.3** — low randomness for factual consistency.

## Caching

We cache AI Overviews by normalized query (lowercase, sorted tokens) with a 24-hour TTL. This means:
- "Messi goals" and "goals Messi" hit the same cache
- Repeated queries don't re-run the model
- After 24 hours, the cache expires and a fresh overview is generated

For football content, 24 hours is reasonable — player stats change rarely, but match results need to be current. A production system would use shorter TTLs for time-sensitive queries.

## SEO Implications

### AI Overviews Are Changing Search

1. **Zero-click searches are increasing** — users get answers without clicking any result. This reduces traffic to websites.
2. **Being cited matters** — if your content is used as a source in AI Overviews, you get a citation link. This is the new "ranking #1."
3. **Content quality signals for AI** — clear, factual, well-structured content is more likely to be selected as a source.
4. **Structured content wins** — content organized with clear headings, lists, and tables is easier for AI to extract and cite.

### How to Optimize for AI Overviews
- Write clear, direct answers to common questions
- Use structured formatting (headings, lists, tables)
- Include specific data points (numbers, dates, names) that AI can extract
- Build topical authority — AI Overviews prefer authoritative sources
- Keep content fresh and accurate — outdated information gets deprioritized

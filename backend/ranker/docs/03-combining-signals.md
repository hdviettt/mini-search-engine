# Combining Ranking Signals

No single signal can rank pages well. BM25 knows about relevance but not authority. PageRank knows about authority but not relevance. The magic is in combining them.

## Our Approach: Linear Combination

```
final_score = 0.7 × normalized_BM25 + 0.3 × normalized_PageRank
```

### Why Normalize First?

BM25 scores range from ~0 to ~15. PageRank scores range from ~0.0001 to ~0.1. If we added them directly, BM25 would completely dominate — PageRank would be negligible.

**Min-max normalization** rescales both to [0, 1]:

```
normalized = (score - min) / (max - min)
```

Now both signals contribute proportionally to the final score.

### Why 70/30?

- **Text relevance should dominate** — when someone searches "robots.txt", they want pages about robots.txt, not the most authoritative page in general
- **Authority breaks ties** — when multiple pages are equally relevant, the more authoritative one should rank higher
- **0.7/0.3 is a starting point** — you can experiment with different weights

### What Different Weights Would Do

| Alpha | Behavior |
|-------|----------|
| 1.0 | Pure BM25 — best text match wins, ignores authority |
| 0.7 | Our default — relevance-first with authority tiebreaker |
| 0.5 | Equal weight — balanced relevance and authority |
| 0.3 | Authority-first — popular pages dominate |
| 0.0 | Pure PageRank — most linked page wins regardless of query |

## What We Observed

### "robots.txt" query — the interesting case

```
#1  Wayback Machine    BM25: 11.82  PR: 0.006668  Final: 0.82
#2  robots.txt article BM25: 12.82  PR: 0.000637  Final: 0.71
```

The robots.txt article has higher BM25 (more relevant text) but the Wayback Machine article has 10x higher PageRank (more pages link to it). The combination puts Wayback Machine on top.

Is this "correct"? It depends on what you mean by correct. Google faces this exact tradeoff constantly — sometimes the most authoritative result isn't the most directly relevant one.

## How Google Combines Signals

Google doesn't use a simple linear combination. Instead, it uses **machine learning models** (historically Learning to Rank, now neural models) that learn the optimal combination from billions of user interactions.

Google combines hundreds of signals, including:

| Category | Examples |
|----------|----------|
| Text relevance | BM25, phrase match, title match, semantic similarity |
| Link authority | PageRank, domain authority, anchor text |
| User signals | Click-through rate, dwell time, bounce rate |
| Content quality | E-E-A-T, freshness, depth, originality |
| Technical | Page speed, mobile-friendliness, HTTPS, Core Web Vitals |
| Context | User location, search history, device type |

The weights aren't fixed — they vary by query type. A news query weighs freshness heavily. A medical query weighs E-E-A-T heavily. A navigational query ("facebook login") weighs exact domain match heavily.

## The Takeaway for SEO

- **You need both relevance and authority** — great content with no backlinks won't rank. Authoritative domains with thin content won't rank for specific queries.
- **Different queries have different balances** — informational queries lean more on relevance. Competitive commercial queries lean more on authority.
- **No single factor is a silver bullet** — SEO is about getting many signals right, not perfecting one.

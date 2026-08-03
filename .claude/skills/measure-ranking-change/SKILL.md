---
name: measure-ranking-change
description: Use when changing anything that affects search result ordering — BM25 parameters, RANK_ALPHA, freshness decay, the rerank cutoff, CANDIDATE_POOL, tokenizer or stemmer behaviour. Runs the eval harness before and after and reports the delta so the change is judged on numbers rather than on a few spot-checked queries.
---

# Measuring a ranking change

Ranking changes look right on the two queries you happen to try and wrong on
the forty you did not. Never ship one without a delta.

## Before touching anything

Confirm the API is running and record the current behaviour:

```bash
curl -s localhost:8000/health
python eval/run.py --baseline
```

`eval/baseline.json` now holds the reference point. If a baseline already
exists and is current, skip this — do not overwrite a good reference by
accident.

## Make exactly one change

One parameter, one formula, one stage. Two at once and the delta cannot be
attributed.

Scoring constants live in:

- `backend/config.py` — `BM25_K1`, `BM25_B`, `RANK_ALPHA`, `FRESHNESS_DECAY`, `FRESHNESS_FLOOR`
- `backend/search/ranking.py` — `CANDIDATE_POOL`, `RERANK_TOP_K`, `RERANK_MIN_SCORE`, `MAX_PER_DOMAIN`

Change it in `search/ranking.py` if both the engine and the explainer need it.
A formula that exists in only one of them will make the playground canvas lie.

## Measure

Restart the API so the constant is picked up, then:

```bash
python eval/run.py --compare eval/baseline.json
```

## Read the result honestly

- **Headline nDCG@10 and MRR** — the summary judgement.
- **by-intent breakdown** — the important part. A change that lifts `entity`
  while sinking `informational` is a trade, not an improvement. Say so.
- **biggest regressions** — named queries that got worse. Look at two or three
  of them directly before deciding the trade is worth it.
- **latency p50/p95** — a quality gain that doubles latency is a decision, not
  a free win.

## Report

State the delta, the trade, and the recommendation. For example:

> `RANK_ALPHA` 0.8 → 0.7: nDCG@10 +0.021, MRR +0.014. `navigational` +0.08,
> `informational` −0.03. p50 unchanged. Recommend keeping — navigational gain
> is larger than the informational loss, and no query dropped more than 0.05.

If the delta is inside noise (< 0.005), say that rather than claiming a win.

## Pricing the reranker specifically

```bash
RERANK_ENABLED=false uvicorn main:app --reload    # in another shell
python eval/run.py --compare eval/baseline.json --label no-rerank
```

The difference is what the cross-encoder is worth. Compare it against the
latency it costs and write the answer into `CLAUDE.md`.

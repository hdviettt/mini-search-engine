"""Search quality evaluation.

Answers questions the code alone cannot: does the cross-encoder reranker
actually improve results, or does it just add 100-150ms? Is RANK_ALPHA=0.8
the right split? Is the rerank_score > -8 cutoff doing the right thing?

Usage
-----
    # Save the current behaviour as the reference point
    python eval/run.py --baseline

    # After a change, see what moved
    python eval/run.py --compare eval/baseline.json

    # Is the reranker worth its latency? Restart the API with
    # RERANK_ENABLED=false, then:
    python eval/run.py --compare eval/baseline.json --label no-rerank

Requires the API to be running (default http://localhost:8000).
"""
import argparse
import json
import math
import statistics
import sys
import time
from pathlib import Path

import httpx
import yaml

EVAL_DIR = Path(__file__).parent
DEFAULT_QUERIES = EVAL_DIR / "queries.yaml"
DEFAULT_BASELINE = EVAL_DIR / "baseline.json"

K = 10
GAIN_HIGH = 3
GAIN_LOW = 1


def gain_for(result: dict, spec: dict) -> int:
    """Graded relevance from substring match on title + url.

    Page IDs churn on every re-crawl, so labels key off text instead.
    """
    haystack = f"{result.get('title', '')} {result.get('url', '')}".lower()
    for needle in spec.get("highly_relevant") or []:
        if needle.lower() in haystack:
            return GAIN_HIGH
    for needle in spec.get("relevant") or []:
        if needle.lower() in haystack:
            return GAIN_LOW
    return 0


def dcg(gains: list[int]) -> float:
    return sum(g / math.log2(i + 2) for i, g in enumerate(gains))


def ndcg_at_k(gains: list[int], k: int = K) -> float:
    actual = dcg(gains[:k])
    ideal = dcg(sorted(gains, reverse=True)[:k])
    return actual / ideal if ideal > 0 else 0.0


def reciprocal_rank(gains: list[int]) -> float:
    for i, g in enumerate(gains):
        if g >= GAIN_HIGH:
            return 1.0 / (i + 1)
    return 0.0


def run_query(client: httpx.Client, api: str, q: str) -> tuple[dict, float]:
    t0 = time.perf_counter()
    r = client.get(f"{api}/api/search", params={"q": q, "per_page": K})
    elapsed_ms = (time.perf_counter() - t0) * 1000
    r.raise_for_status()
    return r.json(), elapsed_ms


def evaluate(api: str, queries_path: Path) -> dict:
    specs = yaml.safe_load(queries_path.read_text(encoding="utf-8"))["queries"]

    per_query = []
    latencies = []

    with httpx.Client(timeout=60) as client:
        for spec in specs:
            q = spec["q"]
            try:
                payload, elapsed_ms = run_query(client, api, q)
            except Exception as e:
                print(f"  ! {q!r} failed: {e}", file=sys.stderr)
                continue

            results = payload.get("results", [])
            gains = [gain_for(r, spec) for r in results]
            latencies.append(elapsed_ms)

            record = {
                "q": q,
                "intent": spec.get("intent", "unlabeled"),
                "returned": len(results),
                "total_results": payload.get("total_results", 0),
                "latency_ms": round(elapsed_ms, 1),
                "ndcg@10": round(ndcg_at_k(gains), 4),
                "mrr": round(reciprocal_rank(gains), 4),
                "reranked": sum(1 for r in results if r.get("rerank_score") is not None),
            }

            if spec.get("expects_zero"):
                record["zero_ok"] = payload.get("total_results", 0) == 0

            per_query.append(record)

    # Zero-result queries are scored on "returned nothing", not on ranking,
    # so they are kept out of the nDCG/MRR averages.
    graded = [r for r in per_query if "zero_ok" not in r]

    by_intent: dict[str, list[float]] = {}
    for r in graded:
        by_intent.setdefault(r["intent"], []).append(r["ndcg@10"])

    zero_specs = [r for r in per_query if "zero_ok" in r]

    return {
        "api": api,
        "queries": len(per_query),
        "summary": {
            "ndcg@10": round(statistics.fmean([r["ndcg@10"] for r in graded]), 4) if graded else 0.0,
            "mrr": round(statistics.fmean([r["mrr"] for r in graded]), 4) if graded else 0.0,
            "zero_result_precision": (
                round(sum(1 for r in zero_specs if r["zero_ok"]) / len(zero_specs), 4)
                if zero_specs else None
            ),
            "empty_responses": sum(1 for r in graded if r["returned"] == 0),
            "latency_p50_ms": round(statistics.median(latencies), 1) if latencies else 0.0,
            "latency_p95_ms": (
                round(sorted(latencies)[int(len(latencies) * 0.95) - 1], 1) if len(latencies) >= 20 else None
            ),
            "reranked_queries": sum(1 for r in graded if r["reranked"] > 0),
        },
        "by_intent": {k: round(statistics.fmean(v), 4) for k, v in sorted(by_intent.items())},
        "per_query": per_query,
    }


def print_report(report: dict) -> None:
    s = report["summary"]
    print(f"\n{report['queries']} queries against {report['api']}\n")
    print(f"  nDCG@10               {s['ndcg@10']:.4f}")
    print(f"  MRR                   {s['mrr']:.4f}")
    if s["zero_result_precision"] is not None:
        print(f"  zero-result precision {s['zero_result_precision']:.4f}")
    print(f"  empty responses       {s['empty_responses']}")
    print(f"  reranked queries      {s['reranked_queries']}")
    print(f"  latency p50           {s['latency_p50_ms']} ms")
    if s["latency_p95_ms"] is not None:
        print(f"  latency p95           {s['latency_p95_ms']} ms")

    print("\n  by intent:")
    for intent, score in report["by_intent"].items():
        print(f"    {intent:16} {score:.4f}")


def print_diff(current: dict, baseline: dict) -> int:
    print("\nvs baseline\n")
    regressed = 0

    for key in ("ndcg@10", "mrr", "zero_result_precision", "latency_p50_ms", "latency_p95_ms"):
        new = current["summary"].get(key)
        old = baseline["summary"].get(key)
        if new is None or old is None:
            continue
        delta = new - old
        lower_is_better = key.startswith("latency")
        worse = delta > 0 if lower_is_better else delta < 0
        if worse and abs(delta) > (1.0 if lower_is_better else 0.005):
            regressed += 1
        arrow = "▲" if delta > 0 else ("▼" if delta < 0 else "=")
        print(f"  {key:22} {old:>9.4f} → {new:>9.4f}  {arrow} {delta:+.4f}")

    print("\n  by intent:")
    for intent, new in current["by_intent"].items():
        old = baseline["by_intent"].get(intent)
        if old is None:
            print(f"    {intent:16} {new:.4f}  (new)")
            continue
        delta = new - old
        arrow = "▲" if delta > 0 else ("▼" if delta < 0 else "=")
        print(f"    {intent:16} {old:.4f} → {new:.4f}  {arrow} {delta:+.4f}")

    # Queries that lost the most ground — where to look first.
    old_by_q = {r["q"]: r for r in baseline["per_query"]}
    drops = []
    for r in current["per_query"]:
        old = old_by_q.get(r["q"])
        if old and "ndcg@10" in r and "ndcg@10" in old:
            d = r["ndcg@10"] - old["ndcg@10"]
            if d < -0.01:
                drops.append((d, r["q"], old["ndcg@10"], r["ndcg@10"]))
    if drops:
        print("\n  biggest regressions:")
        for d, q, old_s, new_s in sorted(drops)[:10]:
            print(f"    {d:+.4f}  {q!r}  ({old_s:.3f} → {new_s:.3f})")

    return regressed


def main() -> int:
    p = argparse.ArgumentParser(description="Evaluate search quality.")
    p.add_argument("--api", default="http://localhost:8000", help="Base URL of the running API")
    p.add_argument("--queries", type=Path, default=DEFAULT_QUERIES)
    p.add_argument("--baseline", action="store_true", help="Save this run as the baseline")
    p.add_argument("--compare", type=Path, help="Compare against a saved baseline JSON")
    p.add_argument("--out", type=Path, help="Write the full report JSON here")
    p.add_argument("--label", default="", help="Tag for this run, shown in the report")
    p.add_argument(
        "--fail-on-regression",
        action="store_true",
        help="Exit non-zero if a headline metric regressed (for CI)",
    )
    args = p.parse_args()

    report = evaluate(args.api, args.queries)
    if args.label:
        report["label"] = args.label

    print_report(report)

    if args.baseline:
        DEFAULT_BASELINE.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nBaseline written to {DEFAULT_BASELINE}")

    if args.out:
        args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")

    regressed = 0
    if args.compare:
        if not args.compare.exists():
            print(f"\nNo baseline at {args.compare} — run with --baseline first.", file=sys.stderr)
            return 2
        baseline = json.loads(args.compare.read_text(encoding="utf-8"))
        regressed = print_diff(report, baseline)

    if args.fail_on_regression and regressed:
        print(f"\n{regressed} metric(s) regressed.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

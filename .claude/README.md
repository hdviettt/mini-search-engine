# Claude Code setup

This directory is committed on purpose. It is part of how the repo is
maintained, not personal configuration.

## Files

| File | Purpose |
|---|---|
| `settings.json` | Shared permissions. Read-only inspection plus the project's own test and lint commands are pre-allowed; anything that crawls, deploys, or spends money is in `ask`. |
| `settings.local.json` | Machine-specific permissions. Gitignored — never commit it. |
| `skills/measure-ranking-change/` | Procedure for any change that affects result ordering: baseline, one change, eval delta, honest report. |
| `skills/add-search-endpoint/` | The three decisions every new API route needs — which router (auth), where the DB connection comes from, what bounds the input. |

## Why the skills exist

Both encode a mistake that already shipped here.

`add-search-endpoint` exists because operational routes were added to the
public router and ran unauthenticated — including one that spends money on a
third-party embedding API, and one that fed a caller-supplied URL to the
crawler.

`measure-ranking-change` exists because ranking constants were tuned by eye.
`RERANK_MIN_SCORE = -8.0` is still a number somebody picked by looking at a
few results. The eval harness in `eval/` exists to replace that with a
measurement.

The architecture, invariants and known traps are in [`../CLAUDE.md`](../CLAUDE.md).

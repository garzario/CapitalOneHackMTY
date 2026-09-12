# Ceptinela, the last control before an irrevocable SPEI

<!-- TODO(product) assets/demo.gif here: under 6 MB, looping, 10 to 15 seconds, no cursor jitter -->

**Demo video:** TODO(product) link | **Live:** TODO(product) production URL | HackMTY 2026,
Capital One track 3, Real-Time Anomaly & Security Sentinel

## The problem

A Mexican SMB pays its suppliers by SPEI, which is instant and irrevocable. If the supplier sits on the SAT's definitive Article 69-B list, every deduction from that supplier is voided retroactively and the money is already gone. Ceptinela runs six explainable controls over the company's own CFDI ledger, the official SAT list and the Banxico-signed CEP at the moment of payment, and holds the transfer with the evidence on screen. TODO(FabriBanda) one cited number with its source and the persona from
[`docs/02-persona.md`](docs/02-persona.md). Write it so a judge reading on a phone understands who
loses money today and how much.

## What it does

- Stops a payment to a supplier the SAT has listed, and quantifies the ISR and IVA already exposed.
- Catches a CLABE that differs from the supplier's history, fails its check digit or changed bank without a payment complement behind it.
- Proves who owns the destination account with a Banxico-signed CEP and keeps it as evidence.
- Flags duplicate invoices and suppliers whose billing behaviour changed.
- Decides hold, verify or release by expected loss, and always leaves the final call to a person.

## Why it is different

TODO(product) The differentiator in two sentences, plus the one thing existing tools cannot do.
The competitor map and the gap live in [`docs/04-market.md`](docs/04-market.md).

## How it works

TODO(product) The architecture diagram from [`docs/07-architecture.md`](docs/07-architecture.md)
plus three sentences on the algorithm. The algorithm itself is pure, dependency-free TypeScript in
`packages/core`, with its tests next to it, so it can be read and run in under a minute.

## Run it in four commands

Requires bun 1.3.11 (the version in `.bun-version`) and a reachable Postgres.

```bash
bun install --frozen-lockfile   # also wires the git hooks
bun run migrate                 # 0001 always, 0002 only if timescaledb is available
bun run seed                    # idempotent, prints the demo account IDs
bun run dev                     # web and API together
```

Optional preflight before the first run: `bun run doctor` checks the bun version, the environment
variables and database reachability. Copy `.env.example` to `.env` first.

## Screenshots

TODO(product) Three stills from `assets/screenshots/`.

## Stack, and why

Fit for purpose is graded, so each row ties a tool to this problem rather than to taste.

| Choice | Pin | Why this, for this problem |
|---|---|---|
| bun | 1.3.11 | One runtime for the API, the tests, the seeder, the migrations and the scripts. Native TypeScript with no build step, and a cold start fast enough for a streaming endpoint. |
| TypeScript, strict | 5.9.3 | The money types and the ledger directions are checked at compile time, not in review. |
| `packages/core`, zero dependencies | n/a | The intelligence is pure functions with unit tests and no mocks and no network, so a judge can read it and run it. This is the answer to "is it really working". |
| Hono | 4.13.7 | Small, standards-based HTTP. The API stays thin transport with no business logic in it. |
| zod plus `@hono/zod-validator` | 4.5.4 / 0.9.1 | One schema per endpoint, validated at the edge, typed on both sides of the wire. |
| Postgres via `postgres` | 3.4.9 | Raw SQL, no ORM. When a judge asks how the forecast works, the answer is the query. |
| Timescale hypertables, conditional | n/a | A transaction ledger genuinely is a time series, so hypertables and continuous aggregates are the honest fit. `0002_timescale.sql` applies only where the extension exists, so a plain local Postgres 18 is the offline fallback on the same dialect. |
| Vite, React, Tailwind | 8.2.2 / 19.2.8 / 4.3.3 | The judge-facing surface is a URL they open on their own phone, which is the cleanest rebuttal to a staged prototype. |
| motion | 13.2.0 | Motion is first-class here, not a polish task, because the experience criteria are 20 points. |
| recharts | 3.10.1 | Charts over our own ledger, not over screenshots. |
| Nessie (optional) | n/a | System-of-record mirror for accounts and transactions. It has dates with no times, so anything intraday comes from our own ledger. See [`docs/09-api.md`](docs/09-api.md). |

Every dependency is pinned exactly and must be more than three days old, enforced by
`minimumReleaseAge` in `bunfig.toml`. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## How we worked

36 hours, four people, branch-and-PR with review on every change.
[`docs/14-process.md`](docs/14-process.md) has the board, representative PRs, the review threads
that caught real bugs, and the list of work we consciously cut.

## Team

| Person | Handle | Owns |
|---|---|---|
| Patricio Garza | [@garzario](https://github.com/garzario) | Lead, intelligence, architecture, CI |
| Fabian | [@fabbyyyy](https://github.com/fabbyyyy) | Data platform, API, deploy |
| Adan | [@Apanawa](https://github.com/Apanawa) | Frontend, UX, motion |
| Fabricio | [@FabriBanda](https://github.com/FabriBanda) | Narrative, docs, market, pitch |

## Docs

| # | Doc | What is in it |
|---|---|---|
| 00 | [challenge](docs/00-challenge.md) | The challenge prompt, the three tracks, the one we chose and why |
| 01 | [rubric mapping](docs/01-rubric-mapping.md) | One row per sub-criterion, with the evidence path for each |
| 02 | [persona](docs/02-persona.md) | One named, quantified persona, plus the anti-persona |
| 03 | [user journey](docs/03-user-journey.md) | The journey map, stage by stage, with friction and intervention |
| 04 | [market](docs/04-market.md) | Competitor map, the gap, bottom-up TAM, SAM and SOM with sources |
| 05 | [business model](docs/05-business-model.md) | Pricing, unit economics, CAC, LTV, go to market |
| 06 | [regulatory and privacy](docs/06-regulatory-privacy.md) | Our legal position, the framework map, the LLM boundary and its cost |
| 07 | [architecture](docs/07-architecture.md) | Diagrams, and a decision table with the alternatives we rejected |
| 08 | [data model](docs/08-data-model.md) | ERD, the DDL, and the synthetic-data methodology |
| 09 | [API](docs/09-api.md) | Our HTTP contract, plus the verified Nessie quirks |
| 10 | [demo script](docs/10-demo-script.md) | The four-minute beat sheet, the seeded IDs, the fallbacks |
| 11 | [pitch](docs/11-pitch.md) | Slide by slide, with 60-second, 90-second and 4-minute variants |
| 12 | [judge Q and A](docs/12-judge-qa.md) | The walk-up answer sheet, per person and shared |
| 13 | [Devpost](docs/13-devpost.md) | The exact submission copy |
| 14 | [process](docs/14-process.md) | How we worked: board, PRs, reviews, ADR index, what we cut |
| adr | [decisions](docs/adr/) | Stack, track, datastore, LLM boundary, deploy target |

## Disclaimer

Prototype built in 36 hours on synthetic data. Not a financial institution, not a regulated
entity, and not financial advice. No real customer data is used anywhere in this repository.

## License

MIT. See [`LICENSE`](LICENSE).

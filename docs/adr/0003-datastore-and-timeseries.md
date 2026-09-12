# ADR-0003: One Postgres dialect, Timescale primary, local Postgres 18 as the offline fallback

- **Status:** Proposed
- **Date:** 2026-09-11
- **Deciders:** `garzario`, with `fabbyyyy`
- **Affects:** `packages/db`, `scripts/migrate.ts`, `scripts/doctor.ts`, `docs/08-data-model.md`

## Context

A transaction ledger genuinely is a time series: append-only, queried as one account over a time
window, rolled up per day. Hypertables and continuous aggregates are therefore the honest fit rather
than a sponsor-prize costume, and Tiger Data managed Timescale is an MLH prize where the usage is not
forced.

Against that, the event is in a conference hall and the demo happens at 05:00 and again at 09:00.
Managed infrastructure over conference Wi-Fi is a single point of failure on the one thing that is not
recoverable. The lead's machine already has PostgreSQL 18 on 5432 with role `postgres` and database
`acme`.

An earlier draft of the plan proposed SQLite for the offline path. That is a contradiction: a second
dialect means a second implementation and a second set of bugs, and SQLite cannot execute
`create_hypertable` at all.

## Decision

**One Postgres dialect, two hosts.** Tiger Data managed Timescale is primary. The offline fallback is
the local PostgreSQL 18 on 5432. Same SQL, same driver, same queries, zero second implementation.

Timescale-only DDL lives in its own conditionally applied migration:

- `packages/db/migrations/0001_init.sql` runs on **any** Postgres 16 or newer. It creates `ledger_tx`
  and the `(account_id, occurred_at desc)` index.
- `packages/db/migrations/0002_timescale.sql` is applied **only when the `timescaledb` extension is
  available**. `scripts/migrate.ts` checks `pg_available_extensions` and skips the file otherwise. It
  creates the extension, the hypertable on `occurred_at`, and one continuous aggregate `ledger_daily`.

Two files rather than one guarded file, because a continuous aggregate cannot be created inside a `DO`
block or a transaction.

**Query layer: raw SQL through `postgres@3.4.9`, no ORM.** When a judge asks how the forecast works,
showing them the SQL is the answer.

`bun run doctor` reports which path is live, so nobody demos against the wrong database by accident.

## Consequences

- Positive: the sponsor-prize usage is genuine and produces a real architecture diagram. The demo
  survives dead conference Wi-Fi. Keeping both paths alive is itself a talking point about resilience.
- Positive: no ORM to explain, no generated client, no migration tool to fight at 03:00.
- Negative: the continuous aggregate only exists on the Timescale path, so any query that depends on
  `ledger_daily` needs a plain-SQL equivalent for the fallback. Keep the number of such queries at
  zero or one, and write the equivalent at the same time.
- Negative: raw SQL means hand-written queries can drift from the schema. The mitigation is that there
  are few of them and they live in one file, `packages/db/src/queries.ts`.
- Now forbidden: a second database dialect, including SQLite, and `bun:sqlite`.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Plain Postgres only, no Timescale | Loses a genuine architectural fit and a sponsor prize we would earn honestly, and the daily rollup becomes a hand-written query anyway |
| SQLite as the offline fallback | Two dialects, two implementations, two sets of bugs, and it cannot run `create_hypertable`. Explicitly rejected |
| An ORM | Another thing to explain to a judge, and the SQL is the evidence we want on screen |
| A Python sidecar for the time-series math | Out of scope unless a library with no TypeScript equivalent is genuinely needed. Under 150 lines of math goes in `packages/core` |

## Revisit if

The managed instance is unreachable for more than fifteen minutes during M1, in which case the local
path becomes primary for the rest of the event and the Timescale story becomes a documented
architectural option rather than a live one.

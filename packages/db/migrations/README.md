# packages/db/migrations

Plain SQL, applied in order by `bun run migrate`, tracked in `schema_migrations`
with a checksum so an edited file is reported instead of silently diverging
between four laptops.

| File | Runs on | What it adds |
|---|---|---|
| `0001_init.sql` | any Postgres 16+ | `ledger_tx`, the bank mirror spine |
| `0003_sentryone.sql` | any Postgres 16+ | the SentryOne schema: suppliers, known accounts, CFDI, complements, instructions, findings, decisions, the SAT list, the verified beneficiary registry and the append-only event ledger |
| `0005_sentryone_drift.sql` | any Postgres 16+ | the columns the domain grew after 0003 (`delay_cost_per_day`, `audio_ref`, `sent_at`, `payment_total`, `operation_number`, the CEP evidence fields), `ledger_tx` as a finding subject and `verification_call` as a ledger event type |
| `0006_company.sql` | any Postgres 16+ | the one-row `company` table: who we are on the header of a constancia, and the bank account id the mirror hangs off |
| `0007_supplier_outflow.sql` | any Postgres 16+ | `supplier_weekly_outflow` as a plain view over the CFDI events: the feed the `supplier_behaviour` detector and the supplier drawer read |
| `0009_consortium_snapshot.sql` | any Postgres 16+ | `consortium_snapshot` and the one-row `consortium_pull`, the local projection of the cross-tenant network |
| `0010_rail_events.sql` | any Postgres 16+ | `cent_sent` and `cep_awaited` as ledger event types, the two the one-cent verification appends |
| `0011_decision_reason.sql` | any Postgres 16+ | `decisions.reason`, the argument a person wrote for the action they signed |
| `0012_assistant_and_payment_events.sql` | any Postgres 16+ | the five ledger event types of the assistant panel and the payment execution |
| `0013_decision_actor_role.sql` | any Postgres 16+ | `decisions.decided_by_role`, the capacity the signature was given in |
| `0002_timescale.sql` | only with `timescaledb` | hypertable and continuous aggregate over `ledger_tx` |
| `0004_timescale_sentryone.sql` | only with `timescaledb` | hypertable and continuous aggregate over `ledger_events` |
| `0008_timescale_supplier_outflow.sql` | only with `timescaledb` | `supplier_weekly_outflow` again, as a continuous aggregate with the same columns and buckets |

The order in the table is the order they run: the plain files first, then the ones
that need the extension. The list lives in `MIGRATIONS` in `packages/db/src/migrate.ts`
and adding a file is a deliberate one-line change there, so a stray `.sql` left in
this folder never runs by accident.

## Rules for a new migration

1. **Never edit an applied file.** The checksum will report it and the next person
   gets a database that does not match the SQL in the repo. Add a new file.
2. **Whole-line `--` comments only.** `splitSqlStatements` in `migrate.ts` drops
   whole-line comments and splits on semicolons outside a string. Single quotes,
   double quotes and dollar quoting (`$$ ... $$`, `$tag$ ... $tag$`) are respected,
   so a plpgsql body is one statement. An inline `--` after code is not stripped.
3. **Everything an extension needs goes in its own file**, named `*_timescale*`,
   and is registered with `requiresTimescale: true`. The offline fallback is a
   plain PostgreSQL 18 on 5432 and it has to stay usable.
4. **Money is `numeric(14,2)`**, never a float. `postgres.js` returns numerics as
   strings, which is what keeps a peso intact on the way out.
5. **`if not exists` on everything that supports it.** `bun run migrate` is run
   twice before most rehearsals.

## Renamed files

Three files were renamed when the product became SentryOne, content untouched
apart from the name in the comments:

| Recorded as | Now |
|---|---|
| `0003_ceptinela.sql` | `0003_sentryone.sql` |
| `0004_timescale_ceptinela.sql` | `0004_timescale_sentryone.sql` |
| `0005_ceptinela_drift.sql` | `0005_sentryone_drift.sql` |

**A rename is recorded, never re-run.** A host that applied the old name has the
old name in `schema_migrations`, so the runner would see the new name as never
applied and send the whole file again. That is not harmless: 0003 recreates the
append-only rules on `ledger_events`, 0004 has since made that table a
hypertable, and Timescale refuses rules on a hypertable, so the second run fails
on the managed service. `RENAMED_MIGRATIONS` in `packages/db/src/migrate.ts`
carries the pairs and `migrate()` reconciles them before it applies anything: the
recorded row is moved to the new filename and given the new file's checksum, so
the "changed since it was applied" warning stays meaningful. A host that already
re-ran the file under both names has its stale old row dropped instead.

Rule 6 for a new migration, then: **when a migration file is renamed, add the
pair here and in `RENAMED_MIGRATIONS` in the same commit.** Renaming a file
without the pair breaks `bun run migrate` on every host that already ran it.

## Why `ledger_events` is shaped the way it is

`LedgerEvent` in `packages/core/src/domain.ts` is a discriminated union, so the
discriminant is a column (`type`, with a check constraint listing the variants) and
the rest of the variant is `jsonb`. The primary key is `(at, event_id)` and not
`event_id` alone because a Timescale hypertable requires the partitioning column in
every unique index, and `0004` partitions this table on `at`. `seq` is an identity
column with a plain index, which gives a total order inside the same instant without
adding a unique index that would block `create_hypertable`.

## Why an object can be defined twice

`supplier_weekly_outflow` is one name over two definitions: a plain view in `0007` and, where the
extension exists, the continuous aggregate that replaces it in `0008`. The Timescale file drops the
view before creating the aggregate, which is only safe because the plain files always run first and
`schema_migrations` stops either of them from running twice. Both return the same five columns over
the same rows with the same Monday 00:00 UTC buckets, so `packages/db/src/queries.ts` holds one
query and neither path gets a private shape. `migrate.test.ts` compares the two column lists without
a database, so a column added to one and not the other fails in CI.

The source is `ledger_events` rather than `cfdis`, and that is forced rather than chosen: a foreign
key into `cfdis (uuid)` needs a unique index on `uuid` alone, which is exactly the index
`create_hypertable` refuses, and `instructions` is pinned the same way by `decisions`. The event
ledger is the one hypertable, and `0003` already calls it the system of record.

The retroactive sweep after a SAT publication is a replay over this table, so an
update or a delete would rewrite history that a judge is being shown. `0003` made
that append-only with two rules, which silently ignored an `update` or a `delete`.
Timescale refuses to turn a table with rules into a hypertable, so `0005` drops
them and installs a trigger that raises `restrict_violation` instead: the same
guarantee, enforced on the hypertable, and loud rather than quiet.

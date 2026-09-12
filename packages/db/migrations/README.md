# packages/db/migrations

Plain SQL, applied in order by `bun run migrate`, tracked in `schema_migrations`
with a checksum so an edited file is reported instead of silently diverging
between four laptops.

| File | Runs on | What it adds |
|---|---|---|
| `0001_init.sql` | any Postgres 16+ | `ledger_tx`, the bank mirror spine |
| `0003_ceptinela.sql` | any Postgres 16+ | the Ceptinela schema: suppliers, known accounts, CFDI, complements, instructions, findings, decisions, the SAT list, the verified beneficiary registry and the append-only event ledger |
| `0005_ceptinela_drift.sql` | any Postgres 16+ | the columns the domain grew after 0003 (`delay_cost_per_day`, `audio_ref`, `sent_at`, `payment_total`, `operation_number`, the CEP evidence fields), `ledger_tx` as a finding subject and `verification_call` as a ledger event type |
| `0006_company.sql` | any Postgres 16+ | the one-row `company` table: who we are on the header of a constancia, and the bank account id the mirror hangs off |
| `0002_timescale.sql` | only with `timescaledb` | hypertable and continuous aggregate over `ledger_tx` |
| `0004_timescale_ceptinela.sql` | only with `timescaledb` | hypertable and continuous aggregate over `ledger_events` |

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

## Why `ledger_events` is shaped the way it is

`LedgerEvent` in `packages/core/src/domain.ts` is a discriminated union, so the
discriminant is a column (`type`, with a check constraint listing the variants) and
the rest of the variant is `jsonb`. The primary key is `(at, event_id)` and not
`event_id` alone because a Timescale hypertable requires the partitioning column in
every unique index, and `0004` partitions this table on `at`. `seq` is an identity
column with a plain index, which gives a total order inside the same instant without
adding a unique index that would block `create_hypertable`.

The retroactive sweep after a SAT publication is a replay over this table, so an
update or a delete would rewrite history that a judge is being shown. `0003` made
that append-only with two rules, which silently ignored an `update` or a `delete`.
Timescale refuses to turn a table with rules into a hypertable, so `0005` drops
them and installs a trigger that raises `restrict_violation` instead: the same
guarantee, enforced on the hypertable, and loud rather than quiet.

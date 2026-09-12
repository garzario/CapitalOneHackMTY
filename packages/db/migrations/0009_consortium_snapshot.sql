-- packages/db/migrations/0009_consortium_snapshot.sql  runs on ANY Postgres 16+
--
-- The LOCAL snapshot of the SentryOne consortium, filled by `bun run
-- consortium:pull` and read by the beneficiary control. Two tables, and the
-- reason there are two is the whole design.
--
-- `consortium_snapshot` is a projection of a warehouse view, not a system of
-- record. The record lives in Snowflake, this is a copy taken at one instant, and
-- every row carries the instant so a screen can say how fresh the signal is. It
-- is therefore REPLACED wholesale by a pull and never merged: a merge would leave
-- a pair the network has stopped corroborating sitting in the snapshot forever,
-- which is the one way a stale row turns into a false release.
--
-- `consortium_pull` is one row that says when the snapshot was taken, where it
-- came from and how many rows it holds. It exists because three states have to be
-- told apart and two tables are the only honest way to do it:
--
--   no pull row                the network was never consulted. The engine reads
--                              this as `not_consulted` and decides exactly what
--                              it decided before the consortium existed.
--   a pull row, no pair row    the network WAS consulted and has never seen this
--                              account. A different and much stronger claim.
--   a pull row and a pair row  the network knows this account, and this is what
--                              it knows.
--
-- A single table could not separate the first two, and reading "no row" as
-- "nobody pays this account" would be the product inventing an answer.
--
-- Three column decisions worth the review time.
--
-- 1. **Hashes are `char(64)` with a hex check, not `text`.** They are HMAC-SHA256
--    hex digests of exactly that length, so the type is the documentation and a
--    raw RFC or CLABE cannot be inserted here by accident: neither is 64
--    characters of hex. That check is the last line of the privacy claim in
--    `packages/consortium/README.md`.
-- 2. **`first_seen` and `last_seen` are `date` and not `timestamptz`.** The
--    warehouse holds a calendar day per event on purpose, because an instant
--    would narrow a payment to a window and a day does not. Storing a timestamp
--    here would invent a precision the source never had.
-- 3. **No amount, no name, no RFC and no CLABE.** Not "we do not populate them":
--    there is no column for any of them, in this table or in the warehouse. The
--    bank code is the exception and it is public on every SPEI receipt.
--
-- Nothing here needs an extension, so there is no Timescale twin: a snapshot of a
-- few thousand rows replaced once per pull is not a time series and a hypertable
-- would buy nothing.
create table if not exists consortium_snapshot (
  rfc_hash       char(64) not null check (rfc_hash ~ '^[0-9a-f]{64}$'),
  clabe_hash     char(64) not null check (clabe_hash ~ '^[0-9a-f]{64}$'),
  bank_code      char(3)  not null check (bank_code ~ '^[0-9]{3}$'),
  tenants        integer  not null check (tenants >= 0),
  first_seen     date     not null,
  last_seen      date     not null,
  fraud_reports  integer  not null default 0 check (fraud_reports >= 0),
  other_accounts integer  not null default 0 check (other_accounts >= 0),
  pulled_at      timestamptz not null default now(),
  primary key (rfc_hash, clabe_hash)
);

-- The supplier-level read: how many accounts the network holds for this RFC, and
-- whether any of them is the one in front of the clerk. It is the query behind
-- "forty companies pay this supplier, on an account none of them has ever paid",
-- so it is indexed rather than left to a sequential scan of the whole snapshot.
create index if not exists consortium_snapshot_rfc
  on consortium_snapshot (rfc_hash);

-- One row, enforced by the primary key and the check rather than by convention: a
-- second pull row would make "when was the network last consulted" a question
-- with two answers.
create table if not exists consortium_pull (
  id        integer primary key default 1 check (id = 1),
  pulled_at timestamptz not null,
  -- 'snowflake' is the warehouse, 'synthetic' is the deterministic network
  -- generated on this laptop for an offline rehearsal. A screen that says "red
  -- SentryOne" has to be able to say which of the two it is looking at, so the
  -- value is constrained here and not left to whatever a script writes.
  source    text    not null check (source in ('snowflake', 'synthetic')),
  rows      integer not null check (rows >= 0)
);

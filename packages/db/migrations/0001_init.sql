-- packages/db/migrations/0001_init.sql  runs on ANY Postgres 16+
create table if not exists ledger_tx (
  id            uuid primary key,
  account_id    text not null,
  occurred_at   timestamptz not null,
  amount        numeric(14,2) not null,
  direction     text not null check (direction in ('debit','credit')),
  merchant_id   text,
  category      text,
  source        text not null default 'nessie',
  raw           jsonb not null default '{}'::jsonb
);
create index if not exists ledger_tx_account_time on ledger_tx (account_id, occurred_at desc);

-- packages/db/migrations/0002_timescale.sql  applied ONLY when the extension exists.
-- scripts/migrate.ts checks pg_available_extensions and skips this file otherwise.
create extension if not exists timescaledb;
select create_hypertable('ledger_tx', 'occurred_at', if_not_exists => true, migrate_data => true);
create materialized view ledger_daily
  with (timescaledb.continuous) as
  select account_id,
         time_bucket('1 day', occurred_at) as day,
         sum(case when direction='debit' then amount else 0 end) as spend,
         count(*) as n
  from ledger_tx group by account_id, day;

-- packages/db/migrations/0004_timescale_ceptinela.sql  applied ONLY when the
-- extension exists. scripts/migrate.ts checks pg_available_extensions and skips
-- this file otherwise, exactly as it does for 0002_timescale.sql.
--
-- Everything Ceptinela needs to work is already in 0003. This file only makes the
-- event ledger cheaper to scan, which is the honest answer to "what happens at ten
-- times the volume": the same SQL, partitioned by time, with the daily counts the
-- timeline reads kept as a continuous aggregate instead of recomputed per request.
-- On a plain Postgres 18 the timeline runs the same query against the base table.
--
-- ledger_events.at is the partitioning column and it is part of the primary key in
-- 0003, which is what lets create_hypertable run without dropping a constraint.
create extension if not exists timescaledb;
select create_hypertable('ledger_events', 'at', if_not_exists => true, migrate_data => true);
create materialized view ledger_events_daily
  with (timescaledb.continuous) as
  select time_bucket('1 day', at) as day,
         type,
         count(*) as n
  from ledger_events group by day, type;

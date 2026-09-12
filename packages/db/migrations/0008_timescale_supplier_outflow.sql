-- packages/db/migrations/0008_timescale_supplier_outflow.sql  applied ONLY when
-- the extension exists. scripts/migrate.ts checks pg_available_extensions and
-- skips this file otherwise, exactly as it does for 0002 and 0004.
--
-- The Timescale half of supplier_weekly_outflow. 0007 created it as a plain view
-- that recomputes per request; this file drops that view and creates a
-- continuous aggregate with the same name, the same five columns and the same
-- bucket boundaries, so packages/db/src/queries.ts holds one query and both
-- databases answer it identically. The plain path is not a degraded mode, it is
-- the same numbers computed at read time.
--
-- Why the source is the event ledger and not `cfdis`: `cfdis` cannot become a
-- hypertable, because `payment_complements.related_cfdi_uuid` references
-- `cfdis (uuid)` and that foreign key needs a unique index on `uuid` alone,
-- which is the one thing create_hypertable refuses. `instructions` is pinned the
-- same way by `decisions.instruction_id`. Neither key can be widened without
-- dropping a foreign key that the sweep and the payment run depend on, and 0003
-- is applied everywhere so it cannot be edited. `ledger_events` is already the
-- hypertable 0004 made, and 0003 calls it the system of record, so the aggregate
-- belongs there. One `cfdi_received` is emitted per CFDI at `cfdi.issuedAt`, so
-- the aggregate and the `cfdis` table carry the same total; queries.test.ts
-- asserts that rather than trusting it.
--
-- The bucket is `time_bucket('7 days', at)`, which counts from Timescale's
-- default origin of 2000-01-03 in UTC. That date is a Monday, so every boundary
-- is the same instant as the `date_trunc('week', ...)` the plain view cuts.
--
-- `drop view` and not `drop materialized view`: at this point the object is
-- always the plain view from 0007, because the plain migrations all run before
-- the Timescale ones and schema_migrations stops this file from running twice.
create extension if not exists timescaledb;

drop view if exists supplier_weekly_outflow;

create materialized view supplier_weekly_outflow
  with (timescaledb.continuous) as
  select payload -> 'cfdi' ->> 'issuerRfc' as supplier_rfc,
         time_bucket('7 days', at) as week,
         count(*)::bigint as invoices,
         sum((payload -> 'cfdi' ->> 'total')::numeric(14,2)) as outflow,
         max((payload -> 'cfdi' ->> 'total')::numeric(14,2)) as max_invoice
  from ledger_events
  where type = 'cfdi_received'
  group by payload -> 'cfdi' ->> 'issuerRfc', time_bucket('7 days', at);

-- Real-time aggregation, and it is a demo-path decision rather than a tuning
-- one. TimescaleDB 2.13 changed the default of materialized_only to true, and
-- with that default a CFDI ingested during the demo would not appear in the
-- aggregate until the next refresh ran. Set to false, a read unions the
-- materialised buckets with the rows newer than the refresh watermark, so the
-- behaviour detector sees an invoice that arrived seconds ago. It is also what
-- keeps this view equal to the plain one on a database that was just migrated
-- and has never refreshed.
alter materialized view supplier_weekly_outflow
  set (timescaledb.materialized_only = false);

-- The refresh policy is what makes this cheaper than the plain view: buckets
-- older than an hour are computed once and kept, and only the tail is computed
-- per request by the real-time union above. start_offset bounds the work to the
-- history the detector can actually read (16 baseline weeks plus the run week).
select add_continuous_aggregate_policy('supplier_weekly_outflow',
  start_offset      => interval '1 year',
  end_offset        => interval '1 hour',
  schedule_interval => interval '1 hour',
  if_not_exists     => true);

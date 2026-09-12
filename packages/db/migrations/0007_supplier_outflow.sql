-- packages/db/migrations/0007_supplier_outflow.sql  runs on ANY Postgres 16+
--
-- supplier_weekly_outflow, the feed the supplier_behaviour detector and the
-- supplier drawer read: what each supplier invoiced this company, per week.
--
-- This file is the plain-Postgres half of a two-path object. 0008 replaces this
-- view with a Timescale continuous aggregate of the same name and the same
-- columns, so every query above it is written once and both databases answer it
-- identically. The only difference is where the numbers come from: here they are
-- computed per request, there they are kept materialised and refreshed.
--
-- Three decisions worth the review time.
--
-- 1. **The source is ledger_events and not cfdis.** 0003 says the event ledger
--    is the system of record and every other table is a projection of it, and on
--    the Timescale path there is no choice at all: `cfdis` cannot become a
--    hypertable, because `payment_complements.related_cfdi_uuid` references
--    `cfdis (uuid)` and that foreign key needs a unique index on `uuid` alone,
--    which is exactly the index a hypertable refuses. `instructions` is pinned
--    the same way by `decisions.instruction_id`. `ledger_events` is already the
--    hypertable 0004 made, so the aggregate lives where it can actually live.
--    The two agree by construction: the generator emits one `cfdi_received` per
--    CFDI at `cfdi.issuedAt`, which `queries.test.ts` asserts against `cfdis`.
-- 2. **The bucket is a Monday 00:00 UTC and it is cut in UTC, not in Monterrey.**
--    `date_trunc('week', ...)` lands on Monday, and TimescaleDB's
--    `time_bucket('7 days', ...)` counts from its default origin of 2000-01-03,
--    itself a Monday, in UTC. Every bucket boundary is therefore the same
--    instant on both paths. A week is not a business day: nobody reads the hour
--    a week opened, and pinning it to UTC is what keeps the two definitions from
--    drifting by six hours.
-- 3. **`::numeric(14,2)` on the way out of the jsonb.** `total` is
--    `numeric(14,2)` in `cfdis` and a JSON number inside the payload. Casting to
--    the storage type is what makes the sum agree with `sum(total) from cfdis`
--    to the cent instead of to within a rounding error.
--
-- `supplier_rfc` is text and not a foreign key to `suppliers`: an invoice can
-- arrive from an RFC we have no supplier row for yet, and dropping it here would
-- hide the case the product exists for.
create or replace view supplier_weekly_outflow as
  select ledger_events.payload -> 'cfdi' ->> 'issuerRfc' as supplier_rfc,
         date_trunc('week', ledger_events.at at time zone 'UTC') at time zone 'UTC'
           as week,
         count(*)::bigint as invoices,
         sum((ledger_events.payload -> 'cfdi' ->> 'total')::numeric(14,2))
           as outflow,
         max((ledger_events.payload -> 'cfdi' ->> 'total')::numeric(14,2))
           as max_invoice
  from ledger_events
  where ledger_events.type = 'cfdi_received'
  group by ledger_events.payload -> 'cfdi' ->> 'issuerRfc',
           date_trunc('week', ledger_events.at at time zone 'UTC') at time zone 'UTC';

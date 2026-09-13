-- packages/db/migrations/0011_decision_reason.sql  runs on ANY Postgres 16+
--
-- One column, for the question three Capital One judges asked on 2026-09-12: what
-- happens if the payment is urgent and the supplier does not answer the telephone.
--
-- The answer the product now gives is that a held payment can be released under a
-- named person's responsibility with a written argument, and that both land on the
-- append-only ledger next to the pesos at risk and the expected loss that were on
-- screen at the moment. `decisions.decided_by` already carried the name.
-- `Decision.reason` in packages/core/src/domain.ts carries the argument, and
-- without this column the normalised projection would answer a reason on the
-- in-memory store and nothing on Postgres, which is exactly the kind of asymmetry
-- a judge finds by reloading the page.
--
-- Idempotent, additive, and nullable on purpose: the engine's own proposal carries
-- no reason, because the engine's reasoning is the findings.
--
-- It sits after 0010_rail_events.sql, which landed on dev while this branch
-- was open, so this file was renumbered twice before it was ever applied anywhere.
--
-- Never edit an applied migration. The checksum in schema_migrations would report
-- it and the next laptop would diverge.

alter table decisions
  add column if not exists reason text
    check (reason is null or length(reason) between 1 and 400);

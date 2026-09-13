-- packages/db/migrations/0013_decision_actor_role.sql  runs on ANY Postgres 16+
--
-- One column, for issue #199: the role the person who signed a decision was
-- acting in.
--
-- `decisions.decided_by` has carried the name since 0003 and `reason` the
-- argument since 0011. What neither answers is the question an auditor asks
-- first, which is in what capacity: a release over a finding is an exception the
-- OWNER approves (`decideRequirement` in packages/core/src/actor.ts), and a
-- constancia or an evidence letter that printed the name without the role would
-- leave whoever reads it eighteen months later unable to tell an approved
-- exception from a clerk exceeding theirs.
--
-- Nullable and checked rather than a lookup table. Null is the engine's own
-- decision, which is signed `system` and is not a person with a role, and it is
-- also every decision taken before the `X-Actor` header existed. The check keeps
-- the two roles of `ActorRole` and nothing else, so a third role is a migration
-- and not a typo in a request body.
--
-- Why no column for the actor on a ledger event: `LedgerEvent` keeps its
-- discriminant in `type` and the rest of the variant in `payload` jsonb, so
-- `actor` on `instruction_received`, `sat_list_published`, `cep_verified`,
-- `cent_sent` and `verification_call` needs no DDL at all. The decision is the
-- one place the ledger is projected into normalised columns, which is why it is
-- the one place that needed this file.
--
-- Idempotent and additive. Never edit 0003 or 0011 to fold this in: the checksum
-- in schema_migrations would report the edit and the next laptop would diverge.

alter table decisions
  add column if not exists decided_by_role text
    check (decided_by_role is null or decided_by_role in ('clerk', 'owner'));

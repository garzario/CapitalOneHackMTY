-- packages/db/migrations/0012_assistant_and_payment_events.sql  runs on ANY Postgres 16+
--
-- The five event kinds the assistant panel and the payment execution append, from
-- issues #195 and #196:
--
-- 1. `payment_settled`, the rail acknowledged a transfer. Separate from
--    `payment_sent` because "we asked" and "the rail says it happened" are two
--    different claims, and a receipt is only complete on the second one.
-- 2. `payment_failed`, the rail refused a line, with the sentence a clerk acts on.
-- 3. `payment_cancelled`, the line was dropped before anything was sent.
-- 4. `assistant_message`, one turn of the assistant panel. The conversation lives
--    on the same append-only ledger as the payments because a proposal somebody
--    acted on is part of the history of that payment, and `AssistantSession` is
--    projected from these rows instead of being stored twice.
-- 5. `intake_image`, a screenshot reached the product: the reference, who dropped
--    it, and the instruction it became. Never the bytes and never anything a model
--    read out of it beyond the CLABE that lands on the instruction.
--
-- `payment_sent` is already legal here, since 0003 wrote it. What it grew in
-- `packages/core/src/domain.ts` is three optional fields (`runId`, `rail`,
-- `actor`), and every one of them lives in `payload`, so no column moves.
--
-- What is deliberately NOT in this file: a column for the confidence level or for
-- the transaction state. Both are derived by `confidenceOf` and
-- `transactionStateOf` in `packages/core/src/levels.ts` out of the findings, the
-- decision, the verification and the execution, and ADR-0009 says why storing
-- either would be wrong: a stored level can disagree with the findings it was
-- computed from, and a derived one cannot. The same argument `holdWindow` made for
-- the deadline it never stores.
--
-- An append-only ledger that refuses one of its own event types is a ledger with a
-- hole in it, so the check constraint has to learn the five or every assistant turn
-- and every executed payment would be rejected at the door. Same shape as 0005 and
-- 0010: a check constraint has no "if not exists" form, so it is dropped by the
-- name Postgres gave it (<table>_<column>_check) and recreated with the wider set.
-- Idempotent, and nothing else in the schema moves: `LedgerEvent` keeps the
-- discriminant in `type` and the rest of the variant in `payload`, which all five
-- new kinds already fit.
--
-- Never edit 0003, 0005 or 0010 to add them: the checksum in schema_migrations
-- would report the edit and the next laptop would diverge.

alter table ledger_events drop constraint if exists ledger_events_type_check;
alter table ledger_events add constraint ledger_events_type_check
  check (type in (
    'cfdi_received', 'complement_received', 'instruction_received',
    'payment_sent', 'payment_settled', 'payment_failed', 'payment_cancelled',
    'sat_list_published', 'cent_sent', 'cep_awaited', 'cep_verified',
    'verification_call', 'decision_made',
    'assistant_message', 'intake_image'));

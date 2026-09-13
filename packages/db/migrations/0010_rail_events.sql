-- packages/db/migrations/0010_rail_events.sql  runs on ANY Postgres 16+
--
-- The two event kinds the one-cent verification appends, from issue #166:
--
-- 1. `cent_sent`, the 0.01 MXN probe leaving the company's account through a
--    payment rail, with the clave de rastreo the rail filed it under. It is the
--    event that makes the beneficiary control self-serve: the clave comes back
--    from the bank and not from a keyboard.
-- 2. `cep_awaited`, the cent is out and Banxico has published no CEP for that
--    clave yet. A CEP appears once the transfer settles, so this is an ordinary
--    state for minutes and not an error, and the event is what lets the screen
--    say so instead of showing nothing.
--
-- An append-only ledger that refuses one of its own event types is a ledger with
-- a hole in it, so the check constraint has to learn them or every verification
-- would be rejected at the door. Same shape as 0005: a check constraint has no
-- "if not exists" form, so it is dropped by the name Postgres gave it
-- (<table>_<column>_check) and recreated with the wider set. Idempotent, and
-- nothing else in the schema moves: `LedgerEvent` keeps the discriminant in
-- `type` and the rest of the variant in `payload`, which both new kinds already
-- fit.
--
-- Never edit 0003 or 0005 to add them: the checksum in schema_migrations would
-- report the edit and the next laptop would diverge.

alter table ledger_events drop constraint if exists ledger_events_type_check;
alter table ledger_events add constraint ledger_events_type_check
  check (type in (
    'cfdi_received', 'complement_received', 'instruction_received',
    'payment_sent', 'sat_list_published', 'cent_sent', 'cep_awaited',
    'cep_verified', 'verification_call', 'decision_made'));

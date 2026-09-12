-- packages/db/migrations/0005_sentryone_drift.sql  runs on ANY Postgres 16+
--
-- Closes the gap between 0003 and packages/core/src/domain.ts as it stands
-- today. 0003 was written against an earlier domain and three things moved:
--
-- 1. Fields the domain grew: Supplier.delayCostPerDay, PaymentInstruction.audioRef
--    and sentAt, PaymentComplement.paymentTotal and operationNumber, and the CEP
--    fields senderAccount, beneficiaryRfc, concepto, numeroCertificado and
--    signatureReason on the verified beneficiary row.
-- 2. Finding.subject.kind gained 'ledger_tx', the row of the bank mirror an
--    unbacked outflow hangs off. Without it every reconciliation finding of that
--    case would be refused by the check constraint at the door.
-- 3. LedgerEvent gained 'verification_call', the outcome of the phone call to the
--    supplier. An append-only ledger that refuses one of the event types is a
--    ledger with a hole in it.
-- 4. ledger_tx from 0001 keyed on id alone, and a Timescale hypertable refuses a
--    unique index that leaves out the partitioning column, so 0002 could never
--    run on the managed instance. The key becomes (occurred_at, id): the same
--    row is still the same row, and `on conflict (occurred_at, id)` keeps the
--    seed idempotent. Found the first time 0002 was actually run on Tiger Data.
-- 5. The append-only guard on ledger_events was two rules, and Timescale refuses
--    to turn a table with rules into a hypertable, so 0004 could never run
--    either. The rules become a trigger that raises, which a hypertable accepts
--    and which is the louder guard 0003 wanted in the first place: an update or
--    a delete now fails instead of being silently ignored. The splitter in
--    packages/db/src/migrate.ts understands the dollar quoting this needs.
--
-- Everything is idempotent. A check constraint has no "if not exists" form, so
-- the two constraints are dropped by the name Postgres gave them
-- (<table>_<column>_check) and recreated with the wider set. Never edit 0003:
-- the checksum in schema_migrations would report it and the next laptop would
-- diverge.

alter table suppliers
  add column if not exists delay_cost_per_day numeric(14,2)
    check (delay_cost_per_day is null or delay_cost_per_day >= 0);

alter table payment_complements
  add column if not exists payment_total numeric(14,2);
alter table payment_complements
  add column if not exists operation_number text;

alter table instructions
  add column if not exists audio_ref text;
alter table instructions
  add column if not exists sent_at timestamptz;

alter table verified_beneficiaries
  add column if not exists sender_account text;
alter table verified_beneficiaries
  add column if not exists beneficiary_rfc text;
alter table verified_beneficiaries
  add column if not exists concepto text;
alter table verified_beneficiaries
  add column if not exists numero_certificado text;
alter table verified_beneficiaries
  add column if not exists signature_reason text;

alter table ledger_tx drop constraint if exists ledger_tx_pkey;
alter table ledger_tx add constraint ledger_tx_pkey primary key (occurred_at, id);

alter table findings drop constraint if exists findings_subject_kind_check;
alter table findings add constraint findings_subject_kind_check
  check (subject_kind in ('instruction', 'cfdi', 'supplier', 'ledger_tx'));

alter table ledger_events drop constraint if exists ledger_events_type_check;
alter table ledger_events add constraint ledger_events_type_check
  check (type in (
    'cfdi_received', 'complement_received', 'instruction_received',
    'payment_sent', 'sat_list_published', 'cep_verified',
    'verification_call', 'decision_made'));

drop rule if exists ledger_events_no_update on ledger_events;
drop rule if exists ledger_events_no_delete on ledger_events;

create or replace function ledger_events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'ledger_events is append-only: % is not allowed', tg_op
    using errcode = 'restrict_violation';
end
$$;

drop trigger if exists ledger_events_append_only on ledger_events;
create trigger ledger_events_append_only
  before update or delete on ledger_events
  for each row execute function ledger_events_append_only();

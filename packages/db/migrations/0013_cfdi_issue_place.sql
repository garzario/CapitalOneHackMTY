-- packages/db/migrations/0013_cfdi_issue_place.sql  runs on ANY Postgres 16+
--
-- `LugarExpedicion`, the postal code a CFDI 4.0 was issued from, which is the only
-- geography an invoice carries.
--
-- Issue #203 gave control 2 a second comparison: the plaza in digits 4 to 6 of the
-- account against the state the supplier invoices from. The plaza lives in the
-- account number and the place lives in the invoice, so neither side can make that
-- comparison alone, and `Cfdi.issuePlace` in `packages/core/src/domain.ts` is where
-- the invoice side lands.
--
-- This column exists so the comparison behaves the same way in both modes. The
-- in-memory repository the demo and `bun run demo` use keeps the field because it
-- keeps the object; without the column, the deployed API would read every invoice
-- back without a place and the geographic half of control 2 would go silent in
-- production and nowhere else. A control that works offline and not on the server is
-- the failure issue #125 is named after, and it is silent, which is worse than
-- broken.
--
-- Nullable on purpose, and the loader treats null as "no place" rather than as a
-- place that disagrees: a CFDI parsed before this column existed, or one whose
-- LugarExpedicion is not five digits, must raise nothing at all.

alter table cfdis add column if not exists issue_place text;

comment on column cfdis.issue_place is
  'CFDI 4.0 LugarExpedicion: the five-digit postal code the invoice was issued from. Null means the document did not carry a readable one, and null never produces a finding.';

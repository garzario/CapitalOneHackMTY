-- packages/db/migrations/0003_sentryone.sql  runs on ANY Postgres 16+
--
-- The SentryOne schema. Column names are snake_case versions of the fields in
-- packages/core/src/domain.ts, one for one, so a reader can hold the TypeScript
-- type and the table side by side. The mapping is restated in
-- packages/db/src/queries.ts, which is the only file that writes these tables.
--
-- Three shape decisions worth the review time.
--
-- 1. ledger_events is the system of record and everything else is a projection of
--    it. The retroactive sweep after a SAT publication is a replay over this table,
--    so it has to be append-only in the database and not only by convention.
-- 2. Money is numeric(14,2) everywhere, the same as ledger_tx in 0001. postgres.js
--    returns numerics as strings, which is what keeps a peso from turning into a
--    float on the way out.
-- 3. Nothing here depends on an extension. 0004_timescale_sentryone.sql adds the
--    hypertable and the continuous aggregate, and is skipped on a plain Postgres,
--    exactly like 0002 does for ledger_tx.
--
-- Statement style: whole-line comments only, and no dollar-quoted function bodies.
-- scripts/migrate.ts splits a migration on semicolons, so a plpgsql body would be
-- cut in half. The append-only guard below is written as rules for that reason.

-- Suppliers we buy from. The RFC is the natural key: it is what the CFDI carries
-- and what the SAT list is indexed by, so there is no surrogate id to keep in sync.
create table if not exists suppliers (
  rfc              text primary key,
  legal_name       text not null,
  first_invoice_at timestamptz not null,
  synthetic        boolean not null default false
);

-- Accounts we have paid before, with the evidence that established each one.
-- A NEW clabe never appears here until something proves it: a payment complement
-- the supplier issued, a prior instruction we actually paid, or a verified CEP.
-- This table is the memory the clabe_forensics detector compares against.
create table if not exists known_accounts (
  supplier_rfc   text not null references suppliers (rfc) on delete cascade,
  clabe          text not null check (clabe ~ '^[0-9]{18}$'),
  established_by text not null
    check (established_by in ('payment_complement', 'instruction', 'cep')),
  established_at timestamptz not null,
  times_paid     integer not null default 0 check (times_paid >= 0),
  primary key (supplier_rfc, clabe)
);

-- The same clabe under two suppliers is a signal, so the reverse lookup is indexed.
create index if not exists known_accounts_clabe on known_accounts (clabe);

-- CFDI 4.0 de ingreso: the invoice the supplier issued to us.
create table if not exists cfdis (
  uuid           uuid primary key,
  serie          text,
  folio          text,
  issued_at      timestamptz not null,
  issuer_rfc     text not null,
  issuer_name    text not null,
  receiver_rfc   text not null,
  subtotal       numeric(14,2) not null,
  iva            numeric(14,2) not null,
  total          numeric(14,2) not null,
  payment_method text not null check (payment_method in ('PUE', 'PPD')),
  payment_form   text,
  synthetic      boolean not null default false
);

create index if not exists cfdis_issuer_time on cfdis (issuer_rfc, issued_at desc);
create index if not exists cfdis_receiver_time on cfdis (receiver_rfc, issued_at desc);

-- The duplicate_invoice detector reads this one: same issuer and same total inside
-- a date window is the first half of the check, a serie and folio collision the
-- second half.
create index if not exists cfdis_issuer_total on cfdis (issuer_rfc, total);
create index if not exists cfdis_serie_folio on cfdis (issuer_rfc, serie, folio)
  where serie is not null and folio is not null;

-- Complemento de recepcion de pagos 2.0, issued by the supplier AFTER it was paid.
-- CtaBeneficiario is the account the supplier itself says it received money on,
-- which is the only document that can legitimately establish a new account.
create table if not exists payment_complements (
  uuid                 uuid primary key,
  related_cfdi_uuid    uuid not null references cfdis (uuid) on delete cascade,
  paid_at              timestamptz not null,
  paid_amount          numeric(14,2) not null,
  beneficiary_account  text check (beneficiary_account ~ '^[0-9]{18}$'),
  beneficiary_bank_rfc text,
  synthetic            boolean not null default false
);

create index if not exists payment_complements_cfdi
  on payment_complements (related_cfdi_uuid);
create index if not exists payment_complements_account
  on payment_complements (beneficiary_account)
  where beneficiary_account is not null;

-- A payment instruction is how a payment request reached the company, and it is
-- where a new account always arrives. supplier_rfc is nullable on purpose: a QR
-- intake can produce an instruction whose supplier we cannot identify yet, and
-- refusing to store it would hide the most interesting case of all.
-- message_text holds PaymentInstruction.text; `text` is a type name in Postgres and
-- reads badly as a column.
create table if not exists instructions (
  id             text primary key,
  supplier_rfc   text references suppliers (rfc) on delete restrict,
  cfdi_uuids     uuid[] not null default '{}'::uuid[],
  clabe          text not null check (clabe ~ '^[0-9]{18}$'),
  amount         numeric(14,2) not null,
  source         text not null
    check (source in ('email', 'whatsapp', 'pdf', 'portal', 'manual')),
  received_at    timestamptz not null,
  message_text   text,
  image_ref      text,
  ocr_confidence numeric(4,3) check (ocr_confidence between 0 and 1),
  synthetic      boolean not null default false
);

create index if not exists instructions_received on instructions (received_at desc);
create index if not exists instructions_supplier
  on instructions (supplier_rfc, received_at desc);
create index if not exists instructions_clabe on instructions (clabe);

-- A finding is attached to an instruction, a cfdi or a supplier, so the subject is
-- polymorphic and deliberately has no foreign key. evidence is the chip payload the
-- UI renders, kept as jsonb so a new detector does not need a migration.
create table if not exists findings (
  id             text primary key,
  detector       text not null check (detector in (
                   'sat_69b', 'clabe_forensics', 'duplicate_invoice',
                   'supplier_behaviour', 'beneficiary_cep', 'bank_reconciliation')),
  severity       text not null check (severity in ('info', 'warning', 'critical')),
  state          text not null
    check (state in ('comprobable', 'requiere_verificacion')),
  subject_kind   text not null
    check (subject_kind in ('instruction', 'cfdi', 'supplier')),
  subject_id     text not null,
  amount_at_risk numeric(14,2) not null default 0,
  explanation    text not null,
  evidence       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null
);

create index if not exists findings_subject on findings (subject_kind, subject_id);
create index if not exists findings_detector on findings (detector, created_at desc);

-- One row per decision moment, not one row per instruction. A clerk can hold a
-- payment on Thursday and release it on Friday, and both have to survive in the
-- history a judge scrolls. The current decision is the newest row.
create table if not exists decisions (
  id                 bigint generated always as identity primary key,
  instruction_id     text not null references instructions (id) on delete cascade,
  action             text not null check (action in ('hold', 'verify', 'release')),
  expected_loss      numeric(14,2) not null default 0,
  delay_cost_per_day numeric(14,2) not null default 0,
  decided_at         timestamptz not null,
  decided_by         text
);

create index if not exists decisions_instruction
  on decisions (instruction_id, decided_at desc);

-- Decision.findings in the domain type. The join is explicit so the exact set of
-- findings that justified a decision can be rebuilt later, even after the detectors
-- change and would produce a different set today.
create table if not exists decision_findings (
  decision_id bigint not null references decisions (id) on delete cascade,
  finding_id  text not null references findings (id) on delete cascade,
  primary key (decision_id, finding_id)
);

-- SAT Article 69-B, one parent row per published list version. The version id is
-- the DOF publication date of the list we downloaded, which is the only identifier
-- the SAT itself gives us.
create table if not exists sat_list_versions (
  list_version text primary key,
  published_at date not null,
  row_count    integer not null default 0 check (row_count >= 0),
  source       text not null default 'sat.gob.mx',
  loaded_at    timestamptz not null default now()
);

-- One row per RFC per status per version. An RFC moves through the statuses over
-- time, keeping every version is what makes the retroactive sweep possible, and
-- deleting a version cascades so a bad download can be dropped whole.
create table if not exists sat_list_entries (
  list_version text not null
    references sat_list_versions (list_version) on delete cascade,
  rfc          text not null,
  name         text not null,
  status       text not null check (status in (
                 'presunto', 'desvirtuado', 'definitivo', 'sentencia_favorable')),
  published_at date not null,
  primary key (list_version, rfc, status)
);

-- GET /api/v1/sat/lookup?rfc= reads across versions, so the RFC leads this index.
create index if not exists sat_list_entries_rfc
  on sat_list_entries (rfc, published_at desc);
create index if not exists sat_list_entries_status
  on sat_list_entries (status, published_at desc);

-- The per-company registry of verified beneficiaries. cep_xml is bytea and not
-- text on purpose: an XMLDSig signature validates over the exact bytes Banxico
-- served, so any re-encoding, newline normalisation or whitespace tidying by the
-- driver would silently invalidate evidence we claim to have checked.
create table if not exists verified_beneficiaries (
  supplier_rfc     text not null references suppliers (rfc) on delete cascade,
  clabe            text not null check (clabe ~ '^[0-9]{18}$'),
  clave_rastreo    text not null,
  transferred_at   timestamptz not null,
  amount           numeric(14,2) not null,
  sender_name      text not null,
  sender_bank      text not null,
  beneficiary_name text not null,
  beneficiary_bank text not null,
  signature_valid  boolean not null,
  name_match       text not null
    check (name_match in ('match', 'partial', 'mismatch')),
  cep_xml          bytea not null,
  verified_at      timestamptz not null default now(),
  synthetic        boolean not null default false,
  primary key (supplier_rfc, clabe)
);

create unique index if not exists verified_beneficiaries_rastreo
  on verified_beneficiaries (clave_rastreo);

-- The append-only event ledger. LedgerEvent is a discriminated union in the domain,
-- so the discriminant is a column and the rest of the variant is the jsonb payload.
-- The primary key carries `at` because a Timescale hypertable requires the
-- partitioning column in every unique index, and 0004 turns this table into one.
-- seq gives a total order inside the same instant without being unique-indexed.
create table if not exists ledger_events (
  event_id    uuid not null default gen_random_uuid(),
  seq         bigint generated always as identity,
  at          timestamptz not null,
  type        text not null check (type in (
                'cfdi_received', 'complement_received', 'instruction_received',
                'payment_sent', 'sat_list_published', 'cep_verified',
                'decision_made')),
  payload     jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  primary key (at, event_id)
);

create index if not exists ledger_events_seq on ledger_events (seq);
create index if not exists ledger_events_type_at on ledger_events (type, at desc);

-- The sweep filters the payload by supplier RFC and by CFDI uuid. jsonb_path_ops is
-- the smaller of the two GIN operator classes and supports the containment queries
-- the replay uses.
create index if not exists ledger_events_payload
  on ledger_events using gin (payload jsonb_path_ops);

-- Append-only, enforced by the server and not by convention. Rules rather than a
-- trigger because a plpgsql body needs semicolons and scripts/migrate.ts splits a
-- migration on semicolons. A rule is a single statement.
-- The cost is that an UPDATE or DELETE is silently ignored instead of raising.
-- TODO(garzario): once the migration splitter understands dollar quoting, replace
-- these with a trigger that raises, so a mistake is loud instead of quiet.
create or replace rule ledger_events_no_update as
  on update to ledger_events do instead nothing;
create or replace rule ledger_events_no_delete as
  on delete to ledger_events do instead nothing;

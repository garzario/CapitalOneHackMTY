-- packages/db/migrations/0006_company.sql  runs on ANY Postgres 16+
--
-- Who the company is. Everything in 0003 describes the suppliers we pay; nothing
-- described us, and three reads need it.
--
-- 1. The constancia prints the company in its header. A document that says who
--    was checked against the SAT list but never says who did the checking is not
--    a document an accountant can file.
-- 2. The bank mirror hangs off one account id. `ledger_tx` also carries the
--    consumer dataset, so the company's mirror has to be replaced by account and
--    never by truncating the table, and the account id has to be stored rather
--    than guessed from whichever rows happen to be there.
-- 3. The payment run has one anchor, `week_of` and `run_id`, written by the seed
--    and read by GET /api/v1/run/current. Deriving the week from the newest
--    instruction instead would let one payment received next Monday move the run
--    and take the 92 seeded lines off the screen with it. The run opens where it
--    was opened; a later intake joins it.
--
-- One row, enforced by the primary key and the check rather than by convention:
-- a second company row would make "which one is us" a question with two answers.
create table if not exists company (
  id              integer primary key default 1 check (id = 1),
  rfc             text not null,
  legal_name      text not null,
  bank_account_id text not null,
  week_of         date not null,
  run_id          text not null,
  synthetic       boolean not null default false,
  seeded_at       timestamptz not null default now()
);

# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Whoever merges a pull request appends its entry to `[Unreleased]` in the same commit, under Added,
Changed or Fixed. Exactly one version is cut for this event, `[1.0.0]` at M4, and tagged. The
release itself is a procedure and not a judgement call: `docs/playbooks/release.md` holds the
commands, and `bun run release-check` is the gate that runs before them.

## [Unreleased]

Everything below is on `dev` and is the content of the coming `[1.0.0]`. The order inside each
group is the order of `AGENTS.md` "Where things live": the intelligence first, then the transport,
then the screens, then the narrative, then the plumbing.

### Added

- Real document import path, so the CFDI parser can be validated on a document a PAC actually
  stamped (refs #68). `bun run scripts/import-real-cfdi.ts <file>` reads one real CFDI 4.0, de
  ingreso or complemento de pagos 2.0, and writes a committable fixture: every amount scaled by a
  secret factor from `REAL_CFDI_SCALE`, every RFC replaced by a `SYN` one carrying a correct SAT
  check digit, legal names constructed, addresses blanked, UUID, folio, bank accounts, operation
  numbers, stamps and certificates regenerated, and the structure, namespaces, attribute order and
  tax breakdown left exactly where they were. Every arithmetic identity the original satisfied is
  recomputed from the scaled inputs and reverified, and the command refuses to write a file in which
  any replaced value, or any RFC or CLABE shaped token, survived. The redacted copy goes to
  `packages/core/src/fixtures/real/`, the change map to the gitignored `.seed/real/`.
  `packages/core/src/cfdi-real.test.ts` parses every fixture in that folder and skips with a message
  while it is empty. Documented in `docs/08-data-model.md`, Real document validation.

- `supplier_weekly_outflow`, the feed the `supplier_behaviour` detector and the supplier drawer read
  (issue #72). One name over two definitions: `0007_supplier_outflow.sql` is a plain view that runs
  on any Postgres 16 or newer, and `0008_timescale_supplier_outflow.sql` drops it and puts a
  continuous aggregate with the same five columns and the same Monday 00:00 UTC buckets in its
  place where `timescaledb` exists, so the offline database answers the same numbers and only the
  cost changes. The source is `ledger_events` and not `cfdis`, which is forced rather than chosen: a
  foreign key into `cfdis (uuid)` needs a unique index on `uuid` alone and that is exactly what
  `create_hypertable` refuses, and `instructions` is pinned the same way by `decisions`. Real-time
  aggregation is on, so a CFDI ingested during the demo reaches the detector without waiting for a
  refresh. `supplierHistory(rfc, weeks)` in `packages/db/src/queries.ts` returns
  `SupplierBehaviourInput` from `packages/core/src/behaviour.ts` with the weekly series attached, so
  `assessSupplierBehaviour(await supplierHistory(sql, rfc))` runs with no mapping step in between,
  and the window comes from the detector's own defaults so the two cannot drift. Tested three ways:
  the mapper and the shape without a database in `rows.test.ts`, the two definitions compared column
  by column in `migrate.test.ts`, and ten cases against a real server in `queries.test.ts`, gated on
  `TEST_DATABASE_URL` and run against the local PostgreSQL 18.6 where the plain view is what
  answers. Documented in `docs/08-data-model.md`.

- The API answers every endpoint in `docs/09-api.md` out of Postgres, so the data platform is live
  behind the product rather than beside it (issue #41). `apps/api/src/postgres-repo.ts` implements
  the same `Repository` the screens were built against, over the query layer in `packages/db`, and
  not one file in `src/routes` changed: `bootRepository()` picks it when `DATABASE_URL` is set and
  the boot log names the host and database without the credentials. `bun run seed` now loads the
  whole demo company into Postgres in one transaction, documents, event ledger, and the findings
  and decisions the six controls produce over the run, replacing the company's own bank mirror by
  account so the consumer dataset in `ledger_tx` survives; running it twice gives the same run.
  Migration `0006_company.sql` adds the one-row `company` table the constancia header, the mirror
  account id and the run anchor come from: the run screen reads the week the seed opened rather
  than re-deriving it from the newest instruction, so an intake received in a later week joins the
  open run instead of replacing it. The current decision is the newest row by append order and not
  the largest `decided_at`, which is what lets a clerk override an engine decision stamped at a run
  instant ahead of their own clock. `apps/api/src/postgres-repo.test.ts` asserts parity against
  `MemoryRepository` on the same seed, line for line, plus the endpoints and the SSE stream, and
  was run against the local PostgreSQL 18 and the managed TimescaleDB 2.30 service.

- The metrics page says how blind the blind evaluation actually is (issue #51). It used to claim
  the labels were written by a different person from the detectors, which the holdout README
  contradicts; the note now states the real position, names the four labels that disagree with
  the engine and are still counted against us, and explains why an info row is not a false
  positive. The numbers on it are the real ones: 30 cases, precision 85.0, recall 81.0, false
  positive rate 1.9.

- The CEP viewer says three things about a Banxico seal instead of two (issue #50). Validated,
  not verified and not valid are different claims, and while `CEP_SIGNATURE_SCHEME_CONFIRMED` is
  false every real CEP is the middle one; the badge, the colour and a sentence under it now carry
  that difference. The Banxico handoff replaces a bare link and an open TODO: the portal takes a
  POST form, so no link can arrive prefilled, and the screen prints the six values it asks for in
  its own order and date format with one button to copy them. The verified beneficiary registry
  is grouped by supplier, newest verification first, because a supplier with three verified
  accounts is the history that makes a fourth one a question.

- The QR the judge scans is on the payment run screen (issue #48). `IntakeQr` renders the intake
  address as an inline SVG built from the matrix, with the four-module quiet zone the
  specification asks for and a fixed contrast direction that survives dark mode. It refuses to
  draw a code on `localhost`, where the address means the judge's own phone, and prints the URL
  and the reason instead. The intake form's submit button is now pinned to the bottom of the
  viewport on a phone, which is the one screen a person drives with one thumb while holding an
  invoice in the other hand. New dependency: `uqr` 0.1.3, zero dependencies, published
  2026-04-03, added to the vetted pin table.

- The Article 69-B simulation replays the ledger for real (issue #49). `src/lib/replay.ts` turns
  a `SweepResult` into one frame per month of the company's own ledger, apportioning each
  supplier's exposure across the months its already-paid invoices fall in and pinning the last
  frame to the sweep's own totals, so the counters climb and land exactly on the number the
  engine reported. Suppliers light up in the month their first exposed invoice appears, quiet
  months still get a tick, the whole replay is capped at 2.4 seconds however many months the seed
  has, and reduced motion jumps straight to the answer. The constancia PDF is linked from the
  result. The placeholder timeline and its hardcoded month list are gone.

- End-to-end vertical slice. `SEED=sentryone` now runs the six controls over the generated company
  at boot, so `GET /api/v1/run/current` serves the engine's own findings and proposed actions
  instead of an empty alert rail: 7 findings on 92 instructions, 2 held and 5 to verify, and
  885,658.73 MXN that does not leave. The API boot line prints the seed, the run and the hero ids.
  `sat_69b` now reads the committed official 69-B snapshot as well as the versions the instance was
  posted, for that one RFC, so a real listed RFC is caught by the control and not only by the lookup
  box, while every synthetic supplier still meets no real row. `bun run demo` is a rewrite that
  drives the five beats of `docs/10-demo-script.md` headless against a freshly seeded in-memory app
  and exits non-zero on any beat, with `--base <url>` to run the same beats over HTTP against a
  deployment.
- `packages/constancia`, the retention artifact as a real PDF (issue #69). A PDF writer with no
  dependency and no headless browser: base-14 Helvetica, WinAnsi bytes so accents and `Ñ` survive,
  exact cross-reference offsets, uncompressed streams so a layout bug is readable with `less`.
  Two documents on top of it, one for the retroactive 69-B sweep and one for the weekly payment
  run, each stating what was checked and not only what was found, naming its own sources, and
  carrying a SHA-256 digest of the ledger range it describes. The page calls that digest a huella
  and says in as many words that it is not an electronic signature. Served by
  `GET /api/v1/sat/constancia?listVersion=` and `GET /api/v1/run/:id/constancia`, linked from the
  69-B screen and the payment run screen.
- `GET /api/v1/sat/lookup` hardened for the RFCs a judge types (issue #70). The input is
  normalised before validation, so lower case, spaces and a hyphen before the homoclave all
  reach the same taxpayer, and the answer echoes the normalised form back. The response now
  carries `listed`, which is the newest situation and not "any row exists", the `effective` row,
  and the `source` of the snapshot that answered, present even on an empty result so that "not
  listed" can never be read as "no list loaded". The endpoint is rate limited to 30 requests per
  minute per client with the shared error envelope, `Retry-After` and the `RateLimit-*` headers.
- Measured accessibility pass over the whole app. `apps/web/audit/audit.ts` checks horizontal
  overflow at 390, 768, 1440 and 1920, keyboard reach and focus visibility under real Tab presses,
  reduced motion reaching the duration tokens, and WCAG contrast on every colour pairing in both
  themes, exiting non-zero on a failure. `bun run audit:web` and `bun run shoot:web`.
- Screenshots for the six screens at four widths and the README loop, in `assets/screenshots`.
- `bun run doctor` answers the pre-demo checklist and not only the setup one (issue #63). It names
  the committed SAT list snapshot with its list version, retrieval date and counts and warns when
  that download is more than 30 days old, parses the CEP fixture and reports the signature as not
  checked rather than valid, says whether a real CEP has landed yet, and on the database says which
  path is live, how many of the five migrations are applied with a Timescale-only file on a plain
  host named as expected rather than missing, what the SentryOne tables hold and how many rows the
  bank mirror has. Every variable in `.env.example` is reported with the files that actually read it,
  grepped from `apps/`, `packages/` and `scripts/` rather than remembered, and one clause saying what
  stops working without it, and the last line is whether this laptop can demo with the network
  unplugged. That last line only counts what stops a demo: a SAT snapshot that is merely old still
  answers offline, so its age is a clause after the verdict and not a reason against it, and an
  unmigrated database is sent to `bun run migrate` while an empty one is sent to `bun run seed`,
  because seeding cannot create tables. A database that refuses the connection prints a reason rather
  than an empty one, which is what the driver gives on ECONNREFUSED. The checks moved to
  `scripts/doctor/checks.ts`, pure or dependency-injected, with `scripts/doctor/checks.test.ts`
  covering the stale snapshot, the edited migration, the plain Postgres path, the readiness rule and
  those three, plus one database case gated on `TEST_DATABASE_URL`. Only a bun version mismatch still
  fails a plain run; `--strict` exits 1 on any warning.

### Fixed

- The demo script's seeded ids and amounts were correct and unprotected. Every figure in
  `docs/10-demo-script.md` that comes from the generator is now asserted against it by
  `packages/seed/src/sentryone/documented-figures.test.ts`, verified by hand against a seeded API
  first. The engine-derived figures in the same tables, the seven findings, the 885,658.73 that is
  not leaving and the 404,152.59 of retroactive exposure, are still unprotected and want a test in
  `apps/api` beside `sentryone.test.ts`.
- The persona, the journey and the printed one-pager quoted a reference run of 92 invoices at
  MXN 673,460.27 over 42 suppliers. `generateSentryOne` produces 92 payment instructions at
  MXN 2,174,210.76 over 44. Nobody wrote a wrong number: they were right when they were written
  and the seed moved underneath them, so `packages/seed/src/sentryone/documented-figures.test.ts`
  now asserts every quoted figure against the generator and fails the build when they drift.
- The one-pager printed the repository QR twice, once unlabelled in the hero slot where a judge
  expects the live app. That slot is the same dashed live-app placeholder the judge card already
  used, so the sheet cannot go to print looking finished.
- The capture script navigated to `/metrics` on a hash-routed app, so the app redirected itself
  to the payment run and the shutter opened there. Four of the eight stills were byte-identical
  copies of the run screen under four different names, and two more were duplicates at phone
  width. The paths carry their `#` now and the page is reset between shots, so the ten captures
  in `assets/screenshots` are ten different screens.
- Every screen title was an `h2` and the app had no `h1` at all, so a screen reader's outline
  started at level two under nothing. `SectionHeader` is the page title on every screen, so it
  is an `h1` now, with a test that keeps the count at one per screen.

- Four colour tokens that failed WCAG AA. `--c-ink-subtle` measured 3.34 on a sunken panel in light
  and 4.25 in dark, against a floor of 4.5, which put every timestamp and helper line below AA.
  `--c-border-strong` measured 1.60 and 1.72 against a floor of 3, and it is the border of `.btn`
  and `.input` on a background of the same colour, so the only thing marking a control was
  effectively invisible.

- Every screen is designed and enforced in four states. The QR intake page gained the two it was
  missing, an instruction that passes all six controls now says so instead of returning a bare
  decision badge, and `apps/web/src/screens/states.test.ts` fails the build when a screen ships
  with a happy path and nothing else. The state matrix and the mapping from the five demo beats to
  the screens they run on are written down in `docs/design.md`.

- Blind evaluation of the six controls (issue #55). Thirty labelled holdout cases in
  `packages/seed/src/holdout/cases`: a true positive for every control, and the hard negatives
  that decide whether a clerk keeps the product switched on, including a bank change backed by
  the supplier's own payment complement, a new supplier ramping, a round-number retainer, a
  quarterly invoice that repeats an amount, a thin history with no baseline to test, a status
  that moved to desvirtuado before the payment, and a photographed CLABE that transcribes badly
  onto the right account. `runEngine` scores them through `runControls`, the same entry point
  intake uses, `bun run eval` prints the table and `GET /api/v1/metrics` serves the same
  `Metrics`. An `info` row is scored as context and never as a false positive. Four labels
  disagree with the engine today and all four are left in the table with the argument written
  down, because a set edited until it agrees measures nothing.
- `docs/11-pitch.md` and `docs/13-devpost.md`, finished against the product that is actually in
  `dev`. The pitch carries the 60, 90 and 240 second versions in Mexican Spanish, all three opening
  with the fiscal hook, whose two halves are now cited at their primary sources (CFF article 69-B for
  the retroactive effect and the thirty-day window, Ley de Sistemas de Pagos article 11 for the
  finality of an accepted transfer order), plus the six controls in the words used at the table, a
  gate table saying which lines may be spoken today and which are still blocked on issues #44 and
  #57, a table of the only numbers we are allowed to say with the source of each, the blind
  evaluation read off `bun run eval` including the four labels that disagree with the engine, and
  the eight hardest judge questions answered in one breath each. The Devpost copy is submission ready with an
  English and a Spanish block per field, the six prize categories each carrying the gate that has to
  be true before it is selected, and `TODO(garzario)` placeholders for the live URL and the video.
  Two discrepancies found while verifying and recorded rather than smoothed over: the reference run
  amount in `docs/02-persona.md` predates the finished generator, and the committed SAT snapshot is a
  different vintage from the open-data file cited in `docs/04-market.md`.
- SentryOne synthetic company in `packages/seed/src/sentryone`: Metalicos del Norte SA de CV, a
  28-person metalmecanica shop in Apodaca with 44 suppliers, eight months of CFDI de ingreso in PUE
  and PPD, payment complements carrying CtaBeneficiario and the clave de rastreo of the SPEI that
  paid them, this week's payment run of 70 to 110 instructions arriving by email, WhatsApp, PDF and
  portal, and the Nessie-shaped bank mirror of every peso that already left, normalised through the
  same importer the live Nessie read uses. The four hard negatives are applied and measured rather
  than described, and four demo scenarios land on named hero instructions. Deterministic from one
  seed, with invariants covering reproducibility, reconciliation to the cent, every reference
  resolving and no date after the run day. `bun run seed` prints the hero instruction ids and the
  demo RFCs, and `SEED=sentryone` serves the same company from the API.
- `packages/db`: the SentryOne query layer is implemented. Every stub in `queries.ts` has a body,
  raw SQL over the tables of `0003`: the append-only event ledger (`appendLedgerEvent`,
  `readLedger` with an exclusive `since`), suppliers with their known accounts (`upsertSupplier`
  moves `first_invoice_at` earlier only and never downgrades the evidence behind an account), CFDI
  and payment complements, instructions, findings, decisions (one row per decision moment, the
  newest wins, the justifying findings through `decision_findings`), the versioned SAT list, the
  verified beneficiary registry with the CEP stored byte for byte as `bytea`, the bank mirror read
  back into `LedgerTx`, `currentPaymentRun` and `latestRunWeek` cut in Monterrey time, and the
  counts and truncate the doctor and the seed use. The row shapes and mappers are in `rows.ts`,
  pure and unit tested; `queries.test.ts` runs against a real Postgres when `TEST_DATABASE_URL`
  is set and is skipped otherwise, and it was run green on both the local Postgres 18 and the
  Tiger Data Timescale service.
- `packages/db/migrations/0005_sentryone_drift.sql`: the columns the domain grew after `0003`
  (`delay_cost_per_day`, `audio_ref`, `sent_at`, `payment_total`, `operation_number`, the CEP
  evidence fields), `ledger_tx` accepted as a finding subject and `verification_call` as a
  ledger event type, `ledger_tx` keyed on `(occurred_at, id)` so `0002` can partition it, and
  the append-only guard on `ledger_events` rewritten from two rules into a trigger that raises,
  because Timescale refuses to turn a table with rules into a hypertable. `splitSqlStatements`
  now respects quoted strings and dollar-quoted bodies, which is what the trigger needs.
- Printable A5 judge card and A4 one-pager layouts with a verified repository QR, an architecture
  back, and explicit blockers for the live URL and real CEP tracking key.
- Finding panel reads all three evidence vocabularies in the repository through
  `apps/web/src/lib/evidence.ts`, and gives the four facts that decide a payment their own
  rendering: the account comparison with the differing digits painted, the change of bank named
  rather than shown as codes, the Article 69-B row badged by status, and the invoice a duplicate
  copies. Chips are labelled in Spanish, and a test fails the build when a producer grows a key
  nobody translated.
- `packages/voice`: the ElevenLabs verification call. `buildVerificationScript` writes what the agent
  says from the payment instruction and never speaks more than the last four digits of the account,
  promises no payment and accuses nobody; `VoiceClient` creates or updates the agent, places the
  outbound call through the Twilio integration and reads the transcript back, all behind an
  injectable fetch; `parseVerificationOutcome` turns a transcript into `confirmed`, `denied`,
  `no_answer` or `unclear` with the quoted sentence, deterministically and with a bare "si"
  deliberately not counting as a confirmation. Plus `verification_call` in the domain ledger,
  `POST` and `GET /api/v1/instructions/:id/verify-call` in `apps/api` (422 with the script when the
  keys are absent, and no path that releases a payment), the browser fallback at `/verify-call` in
  `apps/web`, and `bun run voice-setup` which prints the ids for `.env`. Fixture transcripts, no
  network and no key in the tests.
- A quantified composite payment-clerk persona, explicit corporate-treasury anti-persona, and a
  screen-mapped journey covering false positives, partial name matches and legitimate bank changes.
- Payment-run screen rebuilt around the ten-second read: one hero figure for the money that is
  not leaving, the worst finding named and linked, and the table ordered exceptions first and then
  by amount. `apps/web/src/lib/run-view.ts` holds both answers as pure functions with tests, and
  they read the items rather than `run.totals` so the headline cannot contradict the table after a
  decision applied with no API. Screenshots in `assets/screenshots`, captured reproducibly by
  `apps/web/brand/shoot.ts`.
- SentryOne brand layer and the rationale behind the design system: the name lockup in
  `apps/web/src/components/Wordmark.tsx`, the favicon, touch icon and social card in
  `apps/web/public/` with their sources in `apps/web/brand/`, and `docs/design.md`. The token
  contract is now enforced by `apps/web/src/design/tokens.test.ts`, which fails when a component
  reads a token that does not exist, when a colour has no dark counterpart, or when any file other
  than `tokens.css` writes a colour.
- `packages/engine`: the six controls of ADR-0002 behind one call, `runControls(input)`. It holds
  the two adapters that `packages/core` cannot hold without a dependency cycle, `sat_69b` over
  `matchRfc` plus the retroactive `SweepResult` exposure, and `beneficiary_cep` over `nameMatch`
  and the CEP signature state. `apps/api` depends on it.
- `matchRfc` in `packages/sat`: the Article 69-B situation in force for one RFC, newest DOF
  publication first, so a taxpayer who cleared their name is never reported as listed.
- `Supplier.delayCostPerDay`, optional, with a documented default of zero, and `supplierModelOf`
  in `packages/core` to read it. The expected-loss engine now weighs the delay against a number on
  the supplier record instead of a constant in a route handler.
- `Repository.allComplements` and `Repository.bankMirror` in `apps/api`, so the duplicate and
  reconciliation controls see every complement and the Nessie bank statement.
- Repository bootstrap: bun workspace monorepo, shared TypeScript and lint configuration, the agent
  contract in `AGENTS.md`, the documentation set in `docs/`, CI, and the contributor guides.
- `apps/api` scaffold for the contract in `docs/09-api.md`: one file per route group under
  `src/routes`, zod schemas for every request and response derived from the domain types, a
  `Repository` interface with an in-memory implementation seeded with a synthetic payment run, the
  Server-Sent Events broadcaster behind `GET /api/v1/events`, and the intake pipeline that runs the
  detectors and the expected-loss decision engine in `@hackmty/core`.
- `apps/web` scaffold: design tokens, a typed client for the contract in `docs/09-api.md` with the
  Server-Sent Events hook, a dependency-free hash router, the synthetic payment run the app falls
  back to when the API is absent, and the six screens (payment run, instruction detail, QR intake,
  Article 69-B simulation and lookup, CEP viewer, blind evaluation).
- `packages/cep`: Banxico CEP reader. `parseCep` over the `SPEI_Tercero` document, `verifySignature`
  which runs the candidate matrix and reports `unconfirmed_scheme` rather than claiming a seal it
  cannot prove, `fetchCep` against the public portal with an injectable fetch, and `nameMatch` with
  Mexican legal-name normalisation. Synthetic fixture, zero dependencies, no network in the tests.
- `docs/06-regulatory-privacy.md`: regulatory posture, privacy and LLM boundary for SentryOne.
  Legal position, framework map for Mexico, the verified text of CFF articles 69-B and 69-B Bis,
  the LFPDPPP obligations over CEP holder names and supplier data, the ethics rules the domain
  types enforce, a cost per verification table priced on 2026-09-12, and the synthetic data
  posture. Every legal and price claim is traced to a primary source in a sources table.
- Market and business model: `docs/04-market.md` and `docs/05-business-model.md`, with the competitor
  map, bottom-up TAM, SAM and SOM, unit economics, payback and the go-to-market plan. Every figure is
  cited to a public primary source with its access date.

  `bun run demo` is a rewrite that drives the five beats of `docs/10-demo-script.md` headless
  against a freshly seeded in-memory app and exits non-zero on any beat, with `--base <url>` to run
  the same beats over HTTP against a deployment.
- `packages/core/src/cfdi.ts`: CFDI 4.0 de ingreso and complemento de recepcion de pagos 2.0 parsed
  into the domain types, on a dependency-free XML tokenizer that never throws. Synthetic SAT
  fixtures in `packages/core/src/fixtures/` and 62 tests covering totals, IVA, the timbre UUID, the
  beneficiary account, missing optional nodes and malformed input.
- CLABE forensics detector in `packages/core`: check digit over the 3-7-1 weights, a dated snapshot
  of the Banxico participant catalogue, plaza parsing, OCR-aware Damerau-Levenshtein against the
  supplier's paid accounts, and a `Finding` whose evidence names the differing digit positions.
- Duplicate invoice and supplier behaviour detectors in `packages/core`. Duplicates run five rules
  from provable to worth a look, and only the three the documents alone can prove (timbred UUID
  collision, a reused serie and folio, complements that already cover the total) are emitted as
  `comprobable`. Supplier behaviour tests three signals against the supplier's own trailing 16
  weeks and never against a peer group or a fixed threshold, so it produces
  `requiere_verificacion` with the numbers attached and never a verdict.
- Bank reconciliation detector in `packages/core`, the sixth control read backwards: it matches the
  outflows the bank already posted against the documents that authorised them and reports
  `unbacked_outflow`, `cfdi_paid_twice` and `payment_not_in_mirror` out of a single assignment
  pass. It is written around the fact that Nessie carries no time of day.
- Expected-loss decision engine in `packages/core/src/decision.ts`. `decide` turns findings into
  hold, verify or release by weighing the pesos at risk against what delaying the payment costs
  with that supplier, and never auto-releases while a critical finding exists. `composeFindings`
  runs whichever of the six detectors exist in the package and returns their findings in alert
  rail order, biggest amount at risk first.
- `Supplier.delayCostPerDay`, optional, with a documented default of zero, and `supplierModelOf`
  in `packages/core` to read it. The expected-loss engine now weighs the delay against a number on
  the supplier record instead of a constant in a route handler.
- `packages/engine`: the six controls of ADR-0002 behind one call, `runControls(input)`. It holds
  the two adapters that `packages/core` cannot hold without a dependency cycle, `sat_69b` over
  `matchRfc` plus the retroactive `SweepResult` exposure, and `beneficiary_cep` over `nameMatch`
  and the CEP signature state. `apps/api` depends on it.
- `packages/sat`, the Article 69-B half of the product. A loader that parses the SAT's published
  listing by column name (ISO-8859-1, CRLF, records that span lines, RFC 4180 quoting, DOF dates
  written four different ways) and reports every row it cannot read with its line number instead of
  dropping it; `matchRfc` and `matchRfcAsOf` over normalised RFCs, which answer "listed today" and
  "listed on the day we deducted this invoice" separately; `sweep`, a fold over `LedgerEvent[]` that
  prices what a publication did to invoices already paid, with ISR at 30 percent documented as an
  assumption and IVA summed from the CFDIs rather than multiplied out of a rate; and
  `simulatePublication`, which refuses any RFC that is not synthetic. `matchRfc` returns the
  situation in force, newest DOF publication first, so a taxpayer who cleared their name is never
  reported as listed.
- A dated snapshot of the real SAT list, `packages/sat/src/snapshot/official-2026-09-12.csv`: the
  complete Article 69-B listing as published, 14234 rows current to 2025-12-31, committed as public
  data with its provenance in the adjacent README so `GET /api/v1/sat/lookup` answers a real RFC
  with no network. 91 rows the SAT redacted by court order are reported as unreadable, never
  matched and never silently dropped. The `sat_69b` control reads that snapshot as well as the
  versions the instance was posted, so a real listed RFC is caught by the control and not only by
  the lookup box, while every synthetic supplier still meets no real row.
- `packages/cep`: Banxico CEP reader. `parseCep` over the `SPEI_Tercero` document, `verifySignature`
  which runs the candidate matrix and reports `unconfirmed_scheme` rather than claiming a seal it
  cannot prove, `fetchCep` against the public portal with an injectable fetch, and `nameMatch` with
  Mexican legal-name normalisation. Synthetic fixture, zero dependencies, no network in the tests.
- `packages/extract`: the only package that reaches a language model, and it may only transcribe.
  `extractFromImage` reads the CLABE, the amount and the payee off a photographed instruction and
  `extractFromAudio` transcribes a voice note, both through the Gemini REST `generateContent`
  endpoint with the file inline, a fixed JSON response schema, an injectable `fetch` and
  `GEMINI_API_KEY` from the environment. The post-processor is pure: it scans the transcription for
  18-digit CLABE candidates tolerating spaces and hyphens, validates the check digit with the 3-7-1
  rule imported from `packages/core`, and discounts the confidence by named factors when the check
  digit fails, when candidates are ambiguous or when the model and its own transcription disagree.
  Wired into `POST /api/v1/instructions` behind the presence of the key, which answers 422 when it is
  absent. `scripts/extract-demo.ts` runs it over a file, or replays a recorded fixture with no key
  and no network. The boundary is enforced by a test that reads the package's own source.
- `packages/voice`: the ElevenLabs verification call. `buildVerificationScript` writes what the agent
  says from the payment instruction and never speaks more than the last four digits of the account,
  promises no payment and accuses nobody; `VoiceClient` creates or updates the agent, places the
  outbound call through the Twilio integration and reads the transcript back, all behind an
  injectable fetch; `parseVerificationOutcome` turns a transcript into `confirmed`, `denied`,
  `no_answer` or `unclear` with the quoted sentence, deterministically and with a bare "si"
  deliberately not counting as a confirmation. Plus `verification_call` in the domain ledger,
  `POST` and `GET /api/v1/instructions/:id/verify-call` in `apps/api` (422 with the script when the
  keys are absent, and no path that releases a payment), the browser fallback at `/verify-call` in
  `apps/web`, and `bun run voice-setup` which prints the ids for `.env`. Fixture transcripts, no
  network and no key in the tests.
- `packages/constancia`, the retention artifact as a real PDF. A PDF writer with no dependency and
  no headless browser: base-14 Helvetica, WinAnsi bytes so accents and `Ñ` survive, exact
  cross-reference offsets, uncompressed streams so a layout bug is readable with `less`. Two
  documents on top of it, one for the retroactive 69-B sweep and one for the weekly payment run,
  each stating what was checked and not only what was found, naming its own sources, and carrying a
  SHA-256 digest of the ledger range it describes. The page calls that digest a huella and says in
  as many words that it is not an electronic signature. Served by
  `GET /api/v1/sat/constancia?listVersion=` and `GET /api/v1/run/:id/constancia`, linked from the
  69-B screen and the payment run screen.
- SentryOne synthetic company in `packages/seed/src/sentryone`: Metalicos del Norte SA de CV, a
  28-person metalmecanica shop in Apodaca with 44 suppliers, eight months of CFDI de ingreso in PUE
  and PPD, payment complements carrying CtaBeneficiario and the clave de rastreo of the SPEI that
  paid them, this week's payment run of 70 to 110 instructions arriving by email, WhatsApp, PDF and
  portal, and the Nessie-shaped bank mirror of every peso that already left, normalised through the
  same importer the live Nessie read uses. The four hard negatives are applied and measured rather
  than described, and four demo scenarios land on named hero instructions. Deterministic from one
  seed, with invariants covering reproducibility, reconciliation to the cent, every reference
  resolving and no date after the run day. `bun run seed` prints the hero instruction ids and the
  demo RFCs, and `SEED=sentryone` serves the same company from the API.
- Blind evaluation of the six controls. Thirty labelled holdout cases in
  `packages/seed/src/holdout/cases`: a true positive for every control, and the hard negatives
  that decide whether a clerk keeps the product switched on, including a bank change backed by
  the supplier's own payment complement, a new supplier ramping, a round-number retainer, a
  quarterly invoice that repeats an amount, a thin history with no baseline to test, a status
  that moved to desvirtuado before the payment, and a photographed CLABE that transcribes badly
  onto the right account. `runEngine` scores them through `runControls`, the same entry point
  intake uses, `bun run eval` prints the table and `GET /api/v1/metrics` serves the same
  `Metrics`. An `info` row is scored as context and never as a false positive. Four labels
  disagree with the engine today and all four are left in the table with the argument written
  down, because a set edited until it agrees measures nothing.
- `apps/api` scaffold for the contract in `docs/09-api.md`: one file per route group under
  `src/routes`, zod schemas for every request and response derived from the domain types, a
  `Repository` interface with an in-memory implementation seeded with a synthetic payment run, the
  Server-Sent Events broadcaster behind `GET /api/v1/events`, and the intake pipeline that runs the
  detectors and the expected-loss decision engine in `@hackmty/core`.
- `GET /api/v1/sat/lookup` and `POST /api/v1/sat/publish` in `apps/api` wired to `@hackmty/sat`:
  the lookup merges the official list with the versions this instance holds, and the publish
  endpoint builds the demo publication through `simulatePublication` and prices it with the real
  rates. ADR-0002 holds either side of that line, in code: the real list is read and joined to
  nothing, and the only publication that meets an invoice is one built from synthetic suppliers.
- `GET /api/v1/sat/lookup` hardened for the RFCs a judge types. The input is normalised before
  validation, so lower case, spaces and a hyphen before the homoclave all reach the same taxpayer,
  and the answer echoes the normalised form back. The response now carries `listed`, which is the
  newest situation and not "any row exists", the `effective` row, and the `source` of the snapshot
  that answered, present even on an empty result so that "not listed" can never be read as "no list
  loaded". The endpoint is rate limited to 30 requests per minute per client with the shared error
  envelope, `Retry-After` and the `RateLimit-*` headers.
- `Repository.allComplements` and `Repository.bankMirror` in `apps/api`, so the duplicate and
  reconciliation controls see every complement and the Nessie bank statement.
- `apps/web` scaffold: design tokens, a typed client for the contract in `docs/09-api.md` with the
  Server-Sent Events hook, a dependency-free hash router, the synthetic payment run the app falls
  back to when the API is absent, and the six screens (payment run, instruction detail, QR intake,
  Article 69-B simulation and lookup, CEP viewer, blind evaluation).
- SentryOne brand layer and the rationale behind the design system: the name lockup in
  `apps/web/src/components/Wordmark.tsx`, the favicon, touch icon and social card in
  `apps/web/public/` with their sources in `apps/web/brand/`, and `docs/design.md`. The token
  contract is now enforced by `apps/web/src/design/tokens.test.ts`, which fails when a component
  reads a token that does not exist, when a colour has no dark counterpart, or when any file other
  than `tokens.css` writes a colour.
- Payment-run screen rebuilt around the ten-second read: one hero figure for the money that is
  not leaving, the worst finding named and linked, and the table ordered exceptions first and then
  by amount. `apps/web/src/lib/run-view.ts` holds both answers as pure functions with tests, and
  they read the items rather than `run.totals` so the headline cannot contradict the table after a
  decision applied with no API.
- Finding panel reads all three evidence vocabularies in the repository through
  `apps/web/src/lib/evidence.ts`, and gives the four facts that decide a payment their own
  rendering: the account comparison with the differing digits painted, the change of bank named
  rather than shown as codes, the Article 69-B row badged by status, and the invoice a duplicate
  copies. Chips are labelled in Spanish, and a test fails the build when a producer grows a key
  nobody translated.
- The Article 69-B simulation replays the ledger for real. `apps/web/src/lib/replay.ts` turns a
  `SweepResult` into one frame per month of the company's own ledger, apportioning each supplier's
  exposure across the months its already-paid invoices fall in and pinning the last frame to the
  sweep's own totals, so the counters climb and land exactly on the number the engine reported.
  Suppliers light up in the month their first exposed invoice appears, quiet months still get a
  tick, the whole replay is capped at 2.4 seconds however many months the seed has, and reduced
  motion jumps straight to the answer. The constancia PDF is linked from the result, and the
  placeholder timeline with its hardcoded month list is gone.
- The CEP viewer says three things about a Banxico seal instead of two. Validated, not verified and
  not valid are different claims, and while `CEP_SIGNATURE_SCHEME_CONFIRMED` is false every real CEP
  is the middle one; the badge, the colour and a sentence under it now carry that difference. The
  Banxico handoff replaces a bare link and an open TODO: the portal takes a POST form, so no link
  can arrive prefilled, and the screen prints the six values it asks for in its own order and date
  format with one button to copy them. The verified beneficiary registry is grouped by supplier,
  newest verification first, because a supplier with three verified accounts is the history that
  makes a fourth one a question.
- The QR the judge scans is on the payment run screen. `IntakeQr` renders the intake address as an
  inline SVG built from the matrix, with the four-module quiet zone the specification asks for and
  a fixed contrast direction that survives dark mode. It refuses to draw a code on `localhost`,
  where the address means the judge's own phone, and prints the URL and the reason instead. The
  intake form's submit button is pinned to the bottom of the viewport on a phone, which is the one
  screen a person drives with one thumb while holding an invoice in the other hand. New dependency:
  `uqr` 0.1.3, zero dependencies, published 2026-04-03, added to the vetted pin table.
- Every screen is designed and enforced in four states. The QR intake page gained the two it was
  missing, an instruction that passes all six controls now says so instead of returning a bare
  decision badge, and `apps/web/src/screens/states.test.ts` fails the build when a screen ships
  with a happy path and nothing else. The state matrix and the mapping from the five demo beats to
  the screens they run on are written down in `docs/design.md`.
- Measured accessibility pass over the whole app. `apps/web/audit/audit.ts` checks horizontal
  overflow at 390, 768, 1440 and 1920, keyboard reach and focus visibility under real Tab presses,
  reduced motion reaching the duration tokens, and WCAG contrast on every colour pairing in both
  themes, exiting non-zero on a failure. `bun run audit:web` and `bun run shoot:web`.
- Screenshots for the six screens at four widths and the README loop, in `assets/screenshots`,
  captured reproducibly by `apps/web/brand/shoot.ts`.
- `docs/06-regulatory-privacy.md`: regulatory posture, privacy and LLM boundary for SentryOne.
  Legal position, framework map for Mexico, the verified text of CFF articles 69-B and 69-B Bis,
  the LFPDPPP obligations over CEP holder names and supplier data, the ethics rules the domain
  types enforce, a cost per verification table priced on 2026-09-12, and the synthetic data
  posture. Every legal and price claim is traced to a primary source in a sources table.
- Market and business model: `docs/04-market.md` and `docs/05-business-model.md`, with the competitor
  map, bottom-up TAM, SAM and SOM, unit economics, payback and the go-to-market plan. Every figure is
  cited to a public primary source with its access date.
- A quantified composite payment-clerk persona, explicit corporate-treasury anti-persona, and a
  screen-mapped journey covering false positives, partial name matches and legitimate bank changes.
- `docs/11-pitch.md` and `docs/13-devpost.md`, finished against the product that is actually in
  `dev`. The pitch carries the 60, 90 and 240 second versions in Mexican Spanish, all three opening
  with the fiscal hook, whose two halves are now cited at their primary sources (CFF article 69-B for
  the retroactive effect and the thirty-day window, Ley de Sistemas de Pagos article 11 for the
  finality of an accepted transfer order), plus the six controls in the words used at the table, a
  gate table saying which lines may be spoken today and which are still blocked on issues #44 and
  #57, a table of the only numbers we are allowed to say with the source of each, the blind
  evaluation read off `bun run eval` including the four labels that disagree with the engine, and
  the eight hardest judge questions answered in one breath each. The Devpost copy is submission
  ready with an English and a Spanish block per field, the six prize categories each carrying the
  gate that has to be true before it is selected, and `TODO(garzario)` placeholders for the live URL
  and the video. One discrepancy found while verifying is recorded rather than smoothed over and is
  still open: the reference run amount in `docs/02-persona.md` predates the finished generator,
  under `TODO(FabriBanda)`.
- Printable A5 judge card and A4 one-pager layouts with a verified repository QR, an architecture
  back, and explicit blockers for the live URL and real CEP tracking key.
- `bun run scrub`, the pre-submission secret scrub, and `bun run release-check`, the five gates that
  run before the release pull request. The scrub reads the working tree, every blob reachable from
  every ref and every commit message, and exits non-zero on a key shape, a committed `.env`, a real
  telephone number, a CEP fixture name that is not marked synthetic, or AI attribution. It reads
  blobs through `git cat-file --batch`, because `git log -p` calls the committed SAT list binary and
  never looks inside it, and it reports a history hit as `dev/main` or as `branch` because that is
  what decides the remediation. Findings are printed masked, never as the match. `release-check`
  runs typecheck, tests, build, `bun run demo` and the scrub, stops at the first red gate, and tags,
  pushes and deploys nothing.
- Repository bootstrap: bun workspace monorepo, shared TypeScript and lint configuration, the agent
  contract in `AGENTS.md`, the documentation set in `docs/`, CI, and the contributor guides.

### Changed

- `docs/07-architecture.md` and `docs/08-data-model.md` are finished against the merged tree
  (issue #64), and every figure on both pages now comes from a run or from a cited file. 07 carries
  the four-lane flowchart with the real packages, a sequence diagram of the intake path from the QR
  photo through `packages/extract` to the SSE update, a second one of the SAT publication replay
  through `simulatePublication`, `publishSatList` and `priceSweep`, and a justification table that
  now covers Gemini boxed to extraction, ElevenLabs for the verification call and the hash router,
  each row with the condition that would make us switch. The deliberately absent pieces are a table
  with their reversal condition, MongoDB Atlas among them, and the scaling section states the
  measured cost of a control pass (15.1 ms per line, 1387 ms for a 92-line run on an Apple M3 Pro)
  and the honest multi-tenancy position: the schema is single-tenant by construction because
  `0006_company.sql` refuses a second row, and the path to many tenants is one column plus a space
  dimension. 08 transcribes the ERD from `domain.ts` including `delayCostPerDay`, `paymentTotal`,
  `operationNumber`, `audioRef`, `sentAt`, the CEP evidence fields, `ledger_tx` as a finding subject
  and `verification_call`, says which lines are real foreign keys and which are only join keys,
  explains all six migrations including why `0005` exists, and reports the synthetic-data figures as
  `summarizeSentryOne` returns them for seed 69 and week 2026-09-07. The blind-evaluation section
  carries the measured table from `bun run eval` (30 cases, 85.0 precision, 81.0 recall, 1.9 false
  positive rate, action agreement 28 of 30) and, separately, the false positive rate over the ten
  hard negatives alone, which is 0 of 60 case-by-detector pairs. The stale parts are gone: the ERD
  no longer shows a `ceps` table or an `instruction_cfdi` junction that the schema never had, the
  migration section no longer describes a `supplier_weekly_outflow` aggregate that does not exist,
  and the threshold TODO is answered rather than left open, by stating that no refusal threshold was
  pre-registered before the first run and why claiming one would be false.
- `detectBankReconciliation` buckets the expected payments by the day they are expected on and
  scans only the days inside the match window, instead of the whole company's documents once per
  outflow. Same findings, and a payment run of 92 lines over eight months of statement goes from
  11 seconds to 1.5, which is what makes running the controls at boot possible at all.
- `docs/01-rubric-mapping.md` carries a real claim sentence and real evidence for all fourteen
  sub-criteria plus the engineering-process row: every evidence cell is a path, a PR number, a CI
  run or a test name that exists on `dev` today. Five rows are yellow and each one names the single
  thing that would turn it green, with the issue that tracks it. A self-score section states the
  scoring rule (G full, Y half, R zero) and records M1 at 85 of 100, so the number is reproducible
  instead of asserted. The scoring discipline now checks `dev` rather than `main`, which is where
  the evidence actually lands.
- `docs/14-process.md` replaces its M3 placeholders with the artifacts themselves: the board and
  its nine views, the five epics, three pull requests worth reading with what each body argues
  (#117 the detector registry that made every control silent, #119 what the real 4.5 MB SAT file
  does to a parser, #118 why the call outcome is parsed deterministically), the CI run and the test
  count, the rubric score trend, and the ADR index with each ADR's real status instead of the
  placeholder ones. Build night mode now states what it bought and what it cost, including that no
  merged PR carries a post-merge review thread yet. The cut list is written: the fourteen issues
  superseded by the SentryOne backlog after ADR-0002, the nine closed as duplicates, six deliberate
  descopes each traced to the PR or doc that made the call, and the four surfaces decided out of
  scope before the first commit.
- Docs consistency pass, with the live-integration evidence written down. `docs/14-process.md`
  gains a "Live integrations verified" section for what was run against the real providers on
  2026-09-12: two outbound verification calls through the imported Twilio number to a teammate's own
  mobile, with their conversation ids, the agent id, the 18-second first call ended by the remote
  party and the cost the provider reported; one handwritten-style image through `gemini-3.6-flash`
  that returned supplier, amount and CLABE in one call; and the Nessie key validated by a
  `POST /customers` that answered 201. The gate table in
  `docs/11-pitch.md` ticks the live call against that section, and the gates still open keep the
  sentence to say instead. `docs/04-market.md` reconciles the two SAT files this repository reads:
  the committed 14,234-row snapshot current to 2025-12-31 that the product answers from, and the
  14,761-row open-data export current to 2026-07-31 that the publication-frequency counts are taken
  from. `docs/01-rubric-mapping.md` refreshes the evidence cells touched by #129, #131 and #133 with
  no status letter moved, and the counts that had drifted are corrected wherever they are quoted: 45
  merged PRs, 1,116 tests across 65 files. The cut list entry saying the `sat_69b` detector is not
  fed the real committed list now records that #133 reversed that cut, and why the reversal is still
  inside ADR-0002. The three inconsistencies in files owned by other people were filed as issue
  comments rather than edited, on #54, #52 and #50.
- `README.md` replaces its `TODO(product)` placeholders with what is true now: the problem stated
  with the cited SAT, ISR, IVA and irrevocability figures and the named persona, the differentiator
  and the gap, the four-lane architecture rule and three sentences on the algorithm, the real
  screenshots, and stack rows for `packages/engine`, `packages/sat`, `packages/cep`, Gemini and
  ElevenLabs. The GIF, the demo video and the live URL stay `TODO(garzario)` with their issue
  numbers until they exist.
- `SECURITY.md` replaces the four hand-typed greps under "Repository hygiene" with one command,
  `bun run scrub`, and gains a rotation checklist with a numbered row per provider (Nessie, Gemini,
  ElevenLabs, Twilio, Tiger Data, Vultr) to work through after the closing ceremony, naming for
  each one where the key lives and what to do with it.
- `CHANGELOG.md` consolidates `[Unreleased]` into three groups that match what is on `dev`, in the
  order of `AGENTS.md` "Where things live". Two entries that the merge order had left under the
  wrong heading are back where they belong, `Removed` is folded into the `Fixed` entry it was part
  of, and the four detectors that had shipped without a line of their own have one.

### Fixed

- `insertLedgerTx` stored the bank mirror's `raw` column as a JSON string of JSON: postgres.js
  serialises a value bound to a jsonb column itself, so the pre-stringified payload was encoded
  twice. Every jsonb column now receives the object.
- `0002_timescale.sql` could never run on a Timescale host: `create_hypertable` refuses a unique
  index without the partitioning column and `ledger_tx` was keyed on `id` alone. `0005` rewrites
  the key. Found the first time the migrations were applied to the Tiger Data service.

- The detector registry in `packages/core/src/decision.ts`. It discovered detector modules by
  dynamic import and guessed each one's argument tuple from its arity, so once the real detectors
  landed it called none of them and `composeFindings` returned an empty array for all six slots
  while the tests stayed green. The dynamic `DETECTOR_REGISTRY`, `asDetectorModule`, the call-shape
  guessing and the wiring `apps/api/src/pipeline.ts` carried to work around them are gone, replaced
  by explicit, typed `DetectorAdapter`s over a single `ComposeInput`. `composeFindingsReport` now
  accounts for every control in either `ran` or `skipped` with a named reason, so silence can never
  be read as a clean payment again.
- `isFinding` rejected `subject.kind: "ledger_tx"`, which the domain contract allows, so every
  `unbacked_outflow` from the reconciliation detector was dropped before it reached the clerk.
- The API tests read the ambient environment, so a laptop that followed the setup in the README
  and filled in `.env` saw 48 failures that CI never sees: `SEED=sentryone` swapped the
  hand-written fixture for the generated company, and a `GEMINI_API_KEY` turned the intake
  refusal into a live model call. `createTestApp` now pins the repository and the extractor the
  way it already pinned the clock, the seed guard and the voice configuration, and a test asserts
  that it does.
- The 69-B simulation on the `/sat` screen posted an RFC written into the screen, and that RFC
  belonged to the hand-written fixture rather than to the seeded company, so the sweep listed
  nobody and the demo's centrepiece showed a confident 0.00. The supplier is read off the payment
  run now, and a sweep that lists nobody gets its own empty state instead of a row of zeros.
- Four colour tokens that failed WCAG AA. `--c-ink-subtle` measured 3.34 on a sunken panel in light
  and 4.25 in dark, against a floor of 4.5, which put every timestamp and helper line below AA.
  `--c-border-strong` measured 1.60 and 1.72 against a floor of 3, and it is the border of `.btn`
  and `.input` on a background of the same colour, so the only thing marking a control was
  effectively invisible.

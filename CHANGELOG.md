# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Whoever merges a pull request appends its entry to `[Unreleased]` in the same commit. Exactly one
version is cut for this event, `[1.0.0]` at M4, and tagged.

## [Unreleased]

### Added

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

- Ceptinela synthetic company in `packages/seed/src/ceptinela`: Metalicos del Norte SA de CV, a
  28-person metalmecanica shop in Apodaca with 44 suppliers, eight months of CFDI de ingreso in PUE
  and PPD, payment complements carrying CtaBeneficiario and the clave de rastreo of the SPEI that
  paid them, this week's payment run of 70 to 110 instructions arriving by email, WhatsApp, PDF and
  portal, and the Nessie-shaped bank mirror of every peso that already left, normalised through the
  same importer the live Nessie read uses. The four hard negatives are applied and measured rather
  than described, and four demo scenarios land on named hero instructions. Deterministic from one
  seed, with invariants covering reproducibility, reconciliation to the cent, every reference
  resolving and no date after the run day. `bun run seed` prints the hero instruction ids and the
  demo RFCs, and `SEED=ceptinela` serves the same company from the API.
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
- Ceptinela brand layer and the rationale behind the design system: the name lockup in
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
- `docs/06-regulatory-privacy.md`: regulatory posture, privacy and LLM boundary for Ceptinela.
  Legal position, framework map for Mexico, the verified text of CFF articles 69-B and 69-B Bis,
  the LFPDPPP obligations over CEP holder names and supplier data, the ethics rules the domain
  types enforce, a cost per verification table priced on 2026-09-12, and the synthetic data
  posture. Every legal and price claim is traced to a primary source in a sources table.
- Market and business model: `docs/04-market.md` and `docs/05-business-model.md`, with the competitor
  map, bottom-up TAM, SAM and SOM, unit economics, payback and the go-to-market plan. Every figure is
  cited to a public primary source with its access date.
- Expected-loss decision engine in `packages/core/src/decision.ts`. `decide` turns findings into
  hold, verify or release by weighing the pesos at risk against what delaying the payment costs
  with that supplier, and never auto-releases while a critical finding exists. `composeFindings`
  runs whichever of the six detectors exist in the package and returns their findings in alert
  rail order, biggest amount at risk first.
- `packages/sat`, the Article 69-B half of the product. A loader that parses the SAT's published
  listing by column name (ISO-8859-1, CRLF, records that span lines, RFC 4180 quoting, DOF dates
  written four different ways) and reports every row it cannot read with its line number instead of
  dropping it; `matchRfc` and `matchRfcAsOf` over normalised RFCs, which answer "listed today" and
  "listed on the day we deducted this invoice" separately; `sweep`, a fold over `LedgerEvent[]` that
  prices what a publication did to invoices already paid, with ISR at 30 percent documented as an
  assumption and IVA summed from the CFDIs rather than multiplied out of a rate; and
  `simulatePublication`, which refuses any RFC that is not synthetic.
- A dated snapshot of the real SAT list, `packages/sat/src/snapshot/official-2026-09-12.csv`: the
  complete Article 69-B listing as published, 14234 rows current to 2025-12-31, committed as public
  data with its provenance in the adjacent README so `GET /api/v1/sat/lookup` answers a real RFC
  with no network. 91 rows the SAT redacted by court order are reported as unreadable, never
  matched and never silently dropped.
- `GET /api/v1/sat/lookup` and `POST /api/v1/sat/publish` in `apps/api` are wired to `@hackmty/sat`:
  the lookup merges the official list with the versions this instance holds, and the publish
  endpoint builds the demo publication through `simulatePublication` and prices it with the real
  rates. ADR-0002 holds either side of that line, in code: the real list is read and joined to
  nothing, and the only publication that meets an invoice is one built from synthetic suppliers.
- CLABE forensics detector in `packages/core`: check digit over the 3-7-1 weights, a dated snapshot
  of the Banxico participant catalogue, plaza parsing, OCR-aware Damerau-Levenshtein against the
  supplier's paid accounts, and a `Finding` whose evidence names the differing digit positions.
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
- `packages/core/src/cfdi.ts`: CFDI 4.0 de ingreso and complemento de recepcion de pagos 2.0 parsed
  into the domain types, on a dependency-free XML tokenizer that never throws. Synthetic SAT
  fixtures in `packages/core/src/fixtures/` and 62 tests covering totals, IVA, the timbre UUID, the
  beneficiary account, missing optional nodes and malformed input.

### Changed

### Fixed

- The detector registry in `packages/core/src/decision.ts`. It discovered detector modules by
  dynamic import and guessed each one's argument tuple from its arity, so once the real detectors
  landed it called none of them and `composeFindings` returned an empty array for all six slots
  while the tests stayed green. It is replaced by explicit, typed `DetectorAdapter`s over a single
  `ComposeInput`, and `composeFindingsReport` now accounts for every control in either `ran` or
  `skipped` with a named reason, so silence can never be read as a clean payment again.
- `isFinding` rejected `subject.kind: "ledger_tx"`, which the domain contract allows, so every
  `unbacked_outflow` from the reconciliation detector was dropped before it reached the clerk.

### Removed

- The dynamic `DETECTOR_REGISTRY`, `asDetectorModule` and the call-shape guessing in
  `packages/core/src/decision.ts`, together with the detector wiring `apps/api/src/pipeline.ts`
  carried to work around them.

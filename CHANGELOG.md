# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Whoever merges a pull request appends its entry to `[Unreleased]` in the same commit. Exactly one
version is cut for this event, `[1.0.0]` at M4, and tagged.

## [Unreleased]

### Added

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
- CLABE forensics detector in `packages/core`: check digit over the 3-7-1 weights, a dated snapshot
  of the Banxico participant catalogue, plaza parsing, OCR-aware Damerau-Levenshtein against the
  supplier's paid accounts, and a `Finding` whose evidence names the differing digit positions.
- `packages/core/src/cfdi.ts`: CFDI 4.0 de ingreso and complemento de recepcion de pagos 2.0 parsed
  into the domain types, on a dependency-free XML tokenizer that never throws. Synthetic SAT
  fixtures in `packages/core/src/fixtures/` and 62 tests covering totals, IVA, the timbre UUID, the
  beneficiary account, missing optional nodes and malformed input.

### Changed

### Fixed

### Removed

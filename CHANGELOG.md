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

- The one-cent verification travels inside the payment run, with nobody typing (issue #166).
  `packages/rail` is the new workspace and the only place in the product that sends money: one
  amount, 0.01 MXN, behind a `PaymentRail` interface with three adapters. `NessieRail` records the
  cent as a withdrawal on the company's bank mirror with our own key and mints the clave de rastreo
  from the object id Nessie returns, upper-cased letters and digits behind an `NSS` prefix, cut to
  the 30 characters a SPEI field holds; a withdrawal and not a purchase, because the mirror's
  settled history needs a payee and the probe must name nobody. `StpRail` is the documented
  production path, `registraOrden` with the cadena original in one named field order and an RSA
  SHA-256 `firma` over exactly those bytes, and its constructor refuses without `STP_BASE_URL`,
  `STP_EMPRESA`, `STP_CLABE_ORDENANTE` and `STP_PRIVATE_KEY_PATH`, so it has never pretended to be
  live: nothing in this repository holds an STP contract and `packages/rail/README.md` says so next
  to what IS verified. `FakeRail` is the in-process one, and every `cent_sent` it produces carries
  `simulated: true`. `POST /api/v1/instructions/:id/verify-account` is the pipeline: it sends the
  cent, appends `cent_sent`, resolves the CEP for that clave through the existing seam (the verified
  beneficiary registry, then the CEPs committed to this repository indexed by clave, then the Banxico
  portal and only with `ALLOW_CEP_FETCH=1`), appends `cep_awaited` with a bounded poll when Banxico
  has published nothing yet (`CEP_POLL_INTERVAL_MS`, `CEP_POLL_DEADLINE_MS`), and with the CEP in
  hand stores the registry row that arms control 5, runs the six controls again and appends
  `decision_made` signed `system`. `GET /api/v1/instructions/:id/verification` folds
  `VerificationState` out of the ledger: `not_started`, `cent_sent`, `awaiting_cep`, `cep_signed`,
  `released`, `blocked`, with the clave, the holder, the CFDI legal name, the comparison and the seal
  state. `202` because the CEP is published after the transfer settles, `409` once the payment is
  resolved because a second cent proves nothing new, `503` naming the variables when this server has
  no rail. The seal is `valid` only when `BANXICO_CEP_CERT_PEM` verified it and `not_checked`
  otherwise, which is never rendered as valid. Verified live against `api.nessieisreal.com` on
  2026-09-12: the 0.01 withdrawal lands on the mirror account with no name, no CLABE and no amount
  other than the cent in its description, no customer or account is created, and Nessie stores the
  amount as a whole number so it reads back as 0, which is why the centavo lives in our ledger.
  `bun run demo` gained a beat that takes one seeded line to `released` and another to `blocked` from
  one call each, on the in-process rail and on synthetic CEPs, and it says so on the line it prints.
- The cross-company beneficiary network, on Snowflake, and the network signal inside the beneficiary
  control (issue #164). A supplier's first payment from this company has no history here and has
  years of it in every other company that already pays that supplier, which is the signal Trustpair
  and nsKnox sell to corporate treasuries. `packages/consortium` is our version of it: the SQL REST
  API with a key-pair JWT and no SDK, one table `SENTRYONE.CONSORTIUM.BENEFICIARY_EVENTS` and one
  view `BENEFICIARY_NETWORK`, `bun run consortium:seed`, `consortium:push` and `consortium:pull`, and
  the deterministic synthetic network of other tenants the demo reads. The network is off unless
  `ALLOW_CONSORTIUM=1`.
  **What leaves a tenant** is salted HMAC-SHA256 hashes of the normalised RFC and CLABE, the
  three-digit bank code that is printed on every SPEI receipt, one of `verified`, `paid`, `mismatch`
  or `fraud_reported`, and a calendar day. Never a legal name, an amount, an invoice UUID, a clave de
  rastreo or an account number: there is no column for any of them, and `sync.test.ts` serialises the
  push payload AND the SQL it becomes and fails if one of those strings is in it. The salt is
  network-wide on purpose, because two tenants can only agree they are paying the same account if
  their hashes agree; the cost of that, stated in `packages/consortium/README.md` rather than hidden,
  is that whoever holds the salt can confirm a guess, which is why the salt belongs to the operator
  and the constant in the repository is a documented demo value.
  **The warehouse is never on the hot path.** `bun run consortium:pull` fills the local
  `consortium_snapshot` (migration `0009_consortium_snapshot.sql`, both database paths) and the
  engine reads only that, so a payment decision never waits on Snowflake and the demo works with the
  network unplugged. Two tables and not one, because three states have to be told apart: no pull row
  is "never consulted", a pull row with no pair row is "consulted and never seen this account", and
  both is what the network knows. A pull replaces the snapshot wholesale inside one transaction,
  because a pair the network has stopped corroborating must not stay behind.
  **The decision uses it deterministically and says so.** `assessNetwork` in
  `packages/core/src/network.ts` turns one signal into a verdict and a multiplier on the expected
  loss: `1 / (1 + 0.05 * tenants + 0.02 * months)`, floored at 0.2, monotone in both, and exactly 1
  when the network was not consulted, so an instance with the flag off decides what this product
  decided before the consortium existed. Any fraud report cancels every discount and raises the
  beneficiary finding to `critical` whatever the CEP says, because a tenant who lost money to this
  pair knows something the document does not carry. No LLM anywhere near it, and the two weights are
  labelled priors with a `TODO` naming what would replace them. With no CEP at all the control used
  to be silent and now reports what the network knows when the network knows something, which is the
  case the consortium exists for: forty companies pay this supplier, and none of them pays it here.
  `GET /api/v1/consortium/signal?rfc=&clabe=` answers one pair from the snapshot, 503 naming the flag
  when the consortium is off and 404 when the pair is unknown, and it takes no request shape that
  lists a supplier's accounts. `bun run doctor` gains a `snowflake` line that says whether this
  laptop can decide with the network at all.
  **The network is synthetic and every artifact says so.** SentryOne has one tenant, so the other
  tenants are generated from seed 69 with `synthetic = TRUE` on every warehouse row, and
  `consortium_pull.source` records `snowflake` or `synthetic` so no screen can confuse a rehearsal
  with a warehouse. Verified end to end against a local PostgreSQL 18 on 2026-09-12: 46 hashed pairs
  pulled with `--offline`, a corroborated account released with "pagada por 34 empresas" on the
  finding, and the same supplier on an account the network has never paid verified at 35,769.75 MXN
  of expected loss. The live Snowflake path is untried because `SNOWFLAKE_ACCOUNT` and
  `SNOWFLAKE_USER` are still empty.

- Two things the deploy of #44 cost to learn, written down next to the commands in
  `docs/07-architecture.md` rather than left in a chat: SSH out of the venue network opens the TCP
  connection to port 22 and then never delivers the banner, so `refresh.sh` is unreachable from the
  floor and `bun run deploy:vultr --reinstall --branch <name>` is the path that needs no SSH and
  keeps the address; and a reinstall discards the `caddy_data` volume, so Caddy asks Let's Encrypt
  for a new certificate on the next boot, against a limit of five per week for the same name. The
  script prints the second one before it wipes anything. Also corrects the migration count in the
  same table: five plain files and three Timescale ones, which is what `packages/db/migrations/`
  holds.

- The deploy, both halves of it, and the URL a judge can open (issue #44). `apps/web` is a static
  build on Vercel and `apps/api` runs on one Vultr instance behind Caddy, which terminates HTTPS on
  `api.<ip>.sslip.io`: sslip.io resolves a name that embeds an IPv4 address to that address, so
  Let's Encrypt answers the HTTP-01 challenge on a box that has just booted and no domain has to be
  bought or delegated first. `vercel.json` carries the build (`bun install --frozen-lockfile`, then
  `bun run --filter '@hackmty/web' build`, output `apps/web/dist`) because the bundle imports
  `@hackmty/core` from the workspace and a build rooted at `apps/web` cannot resolve it, and it
  rewrites `/api` and `/health` to the instance so the browser only ever talks to one origin and
  `apps/web/src/lib/api.ts` keeps its relative paths. `.vercelignore` holds the upload to what the
  build reads: the SAT snapshot and the judging assets are 7.6 of the repository's 8.6 MB and the
  web bundle imports neither, which is also why the first upload died mid-flight on the venue Wi-Fi
  and the trimmed one does not. `scripts/deploy-vultr.ts` creates or reuses the instance labelled
  `sentryone-api`, sends `deploy/cloud-init.sh` as user data, and ends by calling `/health` and
  `/api/v1/run/current` over HTTPS, because creating a server is not deploying: it exits non-zero
  unless the deployed API answers the contract in `docs/09-api.md`. Wiping a reused box is opt in
  behind `--reinstall`, `--dry-run` prints the user data with the secret block redacted, and the
  Vultr key being refused for this machine's IP prints the console steps and exits 2 instead of a
  stack trace. `apps/api/Dockerfile` builds on `oven/bun:1.3.11-slim`, the tag `.bun-version` pins,
  with the repository root as its context because the API imports eight workspace packages, and
  ADR-0005's no-`bun:*` rule is untouched: Bun there is packaging, not a dependency of the code.
  `deploy/Caddyfile` sets `flush_interval -1` and no `encode`, which is what keeps
  `GET /api/v1/events` streaming instead of arriving in one lump when the connection closes.
  Deployed and verified on 2026-09-12: <https://sentryone-one.vercel.app> over
  <https://api.104.238.147.69.sslip.io>, serving `run-2026-09-07` with 92 instructions and
  2,174,210.76 MXN out of Tiger Data, the same figures `docs/10-demo-script.md` documents.

- The company's bank mirror is seeded into Nessie with our own key, and the key is validated with a
  write (issue #45). `bun run nessie:mirror` pushes one customer, one Checking account and one
  merchant per supplier, then the company's bank mirror: one purchase per outflow that has already
  settled on the account, newest `--limit` first, 200 of 2446 by default on seed 69. Never the
  pending instructions of the current payment run. Dated, signed outwards, with the beneficiary
  named, which is what the issue's "withdrawals and transfers" means in substance. Purchases and not
  bare withdrawals because a purchase carries a payee and a withdrawal does not, and because that is
  the shape `packages/seed` already builds, so the read-back runs through the same
  `normalizePurchase` the live import uses and the row that comes home is the row the generator
  produced. The command reads the mirror back and reconciles it per Monterrey calendar day against
  the set that was actually pushed, which the state file records, so a later run with a narrower
  default does not report the rest of the account as differing days. `--import` replaces the
  generator's `ledger_tx` rows for the company account with what Nessie answered, through the new
  `deleteLedgerTxBySource` and inside one transaction, and it refuses a push that reported failures,
  a read-back that threw or was partly rejected, and a reconciliation that did not balance. A later
  `bun run seed` puts the generator's mirror back, once and never twice, because the loader deletes
  the account's rows by account id before it inserts. Idempotent from the gitignored
  `.seed/nessie.json`, which carries `keyValidatedAt` and `keyFingerprint`, twelve hex characters of
  SHA-256 over the key that made that write and never the key: the POST that created the customer is
  the only thing that proves the key, because an invalid key answers `200 []` on every read.
  `bun run doctor` now reports that write, computes the same fingerprint over the key in `.env` and
  is green only when the two agree, and still writes nothing itself. Three more Nessie quirks were
  verified while doing it and are in `AGENTS.md` and `docs/09-api.md`: merchant `category` is a bare
  string on a create (`NewMerchant.category` is typed as one, so the refused array shape does not
  compile), an address `state` is at most two characters, and a purchase `amount` is stored as a
  whole number, so the centavos live in our ledger and never in the mirror.

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
  `packages/core/src/cfdi-real.test.ts` parses every fixture in that folder. Documented in
  `docs/08-data-model.md`, Real document validation.

- Three real CFDI 4.0 de ingreso, redacted and committed, so the parser is proven on documents we did
  not write (closes #68). They were received by two taxpayers from three different issuers, stamped by
  two different PACs, and imported on 2026-09-12 through `scripts/import-real-cfdi.ts` under one
  shared `REAL_CFDI_SCALE`, so the amounts scale consistently with each other and the same taxpayer
  carries the same synthetic RFC in the two documents it received. Every amount is the real one times
  a factor that is not in this repository, and every RFC, legal name, postal code, serie, folio, UUID,
  certificate serial and stamp is synthetic. The three are deliberately unlike each other:
  `ingreso-1` has no serie and no folio and uses CRLF line endings, `ingreso-2` carries both and is
  one single line with no indentation, `ingreso-3` withholds IVA and ISR, opens with a byte order mark
  and is a document whose concept level tax rounding the issuing PAC did not satisfy exactly, which
  the importer preserved rather than corrected. `packages/core/src/cfdi-real.test.ts` now runs seven
  tests per fixture: it parses as the kind it claims, the record is watermarked `synthetic`,
  `Total` is `SubTotal` less the discount plus the transferred taxes less the withheld ones to within
  a cent, `iva` is summed from the document level IVA lines rather than read off
  `TotalImpuestosTrasladados` and the two agree on all three because IVA is the only tax these
  documents transfer, the UUID and both
  RFCs are shaped the way SAT writes them, no stamp or certificate is long enough to be a real one,
  and none of the parser's tolerances was needed to read the document: every element resolved a
  declared SAT namespace, the issuer name was present, the document level tax block was present, the
  timbre is a direct child of `cfdi:Complemento`, and the optional serie, folio and forma de pago
  match the document exactly. The three names are listed in the suite, so losing a fixture fails
  instead of reverting the folder to a skip. Documented in `docs/08-data-model.md`, Real document
  validation, and in row 4 of `docs/01-rubric-mapping.md`.

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

- "Verificar cuenta" on the CEP screen, and the beat that follows it with nobody typing (issue
  #167). One click posts `/api/v1/instructions/:id/verify-account`, and from there the panel
  follows `GET /verification` and re-reads on every ledger event that names the instruction, so
  the six states arrive on their own: sin verificar, centavo enviado with the clave de rastreo the
  rail answered, esperando el CEP, CEP firmado por Banxico with the holder next to the CFDI legal
  name, and pago liberado or pago bloqueado with the decision the engine took. The instruction
  detail links into it from the destination account, so the beat starts on the screen that shows
  the account it is about. Three rules hold the panel together. The rail is named on screen,
  "espejo Nessie" in the demo, next to the sentence that says the CEP is Banxico's and the cent is
  ours. The seal is rendered exactly as the API reports it and `sealVerdictOf` is the only place
  that maps it: `valid` is the only value that reads valido, and anything else, including a value
  this build has never seen, reads no verificado, which is what stops a `not_checked` seal from
  being promoted to evidence. And offline the panel moves the first two beats and stops, because a
  browser with no API holds no signed document and walking a mock to "CEP firmado" would fabricate
  the evidence the control rests on. The ledger stream is read structurally rather than by a
  switch on the event type, since `cent_sent` and `cep_awaited` are added to the union in issue
  #166 and a switch would have compiled, dropped both and frozen the panel on "centavo enviado".
  `?data=mock` carries a verification per instruction, one per state, so the offline run renders
  all six. The 409 and the 503 are sentences a clerk can act on and not error codes: a payment
  already released or blocked is not verified twice, and a deployment with no rail says which
  configuration is missing instead of inventing a clave de rastreo.

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

- The six write endpoints of `docs/09-api.md` are now each covered on both stores (issue #42). The
  Postgres suite gained the two that only ever ran against `MemoryRepository`: the pasted-CEP half of
  `POST /api/v1/cep/verify`, and `POST /api/v1/instructions/:id/verify-call`, which asserts that the
  hand-recorded call reaches `ledger_events` as one `verification_call` and drags no `decision_made`
  along with it, and that the event carries four digits and never the CLABE. All six were also driven
  over HTTP against a local PostgreSQL 18, which is what the audit in that issue asked for and is
  written up on the pull request. `docs/09-api.md` gained "The CEP, and what verify can prove", which
  states the three ways into that endpoint, the order the `claveRastreo` form tries them in, and
  where the line between "no verificada" and "invalida" is drawn.

### Changed

- The three questions three Capital One judges asked at the table on 2026-09-12 in the afternoon are
  answered with sources, and one claim we had been making is withdrawn (issue #173). They asked, one
  each: how many people have this problem in Mexico and is there demand, who is already doing it here
  and what problems do they face, and who exactly is the target user. `docs/04-market.md` had a firm
  count and a publication frequency, which answers how many could buy and not how many are hit; it had
  two Mexican competitors, both list checkers; and the user lived in `docs/02-persona.md` as a
  synthetic persona with no population behind her. Thirty-one sources were added, every one opened on
  2026-09-12 and every number carrying its own, and the file now opens with "Demand: how many have the
  problem and how we know" before the sizing, because that is the order the questions arrived in.
  **The demand answer is two answers**, because there are two losses in one payment. On the fraud side
  INEGI's victimisation survey of businesses makes medium-sized firms the most victimised size band in
  the country, 49.0 percent of them victims of a crime in 2023 against 47.3 percent of large firms and
  a 27.2 percent national average, fraud is 8.5 percent of 2.9 million crimes against economic units
  at 522 per 10,000 units, KPMG measured supplier or staff email impersonation at 24 percent of the
  cyberattacks its Mexican respondents reported, and Condusef's own register shows banks refunding
  MXN 1,265 million of the MXN 5,201 million claimed for fraud in the first quarter of 2026, 24.3
  percent. That last ratio is the thesis in one official number: prevention before the SPEI, not
  recovery after it. On the fiscal side the head of the SAT said on 2026-09-09 that it has run about
  2,000 audits of the buyers of false invoices since October 2024, article 49 Bis of the Codigo Fiscal
  has given those buyers thirty natural days from the DOF publication or a restricted digital seal
  since 1 January 2026, and article 113 Bis now carries two to nine years of prison for giving
  `efectos fiscales` to a false invoice. The volume behind the door is SPEI's 7,300 million transfers
  in 2025, up 36.8 percent, of which 94 percent were at or below about MXN 13,200, so this product
  addresses the residual six percent and says so. Eight things are stated as not published rather than
  estimated, including any Mexican peso figure for supplier impersonation, any split of Condusef's
  claims between companies and consumers, and any business-to-business share of SPEI: Banxico's SIE
  table CF891 renders through JavaScript and its exports return the page shell, so the transfer count
  rests on the Governor's Senate remarks as reported and is labelled as a secondary source.
  **The competitor map lost a claim and gained twelve companies.** It used to say nothing sits in the
  window between approving a payment run and sending it. That was wrong and it is gone: ValidX sells
  "antes de pagar, si no cumple se retiene y se notifica a Compras" over a daily sweep of the 69, 69-B,
  69-B Bis and 49-Bis lists, Portal de Proveedores in Monterrey holds a payment when a document expires
  and sweeps 69-B daily across 20,000 registered suppliers, CONTPAQi added the 49 Bis situation to its
  fiscal dashboard in version 19.2.0 on 2026-07-14 while the mass-payment window and the Banorte
  connection sit in the same product, and Verificamex sells the one-cent probe with a CEP read-back for
  MXN 8.93 to 17.85 plus IVA a call. Banco de Mexico performs that same probe itself under Regla 51a
  Bis of the SPEI rules. So "we invented checking 69-B before paying" and "we invented the penny test"
  are now on the do-not-say list, and the gap is restated as the join with four named edges: both
  halves in one decision, the account's own history, a decision instead of a warning, and no supplier
  onboarding and no ERP. Each of the twelve rows carries what the company sells in its own words, its
  winning feature, the problems it faces from its own dated material, and what it cannot do that we
  can. The strongest single row is Bind ERP's help centre saying its EFOS check "no restringira" the
  transaction and only alerts, which is the industry default our hold, verify or release replaces. Two
  Mexican banks are documented too: HSBCnet does sell beneficiary-name validation, for "unicamente
  cuentas HSBC", in batches of up to 5,000 accounts inside a 07:00 to 22:00 window, and BBVA Net Cash
  has the company type the holder's name itself with a token challenge on the last six digits of the
  account, which authenticates the employee and not the account holder. That retires the
  TODO(garzario) the row used to carry.
  **The user has a population behind her now.** `docs/02-persona.md` gained "Target user, buyer,
  channel and anti-user": 403,000 people in the occupation nationally in 2026-T1 and 25,900 in Nuevo
  Leon, 67.1 percent women, paid about MXN 11,900 a month here; 60.4 percent of firms with six or more
  employees bank through the institution's web page against 35.0 percent on a mobile app, which is the
  surface the product has to sit in front of and the one Banxico's December 2026 guidelines do not
  reach, since their scope is mobile apps used by personas fisicas; the buyer is the single decision
  maker of 61.2 percent of firms this size; the channel has a denominator, 16,356 accounting and audit
  units nationally with 12,130 of them at five people or fewer, so the 120 firms in the plan are 0.7
  percent of it; and Nuevo Leon holds about 18,500 firms in the band against 89,523 establishments
  across the four sectors with the longest supplier lists nationally. Four anti-users replace one, each
  with a published reason. Nothing in that section claims to validate Lupita and the two interview
  boxes are still unchecked. `docs/12-judge-qa.md` now opens with the three questions, a thirty-second
  spoken answer each, the numbers allowed to be said with their source and, for each one, what not to
  say. `docs/14-process.md` records the visit and the diff it caused.
  **Two findings were retracted in the same pass and both are written down**, because a retraction that
  leaves no trace gets rediscovered. A first count of job-board vacancies in Nuevo Leon was wrong by an
  order of magnitude, 146 against an actual 2,145, which moves a ratio from 22 to 1 to about 204 to 1
  and is corrected in source 44. And a claim that the FBI's annual report makes business email
  compromise its largest loss category is false, investment fraud is nearly three times larger in the
  same table, so the line it supported was cut instead of repaired. One scope question is recorded
  rather than answered: 69-B is no longer the only SAT list published against suppliers, article 49 Bis
  creates its own and two incumbents already monitor it, so TODO(garzario) before M4 is to add 49 Bis
  and 69-B Bis to `packages/sat` or to say in the docs that the sweep covers 69-B only.

### Fixed

- The CEP screen read the CFDI legal name from `razon_social_cfdi`, a key only the offline
  synthetic run writes (issue #167). `packages/engine` writes `legalName`, so in front of the
  running API the name comparison, which is the entire point of showing a CEP, printed "no
  disponible" under the holder. `readLegalName` in `apps/web/src/lib/evidence.ts` reads both keys,
  the engine's first, which is the module that already exists to keep the three evidence
  vocabularies apart. `legalName` and `beneficiaryName` also gained Spanish labels, so the finding
  panel stops printing our variable names at a clerk.

- `POST /api/v1/cep/verify` does what `docs/09-api.md` says it does (issue #42). It had been the one
  write endpoint still wired to a stub: it only ever answered from the registry of verified
  beneficiaries, matched a pasted `xml` by exact string equality against a document already stored,
  which meant a clerk could never paste a new CEP at all, and returned `finding: null` on every
  request. The TODOs pointed at issue #37, which closed with `packages/cep` holding all four steps.
  The route now goes through them: `parseCep` reads a pasted document, `fetchCep` retrieves one from
  the Banxico portal, `verifySignature` checks the seal, and the `beneficiary_cep` finding comes from
  `packages/engine`, attached to the payment run line that pays the account, or `null` when no
  pending payment goes to it. `apps/api/src/cep.ts` is the seam and it makes the three decisions a
  transport layer owns: a pasted CEP is always accepted and needs no key, no certificate and no
  network; the `claveRastreo` form reads the registry before the portal, so the demo does not depend
  on a public government service being up; retrieval is off unless `ALLOW_CEP_FETCH=1`, because the
  portal is an undocumented form behind a CAPTCHA and a per-address rate limit, and its four known
  failure sentences come back as a `422` a clerk can act on rather than a `500`. The seal is checked
  only when `BANXICO_CEP_CERT_PEM` is configured, and otherwise the CEP keeps the
  `signatureReason: "not_checked"` that `parseCep` wrote: a `signatureValid: true` nobody earned is
  the one lie this endpoint could tell that would cost more than the feature is worth.
- `not_checked` read as a failed Banxico seal, which is an accusation against a document nobody had
  checked (issue #42). `sealStateOf` in `packages/engine/src/beneficiary.ts` treated only
  `unconfirmed_scheme` as unproven and everything else as invalid, so a CEP a clerk had just pasted,
  which `parseCep` stamps `not_checked`, produced a `critical` finding explaining that "el sello de
  Banxico no valido contra el certificado". `UNPROVEN_SEAL_REASONS` now names the three reasons that
  mean the seal could not be proven, `not_checked`, `unconfirmed_scheme` and `invalid_certificate`,
  the last because this server holding no usable certificate is a fact about our configuration and
  says nothing about the supplier's document. A missing `sello`, a `sello` that is not base64 or not
  RSA-2048, a missing `cadenaCDA` and a `signature_mismatch` still read as invalid, because those
  are defects in the document itself. The distinction was already written down in `domain.ts`, in
  `packages/cep/README.md` and in that adapter's own header; only the code disagreed.
- `POST /api/v1/seed` wiped the demo company for a caller who sent `reset: false`. The field was in
  the contract, in the zod schema and in the web client's type, and the handler read only `seed`, so
  the one request that asks this endpoint not to be destructive was the one it answered by being
  destructive. There is no add-without-replace on the repository, so it answers `422` and says why.
- `bun run migrate` works again on the Tiger Data service, which it had not since the SentryOne
  rename (issue #157). Renaming `0003`, `0004` and `0005` left every host that had already applied
  them recording the old filenames, so the runner treated the new names as never applied and sent
  0003 a second time, where its append-only rules on `ledger_events` are refused by the hypertable
  0004 made of that table. `RENAMED_MIGRATIONS` in `packages/db/src/migrate.ts` now maps old name
  to new, and `migrate()` reconciles the `schema_migrations` rows before it applies anything: a
  renamed file is reported as `renamed` and re-recorded under the new name with the new file's
  checksum, and a host that already re-ran the file under both names has the stale row dropped.
  Covered by `packages/db/src/migrate-rename.test.ts` against a real Postgres.
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

- One vocabulary for the three-word answers the product switches on, with the one-cent verification
  (issue #166). `NameMatch` and a new `SealState` live in `packages/core/src/domain.ts`, which is
  where the words the whole product reads belong, and `packages/cep` re-exports the first rather than
  declaring a second copy of it. The engine's seal verdict is now `valid`, `not_checked` or
  `invalid`, so `evidence.signatureState` reads `not_checked` where it used to read `unconfirmed`:
  the same fact, named the way the domain and the API name it, and `sealStateOf` is exported so
  `GET /api/v1/instructions/:id/verification` reports the verdict the finding carries instead of
  computing a second one. Nothing about what is claimed moved: `valid` still needs
  `BANXICO_CEP_CERT_PEM` to have verified the sello, and the three unproven reasons still read as
  "no verificada" and never as invalid.

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

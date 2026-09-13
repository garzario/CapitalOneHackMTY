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

- The payment run leaves, on a rail, with a receipt per line (issue #198, ADR-0008). This is the half
  of the product that did not exist: SentryOne stopped payments and the SPEI left from the company's
  own banking portal, which left the honest answer to "why would Lupita upload the screenshot" at
  "because we asked her to". Now the instruction is the payment order, so every peso that leaves has a
  CFDI, a decision and a name behind it in the append-only ledger.

  `packages/rail` grows `send(order)` next to the probe, and `PaymentOrder` is the ADR expressed as a
  type: the instruction this product already holds, its own amount, and the account that instruction
  names. There is no shape of that object that expresses an amount the instruction did not carry.
  `NessieRail` records each line as a withdrawal on the company's bank mirror and mints the clave de
  rastreo from the object id Nessie answers, `StpRail` signs the same `registraOrden` with the
  instruction's amount and still refuses to exist without `STP_*`, and `LayoutRail` is new: the
  dispersal CSV a bank portal takes and the reader of the response file it hands back, which is the
  no-API path a PyME actually has. It has no `RailId` and that is the honest answer rather than an
  omission, because the participant that executes the file is the company's own bank and this product
  is not it. `PaymentSent.state` is the rail's own claim and nothing upgrades it, and `confirm` asks
  "can you answer for this movement" as its own question, so a rail that cannot be asked leaves its
  lines on `sent` and silence is never read as a settlement.

  `POST /api/v1/run/:id/execute` answers `202` and a stream: one `line` per payment, one `skipped` per
  line the run deliberately left alone with the ADR-0009 rule that decided it, and a `done` carrying
  the whole `PaymentExecution`. `planRunExecution` in `packages/core/src/execution.ts` is the selection
  rule and it asks exactly one question per line, through `assessTransactionState`: `liberado` goes,
  `cancelado` is dropped before anything is sent with a `payment_cancelled` that carries no actor
  because the evidence dropped it rather than a person, `rojo` and `pendiente` are left in front of a
  person, and `enviado` is already gone. Idempotence is per instruction and not per request, and it
  reads the whole ledger rather than only this run's events, so a SPEI the company sent from its own
  portal before ADR-0008 can never be sent a second time. `instructionIds` only narrows, and a request
  that names a line the decisions stop is a `409` that says which one. `GET .../execution`,
  `GET /api/v1/payments/:id/receipt` as JSON and as a PDF, `GET /api/v1/rails`,
  `GET .../layout` and `POST .../layout/response` land with it, the run constancia grows the table of
  what left with a clave de rastreo per row, and `bun run demo` gains the beat where money leaves.

  Three things are in the code rather than in a promise. Nothing is appended for a send that did not
  happen: a server with no rail answers `503` and writes nothing, because a `payment_sent` for a
  payment that never left is the one entry this ledger must not hold. The outflow is written to the
  company's own bank mirror as a `LedgerTx`, which is what lets control 6 reconcile the payment instead
  of reporting it as `payment_not_in_mirror`. And `X-Actor` is required, read through the same
  `parseActorHeader` the rest of the writes use, so the ledger answers who on every line that leaves.

  Verified live on 2026-09-13: one execution of the seeded run on the Nessie sandbox, 86 lines for
  1,388,920.90 MXN, 6 held lines left alone with their reasons, 0 failed, a `409` on the second press,
  and 3 customers and 2 accounts before and after. `packages/rail/README.md` carries the counts, what
  it proves and what it does not, and the quirk a probe of this issue found and paid for: Nessie
  accepts a withdrawal with no `status` and then refuses to list that account's withdrawals at all,
  with no route that deletes a single row.

- The level and the state on every line, the cancellation a definitive SAT listing writes, and the
  one-page evidence letter (issue #204). The contract of issue #221 said what the two words are; this
  is where they reach the wire and where one of them stops a payment.

  `assessLine` and `runLevels` join `confidenceOf` and `transactionStateOf` in
  `packages/core/src/levels.ts`, so one call answers both halves about one line and a run is counted
  by level and by state. Two properties are in that function rather than in every caller, because both
  are how the same payment starts reading differently on two screens. The decision handed to the state
  rules carries the LINE's findings and not the ones the stored decision remembers weighing, since
  `recordEngineDecision` unions findings into the line and never removes one. And a caller holding no
  folded `VerificationState` still reads row 3 of the table, because a critical `beneficiary_cep`
  finding IS a blocked verification and `blockedByCep` reads it off the line. `GET /api/v1/run/current`
  carries `confidence`, `confidenceRule`, `confidenceFindingIds`, `state` and `stateRule` per item and
  the eight counts in `totals`; `GET /api/v1/instructions/:id` carries the same five, through the same
  function, so a judge who clicks a line of the run cannot be shown a different level on the panel.
  Neither value is a column and `0012_assistant_and_payment_events.sql` already said why.

  A definitive listing cancels the line rather than holding it. Under article 69-B `definitivo`, or a
  final resolution under article 49 Bis, the comprobantes have no fiscal effect at all and
  retroactively, so there is nothing for a clerk to wait out: `POST /api/v1/sat/publish` appends one
  `payment_cancelled` per line the publication made definitive, after the `decision_made` so a replay
  reads as the publication and then its consequences, and the intake does the same for an instruction
  that arrives naming a supplier already listed. `definitiveListingReason` writes the sentence once and
  it names the article, the version and the DOF date. It fires once per line: a second publication
  naming the same supplier re-scores the pesos and appends nothing, because `RescoredLine.cancellation`
  is null unless this publication is what made the listing definitive.

  That event is the whole point, and it is where this change meets issue #199. `deps.repo.cancellation`
  reads it off the ledger and `decideRequirement` answers `reopen_cancelled`, so any decision on the
  line then needs `role=owner` and a written reason, with the `403` and the `422` that issue already
  wrote. Nothing here restates that rule: the publication produces the fact and the actor rule reads it,
  which is why the test for it appends no event of its own. Nothing is deleted when an owner does reopen
  the line either. The cancellation stays on the ledger next to the `decision_made` that carries the
  name and the argument, and `releasedByAPerson` is what makes the signature outrank the listing, which
  is ADR-0002 refusing to overrule a person in either direction.

  `GET /api/v1/instructions/:id/carta` is the one page a clerk attaches to an email when the supplier
  rings. `evidenceLetter` in `packages/constancia/src/letter.ts` reuses the constancia generator, the
  shared header and the same huella functions, and prints seven signals with the rule that none of them
  may be blank: both SAT lists (article 49 Bis saying why it could not be consulted, because the SAT
  publishes it one oficio at a time in the DOF and ships no file), the account with its participant and
  plaza code and four digits, the payment history behind that account, the CEP with its seal state and
  the holder-name comparison, the verification call, and what the clerk uploaded. Then the level with
  the rule behind it, the state, the resolution with the person who signed it and their written reason,
  every finding in plain Spanish, and the SHA-256 huella. One page is a test and not an intention, and
  no number about the risk reaches it: the expected loss, the delay cost and the transcription
  confidence all stay in the engine, because a figure next to a supplier's name on a document this
  company signs is a precision nobody earned. `verification_call` joined
  `readVerificationEvents` in `packages/db` so the letter can name the call; `foldVerification` ignores
  it, since the state machine turns on the CEP and a call is not a document.

  Beat 8 of `bun run demo` reads it all back: every line carries a level and a state, the two groups
  add up to the lines of the run, and on seed 69 three lines carry three different state rules,
  `released`, `verification_blocked` and `sat_definitive`. It then fetches the letter of the cancelled
  line and checks it is one page and names the article. `docs/05-business-model.md` says what the
  client is sold (two words and never a figure, and the commitment that does not attach to a payment an
  owner reopened), `docs/08-data-model.md` adds the two domain types with no storage and the field note
  on an absent `actor`, and `docs/09-api.md` carries the five keys, the cancellation and three more
  lines a judge can paste.
- The plaza of a CLABE as a signal control 2 can name, and the geography comparison neither document
  can make alone (issue #203). Digits 4 to 6 of an account number are the plaza the branch that
  opened it belongs to, and `detectClabe` already compared those three digits against the three
  digits of the accounts a supplier had actually been paid on. What it could not do was say where
  that is. `packages/core/src/snapshot/plazas-2026-09-13.csv` is the 786-row catalogue that closes
  the gap, `lookupPlaza` and `plazaLabel` in `packages/core/src/plazas.ts` read it, and the finding
  now names both places with both codes: "Cambio la plaza dentro del mismo banco: la cuenta conocida
  esta en la plaza 580 (APODACA, NL) y esta en la plaza 180 (DISTRITO FEDERAL, DF)". The second
  comparison is new. `Cfdi.issuePlace` carries `LugarExpedicion`, the postal code a CFDI was issued
  from and the only geography an invoice has, the parser reads it, `0014_cfdi_issue_place.sql` stores
  it so the deployed API behaves like the in-memory one, and `plaza_off_invoice` fires when the plaza
  of a new account and the state of the invoices it settles disagree. A brand-new account with no
  history raises the level for lack of information and says so in those words:
  `NO_PLAZA_HISTORY` reaches the evidence and `confidenceOf` answers `precaucion` under
  `new_account_without_history`, which is the join a test asserts.

  **The provenance is the part to read before quoting any of this, and `packages/core/src/snapshot/README.md`
  says it in its first paragraph: this is not Banxico's file, because Banxico does not publish one.**
  What is primary is the definition, and Banco de Mexico and the ABM publish the same sentence on
  their own FAQs, three digits and a cheque-service plaza key. The catalogue itself is published by
  neither, and the README carries five repeatable checks that establish the absence rather than
  asserting it: the CEP app exposes an institution endpoint and no plaza one, the Internet Archive
  index holds no Banxico URL containing the word, the single ABM URL that ever existed was already
  answering 404 when it was captured in 2004, Circular 3/2012 and Circular 2019/95 contain no plaza
  table, and the DOF full-text search answers zero notes. The rows come from the plaza table STP
  publishes, the SPEI participant `packages/rail` documents as the production rail, whose help-centre
  article now answers a login page, so the bytes were read from a public copy whose `sha256` the
  README records. That chain buys exactly one permission and the code enforces it: the catalogue puts
  a name on three digits, a code it does not carry yields no name and no signal, it never raises a
  finding and never changes a severity, and every sentence that names a plaza prints the digits
  beside the name so a reader checks the file instead of trusting us. `POSTAL_PREFIX_STATES` is
  bounded the same way, the states the synthetic dataset uses and no more, with the SAT
  `c_CodigoPostal` catalogue named as the national source and the import left as a follow-on, because
  a 32-row national table written from memory would be a claim with no source.

  The seeded dataset moved with it, and the TODO that asked for this is now answered rather than
  deleted. `MTY_PLAZA_CODE` was `180`, and `180` is `DISTRITO FEDERAL`: the comment in
  `packages/seed/src/sentryone/clabe.ts` had been asking since the generator was written for somebody
  to check it before the detector treated a plaza mismatch as evidence, and it was right about the
  cost of being wrong. The Monterrey metropolitan plaza is `580`, Pesqueria has `598` of its own, so
  all 45 known accounts, the company's own account and the 92 run lines were re-minted into the plaza
  of the municipality that banks there, ids and amounts untouched. The hero line is the case this was
  built for: `INS-2026-09-07-047` now pays `012180102091764611` against the `012580100091764611` that
  supplier has been paid on 52 times, two digits apart with a valid check digit as before, except one
  of the two digits is the plaza, so the money would leave Nuevo Leon. `bun run demo` asserts that
  line carries `plaza_changed` with both places named and that the seeded line contradicts the
  `LugarExpedicion` of its own invoices, and a same-plaza account change still raises no plaza signal
  at all, which is the half that keeps the control usable: 91 of the 92 lines are in `580` or `598`
  and exactly one is not. Every peso figure in `docs/10-demo-script.md` is unchanged, because the
  plaza adds a sentence and a chip and never a severity.
- Where the software actually plugs into somebody else's stack, researched with a source and an
  unverified column per surface (issue #205). Six of them in `docs/05`, ranked by what they cost and
  by whether anybody has to agree to anything: the dispersal layout the ERP already exports and the
  treasurer already uploads, which needs no counterparty; the STP rail, which changes what we are
  rather than what we build; connectors to CONTPAQi, Siigo Aspel and SAP Business One; and email or
  WhatsApp forwarding, which is the only one already built. `docs/07` draws the four seams they use,
  all of which this repository already has. `docs/12` answers "no vamos a reemplazar nuestro SAP" in
  thirty seconds and points at both.

- The blind evaluation reads the way a clerk reads the screen (issue #201). Five new labelled cases
  cover the shapes the set could not see: a taxpayer published under article 49 Bis, which has no
  clearing to wait for; a plaza change at the same bank; a brand-new account at the same bank and
  plaza where the only fact is that we have never paid it; a CEP that arrives while the run is open
  and moves the line from precaucion to confiable; and the hard negative that pairs with the plaza
  case. `Metrics` gains `perLevel`, so `GET /api/v1/metrics` and `bun run eval` report precision and
  recall per confidence level as well as per control, and each case carries an `expectedLevel`
  labelled from what the case is rather than derived through the rule table the engine applies. On
  thirty-five cases: precision 87.0, recall 83.3, false positive rate 1.6, action agreement 33 of 35,
  and `confiable` right on 12 of 12. The numbers in docs/11 and docs/12 are that run's.

- The entry screen in `apps/web`, at `#/entrada` (issue #215): who is acting, what this instance was
  configured with, and one line across every screen when the API is not answering. Two things the rest
  of the app assumed were invisible. Every write carries `X-Actor` and the append-only ledger records
  that name, so "who did this" is answerable for every decision and every peso that left, and until
  now the identity was a value in `localStorage` that nothing on screen could show or change. And the
  rail, the six thresholds and the three levels decide what the run does, which a product that hides
  them is asking to be believed about.

  The selector writes `src/lib/actor.ts`, which grew the store the screens subscribe to, so switching
  the person changes the app under your hand rather than after a reload. It is not a login and the
  screen says so where a judge reads it, under the header it prints verbatim: no password, no session,
  no check, the header is caller-controlled, and a deployment that needs real identity puts
  authentication in front of the API, which is `docs/06-regulatory-privacy.md` section 4.4 moved onto
  the screen it is about. The payment run now sends as the person selected, name and role both: a run
  the owner sent used to reach the ledger as `role=clerk`, a signature that did not match whoever gave
  it. The assistant panel reads the same selection instead of the generated clerk, which is what
  decides whether its proposal card asks for a second signature.

  What a person may do is asked of `packages/core` and never answered on the screen. Each row of the
  capability list carries the `DecideRequest` it is about, `decideRequirement` answers it, and
  `entry.test.ts` asserts that each row really produces the rule it names, so the offer on screen and
  the refusal from the API cannot disagree: the clerk sees the two exceptions she may not do, the
  owner sees three he may, and no button is offered that `apps/api` would answer `403` to. The
  settings are read-only and that is the feature, because a threshold that moves from a control no
  longer matches the tests or the documents; each row prints the file and the constant its number came
  from, and the test opens that file and fails when it no longer exports it.

  The offline banner belongs to the shell for the reason the synthetic mark does: it is true of the
  page load and not of a screen. It appears only when the API was asked and did not answer, never
  under `?data=mock`, where nothing was asked and a failure nobody looked for is not a failure. The
  status card's state machine moved into `src/lib/api-status.ts` so the banner and the card read one
  answer and a page load asks `/health` once, instead of a banner reporting a server the card says is
  up.

- The assistant drawer in `apps/web`, which is the front door of the product for the person who uses
  it (issue #211). Lupita drops the screenshot that arrived on WhatsApp, asks why a line is red, and
  presses the button on what the app proposes, without leaving the screen she is on: `AssistantDock`
  mounts beside the shell rather than on a route, so the panel can read the line underneath it and a
  question with no folio in it still has a subject.

  The part worth reviewing is where ADR-0007 stops being a paragraph. `decodeToolCall` in
  `apps/web/src/lib/assistant.ts` refuses any frame whose `tool` is outside the seven reads and any
  frame whose `readOnly` is not the literal `true`, so a tool call that writes cannot be rendered even
  when the bytes come off a socket, and `forbiddenVerdict` drops a token, a proposal summary or a
  stored turn that says "seguro" in either language or states a probability, a percentage or a score,
  which ADR-0009 forbids on any screen of this product. Dropped frames are counted and the panel says
  how many, because an assistant that quietly loses a read is answering from its own memory. The same
  function is run over the panel's own sources by `apps/web/src/lib/assistant.test.ts`: the vocabulary
  rule is about what a component renders and not only about what a model sends.

  Nothing in the drawer executes itself. `ProposalCard` prints the method, the path and the body of
  the ordinary endpoint that would run, and the write happens in a click handler and nowhere else:
  `confirmProposal` calls the endpoint that already existed for that action, sends `X-Actor`, and puts
  the name of whoever pressed the button into `decidedBy` or `recordedBy`, because docs/09-api.md
  refuses a body and a header that disagree about who acted. A release over a finding asks for the
  owner's name and a written reason before the button enables, which is the role rule of
  `docs/02-persona.md` visible on screen rather than only in the API. `execute_run` is the one
  proposal the panel does not run: the payment run leaves from its own screen, which follows its own
  stream line by line, and a second client for the one endpoint that moves money that is not a cent is
  one too many. The level and the state on every card come from `assessConfidence` and
  `transactionStateOf` in `packages/core`, so a line in the drawer reads the same as that line in the
  table.

  `apps/web/src/lib/sse.ts` is the decoder the panel needed and `EventSource` cannot provide, because
  `EventSource` only ever issues a GET and this endpoint streams a reply to a POST. It is a state
  machine over lines rather than a `split` over the body, which is the whole reason it exists: a chunk
  boundary lands wherever the network put it, and a regex over one chunk drops every frame that
  straddles one, which in practice is the long ones, which here are the tool results. `sse.test.ts`
  feeds the same stream one character at a time and asserts the same frames.

  Under `?data=mock` the drawer opens on the three-turn conversation `bun run web:mock` generated out
  of this run's own finding and answers every turn out of the synthetic run with no request and no
  model, which is what makes it demonstrable on a phone in a corridor. What it will not do is pretend:
  a dropped screenshot is answered by saying the extraction runs on the server, and the fields it
  shows are the dataset's own intake example rather than a reading of a file nothing read. Under
  `?data=api` a failure is reported as a failure, and under `auto` it falls back to the synthetic
  answer with the reason printed, exactly like `useResource`. Voice input is the browser's own
  dictation in `es-MX` and this app uploads no audio: the assistant endpoint takes `text` and `images`,
  so a recording would mean inventing a part the contract does not have, and the transcription path in
  `packages/extract` stays where docs/06 section 6.2.1 documents it, on the intake.

- `bun run offline`, the rehearsal for the Wi-Fi dying (issue #71). It runs `doctor` and then the
  whole demo with `fetch` replaced by one that throws on anything that is not loopback, so a call
  that leaves the machine fails with its URL in the message instead of hanging out a socket timeout
  in front of the room. The keys stay in `.env`, because a dead uplink is not a missing key. The
  local Postgres is untouched: it is a socket, not a fetch, and it is the reason the demo works
  offline at all. `docs/10` carries the measured cold-clone path, twenty seconds of machine time
  from `git clone` to seven green beats on a laptop that already has bun and Postgres.

- The contract the assistant, the payment run and the three screens of 12 September are built on
  (issues #195 and #196). `packages/core/src/domain.ts` gains the shapes and nothing it already had
  moved: `Actor` and `ActorRole`, the name and the role every write carries on `X-Actor`;
  `Confidence` and `TransactionState`, the vocabulary of the whole product; `AssistantMessage`,
  `AssistantToolCall`, `AssistantSession` and `ActionProposal`, where the assistant reads and
  proposes and a person executes; `PaymentExecution`, `PaymentExecutionLine`,
  `PaymentExecutionTotals` and `PaymentReceipt`, what the run did on the rail and the document it
  produced; and `Plaza`, the three digits of a CLABE resolved to a place, whose city stays unnamed
  until a dated Banxico snapshot lands because a city invented next to a real account number is the
  claim ADR-0002 forbids outright. The event ledger learns `payment_settled`, `payment_failed`,
  `payment_cancelled`, `assistant_message` and `intake_image`, `payment_sent` grows three optional
  fields (`runId`, `rail`, `actor`) so every writer that predates the execution keeps working, and
  `packages/db/migrations/0012_assistant_and_payment_events.sql` widens the `ledger_events` CHECK to
  the five new kinds the way 0005 and 0010 already did it, dropped by name and recreated, with the
  runner test asserting on a real Postgres that the five are accepted and that a sixth kind the
  domain does not have is still refused.

  The two derivations are the part worth reading. `confidenceOf` and `transactionStateOf` in
  `packages/core/src/levels.ts` are pure, answer with the rule that fired and the findings behind it,
  and are shared by the engine, the API, the screens and the generated mock, because the alternative
  was the four implementations that made issue #125 possible: a level computed in four places is that
  bug with a slower fuse. A definitive SAT listing or any critical finding is `alerta`; an account
  with no payment history, a pending verification or any warning is `precaucion`; nothing open is
  `confiable`, which is not the word "seguro" and never will be, because a SPEI cannot be recalled.
  The state is `enviado` once the rail sent or settled the line and a list published afterwards does
  not un-send it, `cancelado` when the execution dropped it, the beneficiary came back blocked or the
  supplier is definitively listed and nobody signed a release, `rojo` when a decision stopped it or
  the rail refused it, and the two states the run has always counted internally, `liberado` and
  `pendiente`, so a line nobody has looked at is not green and a release on Wednesday is not
  `enviado` until money leaves on Thursday. A release a named person signed with a written reason
  outranks the listing and the engine's own `system` signature does not, which is ADR-0002 refusing
  to overrule a person in either direction. Neither value is stored, for the reason `holdWindow`
  already gave about the deadline it never stores, and every row of both tables has a test.

  `docs/09-api.md` carries the endpoints: `POST /api/v1/assistant/messages` with its five SSE events
  (`token`, `tool_call`, `tool_result`, `proposal`, `done`), `GET /api/v1/assistant/sessions/:id`,
  `POST /api/v1/run/:id/execute` answering `202` with one `line` event per payment,
  `GET /api/v1/run/:id/execution`, `GET /api/v1/payments/:id/receipt` as JSON and as a PDF,
  `GET /api/v1/instructions/:id/carta` for the one-page evidence letter, `GET /api/v1/rails` so a
  screen can say which rail is live without reading an environment file, and `GET /health` with a
  dependency block that still touches no network. Plus the two rules that run across all of them: the
  `X-Actor` header on every write, with `owner` guarding exactly the exception `docs/02-persona.md`
  gives the owner because a maker-checker chain is in the anti-persona column of that page, and the
  level and the state on every instruction and on the run. Three ADRs argue it:
  `docs/adr/0007-assistant-boundary.md`, where `AssistantToolCall.readOnly` is the literal `true` so
  a writing tool cannot be expressed at all, `docs/adr/0008-payment-rails.md`, where the rail may send
  only one line of one instruction for that instruction's own amount, which is what makes the upload
  the payment rather than a policy, and `docs/adr/0009-states-and-levels.md` with the rule table.

  `bun run web:mock` now writes the level and the state per line, the execution of the run, the
  receipts and one assistant session of three turns, all derived and none of it typed: the blocked
  beneficiary is the `cancelled` line and the reason quotes the two names the CEP comparison read, the
  line whose CEP agrees only in part is `queued`, the last line handed to the rail is `sent` because a
  rail acknowledges in its own time, and the other 83 are `settled`. No line is `failed`, because
  nothing in the seeded company produces a rail refusal and inventing a bank error to fill a state
  would be inventing evidence. Every receipt says `sealState: "not_checked"`, which is the honest
  answer on a mirror that is not a SPEI participant, and carries four digits of the account rather
  than eighteen. The assistant session quotes the engine's own `explanation` and its tool result IS
  that finding's evidence object, so nothing in the panel asserts anything the deterministic side did
  not, and the generator refuses to write a sentence carrying a probability or the word "seguro".

- Who did it, on every write and on the ledger, with the two exceptions only the owner may approve
  (issue #199). `X-Actor: role=clerk; name=Lupita Elizondo` is now required by every write endpoint
  and read in one place, `apps/api/src/middleware/actor.ts`; a write without it is `400 bad_request`
  naming the header and showing the form, which is a 400 and not a 403 because nothing about the
  caller was rejected, the request did not say who was acting. The header is mounted per write route
  rather than once over `/api/v1`, so a POST to a path that does not exist still answers `404` rather
  than complaining about a header it would never have needed, and a table-driven test walks every
  documented write path to catch a new endpoint that forgot it. Where a body already names a person,
  `decidedBy` on a decision and `recordedBy` on a hand-recorded call, the two have to be the same
  person and a mismatch is `400` with neither name echoed back, for the reason `rejectInvalid`
  already gives about a CLABE.

  The role guards exactly two shapes and `decideRequirement` in `packages/core/src/actor.ts` is the
  rule, pure and unit-tested, so the screens and the assistant panel can show it before anybody
  presses anything instead of discovering it in a refusal. A release on a line whose `confidence` is
  not `confiable`, or on a line the engine was holding, is the exception `docs/02-persona.md` gives
  the owner; and any decision on a line the run cancelled is the owner's too, because a cancelled line
  is closed and putting it back in front of the run is a second decision about the same pesos. The
  level and not a count of findings, because an `info` finding stops nothing: a supplier who was
  listed and then cleared their name leaves a row that is history, and asking the owner to approve a
  payment nothing stands against is how a control becomes a formality somebody clicks through. A
  clerk asking for either is `403 forbidden` with the sentence that says who can and names the level,
  and nothing is appended; the same request with no `reason` is `422 unprocessable` asking for the
  argument, because an exception approved with no prose is the record ADR-0002 says this ledger must
  never hold. `reason` stays optional everywhere else, since an API that refused an ordinary hold for
  lack of a sentence would be refused by the clerk instead, outside the product, where nothing is
  recorded at all. Whether a line was cancelled is asked of the ledger and not of a status column,
  through one new repository read implemented on both stores, because a stored status can disagree
  with the events it came from.

  The ledger answers "who" without a join. `actor` now travels on `instruction_received`,
  `sat_list_published`, `cep_verified`, `cent_sent` and `verification_call`, joining the four
  variants that already carried one, and `Decision` grows `decidedByRole` next to `decidedBy` so a
  document can tell an approved exception from a clerk exceeding theirs.
  `packages/db/migrations/0013_decision_actor_role.sql` adds the one column that needed DDL, checked
  to the two roles and nullable because the engine signs decisions too and `system` is not a person;
  every other actor rides in the `payload` jsonb the event ledger already stores, so no other table
  moved. Three events deliberately carry nobody: `payment_settled` and `payment_failed` are the rail
  answering rather than a person acting and `cep_awaited` is a wait, each of them follows an event
  that does carry the name, and putting a clerk on them would read as an action she never took.

  The documents print it. The run constancia gains a "Quien resolvio cada instruccion" section with
  the name, the capacity in Spanish and the argument, and calls the engine's own decisions `el motor
  (automatico)` rather than dressing them as a signature; the sweep constancia says who loaded the
  list version, off the `sat_list_published` event, and prints "No se cargo desde esta instancia" for
  the committed official snapshot instead of a name nobody signed. `Decision.decidedByRole` is the
  field the evidence letter of issue #204 reads next to the name.

  `docs/06-regulatory-privacy.md` section 4.4 states in full what this is not: the demo identity
  selector is not authentication, the header is caller-controlled, nothing verifies it, and a `curl`
  can claim to be the owner as easily as the browser can. What the header satisfies is the
  accountability rule of ADR-0002, that every action on somebody's money has a name against it in a
  record nobody can rewrite, and the section lists what production needs instead, from an identity
  provider in front of the API to per-company tenancy, none of which is in this repository. The
  clerk's identity is personal data about an employee and is treated under the obligations of 4.2
  like everything else on that page.

- The supplier profile, which is the expediente the drawer never had room for (issue #213).
  `#/suppliers/:rfc` in `apps/web` answers the four questions a clerk asks about a counterparty before
  a payment leaves, on one screen: the history, every account with its plaza, what the supplier
  invoiced week by week, and where it stands on both SAT lists. It is reachable from the RFC under the
  legal name in the run table and from "Ver expediente del proveedor" on the instruction detail, and
  it works under `?data=api` and `?data=mock`. The drawer is gone rather than kept beside it: two
  renderings of one expediente is the failure of issue 125 with a slower fuse, and a sheet sliding
  over the payment run had space for the invoice table and nothing else.

  The part worth reading is `apps/web/src/lib/supplier-profile.ts`, and the reason it is a module with
  its own tests rather than markup is that four of the sentences on this screen would be wrong in a
  way nobody notices. The weekly series is cut on a Monday 00:00 UTC boundary, because that is what
  `date_trunc('week', at at time zone 'UTC')` in `0007_supplier_outflow.sql` lands on and what
  `time_bucket('7 days', at)` in `0008` counts from its 2000-01-03 origin: a week cut in Monterrey
  would put every bar one day off the row the database holds. A week with no invoice is a filled zero
  rather than an omitted bucket, because silence is the signal in half of these cases and closing the
  gap draws four quiet months as four adjacent bars. A plaza is three digits with a name beside it or
  three digits alone, `lookupPlaza` is the only table consulted, and the panel prints who published
  the catalogue, because `packages/core/src/snapshot/README.md` answers "is this Banxico's file?" with
  "no" in its first paragraph. And both SAT lists always answer, the way `ControlsPanel` always draws
  six bars.

  Where each number comes from is on the screen, and one of those sentences is an admission.
  `supplier_weekly_outflow` is in the database twice and has no endpoint in `docs/09-api.md`, so
  `GET /api/v1/suppliers/:rfc` answers `cfdis` and never `weeks`, and the chart says in as many words
  that the series is grouped in the browser out of the invoices that endpoint did answer. The dashed
  reference line is `baselineRatePerWeek` off the `supplier_behaviour` finding and appears only when
  that detector raised one: with no finding there is no baseline the arithmetic ran, and a threshold
  drawn from the chart's own mean would be this screen inventing one. The consortium is one line read
  off the finding that carries the signal rather than a second call to
  `GET /api/v1/consortium/signal`, so the line is the one the decision was made with, it renders under
  `?data=mock` where nothing reaches the network, and "no consultada" is printed rather than hidden.

  Nothing on it is a verdict about the company. There is no level over the legal name, because
  `confiable`, `precaucion` and `alerta` are about one payment under ADR-0009 and a badge over an RFC
  would be a rating this product has no business issuing. The two SAT rows are worded the same way:
  an absent 69-B row says the RFC is not in the corte this build has loaded and that this is not a
  constancia of anything, and an absent 49 Bis row says the article publishes one resolution and
  provides for no published clearing, so no row is not a desvirtuamiento. The official list stays
  behind a press, so the panel links to `#/sat?rfc=` and asks the SAT nothing on arrival.
- The payments screen, where the run leaves and a person sends it (issue #212). `#/payments` in
  `apps/web` is the last look before the money moves: the lines the run hands to the rail with their
  level and their state, "Enviar corrida" behind a second press and a name, the progress line by line
  as the rail answers, the receipt of every payment that left, the run constancia and the bank layout
  export. The lines the run does not take sit in their own table with the sentence that says why,
  because a payment that disappears quietly is a payment somebody believes they made.

  The part worth reading is `apps/web/src/lib/payments.ts`, which answers two different questions with
  two different fields instead of collapsing them into one. Whether the run TAKES a line is the
  decision, because `POST /api/v1/run/:id/execute` hands the rail every released line and nothing
  else; whether a line the run took will be PAID is `transactionStateOf`, because a released line
  whose beneficiary came back blocked, or whose supplier is definitively listed with nobody's
  signature over it, reads `cancelado` and comes back off the rail as a `cancelled` line carrying a
  reason. Collapsing the two is how a screen either hides a payment that was refused or offers one the
  API was never going to send, and the generated run has one line of each kind, so both cases are on
  screen rather than in a comment. Neither the level nor the state is computed here: `confidenceOf`
  and `transactionStateOf` in `packages/core` answer both, the API's own `confidence` and `state` are
  used when the payload carries them, and the module adds only the Spanish sentence under a state,
  quoting the engine's own `explanation` or the rail's own `reason` rather than composing a second
  account of one event.

  Nothing leaves without a person and the screen is built so that is visible rather than claimed. The
  name of whoever sends the run is a field on the page, it travels on `X-Actor`, the ledger records it
  per line, and the button refuses to work without it. The confirmation press names the count and the
  pesos and says that a SPEI does not come back. `GET /api/v1/rails` is what lets the screen say which
  rail is live without reading an environment file: on the Nessie mirror it states that the sandbox
  registers the outflow, moves no pesos and produces no CEP, which is why the receipt reads "sello no
  verificado", and on STP it says the rail has never run live from this repository. A server with no
  rail repeats the sentence `packages/rail` wrote instead of a paraphrase.

  The layout export is the no-API path a small company actually uses: a CSV in SentryOne's own
  columns, one row per line, and the screen says out loud that every bank publishes its own template
  so the file is adjusted to the portal before it is uploaded. It carries only a line that may be paid
  and that no rail is holding, which are the same two refusals the execute endpoint follows: a file
  with a held payment in it would be the control being bypassed by the export, and a file repeating a
  transfer already on the rail is how a supplier gets paid twice.

  The stream rides `streamSse` and `sse.ts`, which the assistant panel landed for the same reason
  this needed them: `EventSource` issues a bare GET and the execute stream starts with `confirm: true`
  and an actor header. `executeRun` adds only what a frame means, a `line` per payment and a `done`
  carrying the whole `PaymentExecution`, and it never retries, because a retried execute is a second
  request to move money and the endpoint is idempotent per instruction precisely so a person decides
  that rather than a client. The screen also listens on `GET /api/v1/events` and re-reads the
  execution on any `payment_*` event, so a second screen watching the run moves with the first, and
  folding a line is idempotent per instruction so the two channels delivering the same payment cannot
  double it. Under `?data=mock` nothing opens at all: the generated execution is replayed line by line
  in the browser, so the review, the progress, the receipts and the export are demonstrable on a phone
  in a corridor.
- The assistant panel: Gemini with function calling over this API's own reads, and a card a person
  presses (issue #197). `apps/api/src/assistant/` is the whole of it.
  `POST /api/v1/assistant/messages` answers `text/event-stream` with the five events of docs/09,
  `token`, `tool_call`, `tool_result`, `proposal` and `done`, every one of them carrying the session
  id so a minted one reaches the client on the first byte;
  `GET /api/v1/assistant/sessions/:id` replays a conversation, projected from the
  `assistant_message` rows of the ledger on both stores rather than stored a second time. Nine read
  tools, each one a GET through the very handler the web app calls over the wire, so the run the
  panel quotes is byte for byte the run on the screen: the run, one instruction with its evidence,
  the supplier drawer, the verification state, the execution, a receipt, the SAT lookup over both
  lists, the consortium signal and the blind metrics. Five action tools that return an
  `ActionProposal` and nothing else.

  The boundary is where the interesting part is, and every clause of it is a property of the code
  rather than a line in a comment. The only function that issues a request hardcodes `GET`, so a
  writing tool cannot be added by accident. The proposal's payload is built from the contract in
  docs/09 on our side and `decidedBy` is read off the `X-Actor` header, so a model cannot sign a
  decision with somebody else's name. The Spanish sentence on a proposal is checked against a
  forbidden-vocabulary list before it leaves, which is ADR-0009 holding on the one line of copy a
  model is nearest to writing: three levels, never a probability, never "seguro". Accounts leave as
  four digits because `mask.ts` rewrites the whole payload on the way out, and the test asserts over
  a serialised request body that no eighteen-digit run survives. The turn appends two
  `assistant_message` events and never a `decision_made`, a `cent_sent` or a `payment_sent`.

  Intake by chat: a screenshot goes to `packages/extract` for transcription only, the supplier is
  attributed deterministically by matching the account against the ones this company has paid and
  then the payee against the legal names in the run with `nameMatch`, and the instruction is created
  through the ordinary `POST /api/v1/instructions` with the image on it, so `imageRef`,
  `ocrConfidence` and the `ocrChannel` evidence of the CLABE control are the pipeline's own and the
  six controls that run are the six controls. When the attribution does not answer, nothing is
  created and the turn ends with an `intake` proposal for a person to complete. `intake_image`
  carries the reference, the actor and the instruction it became, never the bytes.

  `bun run eval:assistant` is twenty golden questions with the read each one has to reach for. Live
  against `gemini-3.6-flash` on 2026-09-13 it routed 20 of 20 and offered the action that was asked
  for 5 of 5, for MXN 3.54, and the same twenty run offline against a recorded plan in `bun test`
  with no key and no network. `docs/06-regulatory-privacy.md` section 6.4 is the transfer paragraph
  and the measured cost, with the token prices and the Banxico FIX stamped with their dates in
  `apps/api/src/assistant/cost.ts`, and every turn writes its own tokens and pesos onto the ledger
  event so the cost question is answered by summing rows. ADR-0007 gains what the build settled and
  docs/09 gains the stream, the nine tools and `AssistantUsage`. `X-Actor` parsing lands in
  `apps/api/src/actor.ts` for every write that follows.

- The answers to the six things three Capital One judges said at the table on 2026-09-12, and the
  behaviour that makes four of them true rather than asserted (issue #171). A held payment now
  carries a deadline and a way out: `holdWindow` in `packages/core/src/hold.ts` reads the same
  `EXPECTED_DELAY_DAYS` table `decide` weighed the expected loss against, so the delay the arithmetic
  charged for and the deadline a clerk is promised are one number and cannot drift, three days for a
  hold and one for a verification, measured from the decision's own instant. The deadline decides
  nothing when it passes, which is binding under ADR-0002: `expired` turns true, the payment goes
  back in front of a person, and what the deadline actually buys is a bound on the retry loop. The
  window carries ordered `nextSteps`, and the one worth saying out loud is `one_cent_cep`, because it
  needs nobody to answer a telephone; after a `denied` the only step offered is `keep_held`, since
  suggesting a release next to the supplier's own denial would be the product arguing against its own
  finding. `GET /api/v1/instructions/:id` answers it, and so does a recorded
  `POST /api/v1/instructions/:id/verify-call`, which is how "nadie contesto" and "y ahora que" arrive
  in the same response. `POST /api/v1/instructions/:id/decide` takes a `reason` next to the required
  `decidedBy` and answers the `amountAtRisk` it was decided against: an urgent payment can be released
  under a named person's responsibility with a written argument, and both land on the `decision_made`
  ledger event and on `decisions.reason` (`packages/db/migrations/0011_decision_reason.sql`), because a
  hold with no way out is bypassed outside the product where nothing is recorded at all. And the run
  answers in pesos rather than in line counts: `runMoney` in `packages/core/src/exposure.ts` puts
  `heldAmount`, `toVerifyAmount`, `releasedAmount`, `stoppedAmount`, `amountAtRisk`,
  `retroactive69bBase` and `retroactive69bExposure` on the `totals` of `GET /api/v1/run/current`, with
  the 69-B pair counted once per supplier because the sweep prices it per supplier and one supplier can
  sit on three payments in one week. `docs/09-api.md` and `docs/08-data-model.md` carry the contract
  and the column. The same pass corrects a number the pitch said out loud: the listed-supplier
  scenario summed its deducted base over the settled invoices and then reported the supplier's whole
  invoice count next to it, so `docs/11-pitch.md` and `docs/08-data-model.md` said 31 invoices while
  `docs/07-architecture.md` and `bun run demo` said 24 paid ones for the same MXN 878,592.59. The
  note in `packages/seed/src/sentryone/scenarios.ts` now counts the set the base was summed over, and
  the two docs say 24 of 31.

- The newest 69-B sweep folded into the run totals, so the retroactive exposure climbs while the list
  publishes instead of reading zero next to it (issue #175). `POST /api/v1/sat/publish` used to price
  the whole ledger and stop there, which left `totals.retroactive69bBase` and
  `totals.retroactive69bExposure` on `GET /api/v1/run/current` at zero in the same minute
  `SweepResult.totalExposure` answered MXN 404,152.59: two figures that are both correct and look
  contradictory next to each other, which is exactly what a judge picks at. Now the same request
  re-scores the pending lines of the current run whose supplier the publication names, through
  `rescoreSweptLines` in `apps/api/src/pipeline.ts`: the six controls run again with the sweep on
  `ComposeInput.sweep`, so the `sat_69b` finding carries `deductedBase` and `retroactiveExposure`, the
  findings are stored, `decide` reaches the action again and a `decision_made` signed `system` is
  appended per line, after the `sat_list_published` and never before it, so a replay can never show a
  payment re-decided by a list that had not been posted. Those events go out on `GET /api/v1/events`,
  which is what makes the run screen move while the publication lands. A released line and a line a
  person decided are never touched, because that is money the run already let go and a decision with
  somebody's name on it; a decision the engine signed `system` is re-scorable, since a second
  publication is new evidence. The response gains `rescored`, one row per line moved, and it carries no
  pesos of its own on purpose: the exposure is priced per supplier, one supplier can sit on several
  lines of the same week, and `runMoney` keys the pair on the RFC so it is counted once. Read off a
  fresh run at seed 69, the seeded run goes from zero on both fields to MXN 878,592.59 of base and MXN
  404,152.59 of exposure, `amountAtRisk` climbs by exactly that exposure from MXN 799,209.86 to MXN
  1,203,362.45, and one line moves: `INS-2026-09-07-070` from `verify` to `hold`. The alternative, a
  read-time join of the newest sweep onto the run, was rejected in the ADR-0002 amendment of
  2026-09-12, because two sources of one number is what `packages/core/src/exposure.ts` exists to
  prevent. `docs/09-api.md` carries the contract under "What a publication re-scores", `bun run demo`
  beat 3 asserts the identity between the two figures rather than the direction of the change, and the
  Postgres half of it is checked against `MemoryRepository` on the same publication.

- The design system the three screens of 12 September are built on: the tokens of ADR-0009 and the
  base components (issue #207). `apps/web/src/design/tokens.css` gains the level and the state as
  named colours. The level aliases the three decision triplets, because a level and an action are two
  readings of one body of evidence and a fourth hue on the same row would mean nothing pulls the eye;
  the state does not, because a state is a fact about money and not a verdict, so `enviado` is the
  informational tone and not green (a green chip would say the payment was fine, which nobody can say
  about a transfer that cannot be recalled and that a list published on Friday can still poison),
  `cancelado` is neutral and firm rather than red, and `pendiente` fills with the surface it sits on
  and carries a dashed border, so the chip is its outline and its word. An alias needs no entry in the
  dark block, because a custom property resolves where it is used, and `tokens.test.ts` learned that
  rule plus the other half of it, that the target exists. `LevelChip` and `StateChip` carry a three
  step meter and a dot beside their word: never a number, never a percentage, and never "seguro", which
  the new `apps/web/src/lib/labels.test.ts` enforces over the whole copy dictionary and then over every
  source file in `src/`. The meter is an ordinal over the same three words and is not a score, which is
  written down where it is drawn, because roughly one man in twelve cannot separate the red from the
  amber and colour may not be the only channel.

  The base set is `Button`, `LevelChip`, `StateChip`, `DataTable`, `Drawer`, `Toast` and the three
  blocks of `States.tsx`, so the assistant panel and the payment screen build on one vocabulary rather
  than three. Two of them close real gaps: `Drawer` traps Tab and gives focus back, which was
  `TODO(FabriBanda)` in `apps/web/README.md` and meant focus used to walk out of the supplier drawer
  into the run behind the scrim, where the ring was invisible and the next Enter pressed a button
  nobody could see; and `Toast` is the confirmation the run screen carried as a `TODO`, one live region
  mounted by the shell, where a confirmation clears itself after six seconds and a refusal has no timer
  at all, because the line that says why a payment was rejected is the one a clerk has to read. No
  screen was restyled: the adoption pass replaces inline `style={{ color: "var(--c-hold-ink)" }}` and
  interpolated borders with classes, since an inline style cannot be overridden and hides the token
  from anyone reading the stylesheet. `#/design` renders every token and every base component on one
  page, reading the values back with `getComputedStyle` so the sheet cannot drift from the file it
  documents; it is a reference and not a screen, so it is not in the navigation.

  The measured pass is where the work is checked, and getting a true one meant fixing the audit
  itself. `apps/web/audit/audit.ts` navigated to paths with no `#`, and this app is a hash router that
  rewrites an empty hash to the payment run on the first paint, so every row of the report was the run
  screen under another screen's name: all seven answered with the same focusable count to the digit.
  It also measured `position: fixed` boxes against the layout viewport, while under device emulation
  they are laid out against `window.innerWidth`, which reported the toast region as a 719 px overflow
  at a 390 px width that does not exist on a phone. With both fixed, the seven routes are clean at 390,
  768, 1440 and 1920, every control is named and shows a ring under a real Tab press, and all 52 colour
  pairings clear their floor in both themes. One token moved to get there: `--c-state-cancelado` measured
  2.99 against the sunken fill its chip has, under the floor of 3 for the boundary of a non-text
  element, so it is `--c-ink-subtle` rather than `--c-border-strong`, which is tuned against a panel.
  The audit now takes `AUDIT_PORT` from the environment, next to the `SHOOT_PORT` the payments
  front added to `brand/shoot.ts` for the same reason on the same night, because two Chromes
  launched with one `--user-data-dir` are one Chrome and the second caller drives the first
  caller's page: a capture of the token sheet came back holding another branch's not-found page,
  in the wrong theme, under our file name. `docs/design.md` carries all of it.

- `docs/print/team-card.html`, one A4 page in Spanish for the four of us and not for a judge: the
  problem in two sentences, the user in one, the five competitors `docs/04-market.md` names with one
  line each, the business model in three sentences, and the six objections of 2026-09-12 with the
  answer to say out loud. It uses `docs/print/print.css` and the visual system of `judge-card.html`,
  and `docs/print/README.md` states the rule that governs it: no number reaches that card that is not
  already in `docs/04`, `docs/05` or `docs/11`.

- The other SAT list, article 49 Bis, covered next to 69-B and reported honestly (issue #180).
  Article 49 Bis of the CFF was added by the decree of DOF 07-11-2025 and is in force since 1 January
  2026: after an express home visit capped at twenty-four business days, the SAT publishes the taxpayer
  whose CFDI it determined false, and the third parties who received those CFDI have **thirty natural
  days from the DOF publication** to reverse the fiscal effect or the authority restricts THEIR OWN
  certificado de sello digital under article 17-H Bis fraccion XIV, with article 113 Bis now covering
  whoever gives `efectos fiscales` to a false CFDI. `packages/sat/src/art49bis.ts` is the second list:
  a loader over the published `Anexo 1` layout resolved by column name, the thirty day window
  (`correctionDeadline` counts the publication day as day one, stated as the reading that errs early
  because being a day late costs the seal), an index, and `sweep49Bis`, which prices the already paid
  and already deducted CFDIs through the same `priceCfdis` and the same ledger fold as the 69-B sweep
  so the two can never answer different numbers, plus the correction deadline the pesos alone do not
  carry. `Sat49BisEntry` is its own domain type and not a fifth `SatListStatus`, because fraccion X
  publishes one outcome and provides for no published clearing, so nothing may report a 49 Bis taxpayer
  as cleared. `packages/engine/src/sat49bis.ts` gives control 1 a second finding, in Spanish, naming
  the article, the DOF date, the days left and the seal restriction, always `comprobable` because the
  published resolution is already final; the detector id stays `sat_69b`, which is control 1 and is
  persisted, CHECK-constrained and counted per detector, so ADR-0002 still has six controls.
  `GET /api/v1/sat/lookup` now answers `lists`, one block per article with an `answered` flag on each.
  **And the honest half.** There is no machine-readable 49 Bis listing, so none is committed: the SAT
  open-data catalogue carries articles 69, 69-B and 69-B Bis and nothing for 49 Bis, and the DOF
  publishes it one oficio at a time as an HTML note, fourteen of them naming fourteen taxpayers between
  10 July and 28 August 2026, counted at the source on 2026-09-12. So the lookup answers that list with
  `answered: false` and `coverage: "not_published_machine_readable"` plus the counts and the URL to
  check them, the fixture that exercises the loader is six invented rows whose first line says in
  Spanish that it is not the SAT's file, and `packages/sat/src/snapshot/README.md` carries the statute
  with its retrieval time, all fourteen note ids, the seven published columns, the two date formats
  those fourteen oficios use, and the manual steps to load a new publication. Article 69-B Bis is
  decided the other way and closed rather than deferred: its listing does exist as open data, three
  taxpayers at a 5 June 2026 cut-off, and it is deliberately not wired into supplier screening because
  it is about the improper transfer of tax losses and says nothing about a supplier's invoice. The
  TODOs this replaces are gone from `docs/04-market.md`, `docs/06-regulatory-privacy.md` and
  `docs/14-process.md`, and `docs/01`, `docs/08` and `docs/09` carry the coverage statement.

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
  with a warehouse.
  **Verified against the real warehouse on 2026-09-12, and the verification found one bug.**
  `consortium:seed` created `SENTRYONE.CONSORTIUM` and loaded 2,040 synthetic events, `consortium:push`
  added 2,446 of this tenant's own hashed outcomes, and `consortium:pull` landed 46 hashed pairs, 45
  corroborated and 1 with a fraud report, into the managed Postgres. The first live pull skipped all 46
  rows: the SQL REST API returns a DATE as the number of days since the epoch in a string, not as
  `YYYY-MM-DD`, so the pull wrote an EMPTY snapshot with `source = 'snowflake'`, which a screen would
  have read as a network that has never seen any of these accounts. `networkSelect` now formats both
  dates with `to_varchar(..., 'YYYY-MM-DD')` and `readNetworkRows` also decodes the epoch-day form, each
  with a test. `bun run doctor` prints the `snowflake` line green with the pair count and the
  `pulled_at` it wrote.
  **`bun run demo` has a sixth beat for it.** It fills a local snapshot from the generator with no
  Snowflake account, then posts two lines of the seeded run through intake: one the network corroborates
  is released carrying `pagada por 34 empresas desde sep 2025` in its evidence, one the network has no
  row for is held at 537,960.97 MXN carrying `sin registro de esta cuenta, 1 otra cuenta del proveedor`,
  and the same two lines against an instance with the flag off, and against one with the flag on and an
  empty snapshot, come back with the identical action and the identical expected loss, which is claim 2
  of `packages/core/src/network.ts` asserted rather than argued.

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

- What a client gets when the product is wrong, on both sides of the error, and the law that decides
  how any of it may be written (issue #194). A second Capital One panel asked on the evening of
  2026-09-12 whether the subscription should include an insurance policy covering losses up to an
  amount per tier, phrased as "you mark a payment as safe and it turns out to be fraud".
  `docs/05-business-model.md` gains "When a released payment is fraud: what the client gets", four
  layers at four stages of maturity, and the premise is corrected before anything is promised: `Action`
  in `packages/core/src/domain.ts` is `hold`, `verify` or `release` and there is no fourth value
  meaning safe. Layer 1 exists today and is evidence rather than safety: the six controls and their
  findings from `runControls`, the CEP holder name when it was obtained with `not_checked` never
  dressed up as a pass, and the append-only `LedgerEvent`, which together are the file a client takes
  to its bank, to an insurer or to the SAT inside the thirty-day window article 69-B opens. Layer 2 is
  the commitment we can fund ourselves and it is labelled a proposal: four weeks of shadow mode at no
  charge, a service credit, and a make-whole capped at the lower of twelve months of the tier and the
  fees actually paid, MXN 10,788 direct and MXN 2,340 per client company through a firm, funded by
  reserving 10 percent of collected subscription revenue. That reserve costs ten points of gross
  margin, accrues one full cap per ten paying companies per year, and therefore stays solvent only
  while qualifying events run at or below 10 percent of accounts a year, which is why the contract has
  to cap the make-whole by the reserve balance as well as per company. It attaches only when all six
  controls ran, the seal was `valid` and `nameMatch` was `match`, and the release was signed
  `SYSTEM_DECIDER`, never after a person's override, so today almost nothing would qualify:
  `beneficiary_cep` reads 0.0 percent in the blind evaluation and the seal reads `not_checked` until
  the real Banxico certificate lands. Layer 3 is the insurance layer, which only an authorised insurer
  may write and where our asset is the underwriting input nobody else brings. Layer 4 answers the error
  the panel did not ask about and a payables desk meets every week, a legitimate payment held: the
  delay is bounded by `HOLD_WINDOW_DAYS` in `packages/core/src/hold.ts`, which is the same
  `EXPECTED_DELAY_DAYS` the expected loss was weighed against, three days for a hold and one for a
  verification, the owner ends it whenever they want under their own name and written reason through
  `POST /api/v1/instructions/:id/decide`, and the day already carries a price per supplier,
  `Supplier.delayCostPerDay` from `packages/seed/src/sentryone/delay-cost.ts`, MXN 101.98 to MXN
  4,611.27 across the 44 suppliers with a median of MXN 353.13. The proposed remedy is a service credit
  against the next invoice at that price, capped at one month of the tier per event and two months per
  rolling twelve months, MXN 1,798 direct and MXN 390 through a firm, leaving 66 percent gross margin
  direct and 41 percent through a firm in the worst case where every account claims the whole cap every
  year. What makes that layer worth reading is the arithmetic that rules out the obvious version of it:
  6 of 92 lines stopped on the seeded run, 3 of the 20 findings the blind evaluation raised were false,
  so about 78 days of wrong delay a year, MXN 27,500 at the median supplier price and MXN 53,800 at the
  mean, against MXN 10,788 of annual subscription. Paying the full priced delay is two and a half to
  five times the price, so it is not a commitment, it is an arithmetic error, and the cap is stated
  with what it does not reach: on the most expensive line of the run it pays 8.8 percent of a three-day
  hold. `docs/06-regulatory-privacy.md` gains section 2.2 with the law behind all four layers, read in
  the texto vigente of the Ley de Instituciones de Seguros y de Fianzas on 2026-09-12. Article 20
  reserves any operación activa de seguros to authorised Instituciones and Sociedades Mutualistas and
  defines one as obliging oneself, against the payment of a sum of money, to repair a damage or pay a
  sum of money should a future and uncertain event occur, which is what a payout on fraud would be;
  article 24 makes a contract concluded against it produce no legal effect at all; article 495,
  fracción I attaches three to fifteen years of prison and a fine; articles 91 and 93 reserve
  intermediation to authorised agentes de seguros; and article 102 is the one lawful channel, a
  contrato de adhesión contracted through a persona moral whose service contract is registered with the
  Comisión in advance and which is then subject to its inspection. That is why every commitment here is
  a price remedy against our own fees rather than an indemnity, why the delay credit is applied against
  the next invoice, and why no proof of loss is asked: paying against evidence of a lost sale would be
  resarcir un daño, the verb article 20 uses. Ten more sources, all opened 2026-09-12, are quoted
  rather than characterised: Trustpair indemnifies with no amount, condition or exclusion on the page
  and sells to the largest corporations in the world, nsKnox publishes only website terms that cap
  liability at what the user paid it, Eftsure answered a redirect loop so nothing is attributed to it,
  Verificamex takes "el más amplio deslinde de responsabilidad que en derecho proceda", and of the
  three Mexican policies we opened the closest wording, BBVA's `Fraude Digital` for PyME, excludes our
  loss twice, because our transfer is authorised by the client's own clerk from the bank's own portal.
  `docs/12-judge-qa.md` gains subsection 8 of "Second table of 12 September" with the thirty-second
  spoken answer and the five gaps to volunteer, and the ten sources this work opened are numbered 57 to
  66, continuing the sequence `docs/04-market.md` and `docs/05-business-model.md` share. Nothing here has been reviewed by counsel and the article 20 consultation
  the statute provides for has not been filed, so the caps and the word guarantee stay out of any
  contract, price list and screen until both have happened.

- The rest of the guarantee menu, eight options with a precedent and a weakness each, and the three we
  would defend on stage (issue #194, second pass). The team asked for more alternatives than the four
  layers above, stronger and better defended, so `docs/05-business-model.md` gains "The options, and the
  one we would defend" inside the same section, written as a menu a judge can push on: every option
  carries what it costs us, what it needs legally, the precedent with somebody else's document behind it,
  and the honest weakness, in that order. (a) Guarantee by evidence depth rather than by price, so cover
  attaches to payments that carried the full chain and the gate is the incentive to use the controls;
  the precedent is Eftsure, which indemnifies only where its own engine matched the account to the
  vendor's name and gave the payment a "green thumb" of approval, and the contrast is Ramp, which uses
  the same audit log to place the loss on the customer. (b) A parametric trigger, with the finding that
  kills the naive version: the FSI and IAIS paper defines the index as an objective measure "reported by
  an independent third party (neither the insured nor insurer)", so our own append-only ledger cannot be
  the index and the Banxico-signed CEP can, which makes the defensible design a two-part trigger, a CEP
  holder mismatch as the index and the ledger as the audit record, with basis risk named out loud as the
  known limitation. (c) The reserve, sized, and this is the arithmetic the earlier pass asserted instead
  of showing: the per-event cap is exactly ten times what one company accrues to the reserve in a year,
  because one is twelve months of fees and the other is a tenth of twelve months of fees, so the
  break-even claim rate is 10.0 events per 100 companies a year at every tier and therefore at every
  mix, against the 5.22 fraud events per 100 economic units INEGI publishes, 1.92 times of headroom,
  with the whole table at 300, 1,000 and 3,000 companies pricing every ENVE event as if it qualified.
  The same option names where it breaks, which is severity and not frequency: the direct cap is 4.61
  times the channel cap, so in an adverse mix the break-even falls to 3.74 per 100, below the published
  incidence, an overrun of MXN 48,052 at 300 companies and MXN 480,521 at 3,000, and three unexpected
  direct events empty a 300-company reserve against twenty-nine at 3,000, which is why the tail matters
  in year one and not in year three. It also refuses the word reinsurance, because reinsurance is cover
  an insurer buys and we are not one. (d) The insurance layer done right, with the product class named,
  funds transfer fraud and social engineering, and the pitch that writes itself: in Abraham Linc Corp.
  v. Spinnaker Ins. Co. a claim went to discovery over whether the insured had followed an "established
  and documented verification procedure" and it had "no documented procedure or protocol", only an
  "unwritten protocol" of email, so we do not compete with the endorsement, we are the condition
  precedent that makes it payable, and we hand the client the sublimit problem in writing, USD 100,000
  against a USD 2,000,000 endorsement on a real policy and a published market range of USD 25,000 to
  USD 250,000. Travelers' own coverage highlights admit the control the market demands is spoofable,
  that a fraudster can amend the phone number in the email panel so the callback reaches them, which is
  the setup for the one-centavo CEP probe, since the attacker does not hold Banxico's signing key. The
  same option corrects how this route had been described internally: under article 102 LISF we are
  **not** a licensed promoter, because that article is precisely the route that needs no agente de
  seguros licence, and it comes with a services contract registered with the CNSF beforehand, CNSF
  inspection of those operations, and article 104 making the insurer liable for our conduct in the
  channel, which is a reason an insurer may refuse it. (e) The bank-embedded route, where the precedent
  is a mandate rather than a product: the United Kingdom has required capped reimbursement for
  authorised push payment fraud since 7 October 2024, split 50/50 between sending and receiving firm,
  two exceptions only, five business days, GBP 100 maximum excess, no minimum claim, a 13-month window
  and a GBP 85,000 cap, covering microenterprises and charities as well as individuals, and the
  published returns are 88 percent of in-scope money lost reimbursed over eighteen months with 3 percent
  of claims rejected for the customer not taking enough care. The moral hazard objection is answered with
  a regulator's independent evaluation rather than intuition: APP fraud losses fell by about GBP 73
  million a year with nearly 35,000 fewer scams, a short-term net benefit of GBP 17 million to GBP 29
  million the evaluators call conservative, and "no evidence of market exits or reckless consumer
  behaviour". The honest caveat rides in the same breath, that the regime's microenterprise is fewer than
  ten employees and EUR 2 million so our 11 to 250 person persona sits outside its scope, and that Mexico
  has no equivalent duty at all. (f) Claim assistance, which promises effort and evidence and never
  recovery, and it rests on a finding that makes it urgent: Condusef's electronic channel is closed to
  exactly this loss by its own published rules, because it cannot take a complaint involving more than
  one financial institution or one where no contractual relationship with the institution is shown, so a
  company discovers on the worst day that it needs an in-person appointment and, as a persona moral, a
  notarial instrument, with the LPDUSF's procedural deadlines behind it and no deadline to pay anything.
  The packet is the `carta`, the two constancias and the CEP, the window is short because the first 48
  hours often decide whether stolen funds come back, and the baseline is stated rather than improved on
  paper: one peso in four comes back today and we have no measurement of what a better file changes
  about that. (g) Priority verification for the opposite error, the cent and the call attempted first
  inside a published window for a line the owner marks urgent, with the month credited when we miss,
  on top of the bound and the named release that already exist, and the weakness volunteered, that no
  urgent field exists in the domain today, the queue behind it is a founder and not a rota, and no SLA
  makes a supplier answer the telephone. (h) The legal floor, liability capped at the fees paid in the
  preceding twelve months with the person's decision as the last act, which is above the Mexican
  market's own floor rather than a retreat from it, and where the one thing nobody read is routed rather
  than guessed: what a Mexican court would look at when asked to enforce or set aside such a cap in a
  business-to-business contract of adhesion is not answered anywhere in this repository. The closing
  ranking is explicit: (a), (b), (c) and (g) today with (f) shipping alongside and (h) underneath, (d)
  as the partnership within twelve months of paying customers, (e) as the bank route we ask for and have
  not got, and (d) named as the strongest option while (c) is the one we can do this week. Seventeen
  sources, 75 to 91, all opened 2026-09-12 in the evening, and two of them correct earlier entries in
  the same list rather than arguing with them: Eftsure's guarantee page opened after the afternoon's
  redirect loop turned out to be a region cookie, so [60]'s sentence that nothing could be attributed to
  Eftsure is superseded by [79] and the comparables table now reads that one vendor does publish a capped
  indemnity; and Howden México is the first Mexican page found that offers cover for this loss, a broker
  and not an insurer, saying in its own words that many policies will not cover it "porque el pago se ha
  realizado legítimamente: a ojos del banco, es real". `docs/12-judge-qa.md` subsection 8 is rewritten
  around it: a thirty-second spoken answer naming the three things that pay today and the precedent, two
  follow-on blocks for the opposite error and for the reserve arithmetic, thirteen rows of what may be
  said with the source against each, and a "do not say" list whose first two entries are the two things
  the team had been saying loosely, that we would be a licensed promoter of insurance and that we would
  reinsure the tail. Neither is true and both are corrected here rather than on stage. Nothing in the
  menu has been reviewed by counsel, the article 20 consultation is still unfiled, and two of the eight
  options end in a routed question instead of an answer. One consequence of merging #201 into this branch
  is restated rather than left stale, because it lands inside this same section: the blind evaluation grew
  from thirty labelled cases to thirty-five, so the false-finding share is 3 of the 23 findings it raised
  and not 3 of 20, 13.0 percent and not 15, which moves the layer 4 projection to about 41 wrongly
  stopped payments a year, about 68 days of wrong delay, MXN 24,000 at the median supplier price and MXN
  46,900 at the mean, 2.2 to 4.3 times the annual subscription rather than two and a half to five, and
  MXN 44 per event rather than MXN 38 for a company wrongly stopped every time. The credibility bullet
  now carries the run's own figures, 87.0 percent precision, 83.3 percent recall, 1.6 percent false
  positives and 33 of 35 on action agreement, and points at the level matrix that arrived with it,
  because `confiable` right on twelve of twelve is the row a guarantee actually rides on.

- **The deployment answers for itself: `/health` per dependency, a request id on every log line, a token
  bucket on every write** (issue #200). Until this landed, the question "is the deployed API serving the
  ledger you seeded" took an ssh and a guess, and the request id that was already on every response was
  only findable in a log for the requests that had already failed.

  `GET /health` keeps `ok`, `service` and `version` and grows `dependencies`, seven ordered rows:
  `database`, `nessie`, `rail`, `consortium`, `cep`, `extraction` and `voice`, each
  `{ name, configured, state, detail, checkedAt }` with `state` one of `up`, `down` and
  `not_configured`. Every sentence comes from `dependencyReport` in `apps/api/src/dependencies.ts` and
  `bun run doctor` prints the same rows as `dep <name>` out of the same function, so the laptop and the
  box cannot answer differently about why a screen is empty. Three rules are in the code rather than in
  a promise, and each has a test. It reaches no third party: exactly two things are probed, a `select 1`
  bounded at 2000 ms and building the payment rail, and the five configuration rows say "Not probed from
  here" in those words rather than implying a check nobody ran. No secret is in the payload: `configured`
  is a boolean, every detail names variables and never values, and a suite of fake keys goes in and is
  asserted absent from the rendered JSON. And a failed probe is classified into one of five sentences, so
  a driver message never reaches the wire and the raw one is logged against the request id instead.
  `ok` stays `true` with every dependency down, because a load balancer that restarts the container when
  the ledger is slow takes the demo down for a reason that has nothing to do with the demo.

  Every request now writes one line, `[<id>] <method> <path> <status> <ms>ms`, with the sink injected
  through `ApiDeps.log` so the suite asserts the shape and `bun run demo` prints its own beat sheet
  instead of a thousand request lines. The query string is deliberately dropped:
  `GET /api/v1/sat/lookup?rfc=` is the one endpoint in this API that reads real data and it takes a real
  taxpayer's RFC in the query, so a logged URL would be the one thing `docs/06-regulatory-privacy.md`
  forbids, pasted into an issue. Path parameters stay, because those are synthetic ids of our own company.

  The rate limit is now a token bucket and it covers every write, 120 a minute per client, mounted once
  on the `/api/v1` tree and skipping `GET`, `HEAD` and `OPTIONS`, so a write endpoint added next week is
  covered without anybody remembering to cover it and a screen reading the run is never charged for it.
  The lookup box keeps 30 and an assistant turn keeps 20, tighter because a turn costs tokens. The bucket
  replaces the fixed window for the reason a window cannot fix: a client that exhausts it gets the whole
  allowance back at an edge and can burst twice the limit across it, while a bucket refills continuously,
  so the clerk confirming eight lines in a row is never refused, a loop is throttled to the refill rate,
  and `Retry-After` becomes the seconds until one token exists rather than the seconds until an invisible
  window rolls over.

  `vercel.json` gains `cache-control: no-store` on `/api/(.*)` and `/health`, and
  `scripts/vercel-rewrites.test.ts` is the guard that matters: it reads the route tree off the app and
  the rewrite sources off `vercel.json` and fails when the API serves a path the web origin cannot
  reach. The bundle ships with no base URL, so that failure is a 404 on the deployed product and a green
  test suite, which is the most expensive shape a bug can have on a judging day. `docs/07-architecture.md`
  carries the final topology and how the box was moved onto this code, and `--smoke-only` on the deploy
  script now prints the live dependency rows next to the run totals.

  **And the redeploy found something worse than anything the new endpoint reports.** `apps/api/Dockerfile`
  copies the workspace manifests one by one before `bun install --frozen-lockfile`, and `packages/rail`
  and `packages/consortium` arrived with issues #164 and #198 without being added to that list. So the
  image could not be built from this tree at all: `bun install` inside it answered
  "Workspace dependency @hackmty/rail not found" and the build stopped there. The instance went on
  serving the container from before either package existed, which means the deployed API had no payment
  run and no consortium endpoint while the repository had both, and nothing in `bun test`,
  `bun run typecheck` or `bun run build` could have said so because none of them reads a Dockerfile. The
  two lines are added and `scripts/docker-image.test.ts` is the guard, reading the workspace directories
  off disk rather than trusting the list, so a package added next week fails on a pull request instead of
  on the one deploy that matters.

  **Then the request id paid for itself inside a minute.** With the new image running, `/health` said
  `database: up` and the first assistant turn over HTTPS still came back as the failure sentence. One grep
  for the id the caller sent found the line and then the cause: `ledger_events_type_check` refused
  `assistant_message`, because migrations `0010` through `0014` had never been applied to Tiger Data. The
  deployed ledger was five behind, which means the payment run of ADR-0008 could not have been executed
  against it either, since `payment_sent` and `payment_cancelled` would have been refused the same way.
  `bun run migrate` applied the five and `bun run doctor` reports 14 of 14. The third finding was
  `consortium: not_configured` on the live `/health`: `ALLOW_CONSORTIUM` had never been forwarded to the
  instance, so the cross-tenant signal of #164 was off in production while the snapshot sat filled in the
  warehouse. `FORWARDED_ENV` now carries it and `NESSIE_BASE_URL`, which `docs/07` had been claiming all
  along, and the box the judges will use keeps the configuration it was provisioned with, because a
  refresh rebuilds code and does not rewrite `/srv/sentryone/.env`. The verified state, every line of it
  through the Vercel rewrite, is the table in `docs/07-architecture.md`.

### Changed

- **The verification call confirms the account change and the last four digits, and the agent the
  provider stores carries neither** (issue #206). The call used to ask one question, whether the
  account is theirs, which somebody who opened that account yesterday can answer yes to. It now asks
  about the change when there is a change: "una cuenta que no es la que le hemos pagado antes, y que
  termina en 4 6 1 1. Solo necesito que me confirme si ustedes cambiaron su cuenta y si esa cuenta es
  de ustedes. Si o no?". Still one yes or no, because a call that asks two questions gets an answer to
  one of them, and still nothing a supplier has to look up. Whether it is a change is derived and not
  typed: `scriptForInstruction` compares the instruction's account against `supplier.knownAccounts` on
  digits, and no history answers "not a change" rather than "a change", because a brand-new supplier
  has changed nothing. The four outcome types are untouched.

  The second half is where the account numbers went. `VERIFICATION_TEMPLATE` is the prompt with
  `{{company}}`, `{{supplier}}`, `{{supplier_sentence}}`, `{{question}}` and `{{account_last4}}` where
  the instruction's words go, and it is what `bun run voice-setup` uploads: the agent at ElevenLabs now
  holds the five rules and no supplier, no amount and no account, asserted by a test that it carries no
  two digits in a row at all. The per-call values travel as
  `conversation_initiation_client_data.dynamic_variables`, so the words on the telephone are this
  instruction's and not a sample's, which they used to be. `VERIFICATION_VARIABLE_DEFAULTS` rides along
  as `dynamic_variable_placeholders` and is what a call with no variables says, which asks nothing and
  names no account, and `renderVerificationText` throws rather than hand a telephone a string with
  `{{supplier}}` still in it. `scripts/voice-agent.json` lost its sample instruction, which is where
  the repository's one eighteen-digit placeholder CLABE lived, and `scripts/voice-setup.test.ts` is the
  pin: no full CLABE and no run of five digits in the config or in the body that is uploaded.

  Three real outbound calls on 2026-09-13 are the evidence, all to a teammate's own mobile on the
  seeded hero line, and two of them found defects rather than confirming the build.
  `conv_8201m2cnt2fbf949zxnawp7hktfs` reached a voicemail, was read as `no_answer` correctly, and sat
  on the recording asking "sigue ahi" for the full hundred and fifty seconds, so the prompt now ends
  the call on a recording and leaves no message. `conv_0901m2cp16q0feht603dbz1t8a5r` reached a person
  who heard the change question, and the voice read `4611` as "cuatro mil seiscientos once", a
  quantity, so `spokenLast4` spaces the digits. `conv_0901m2cp6eh3fy4bn7fcsvvyd9d7` is the call as it
  ships: "termina en cuatro seis uno uno", the change asked, no other digit of any account spoken, an
  off-topic request refused with "Mi funcion es unicamente confirmar los datos de pago", and an
  outcome of `unclear` that is the honest reading of a person who said "Si, lo que es" and then went
  off script. `docs/03-user-journey.md` branch 3, `docs/09-api.md`, `docs/10-demo-script.md` and
  `docs/14-process.md#live-integrations-verified` carry it, and the voice id the cut list said was not
  pinned is pinned.

- **The pitch is a stand pitch now, and the clock is counted rather than claimed** (issue #75). The
  240-second stage version of `docs/11-pitch.md` is gone, because there is no stage: judging is
  continuous, the pitch happens standing at the table on the real app, and a video is only the backup.
  What replaces it is eleven beats in the order the screen tells the story, the laptop shut for the
  first forty-four seconds, and the numbers, the competition, the model and the guarantee afterwards at
  one breath each. The hook now carries article 49 Bis beside 69-B, which is the clause that makes the
  retroactive clock point at the buyer and at the buyer's own sello digital, and it closes on the
  sentence `docs/11` has asked for since the eight-minutes sentence was banned: el jueves Lupita va a
  apretar enviar noventa y dos veces, no la hacemos mas rapida, le quitamos de encima los seis pagos
  que no se deshacen.

  **The clock is arithmetic on a word count and the file says so.** 786 spoken words at 150 words a
  minute is 5:14, which is fourteen seconds over the ceiling, so rung 1 of a pre-declared ladder comes
  off by default and lands it at 4:59. The ladder has six rungs with measured savings per rung down to
  3:25, ten `+` clauses that go back in when a judge stays, and three things that never come off at any
  rung: the hook, the synthetic-data sentence, and the beat where a screenshot becomes a payment
  instruction. `docs/14-process.md` gains the protocol that replaces the arithmetic with two stopwatch
  readings, one clean run and one against a teammate playing a hostile judge, with what gets logged per
  run and the rule for reading the ladder off the total.

  **`docs/10-demo-script.md` gains the operating sheet** with the exact click, the on-screen result,
  the Spanish said over it, the dependency and the fallback per beat, above the four-minute reference
  that still owns every id and every figure. Two of its rules inverted with this merge and both are
  written the new way: the plaza fires on the seeded hero line since #233 moved the account to
  `012180102091764611`, so the two places are named out loud; and the re-scored line reads
  `cancelado` through `sat_definitive` since #204, so the word is true on a merged build. `docs/12`
  gains twenty-two Q&A cards, one per question the two Capital One tables actually asked, each answer
  under sixty words in Spanish with the owner among the four and the long section it compresses; a card
  that still gets asked after the pitch is recorded as a defect in the pitch and not in the card.

  **`docs/print/team-card.html` carries the order of the pitch** instead of the six objections, which
  moved to the cards and live on a phone: the hook word for word, the three families of banned
  sentence, the eleven beats with their clock and their presenter, the ten numbers allowed out loud,
  four competitors first and seven on request, and the four guarantee layers with the empty menu slot
  and the triage that stops a tired presenter improvising a letter into it. Re-measured headless, one
  A4: `/Count 1`, `/MediaBox [0 0 594.95996 841.91998]`, zero overflow, and the last block at 1000
  against a limit of 1063.

- `docs/10-demo-script.md` is true against the app again (issue #79). Beat 2 says seven months of
  replay because that is what the seeded ledger holds and what the screen shows; beat 5 carries the
  thirty-five case numbers and stops claiming the labels were written by someone who had not read
  the controls. The four-minute question is answered by counting rather than by asserting: 405
  spoken words, 2:42 of talking at 150 words a minute, and a per-beat table showing that beats 3 and
  4 have under five seconds of slack each and are the two that need a human to physically do
  something. The checklist gains the boot line to read, because `bun run dev` from the repository
  root does not hand `SEED` to the API and the fixture it serves instead makes every figure in the
  file wrong. The same counts were stale in `docs/01`, `07`, `08`, `13`, `14` and the README.

- `docs/11` and `docs/12` no longer claim the labelled cases were written by someone who had not
  read the controls. The controls were merged first, `packages/seed/src/holdout/README.md` has said
  so since #122, and a judge who reads the repository and then hears the stronger claim out loud has
  found the one thing that costs more than the point it was worth. The sentence to say is that no
  case was edited to make a control pass and the ones that disagree are still counted against us.

- A second Capital One panel came to the table on the evening of 2026-09-12, said the project was
  interesting and then asked the one thing the afternoon's answers had given in categories instead of
  counts: narrow the market, and say exactly who sells this and through which channel (issue #193).
  `docs/05-business-model.md` replaces "GTM in three steps" with "GTM: who sells this, to whom, and
  through which channel", and every count in it is counted or admitted to be an assumption.
  **The segment is narrowed until it is a list somebody could buy.** Formal manufacturers, wholesalers
  and builders of 11 to 250 people in Nuevo Leon whose payment run touches 30 or more suppliers a week,
  through four filters: 24,599 establishments in the band in the state, **6,476** of them in
  manufacturing 3,240, wholesale trade 2,445 and construction 791, **6,114** of those in the thirteen
  metropolitan municipalities led by Monterrey 2,261 and Apodaca 857, and **about 2,312** after INEGI's
  blunt all-size national formality rate of 35.7 percent, which is too low for this band and is used
  anyway. The fifth filter, 30 suppliers a week, **is published nowhere**: DENUE carries no payment data
  and the ENAFIN tabulados render as a JavaScript shell, so it is a hypothesis with a measurement
  attached and the 200 free sweeps are the measurement. The new source [48] is the DENUE 05_2026 Nuevo
  Leon bulk file counted by us with the same strata filter as [26], reproducible in one command, and it
  cross-checks by returning exactly the 737 accounting units for SCIAN 541211 that [26] already reports.
  It also surfaces a disagreement between instruments that is now written down instead of smoothed over:
  DENUE puts 24,599 establishments in the band in the state against the about 18,500 economic units
  CE 2024 implies, a third apart on the same band in the same state, and neither number is wrong.
  **Months 1 to 6 are founder-led, and the buyer is not the clerk.** Fabricio and Patricio take the
  meetings, the opener is a free supplier-register sweep of which the stop condition already fixes 200,
  about 8 a week, and the arithmetic of the conversations is written out with its two rates labelled as
  assumptions with no benchmark behind them: 1 in 3 owners agreeing to a sweep is 600 conversations,
  23 a week, about 5 a working day for two of the four calendars, and 1 in 4 exposed sweeps converting is
  2 or 3 paying companies in six months. Carrying the whole 36-month SOM that way would be 7,200 owner
  conversations, 46 a week for three years, which four founders who are also building the product cannot
  do, so the channel is arithmetic rather than a growth lever. The buyer is **purchasing and finance**
  and it is stated as two functions rather than a job title, because a function is what you can ask for
  an introduction to: finance files the complementary return inside the thirty days and carries the 46
  percent of a disallowed subtotal that reverses as ISR plus IVA, purchasing owns the register the
  controls read and makes the telephone call when a payment is held. The published evidence of that split
  is a competitor's own promise and not our reading of an org chart, ValidX's "si no cumple, se retiene y
  se notifica a Compras", with ENAFIN's 61.2 percent `Director(a) o gerente` used for the shape of the
  sale and nothing more. The clerk of `docs/02-persona.md` stays the user and is not the buyer, since the
  one thing the product does to her Thursday is make it slower on six lines out of ninety-two, and
  `docs/02-persona.md` section 2 now says so in the same words.
  **From month 6 the accounting firm is a reseller, against a denominator that is counted.** 143 of the
  737 accounting and audit units in Nuevo Leon employ 11 to 250 people and 140 of those are metropolitan,
  so the year-one target of 25 firms is 17.5 percent of a state rather than the 0.7 percent of a national
  denominator this file used to quote. The partner economics are stated both ways because we do not set
  the firm's resale price: MXN 3,900 to us, up to MXN 168,960 a year of billing if the firm resells at
  our direct price at a 78.3 percent gross margin, or MXN 195 per client per month if it bundles it into
  its own fee, against our MXN 2,620 gross per firm at 67.2 percent and a 0.69-month payback. Why a firm
  sells it is written precisely enough to survive a tax question: the statutory obligation is the
  client's, and what the firm carries is the work and the relationship. **Two sentences were wrong and
  are corrected rather than quietly dropped.** Both published competitors sell *to* accounting firms and
  not *through* them, and one of them does publish a customer count: Tesio's own home page positions it
  as "Software fiscal con IA para contadores y despachos" and publishes "+2,400 contadores automatizan
  con Tesio", self-reported and unaudited, and 69b.mx sells a `Corporativo` tier at MXN 1,999 a month
  "Para equipos grandes y despachos" with unlimited monitored RFCs. That pair is the demand and it also
  prices the ceiling, since our MXN 3,900 firm plan is **1.95 times** that tier and the whole argument for
  the difference is that theirs monitors a list while ours decides a payment. Neither publishes a
  reseller, partner or affiliate programme, so the firm as a reseller is labelled our bet.
  **The integration channel is gated on ten paying firms** and the vendors' own pages are quoted for what
  they do and do not publish: CONTPAQi states more than 6 thousand distributors and more than 1.2 million
  user companies and publishes no distributor terms at all, Siigo Aspel publishes a tiered
  certified-distributor directory with no total, and the SAT's list of proveedores autorizados de
  certificacion **is not countable**, through four routes tried on 2026-09-12: a 1,477-byte JavaScript
  shell, a legacy PAC page whose content block is empty and last modified 11 February 2014, the padron of
  contadores publicos answering HTTP 500, and AMEXIPAC rendering its members as a logo carousel. So no
  PAC count is quoted anywhere, and 69b.mx's own `API 69-B` is marked "Proximamente" with a waitlist, so
  nobody in the category has proved that channel either. The chamber route is published and dated:
  CAINTRA Nuevo Leon states more than 5,000 affiliated companies and signed an agreement with Afirme
  Banco on 2026-09-10 at Expo Pyme Monterrey covering about 4,500 affiliated PyMEs, which is a bank
  distributing a financial product to precisely our segment through a chamber two days before this was
  written. It is credit and not a control, so it is carried as an analogy. COPARMEX Nuevo Leon publishes
  only a national figure so none is used, ICPNL's 2,000 afiliados is quoted as self-reported, and the
  IMCP answered HTTP 403 to three clients so no IMCP number appears at all.
  **And a third route, from the same team meeting, with the intermediation dilemma answered rather than
  deflected.** A bank embeds the control inside its own business banking so that the payment already runs
  through it. The answer to "you are one more intermediary" is not that we are indispensable, it is where
  the control sits: **SentryOne belongs where the payment executes**, and three published facts carry it.
  60.4 percent of firms with six or more employed persons operate through the institution's own web page
  against 35.0 percent on a mobile app. The despacho cannot be the last step because it holds no
  credentials for the client's portal, which is already in `docs/02-persona.md`. And the verification
  primitive is the rail's own: Regla 51a Bis of the SPEI rules has Banco de Mexico generate a one-centavo
  order in its own name to read the holder out of the CEP, with Regla 72a obliging participants
  generally. The gap is written by the banks themselves, HSBCnet selling beneficiary-name validation for
  "unicamente cuentas HSBC" in files of up to 5,000 accounts inside a 07:00 to 22:00 window, and BBVA Net
  Cash having the company type the holder's name itself behind a token challenge that authenticates the
  employee and not the account holder. **Nessie is the bank of the demo**, which is a statement about
  `scripts/nessie-mirror.ts`, `packages/nessie/src/mirror.ts` and the sixth control,
  `bank_reconciliation`, rather than about a relationship, and **Capital One is named as the kind of bank
  this route is for, which is a judgement about bank shape and not an agreement: nobody at Capital One or
  at any other bank has agreed to anything.** It is third in the order and not first because a bank
  integration is a procurement cycle and a security review measured in quarters, and the only thing that
  survives either is evidence from companies already running the control, so the order is 200 sweeps, ten
  paying firms, then the conversation. No count of Mexican banks is quoted, because the CNBV register was
  not opened on this pass, and no published Mexican bank programme for small-business software partners
  is cited either, because none was opened, which is why the route is an ask for a conversation rather
  than an application to a programme known to exist.
  **The pitch carries it on stage.** `docs/11-pitch.md` gains four rows in the numbers table, the segment
  with its 6,476, 6,114 and about 2,312, the 143 of 737 reseller denominator, the MXN 1,999 despacho price
  anchor with the 1.95 times it implies, and Tesio's 2,400 as the only customer count a competitor
  publishes. The 3:25 market sentence now says the segment before the national figure and labels the
  246,000 as the total, which is what the panel asked for. The 3:45 ask **is now the channel ask**, three
  introductions to despachos of 11 or more people in Monterrey to run the sweep over real payment runs
  plus one conversation with whoever owns business banking, so the ten real payment runs survive as what
  the introductions are for. And the closing paragraph of "The business, in the three sentences that get
  asked" carries the four motions in order with the bank route stated as an ask.
  `docs/12-judge-qa.md` gains "Second table of 12 September": the question as it was asked, the
  thirty-second answer, eleven allowed rows with a source each, five things not to say starting with any
  claim that a bank has agreed to anything, and the honest gap volunteered in the same breath, which is
  that the supplier-count filter is published nowhere and the two conversion rates have no benchmark at
  all. `docs/04-market.md` gains the first-segment row, the instrument disagreement, Apodaca counted at
  2,511 in the band and 857 in the three sectors, which closes the TODO it carried, the correction to the
  channel assumption, the bank route with no bank count, and source [48]. The direct half of the SOM is
  re-read against the narrowed segment and the consequence is said out loud: 600 direct companies would
  be 9.3 percent of the 6,476, so that half leaves Nuevo Leon after the first year or it does not happen.
  `docs/01-rubric-mapping.md` rows 8, 11 and 14 point at the renamed sections and row 11 now describes
  counts instead of steps, and ADR-0006's link to the renamed GTM section is fixed.

- The rate a second Capital One panel asked for on the evening of 2026-09-12, answered as a bracket
  with its arithmetic on the page instead of as the number a teammate said (issue #192). The question
  was what percentage of supplier transfers in Mexico is stolen and the answer given at the table was
  25.4 percent, which is in no source this repository holds: it is the 24.3 percent of Condusef's
  refund share misremembered, a share of disputed pesos that came back rather than a share of
  transfers that left, and as a loss rate it is wrong by three orders of magnitude. `docs/04-market.md`
  gains "The rate on supplier transfers, and how it is derived" ahead of the sizing, and the honest
  answer is that **nobody publishes that rate**, not Banxico, not Condusef, not the CNBV, not the ABM,
  not INEGI. What is published brackets it. Possible-fraud claims against banks in 2025 over SPEI
  transfers in the same year give **7.1 per 10,000**, a ceiling because the numerator counts cards and
  ATM and internet purchases while the denominator counts only SPEI and because the denominator is a
  "more than". Unrecognised electronic transfers that reached Condusef in the first half of 2026 over
  half of that denominator give **2.1 per million**, a floor because the escalated register is about
  nineteen times smaller than the one claims are made to; the two errors in that second ratio push in
  opposite directions, a factor of nineteen against a factor of 1.37, so the net is argued in the file
  rather than asserted. **Say the bracket, never a point inside it.** Three more derivations follow,
  each with its formula and inputs printed so a judge can reject a cell instead of the method: INEGI's
  522 fraud events per 10,000 economic units a year, which is the unit a buyer actually buys in, the
  MXN 958.91 of expected annual cost it implies on the national average and the admission that this
  does not pay for MXN 10,788 of subscription on its own, and the same figure scaled to pequena and
  mediana through the only size gradient INEGI publishes, MXN 2,770 and MXN 9,108, labelled modelled
  because the cross of size against crime type is ours and not INEGI's. The negotiation sentence is
  the ratio that comes out of it, **6.9 percent** of what INEGI already measures a small company
  spending and losing on crime in a year and **2.1 percent** for a medium one, and the close is an
  admission rather than a claim: we do not know your rate and neither does anybody else, which is what
  the free supplier-register sweep and its stop condition exist to measure. The international analogue
  is labelled as an analogue: UK Finance counts our exact attack and puts **68 percent of invoice and
  mandate losses on business accounts** and **37.0 percent of all business APP losses** on it, which
  over Pay.UK's Faster Payments volume is about **7 payments in every 10 million**, and Pay.UK's own
  Confirmation of Payee milestone attributes no measured share of any fraud fall to the service, so
  neither do we. Eight sources were added, 67 to 74, every link opened on 2026-09-12.

- Two sentences in `docs/04-market.md` were corrected against their own sources in the same pass,
  because finding them and leaving them is worse than the original error (issue #192). INEGI's
  `Fraude` category **is** defined: footnote 1 to cuadro 3 and grafica 4 of the comunicado reads
  "Incluye fraude bancario y fraude al consumo del establecimiento", so bank fraud is named, and the
  earlier claim that the category was neither defined nor broken down was true only of the
  presentation. What still does not exist is a supplier-impersonation subcategory or any split between
  the two things that footnote bundles. And Banxico SIE table CF891 does not answer its export
  endpoints with the page shell: re-probed on 2026-09-12, `&tipoArchivo=CSV`, `&tipoArchivo=XLS`,
  `&tipoArchivo=IQY` and `&formatoXLS=true` each answer HTTP 400 with the same 146-byte message about
  an invalid character in a form field, which is a rejection and not a silent fallback, while the page
  itself answers HTTP 200 with about 164 KB of HTML carrying no table element, no series identifier
  and no year. Sources 14 and 15 were read again and now carry what was taken from them, including the
  ENVE universe of about 4.8 million economic units that derivation 3 divides by, which is implied by
  the survey's own 27.2 percent on 1.3 million victims and is a different universe from the 5,468,180
  of the Censos Economicos.

- `docs/11-pitch.md` and `docs/12-judge-qa.md` carry the answer and the ban (issue #192). The numbers
  table gains six rows, the bracket among them, each pointing at the derivation rather than repeating
  it. Delivery rules gain a third banned sentence next to "nadie hace esto" and "nosotros inventamos
  la prueba del centavo": **25.4 percent, and any other single percentage offered as the rate of fraud
  on supplier transfers**, with the two-sentence Spanish replacement written out, the bracket first and
  then the 24.3 percent said correctly. `docs/12-judge-qa.md` gains "Second table of 12 September" with
  the question, the thirty-second answer, the close and one instruction about order: do not volunteer
  the bracket before the fiscal hook, because a panel that hears two per million first has been handed
  a reason to think the fraud half is rare. The honest-gap line of section 6 was updated in the same
  pass, since it claimed we had no frequency figure at all and now there is a national one that is not
  a figure for this size band. The `Tests` row of the numbers table was re-read after the merge this
  branch carries, because the cell says to do that and a judge who runs `bun test` next to the pitch
  sees both numbers: 1,881 tests across 100 files, 1,769 passing, 112 skipped, 0 failing. The same
  counts in `docs/01-rubric-mapping.md` row 7 still read 1,725 and 111 and were left alone, because
  that file is not on this branch's path.

- `docs/12-judge-qa.md` gains "Table feedback of 12 September and the answers": the six objections,
  a thirty-second answer each, and the file or the endpoint each answer rests on named once. The rule
  it is written under is the one to keep: an answer that is not true in the repository today is written
  as "today X, and by the demo Y" with the issue that makes it Y, which is why the screen work is
  #174 and folding the newest sweep into the run counter is #175.

- `docs/11-pitch.md` drops the minutes framing for the loss framing. "En la vida real esto toma ocho
  minutos y con nuestro producto toma segundos" is now banned in Delivery rules rather than merely
  discouraged: it prices the product at the wage of the person doing the work, which anyone can
  compute while you are still talking, and it invites the objection the second engineer gave us. The
  new section "The value is the loss, not the minutes" says what replaces it, and "The objection about
  the father's PyME" answers that engineer: the user is not the owner who knows his suppliers by
  voice, it is the company whose Thursday run pays dozens of them through one clerk, the supplier's own
  WhatsApp is the channel the attacker uses so trusting the conversation is the failure mode and not
  the defence, and the 69-B loss needs no fraud at all. The gated table gains the two rows these
  changes let us say, and the numbers table gains the hold window.

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

- The docs read again against the merged tree, 00 to 14 plus the ADRs, `README.md` and `AGENTS.md`
  (issue #202). The night of the 12th merged the assistant, the payment execution, the actor on every
  write, the plaza, the three levels and the three states, and the four documents, and a narrative
  that still described the product of the morning is the Wizard-of-Oz reading Capital One said they
  hunt for. Seventeen files moved and every change is something the running product falsified, not a
  rewording.

  Five of them were claims that were simply untrue. `POST /api/v1/run/:id/execute` was documented with
  a `403` branch the route deliberately does not have, because sending the run is the clerk's own work
  and the owner-only shape belongs to `decide`. `AssistantTool` has nine members and ADR-0007, the
  stand pitch, the demo script and judge card 17 all said seven. `packages/constancia` writes four
  documents and `docs/07` said two. `apps/web` has ten screens and three docs said six. The CHANGELOG
  pointed at `0013_cfdi_issue_place.sql` and `0009_decision_reason.sql`, which are `0014` and `0011`.

  A sixth was true when this branch opened and stopped being true while it was open, which is worth
  recording rather than hiding. `GET /health` answered `{ ok, service, version }` and the docs
  promised a `dependencies` block, so this branch first corrected the docs down to the route; then
  issue #200 merged and built the block, and the correction was reverted to `origin/dev`'s own words.
  The same happened to the person selector: three documents said it was owed, issue #215 shipped
  **Entrada y ajustes** with it, and every one of those sentences now says what the screen does and
  that it is still not a login. A docs pass that lands after the features it describes has to be
  re-read against the base it merges onto, not against the base it branched from.

  Every count is read off a run on this branch rather than adjusted: `bun test` answers 2,586 tests
  across 138 files, 2,468 passing and 118 skipping, where the README said 1,725 across 99 and 111,
  `docs/07` said 1341 across 77 in two places, `docs/11` said 2,238 across 114, and `docs/01` said
  2,196 across 118. The 118 skips are the database cases in six files, all of them gated on
  `TEST_DATABASE_URL`. `bun run eval` answers 35 cases at 87.0 percent precision, 83.3 percent recall
  and a 1.6 percent false positive rate, with 12 of 12 on `confiable`, and `bun run demo` is green on
  all nine checks. The seeded run is 92 instructions for 2,174,210.76 MXN over 4,103 CFDIs, 3,801
  complements and 2,446 bank-mirror rows, which is what `docs/07` already claimed and now verifiably.

  `docs/03` is the one that was rewritten rather than corrected. The journey had six stages ending at
  an archive artifact marked `TODO(fabbyyyy)`, and it said in its own words that SentryOne never sends
  the SPEI and that the bank remains where it leaves from. It now has eight stages and four branches:
  the payment arriving inside the conversation when a clerk drops a WhatsApp screenshot into the panel,
  and the run leaving on the rail with a clave and a receipt per line, are two of them, and the fourth
  branch is the one case where the evidence stops a payment with nobody's name on it, a definitive SAT
  listing that only a named owner reopens with a written reason. It is nine stages by the time it
  landed, because #215 put a front door in front of the invoice and the journey now starts where the
  person says who they are signing as. Everything issues #206 and #213 had just added about the call
  and the supplier profile is kept word for word. Every artifact it names exists, and the two screens
  that are still owed, the count per level of #208 and the override reason asked for before the click
  of #174, are listed under their own heading rather than implied.

  `docs/07` gained the fourth flow, the run leaving on the rail, as a sequence diagram with the four
  properties that are checkable rather than believable: idempotence per instruction and not per
  request, `sent` and `settled` never collapsed, the execution folded out of the ledger and never
  stored, and a cancelled line being a statement where a skipped one is not. The topology diagram
  gained `packages/rail`, `packages/consortium`, the assistant, the plaza catalogue, article 49 Bis and
  `levels.ts`, and the row that said an on-demand LLM explanation layer is not built now says which
  half of it shipped and which half stays forbidden. `docs/08` grew the six domain types that have no
  storage and explains why each one is read out of the ledger instead of a table, so the table counts
  sixteen places and not ten, and the entities preamble names all eight event kinds the ledger learned
  after `0003` rather than stopping at three.

  The rest is the narrative catching up with what is true. `docs/11` ticks the rail row with the
  86-line live Nessie run and the assistant row with its boundary, and gains four rows for the actor,
  the definitive listing, the two vocabularies and the one-page letter, each with the part that is
  still not on screen written into the gate. `docs/12` replaces a Patricio honest-gap cell dated
  2026-09-12 that described the detectors and the API as open pull requests, names the file to open on
  screen instead of carrying a TODO to find it, and stops saying a judge can re-verify the CEP on their
  own phone, because the CEP on screen is the synthetic fixture and #57 is open. `docs/06` section 4.4
  no longer says the screens pick the identity from a list, because the control that would do that is
  not built. `AGENTS.md` states the ADR-0005 amendment rather than the runtime it replaced, and its
  package list gained `sat`, `cep`, `extract`, `voice` and `constancia`, which it never had.

  One thing was deliberately left alone. `docs/13-devpost.md` belongs to issue #76 and the Devpost
  agent, so not a line of it is touched here even where it carries the same counts.

- The photo and voice-note intake against the model this repository actually configures (issue
  #197, found while building the panel). `packages/extract` sent
  `thinkingConfig: { thinkingBudget: 0 }` on every request, which Gemini 2.5 accepts and
  `gemini-3.6-flash` refuses with `400 Request contains an invalid argument`: every screenshot and
  every voice note failed against the configured model, and the intake answered "the image could not
  be read" for a reason that had nothing to do with the image. The field is now sent only when a
  caller pins a budget, and the output allowance is raised to 4096 and 8192 tokens because the model
  thinks whether or not it is asked to and the answer was being truncated instead. Verified against
  the live API with a real screenshot: the account, the amount and the payee all come back, and
  `docs/06` section 6.4 carries what the thinking tokens cost.

- `?data=mock` was documented as "no request leaves the browser" and it was making two, so the offline
  mode looked broken exactly where it is meant to be the strongest (found verifying issue #125).
  `useResource` honoured the mode, so every screen that loads through it was silent, but two things open
  a connection on their own and neither asked: the run screen's event stream (`useEvents` in
  `RunScreen.tsx`, called with no `enabled`) and the API status card (`getHealth` in `StatusCard.tsx`).
  Measured with headless Chrome counting requests, `?data=mock#/run` issued `GET /api/v1/events` and
  `GET /health`. What it cost on screen is worse than the requests: the run header printed "Datos: solo
  datos sinteticos" and "Flujo de eventos conectado" beside each other, two claims that cannot both be
  true, and on a phone in a corridor the same card would have read "API no responde" in the hold colour
  for a server the page had promised not to ask. `reachesApi` in `apps/web/src/lib/resource.ts` is now
  the one rule, `auto` still allowed to try and fail because it is API first by definition. The run
  screen holds the stream closed and says so in its own words rather than reporting a connection that
  closed, and drops the Reconectar button, which offline could only offer a judge a button that fails.
  The status card asks nothing, says "No se consulto la API", and explains that not knowing whether a
  service answers is not the same claim as knowing it does not. `apps/web/src/lib/resource.test.ts`
  guards the class rather than the two instances: it walks every source in `apps/web/src`, and a file
  that calls `useEvents` has to pass `enabled:` in that call while a file that calls `getHealth` has to
  consult the mode. Checking the call and not the file is the point, because the run screen already
  carried `source !== "mock"` on the constancia link three hundred lines from the stream it was not
  guarding, so a file-wide search would have passed on the broken version. 16 tests and 43 checks over
  `resource.test.ts` and `RunScreen.test.ts`, and both guards were run against the pre-fix sources to
  confirm they go red on them.
- `scripts/web-mock.test.ts` could fail `bun run release-check` for being on a busy laptop. Its first
  test runs the whole generator and diffs 152 KB byte for byte, which measures 3.6 to 3.8 seconds idle
  against Bun's 5 second default; with the API, two vite servers and a headless Chrome running beside
  it, it took 5.8, and release-check stopped three gates early and printed "do not tag" for a green
  tree. The budget is now stated at 30 seconds with the measurement written next to it, so the gate
  reports the repository rather than the load on the machine.
- The QR prefill example in `apps/web/README.md` named `SYN010101AAA`, which belongs to the
  hand-written fixture in `apps/api/src/synthetic.ts` and not to the seeded company this app falls back
  to, so scanning it prefilled a supplier the offline run does not hold and the demo API answers 404
  for. It is now the RFC and the amount the intake screen's own placeholder shows, read off the run
  through `EXAMPLE_SUPPLIER_RFC`. Same failure as issue #125 in a smaller place: a folio written down
  once and left behind when the dataset moved.
- The API and the offline fallback of the web app were two different companies, so one RFC could carry
  two legal names on one screen (issue #125). `apps/web/src/lib/mock.ts` held a hand-written run of
  eight suppliers while the API booted the generated company from `@hackmty/seed`, and the two
  disagreed about the legal name of every RFC they shared. The supplier drawer is where it showed: the
  table row renders from the run payload and the drawer fetches `GET /api/v1/suppliers/:rfc`
  separately, so when one of the two calls fell back and the other did not, one RFC named two companies
  at the same time. The expensive version of the same bug is the API dropping mid-demo, when every name
  on the projector changes at once. There is one dataset now. `bun run web:mock`
  (`scripts/web-mock.ts`) writes `apps/web/src/lib/mock-data.ts` out of `loadSentryOne` at seed 69 for
  the week of 2026-09-07, runs the same `assessRun` the API runs at boot at `runInstant(runDay)`, and
  composes what a repository composes rather than stores through `MemoryRepository` itself: the run
  totals through `runMoney`, the SAT version summaries, the blind holdout metrics and the priced
  retroactive sweep. The three things the run does not carry are each built with the package that owns
  it and marked in the output: the consortium signal, the CEP of a one-cent probe, and the five
  one-cent verification states the API folds out of its ledger. `mock.ts` keeps the three jobs a
  generated file should not do, which is composing the endpoint payloads, deriving the totals again
  through `totalsFor` after a decision is applied with no API, and saying what is deliberately not one
  for one with the API. The data is generated ahead of time and committed because the browser bundle
  cannot import `@hackmty/seed`: it reaches `node:fs` through `@hackmty/sat` and `node:crypto` through
  `@hackmty/consortium`, so a build-time import would either break the browser build or add a
  dependency `apps/web` must not have. `scripts/web-mock.test.ts` is what makes "generated" mean
  something. It regenerates the file and compares it byte for byte, and it boots a `MemoryRepository`
  on the same company to assert that both sides answer the same legal name for all 44 suppliers, the
  same amount, CLABE, action and findings on all 92 lines, the same totals, the same list versions and
  the same metrics, which is the acceptance criteria of the issue written as assertions: 15 tests and
  1,433 checks over the two sides. Three things in the offline copy are deliberately narrower than the
  API's, and the narrowing is asserted rather than assumed. The invoices are the 156 of the company's
  4,103 that a screen of this app can reach, which is the ones this run settles, the ones the
  retroactive sweep prices and the ones a finding names, 8.8 KB gzipped against 208 KB for the whole
  eight-month history. The payment complements are the 2 that settle those, because
  `SupplierDetail.complements` is read by no component in `apps/web`. The verified-beneficiary registry
  starts empty, which is what `sentryoneDataset` hands the API, because a browser with no API has
  verified nothing. Every row the offline file does carry is the API's own row, every invoice a screen
  can open is carried, and no supplier of the run answers with an empty file. That takes the web bundle
  from 1,757 KB and 359 KB gzipped to 565 KB and 160 KB, and `chunkSizeWarningLimit` from 2000 to 700.
  The one number the narrowing moves is the invoice count in the supplier drawer, which is the API's
  whenever the API answered; offline the field is labelled "facturas de esta corrida" and says in one
  line which invoices travelled, because printing 3 for an issuer that has 23 under the label
  "facturas en el expediente" is issue #125 again. `docs/07-architecture.md` carries the difference and
  the sizes. Four smaller things the one dataset exposed went with it. `PaymentRunTotals` in
  `apps/web/src/lib/contract.ts` carried a TODO reading `held`, `toVerify` and `released` as peso sums
  while `paymentRunTotalsSchema` in `apps/api/src/schemas.ts` had answered counts all along, and it now
  reads counts and carries the seven peso fields `runMoney` puts on the run. `not_checked` was missing
  from the unconfirmed set in `apps/web/src/lib/cep-seal.ts`, so every CEP this build has shown read as
  "Firma no valida", which is the accusation that module exists to prevent. The CEP screen's example
  was a hand-written `CepVerification` claiming `comprobable` over a seal nobody had checked, and is
  now the answer `POST /api/v1/cep/verify` gives for the probe on the released line of the run. And the
  folios written into the intake placeholder, the verification placeholder, `apps/web/audit/audit.ts`
  and `apps/web/brand/shoot.ts` belonged to the dataset that is gone, so they are read off the run:
  an audit or a README screenshot of the error state is no longer possible.

- The demo company priced no supplier relationship, so the expected-loss trade-off weighed the pesos
  at risk against zero and the field the instruction screen calls "Costo de retrasar un dia" read
  MXN 0.00 on all 92 payments (issue #182). `packages/seed/src/sentryone/delay-cost.ts` now prices
  `Supplier.delayCostPerDay` on all 44 suppliers from two things a Mexican supplier contract actually
  carries: moratory interest at three per cent a month on the balance this company owes that supplier,
  which is the monthly spend scaled by the payment terms, plus the pronto pago discount of one and a
  half per cent on the payment that was about to leave, lost in full the day it is late because the
  window closes. Raw material, tooling and the outside processes a shipment waits on carry
  `LINE_STOP_FACTOR`; consumables and services carry 1, and the split is the complement of
  `CONSUMABLE_SEGMENTS` plus the services rather than a third list, because the segments a plant buys
  more of during a shutdown are exactly the ones whose delay does not stop a line. The result is MXN
  101.98 to MXN 4,611.27 a day, the scale the hand-written fixture in `apps/api/src/synthetic.ts`
  already used, and it is arithmetic over the catalogue row with no draw from the RNG, so not one
  invoice, amount or instruction id moved: `INS-2026-09-07-047` is still the hero and
  `INS-2026-09-07-029` is still the largest hold. What did move is the counters, and that is the point.
  Rule 3 of `decide` now reaches its release branch on a line that carries a finding:
  `INS-2026-09-07-032` shows a duplicate-invoice warning worth MXN 2,088.00 of expected loss and the
  engine releases it, because a day of delay with that supplier costs MXN 4,611.27. The run is 785,289.86
  MXN not leaving over 2 held and 4 to verify, against 885,658.73 over 2 and 5 before, and
  `docs/10-demo-script.md`, `docs/11-pitch.md`, `docs/12-judge-qa.md` sections 5b and 5c,
  `docs/08-data-model.md`, `docs/print/team-card.html` and beat 1 of `bun run demo` were re-read off a
  fresh run rather than adjusted by hand. The demo now asserts the price exists on every decision, so a
  regression to zero is a red gate instead of a flat field on stage, and the one test that assumed a
  finding always stops a payment says what it meant instead: the four lines the demo names are stopped
  structurally by rules 1 and 2, and a released line with a finding has to satisfy the arithmetic that
  released it. The blind holdout is deliberately left unpriced, because nothing in a labelled case
  document prices a relationship.

- Three places still told the competition story the market research of PR #177 replaced, and all
  three are now the one story (Refs #171 and #169). `docs/12-judge-qa.md` answer 1 of the table
  feedback used to say "nosotros somos el unico que junta las tres cosas en el momento del pago"
  while naming only 69b.mx, Tesio and three foreign platforms; it now names what `docs/04` documents,
  in the order to say it: the fiscal camp already holds payments and never sees the account (ValidX,
  Portal de Proveedores, 69b.mx, Tesio), the money camp disperses SPEI without verifying who receives
  it (Clara, Xepelin), the one-centavo probe is a commodity that Verificamex sells metered and that
  Banco de Mexico writes into Regla 51a Bis of the SPEI rules, CONTPAQi holds both halves and its own
  changelog shows they never meet at the moment of payment, Bind ERP alerts and by its own help
  centre "no restringira", HSBCnet validates beneficiary names for HSBC accounts only, and Trustpair,
  nsKnox and Eftsure verify accounts for corporate treasuries abroad. The claim that replaces the old
  one is the union of the fiscal half and the money half in a single decision, retain, verify or
  release with the evidence attached, before the transfer is irrevocable, and the two sentences that
  break in one search are written down as never to be said: "nadie hace esto" and "nosotros
  inventamos la prueba del centavo". `docs/11-pitch.md` loses the same claim from the three timed
  versions, from the "list is public and free" answer, from the bank answer, which now says out loud
  that HSBCnet really does sell name validation for HSBC accounts only, and from the "why would an
  accounting product not add this" answer, which now names CONTPAQi as the incumbent that already has
  both halves; it gains the section "The competition, and the two sentences that lose the room", two
  price-anchor rows, and a delivery rule for the two banned sentences. `docs/print/team-card.html`
  carries nine competitor entries with one line each instead of five, the union claim and the two
  banned sentences. The scope line those two files carry was drafted as "today 69-B, and by the demo
  the 49 Bis list (#180)" and #180 merged before this branch did, so it says what is now true instead:
  both articles are in the lookup, the control and the sweep, and the half to volunteer is that 49 Bis
  answers `answered: false` with `coverage: "not_published_machine_readable"`, because the SAT
  publishes it as fourteen DOF oficios and not as a file, which is also the answer to a competitor
  advertising daily re-screening of it. No code moved: this touches `docs/12` and the card and nothing
  under `packages/sat`. The card kept its single A4 page: the business model moved into the left
  column so the roster gets a column of its own, and `docs/print/README.md` gains the headless
  re-measurement, because `.page` clips silently and a PDF with one page is not evidence that nothing
  was cut.

- The evidence behind the article 49 Bis coverage, taken back to the SAT, the DOF and the compiled
  statute and made reproducible by somebody who was not there when it was written (issue #180). The
  facts all held: the committed 69-B snapshot was downloaded again and is byte for byte the file the
  SAT serves, same 4566277 bytes and same `Last-Modified` of 2026-01-22, so the counts
  `official.test.ts` asserts are counts of the live file, and `packages/sat/src/snapshot/README.md`
  now carries its `sha256` and the one-line command that repeats the comparison. Article 49 Bis
  fraccion X reads as the docs say, forty-five business days to publish, thirty NATURAL days for the
  buyer to file the complementary return and then the restriction of the buyer's own certificado de
  sello digital under 17-H Bis fraccion XIV, all of it added by the decree of DOF 07-11-2025 whose
  Transitorio Primero sets 1 January 2026; the SAT open data catalogue still carries only articles 69,
  69-B and 69-B Bis; and all fourteen DOF oficios were opened one by one, each naming exactly one
  taxpayer, the notification dates written `DD/MM/YYYY` in the first seven and `06 de agosto de 2026`
  in the last seven with the change between oficios 24291 and 24292, exactly as `dates.ts` says.
  **What did not hold was the citation itself, twice over.** The DOF search was cited as
  `https://dof.gob.mx/busqueda_detalle.php`, which answers `302 Found` to `/Error_BS.php`: a bare link
  to a form nobody can open, handed to a clerk in the lookup answer as the URL to check the
  publications with. And the phrase was written without its accents, `fraccion X del articulo 49 Bis`,
  which the DOF full-text search answers with **zero results** where `fracción X del artículo 49 Bis`
  answers fourteen. Together those two would have read as "the list is empty" to the next person who
  checked. `ART_49BIS_DOF_SEARCH_URL` is now the search with its query string and the accents
  percent-encoded, a new test fails if it goes back to the bare page, and the trap is written down in
  `packages/sat/src/snapshot/README.md`, `docs/04-market.md` source 46 and `docs/06-regulatory-privacy.md`.
  One legal sentence was also an addition rather than a reading: fraccion XI does not refer anything to
  the Ministerio Público, it says the SHCP "procederá penalmente" in the terms of article 113 Bis,
  which itself requires a querella from the SHCP and names no other body, so the three places that said
  otherwise now quote the statute. Article 29-A fraccion IX is quoted as it reads, "Amparar operaciones
  existentes, verdaderas o actos jurídicos reales". Two blanket sentences about
  `art49bis-fixture.csv` were true of the accepted rows only and now say so: one row carries
  `XXXXXXXXXXXX` the way the SAT redacts an RFC and is rejected with its line number, and one row has
  an empty name and falls back to its own RFC, which is the pair the test `names nobody real` asserts.
  The lookup and the sweep were also run through the API over the memory repository: a real 69-B RFC
  answers from the committed list with its three dated situations, a real 49 Bis taxpayer gets
  `answered: false` with the coverage reason rather than a clean bill, a `SYN` RFC on neither list
  answers empty with both lists named, `POST /api/v1/sat/publish` still refuses a non-synthetic RFC
  with a `400`, and the simulated sweep prices MXN 404,152.59 over 24 paid invoices, the number
  `docs/10-demo-script.md` states.

- `bun run scrub` printed a remediation nobody could act on, and the test count three documents quote
  had drifted. A `branch` finding said "its author amends and force-pushes that branch", which is
  impossible when the branch was merged and deleted on the remote weeks or minutes ago: `git rev-list
  --all` walks remote-tracking refs, so a clone that has not run `git fetch --prune` keeps reporting a
  real `Co-authored-by` trailer on a commit no remote branch contains, and `bun run release-check`
  fails on it with no way forward. The finding now prints the three commands that identify and clear
  that case, a commit-message finding prints a remediation at all, and the header says the same. The
  comment in `.githooks/pre-commit` names the `Co-authored-by` trailer it exists to prevent again,
  which the shape change in #187 made safe and which is how `.githooks/commit-msg` has always read it.
  `docs/01-rubric-mapping.md` and `README.md` said 1,670 tests across 97 files, and `README.md` said
  109 database cases skip, where `bun test` answers 1,725 passing and 111 skipping across 99 files.
  The three documents that quote a count, those two and the table in `docs/11-pitch.md`, were read off
  one run after merging `origin/dev`, so they agree with each other and with the case this branch adds.

- Eight sentences in `docs/12-judge-qa.md`, `docs/11-pitch.md` and `docs/print/team-card.html` said
  things the running product does not do, found by taking each claim to the code and to `curl`
  (issue #171). The verification-call deadline is one day and not three: `HOLD_WINDOW_DAYS` is
  `EXPECTED_DELAY_DAYS`, three days for a `hold` and one for a `verify`, and a verification call is
  placed on a payment in `verify`, so the response says `days: 1`. The reason column is
  `0011_decision_reason.sql` and not `0009`, which the consortium and the rail took. The cost of
  delaying a payment reads MXN 0.00 on every instruction of the demo company, because the generator
  prices no `Supplier.delayCostPerDay` and `supplierModelOf` falls back to zero, so the sheet now
  says the mechanism is in `decide` and the number is flat in this data (issue #182). The UI does not
  say the loss probability is a prior, only `decision.ts` does. `releasesPayment: false` is on every
  response that reports a call and not on a `404`. A `no_answer` with nobody on the line carries no
  quoted phrase; only a voicemail greeting does. The beneficiary comparison is not a documental fact
  while `nameMatch` answers `partial` on one shared word and the seal reads `not_checked`. And four
  numbers were stale: the test count, the 180 case-by-detector pairs that contradict a matrix summing
  to 183, the claim that no control stayed silent in the blind evaluation, and a `TODO` about a
  persona figure that had already been refreshed.

- `POST /api/v1/instructions/:id/verify-call` validated `recordedBy` on a hand-recorded call and then
  dropped it, so the fallback path the demo uses when there is no telephony on site was the only
  human action in the product landing on an append-only ledger with nobody's name against it (issue
  #171). It now travels onto the `verification_call` event, and stays absent on a call the agent
  placed, where the conversation id is the provenance.
- The one-cent verification, walked end to end over real HTTP and reconciled against what the
  repository says about it (issue #165). Three claims were wrong and are now what the sandbox and
  the code actually do. `packages/rail/src/nessie.ts` said `GET /accounts` answers the key's two
  mirror accounts with the reconciled one first, so the probe landed "on the same account
  `bank_reconciliation` reads", and `docs/09-api.md` repeated it: reading the sandbox on 2026-09-12
  with `GET` only, the first account is `3fce172e-1591-43b8-b112-08e4491e3651`, the one abandoned during development in issue
  #45, and the reconciled mirror `ad2841a5-c274-47e4-84c8-e830667feea6` is second, so both live probes are on the older
  account. The selection is unchanged and still deterministic; what changed is that nothing claims
  the reconciliation any more, and the same read confirmed the counts issue #45 recorded, 3 customers
  and 2 accounts, so the probes created neither. `docs/10-demo-script.md` still told the manual story
  in beat 4, a person sending a cent and reading a clave off a statement, which is exactly what issue
  #165 removed: the beat is now the button, the states it walks, which half is the Nessie mirror and
  which half is Banxico, and the seal read out as reported. Its rules said the CEP on screen was real
  data; every CEP this repository holds is synthetic, and the rule now says so.
- The CEP screen showed a released payment beside a registry of verified beneficiaries still reading
  "registro vacio" (issue #165). Storing the CEP is what writes that row, and the registry is a second
  resource loaded on mount, so nothing re-read it. `storedCepAt` in `apps/web/src/lib/verification.ts`
  is the rule, keyed on the instant the CEP landed so it fires once per document rather than on every
  step the machine takes afterwards, and never for the offline run, where no row reached any registry.
- Stale counts that a judge checks in five seconds. `README.md` claimed 1023 tests across 59 files and
  `apps/api/README.md` claimed 163 in its workspace; the suite is 1,670 tests across 97 files with no
  network, no database and no key, with 111 database cases that skip. `apps/api/README.md` also told
  the reader to run the Postgres half as `TEST_DATABASE_URL=... bun test` over the whole tree: six
  files share that one database and each migrates and empties it in its own `beforeAll`, so a
  whole-tree run fails somewhere different every time. It now says one workspace at a time, which is
  what was verified: `bun test apps/api` against local PostgreSQL 18.6 is 246 tests green.

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
- The web app is redesigned around Capital One's own design language, on top of the rename in
  #152 (epic #82). The palette, the neutrals, the radii and the three decision colours are read
  from Gravity, Capital One's design system, rather than invented: the page is white like theirs,
  the neutrals are warm rather than blue-black, the accent is their brand navy `#013D5B` and the
  release colour is their olive `#5C7F0B`. The interface is set in Hanken Grotesk, self-hosted as
  one variable file per subset so the demo survives a room with no Wi-Fi, and it uses Capital One's
  own weight hierarchy, which is the thing that makes their pages look like two typefaces when they
  are one: display at 300, navigation and table data at 400, emphasis at 600. The rail's type is
  matched to their navigation exactly, at 14px and weight 400. Their lockup appears once, in the
  rail's foot, as attribution.
- The rail is a brand panel. Its ground is Capital One's brand navy, the same value as the accent,
  so the one piece of furniture on every screen is theirs and it is the first thing in the reading
  order. It carries its own palette, because every one of the page's ink tokens is dark on dark in
  there, and that palette does not change with the theme: a brand colour that shifts with the
  operating system is not a brand colour. Two things the audit caught rather than the eye: the app's
  focus ring is that same navy, so it has to invert inside the rail or keyboard focus vanishes where
  a keyboard user starts, and the muted ink measured 4.2 against the active row, under AA.
- The metrics page dropped the six-bullet essay on what the evaluation does and does not claim. The
  argument belongs in `packages/seed/src/holdout/README.md` and in the judge Q&A, not on the screen;
  what stays is the one line that is evidence rather than argument, that the figures on screen are
  the ones `bun run eval` and `GET /api/v1/metrics` print.
- The six sections moved from a row of tabs into a collapsible left rail, whose collapsed state is
  remembered, and the shell's top bar now carries the page's single `h1`. Five screens stopped
  repeating that title under it and keep only the sentence that says what they are for.
- The payment run lost most of what was on it, and reads better for it. The three decision buttons
  are gone from every row -- fifty-two coloured objects on one screen, inviting the decision to be
  made from the one place that shows no evidence for it -- and deciding happens on the instruction,
  next to the finding that explains it. The decision chip is gone too: a row's state is a 3px mark
  on its left edge and a word in its own column. The alert rail, which listed the findings the table
  was already sorted by, became a panel that names all six controls and what each one found,
  including the ones that found nothing. Two of the three totals cards became a line of text beside
  the one figure that decides whether the clerk can go home.
- The run opens on its exceptions. A week of 92 instructions is 7 rows of work and 85 that say "this
  one is fine", and the page was twelve screens tall as a result; a segmented filter above the table
  (`No salen` / `Liberadas` / `Todas`) opens on the first and takes the page to under two screens.
  Nothing is hidden: the headline card states the full count and the released total on every view,
  and each segment carries its own size. Changing the filter animates the incoming rows; the first
  paint does not animate, so the table is never blank in the frame a judge sees.

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

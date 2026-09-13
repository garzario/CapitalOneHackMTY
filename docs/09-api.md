# 09. API contract

Base path `/api/v1`. JSON in and out. Errors use one envelope: `{ "error": { "code": string, "message": string, "requestId": string } }`.
Codes: `bad_request` 400, `forbidden` 403, `not_found` 404, `conflict` 409, `unprocessable` 422, `rate_limited` 429, `internal_error` 500, `service_unavailable` 503.
`service_unavailable` is a capability this instance was not configured with rather than a request that is wrong, and it is distinct from `forbidden`, which is about who is asking. Two endpoints answer it: the consortium when `ALLOW_CONSORTIUM` is unset, and the one-cent verification on a server with no payment rail. A 422 on either would tell a clerk their request was wrong when it was not.
All amounts in MXN. All timestamps ISO 8601. Every synthetic object carries `synthetic: true`.
Types are the ones in `packages/core/src/domain.ts`; the API never invents a second shape.

## Read

| Method | Path | Returns | Notes |
|---|---|---|---|
| GET | `/health` | `{ ok, service, version, dependencies }` | liveness, plus what this instance was configured with. See "Health, and what it may not check" below |
| GET | `/api/v1/run/current` | `PaymentRun` | this week's payment run: instructions, their decisions and findings, totals. Under `SEED=sentryone` the six controls are run over the generated company at boot, so the findings and the proposed actions on this payload are the engine's own output and not fixture rows. `Decision.decidedBy` stays absent on every line until a person confirms one |
| GET | `/api/v1/instructions/:id` | `{ instruction, decision, findings, supplier, hold, confidence, confidenceRule, confidenceFindingIds, state, stateRule }` | detail panel. `hold` is the window the payment is stopped for, or `null` when it is released. The last five are the same level and state the run carries for that line. See "The hold window" and "Confidence and state" below |
| GET | `/api/v1/suppliers/:rfc` | `{ supplier, cfdis, complements, findings, verifiedBeneficiaries }` | supplier drawer |
| GET | `/api/v1/sat/lookup?rfc=` | `{ rfc, entries: SatListEntry[], listed, effective?, source, lists }` | the judge types a real RFC here; read-only over the official list merged with any version this instance was posted. `lists` answers for both SAT lists, article 69-B and article 49 Bis, and says which one could answer. Rate limited per client |
| GET | `/api/v1/sat/versions` | `{ versions: [{ listVersion, publishedAt, rows }] }` | loaded list versions |
| GET | `/api/v1/beneficiaries` | `{ items: [{ supplierRfc, clabe, cep, verifiedAt }] }` | verified beneficiary registry |
| GET | `/api/v1/consortium/signal?rfc=&clabe=` | `{ rfc, clabe, network: NetworkSignal }` | what the SentryOne consortium holds for one beneficiary pair, read from the LOCAL snapshot and never from Snowflake. Both halves of the pair are required. `503 service_unavailable` when `ALLOW_CONSORTIUM` is unset, `404 not_found` when the network has never seen the pair or when nothing has been pulled. See "The consortium, and what the network can say" below |
| GET | `/api/v1/metrics` | `Metrics` | blind evaluation, recomputed on demand. `perDetector` and `perLevel` |
| GET | `/api/v1/ledger?since=` | `{ events: LedgerEvent[] }` | append-only ledger, for the timeline |
| GET | `/api/v1/sat/constancia?listVersion=` | `application/pdf` | constancia of the retroactive sweep for one loaded list version |
| GET | `/api/v1/run/:id/constancia` | `application/pdf` | constancia of one weekly payment run. `current` is accepted as the id |
| GET | `/api/v1/instructions/:id/verify-call` | `{ script, voiceConfigured, releasesPayment: false }` | the words the voice agent reads, or the clerk does. Side effect free: no call is placed and nothing is appended |
| GET | `/api/v1/instructions/:id/verification` | `VerificationState` | where the one-cent verification of this instruction stands, folded out of the event ledger. `state: "not_started"` when the cent has not been sent, which is a real answer and what lets the screen offer the action. `404` for an instruction nobody holds |
| GET | `/api/v1/assistant/sessions/:id` | `AssistantSession` | one conversation of the assistant panel, projected from the `assistant_message` events of that session id, on either store. `404` for a session nobody holds |
| GET | `/api/v1/run/:id/execution` | `PaymentExecution` | what this run did on the payment rail, folded out of the ledger. `current` is accepted as the id. A run nobody has executed answers `200` with `lines: []` and `totals` at zero, because "nothing has been sent" is an answer and a `404` there would read as "no such run" |
| GET | `/api/v1/payments/:id/receipt` | `PaymentReceipt` or `application/pdf` | the receipt of one payment. `:id` is the `receiptId` the execution line carries. JSON by default and the PDF on `Accept: application/pdf` or `?format=pdf`, and the two are the same object. See "The receipt and the carta" below |
| GET | `/api/v1/instructions/:id/carta` | `application/pdf` | the one-page evidence letter of one instruction: the seven signals, the level with its findings, the state, the decision and the name against it. See "The receipt and the carta" below |
| GET | `/api/v1/run/:id/layout` | `text/csv` | the dispersal file of the released lines, for a clerk whose bank has a portal and no API. Exactly the lines `POST .../execute` would send, through the same `planRunExecution`, because a file that held a line the run would not send would be the control bypassed by an export button. Nothing is appended: writing a file sends nothing. `X-Layout-Lines` carries the count |
| GET | `/api/v1/rails` | `{ active, rails, message? }` | which payment rails this server holds, which one is active and which of them has ever moved money. No key, no secret, no account. See "Which rails this server holds" below |

`PaymentRun` = `{ id, weekOf, totals, items: Array<{ instruction, supplier, decision, findings, confidence, confidenceRule, confidenceFindingIds, state, stateRule }> }`. The last five are the level and the state, derived and never stored, and they are specified under "Confidence and state" below.

`totals` answers in line counts and in pesos, because the value of the product is the loss it prevents and not the minutes it saves. Counts: `instructions`, `held`, `toVerify`, `released`, plus the eight of the level and the state, `confiable`, `precaucion`, `alerta`, `rojo`, `cancelado`, `enviado`, `pendiente` and `liberado`, from `runLevels` in `packages/core/src/levels.ts`. Pesos, all MXN and exact to the centavo, from `runMoney` in `packages/core/src/exposure.ts`: `amount` (the whole run), `heldAmount`, `toVerifyAmount`, `releasedAmount`, `stoppedAmount` (held plus to verify, the money that has not left), `amountAtRisk` (the largest single amount at risk on each line, added across lines, never the sum inside a line), `retroactive69bBase` and `retroactive69bExposure` (the subtotal already deducted to the suppliers this run's 69-B findings name, and the ISR plus IVA that reverses on it). The last two are zero until a publication has priced a supplier this run pays, and `POST /api/v1/sat/publish` is what prices one: it re-scores the pending lines of the current run in the same request, so the pair climbs as the list lands rather than after somebody reloads something. The whole-ledger figure for one publication is `SweepResult.totalExposure` on that endpoint, and this pair is the part of it the run in front of the clerk carries. Each supplier is counted once however many lines of the run pay it, because the sweep prices per supplier.

### The lookup box, in detail

`GET /api/v1/sat/lookup?rfc=` is the only endpoint that reads real data, so it is specified here rather than left to the table.

- The RFC is normalised before validation: upper-cased and stripped of spaces, dots, slashes, underscores and hyphens. `&` and `Ñ` are kept, because both are legitimate in the name portion of a moral person's RFC. `rfc` in the response is the normalised form, so the screen echoes what was searched.
- `listed` is true only when the newest situation is `presunto` or `definitivo`. A taxpayer who was published and then cleared their name is not listed, and `entries` still carries the whole history so a clerk can see both rows.
- `effective` is the newest row, absent when the RFC appears on no version we hold.
- `source` names the snapshot that answered: `{ article: "69-B", listVersion, retrievedAt, url, taxpayers, rows }`. It is present on an empty answer too, so "not listed" can never be read as "no list was loaded".
- `lists` is the whole answer, one block per SAT list, and the four keys above are the 69-B block repeated at the top level so nothing that already read them breaks. Every block carries `article` and `answered`.
  - `{ article: "69-B", answered: true, listed, entries, effective?, source }`. It answers from the committed download plus any posted version, which is what the top-level keys say.
  - `{ article: "49 Bis", answered: false, coverage: "not_published_machine_readable", entries: [], note, publications }`. `note` is the sentence in Spanish a screen shows, and `publications` is `{ oficios, taxpayers, firstPublishedAt, lastPublishedAt, surveyedAt, url }`. **`answered: false` is the point of the field.** Article 49 Bis has been in force since 1 January 2026 and the SAT publishes that list one oficio at a time as a DOF note, with no CSV and no open-data dataset: fourteen oficios naming fourteen taxpayers between 10 July and 28 August 2026, counted at the DOF on 2026-09-12. A screen that rendered an empty `entries` as "no esta listado" would claim a check nobody ran, so the block refuses to carry a `listed` key at all. When a machine-readable listing exists the block becomes `{ answered: true, coverage: "loaded", listed, entries, effective?, source }` and nothing else on this endpoint changes. Provenance and the manual steps are in `packages/sat/src/snapshot/README.md`.
- Rate limited per client: 30 requests per minute, answered with `429 rate_limited` plus `Retry-After`. Every response carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`. The counter is per process and keyed on the forwarded client address, which is caller-controlled: it stops one machine enumerating the list, and it is not a defence against a distributed client.
- Nothing on this path touches a synthetic invoice. ADR-0002 keeps a real RFC to this box and to nothing else.

## Write

| Method | Path | Body | Effect |
|---|---|---|---|
| POST | `/api/v1/instructions` | `{ supplierRfc?, cfdiUuids?, clabe?, amount, source, text?, image? (base64), audio? (base64) }` | intake from the QR page. Runs all detectors, stores the instruction, findings and decision, returns them. If `image` or `audio` is present the CLABE is extracted first and `ocrConfidence` set, and a voice-note transcript lands in `text`; a typed `clabe` always wins over one a model read. Extraction is transcription only (`packages/extract`, docs/06 section 6.2.1). A server with no `GEMINI_API_KEY` answers 422 `unprocessable` and says so. |
| POST | `/api/v1/instructions/:id/decide` | `{ action: "hold" \| "verify" \| "release", decidedBy, reason? }` | a person confirms. Appends `decision_made`, carrying `decidedBy`, `decidedByRole` and `reason` on the decision, so a release nobody can explain later is not a thing this product allows. Answers `{ instruction, decision, amountAtRisk, hold }`: `amountAtRisk` is the largest single amount at risk among the findings, stated rather than left to be re-derived, and `hold` is `null` exactly when the action is `release`. `decidedBy` has to be the name on `X-Actor`. The two owner-only shapes are a release over something and a decision on a cancelled line: a `role` that may not do it is `403` and one of them with no `reason` is `422`. `reason` stays optional on every other shape, because an API that refused an ordinary hold with no prose would be refused by the clerk instead, outside the product, where nothing is recorded at all. See "The actor on every write". A line a definitive SAT listing cancelled is the `reopen_cancelled` shape; see "What a definitive SAT listing does" below. |
| POST | `/api/v1/sat/publish` | `{ listVersion, entries: SatListEntry[] }` or `{ simulate: true, rfcs: string[], status? }` | loads a list version (or simulates one for the demo, synthetic RFCs only), runs the retroactive sweep over everything the ledger says is already paid, and re-scores the run. `status` is one of the four `SatListStatus` values and defaults to `presunto`; the demo publishes `definitivo`, which is the status that voids the deductions. Returns `SweepResult` plus `rescored`. See "What a publication re-scores" below |
| POST | `/api/v1/cep/verify` | `{ claveRastreo, date, amount, senderBank, beneficiaryBank, beneficiaryAccount, supplierRfc }` or `{ xml, supplierRfc }` | retrieves or accepts the CEP, checks the Banxico seal, compares the holder name with the supplier legal name, stores the evidence. Returns `{ cep, nameMatch: "match" \| "partial" \| "mismatch", finding }`, where `finding` is the `beneficiary_cep` finding `packages/engine` authors, or `null` when no pending payment goes to that account. See "The CEP, and what verify can prove" below. |
| POST | `/api/v1/instructions/:id/verify-call` | `{ toNumber }` or `{ conversationId }` or `{ outcome, evidence?, recordedBy }` | the verification call to the supplier. `toNumber` rings them through the voice agent and answers `202 { status: "calling", conversationId, script }`; `conversationId` collects a finished call, parses the transcript and appends `verification_call`; `outcome` records a call a person made by hand, and `recordedBy` travels onto the `verification_call` event so that entry carries a name like every other human action. A recorded outcome also carries `hold`, the window and the next step, which is how a `no_answer` answers "what now" in the same response, and that window is three days on a `hold` and one day on a `verify`, from `EXPECTED_DELAY_DAYS`. Never releases a payment: every response that reports a call carries `releasesPayment: false`, and no `decision_made` is ever appended. A `404` or a `400` carries only the error envelope, because there is no call to report. When `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` or `ELEVENLABS_PHONE_NUMBER_ID` is missing it answers `422` with the usual error envelope **plus** a `script` key, so the clerk reads it on their own telephone. |
| POST | `/api/v1/instructions/:id/verify-account` | no body | the one-cent verification, with nobody typing. Sends 0.01 MXN to the account this instruction pays, through the configured rail; appends `cent_sent` with the clave de rastreo the rail answered; resolves the CEP for that clave; and with the CEP in hand runs the beneficiary control and the expected-loss rule and appends `decision_made` signed `system`. Answers `202` with the `VerificationState` it reached synchronously. `404` unknown instruction, `409` when it is already released or blocked, `503` when this server has no rail. See "The cent inside the run" below |
| POST | `/api/v1/seed` | `{ seed?: number, reset?: boolean }` | regenerates the demo company from `seed`, on either store. Dev only, guarded by `ALLOW_SEED=1`, and a 403 rather than a 404 when it is off, because hiding a destructive endpoint makes it harder to notice when a deployment enables it. There is no way to add to the company without replacing it, so `reset: false` is answered `422` rather than ignored: wiping a store for a caller who asked us not to is the one thing here nobody could undo. |
| POST | `/api/v1/assistant/messages` | `multipart/form-data` or `{ sessionId?, text, images?: string[] }` | one turn of the assistant panel. Answers `text/event-stream` with `token`, `tool_call`, `tool_result`, `proposal` and `done`. It reads and it proposes, and it writes nothing but the conversation and, when a screenshot is attached and can be attributed, the ordinary intake that screenshot becomes: no decision, no cent, no payment. Rate limited per client, 20 turns a minute. See "The assistant, and what it may not do" below |
| POST | `/api/v1/run/:id/execute` | `{ instructionIds?, confirm: true }` | the payment run leaves on the configured rail. `202` and `text/event-stream`, one `line` event per payment and a final `done` carrying the `PaymentExecution`. Nothing is sent without `confirm: true` and an `X-Actor`. See "The payment execution" below |
| POST | `/api/v1/run/:id/layout/response` | `{ file: string }` | the file the bank portal handed back after somebody uploaded the dispersal layout. `readLayoutResponse` in `packages/rail` parses it, and each row becomes a `payment_sent` plus a `payment_settled` carrying the clave de rastreo the bank filed, or a `payment_failed` with the portal's own sentence. Answers `{ applied, unknown, execution }`. `422` when the file carries no reference and clave at all, because then there is nothing to record. See "The payment execution" below |

### The actor on every write

Every write carries `X-Actor`, and it is the header that makes the ledger answer "who".

```
X-Actor: role=clerk; name=Lupita Elizondo
```

- Two keys, order free, separated by `;`. `role` is `clerk` or `owner`. `name` is 1 to 120
  characters and is the rest of the pair, spaces included, so a real name needs no quoting; a name
  with a `;` in it is refused rather than truncated.
- A write with no header, an unknown role or an empty name is `400 bad_request` naming the header.
  Not a `403`: nothing about the caller was rejected, the request did not say who was acting.
- Where the body already names a person the two must agree. `decidedBy` on
  `POST /api/v1/instructions/:id/decide` and `recordedBy` on a recorded `verify-call` are the two,
  and a mismatch is `400`, because a decision signed by one name under a header carrying another is
  a record nobody can rely on later.
- `role` is checked on two shapes and `docs/02-persona.md` is why. That page puts a formal
  maker-checker in the anti-persona column: this company has one clerk who assembles the run and an
  owner working elsewhere in the business, and an approval chain it does not have is a control that
  gets bypassed. So `owner` is required for the thing that page says the owner does, approving an
  exception, and there are exactly two of those. Everything else,
  `POST /api/v1/run/:id/execute` included, is the clerk's own work, and a `role` that is not allowed
  to do it is `403 forbidden` with the sentence that says who can.
  1. **A release over something.** `decide` with `action: "release"` on a line whose `confidence` is
     not `confiable`, or on a line the standing decision was holding. The level and not a count of
     findings, because an `info` finding stops nothing: a supplier who was listed and then cleared
     their name carries a row that is history, and asking the owner to approve a payment nothing
     stands against is how a control becomes a formality. `confidenceOf` in
     `packages/core/src/levels.ts` is the same function the chip on the screen reads, and
     `decideRequirement` in `packages/core/src/actor.ts` is the rule.
  2. **Reopening a line the run cancelled.** Any `decide` on an instruction the ledger holds a
     `payment_cancelled` for, whatever the new action is. A cancelled line is closed: the money did
     not leave and the record says so, and putting it back in front of the run is a second decision
     about the same pesos rather than housekeeping. The question is asked of the ledger and not of a
     status column, because a stored status can disagree with the events it was derived from.
- **Both of those need prose.** `reason` stays optional everywhere else, because an API that refused
  an ordinary hold with no sentence would be refused by the clerk instead, outside the product, where
  nothing is recorded at all. On these two it is required and a request without it is
  `422 unprocessable` asking for it: an exception approved with no argument is the record ADR-0002
  says this ledger must never hold. The 403 and the 422 are deliberately two answers, because "you
  may not do this" and "say why" are two different things to tell a person.
- `Actor` is a name and a role and not a user account. SentryOne holds no credentials and no
  session, because a product that asks a clerk to register before it can stop a bad payment is a
  product nobody opens on a Thursday. A deployment that needs authentication puts it in front of
  this API, and the header stays what the ledger records. The header is caller-controlled, so it is
  an identity this product records and not one it verifies, and
  `docs/06-regulatory-privacy.md` section 4.4 says so in those words: the demo identity selector is
  not authentication.
- The actor reaches the ledger, on every event a person caused: `instruction_received`,
  `sat_list_published`, `cep_verified`, `cent_sent` and `verification_call` carry `actor` as of this
  issue, `payment_sent`, `payment_cancelled`, `intake_image` and the `assistant_message` of a
  person's turn already did, and `decision_made` carries `Decision.decidedBy` plus
  `decidedByRole`. Three carry nobody on purpose: `payment_settled` and `payment_failed` are the
  rail answering rather than a person acting, and `cep_awaited` is a wait. Each of them follows an
  event that does carry the name and the clave de rastreo, and putting a clerk on them would read as
  a second action she never took.
- `Decision` grows one field: `decidedByRole`, the capacity the signature was given in, absent on a
  decision the engine signed `system`. It is the field the evidence letter of issue #204 reads next
  to `decidedBy`, and the run constancia prints both under "Quien resolvio cada instruccion". The
  sweep constancia prints who loaded the list version, off the `sat_list_published` event, and says
  "No se cargo desde esta instancia" for the committed official snapshot rather than printing a name
  nobody signed.

### Confidence and state, on every instruction and on the run

Two fields travel with every line of the run, every instruction detail and every assistant answer
about one, and they are the vocabulary of the whole product: a level and a state.

- `confidence` is `confiable`, `precaucion` or `alerta`, from `confidenceOf` in
  `packages/core/src/levels.ts`. **Never a probability and never the word "seguro", in any
  language.** The expected-loss arithmetic is an upper bound on the evidence and says so in its own
  comment, so a figure like 0.73 next to a supplier's name would be a precision nobody earned, and
  "safe" would be a guarantee nobody can give about a transfer that cannot be recalled. ADR-0009 is
  binding on this and ADR-0002 is where it comes from.
- `state` is `rojo`, `cancelado` or `enviado` on screen, from `transactionStateOf` in the same file,
  plus the two the run has always counted internally: `pendiente` for a line nothing has decided and
  `liberado` for a line nothing stops that has not been sent. The three public ones are the team
  decision of 2026-09-12; the internal pair is what stops an honest answer being rounded to a
  colour, because a line nobody has looked at is not green and a release on Wednesday is not
  `enviado` until money leaves on Thursday.
- Both are derived and neither is stored. The rule table is in ADR-0009, the two functions are pure,
  and `0012_assistant_and_payment_events.sql` deliberately adds no column for either: a stored level
  can disagree with the findings it was computed from and a derived one cannot. Same argument
  `holdWindow` made for the deadline it never stores.
- `confidence` always arrives with the findings behind it. `assessConfidence` answers
  `{ level, rule, findingIds }`, the detail panel renders the finding and its evidence chips next to
  the level, and a level with no evidence under it is not a thing this product shows.
- The run carries them per line and in `totals`, as counts: `confiable`, `precaucion`, `alerta`,
  and `rojo`, `cancelado`, `enviado`, `pendiente`, `liberado`. Counts and not an average, for the
  reason `runMoney` gives for never summing an amount at risk inside a line. The three levels add up
  to `totals.instructions` and so do the five states, because every line carries one of each.
- **The five keys, per line.** Every item of `GET /api/v1/run/current` and the body of
  `GET /api/v1/instructions/:id` carry the same five, all derived by `assessLine` in
  `packages/core/src/levels.ts` so the table and the panel cannot disagree about one payment.

| Key | Value |
|---|---|
| `confidence` | `confiable`, `precaucion` or `alerta` |
| `confidenceRule` | which rule of the ADR-0009 table fired: `sat_definitive`, `critical_finding`, `new_account_without_history`, `pending_verification`, `warning_finding`, `no_open_signal` |
| `confidenceFindingIds` | the findings that produced the level, all of them on this line. Empty on `no_open_signal`, and also on a `pending_verification` the engine reached from its own `verify` action with no finding standing open, where the evidence is the action |
| `state` | `rojo`, `cancelado`, `enviado`, `pendiente` or `liberado` |
| `stateRule` | which state rule fired: `executed`, `execution_cancelled`, `verification_blocked`, `sat_definitive`, `stopped_for_a_person`, `execution_failed`, `released`, `undecided` |

- A caller holding a run payload and no folded `VerificationState` still reads row 3 of the state
  table, because a critical `beneficiary_cep` finding IS a blocked verification and `blockedByCep`
  reads it off the line. The run and the instruction panel therefore answer the same state for a
  payment whose CEP named somebody else, which is the disagreement issue #125 cost us once.

### What a definitive SAT listing does, and who can undo it

This is the one rule where the product stops a payment without waiting for anybody, and it is
ADR-0009 row 4. The two halves meet on the ledger and nowhere else: this section writes the
cancellation, and "The actor on every write" above owns who may undo it.

- **It cancels, it does not hold.** A supplier published as `definitivo` under article 69-B, or named
  in a final resolution under article 49 Bis, has comprobantes with no fiscal effect, retroactively.
  There is nothing for a clerk to sit out, so the line reads `cancelado` with
  `stateRule: "sat_definitive"` and not `rojo`.
- **It lands on the ledger.** `POST /api/v1/sat/publish` appends one `payment_cancelled` per line the
  publication made definitive, after the `decision_made` it already appended, so a replay reads as the
  publication and then its consequences. `POST /api/v1/instructions` does the same for an instruction
  that arrives naming a supplier already listed. `reason` comes from `definitiveListingReason` in
  `packages/core/src/levels.ts` and names the article, the list version and the publication date.
  `actor` is absent: nobody dropped the line by hand, and that field is optional for exactly this case.
- **Once per line.** A second publication naming the same supplier re-scores the pesos and appends no
  second cancellation, because `RescoredLine.cancellation` is null unless this publication is what made
  the listing definitive. An append-only ledger with two cancellations of one line would read as two
  events where there was one.
- **That event is what makes the line the owner's to reopen.** `deps.repo.cancellation` reads it and
  `decideRequirement` answers `reopen_cancelled`, so any `decide` on the line needs `role=owner` and a
  written reason. The rules, the status codes and the sentences are in "The actor on every write"
  above; nothing is repeated here, because two places that state one rule is how they start to differ.
- **Nothing is deleted when an owner does reopen it.** The `payment_cancelled` stays on the ledger next
  to the `decision_made` that carries the name and the argument, and the line then reads `liberado`
  because `releasedByAPerson` makes the signature outrank the listing. A `hold` or a `verify` by the
  owner leaves it `cancelado`, since only a release is a release. ADR-0002 forbids the product
  overruling a person in either direction, and it forbids the reverse just as firmly.

### What a publication re-scores

`POST /api/v1/sat/publish` does two things and only the first one used to be written down. It loads
the list version and prices what the ledger says is already paid to the suppliers it names, which is
the retroactive sweep and answers `SweepResult`. Then, in the same request, it re-scores the run.

- **What is re-scored.** The lines of the current run whose supplier the publication names and whose
  decision is still pending. For each one the six controls run again, this time with the sweep on
  `ComposeInput.sweep`, so the `sat_69b` finding carries `deductedBase` and `retroactiveExposure`;
  those findings are stored and `decide` reaches the action again.
- **What is not.** A released line, because that is money the run already let go, and a line a person
  decided, because that decision has their name on it and is not the engine's to overwrite. A decision
  the engine signed `system` is re-scorable, since a second publication is new evidence and the
  engine's own earlier verdict is not somebody's signature.
- **What it appends.** `sat_list_published` first and then one `decision_made` per re-scored line,
  signed `system`, in that order, so a replay a year later can never show a payment re-decided by a
  list that had not been posted. Every one of them goes out on `GET /api/v1/events`, which is what
  makes the run screen move while the list publishes.
- **What the response adds.** `rescored`, one row per line that moved:
  `{ instructionId, supplierRfc, before, decision }`, with `before` null when nothing had decided the
  line. It carries no pesos of its own, because the exposure is priced per supplier and one supplier
  can sit on several lines of the same run: a figure per line would invite adding the same voided
  deductions twice. An empty array is an ordinary answer, not a failure.

Findings are added and never replaced, so a line listed as `presunto` in August carries that row next
to the `definitivo` one published today. That is history rather than duplication, and
`totals.retroactive69bBase` still counts the supplier once because `runMoney` keys the pair on the RFC.
The decision that follows is the ADR-0002 amendment of 2026-09-12: the number lives in the stored
findings, not in a read-time join, because two sources of one figure is what
`packages/core/src/exposure.ts` exists to prevent. Issue #175.

### The CEP, and what verify can prove

`POST /api/v1/cep/verify` is the endpoint most able to make a claim it has not earned, so the three
ways into it and the one thing it refuses to say are written out here rather than left to the table.
All four steps live in `packages/cep` and the finding comes from `packages/engine`; `apps/api` only
decides which way applies. `src/cep.ts` holds that wiring.

- **A pasted CEP is always accepted.** `{ xml, supplierRfc }` is parsed by `parseCep` and needs no
  key, no certificate and no network, so it works on a laptop with an empty `.env`. This is the
  primary path and the one the demo uses: a clerk downloads the XML their own bank or
  banxico.org.mx/cep handed them and pastes it. The registry is not consulted, because a person
  pasting a document is handing us evidence rather than asking what we already hold.
- **The `claveRastreo` form reads the registry first and the portal second.** An account a one-cent
  probe already verified is answered from what we hold, so the demo does not depend on a public
  government service being up. Only a miss reaches Banxico.
- **Retrieval from Banxico is opt-in, with `ALLOW_CEP_FETCH=1`.** The portal is an undocumented
  two-step form behind a CAPTCHA and a per-address rate limit (`packages/cep/src/fetch.ts` says so
  at the top), so an API that POSTed to it on every click would be worse for the demo and worse for
  the service. With the flag off, a miss answers `422` naming the flag and telling the clerk to paste
  the XML. With it on, the portal's four known failure sentences come back as `422` with a sentence a
  clerk can act on, and never as a `500`.
- **It is not a lookup over other people's payments**, which is the product rule in
  `docs/06-regulatory-privacy.md` section 6.4. The body the portal needs is the date, the clave de
  rastreo, both participants, the beneficiary account and the exact amount to the centavo, and that
  is confidential information only a party to the transfer holds. The endpoint takes no broader
  query, so there is no shape of request that turns it into a general search.
- **The seal is checked when, and only when, `BANXICO_CEP_CERT_PEM` is configured.** The CEP carries
  the serial of the Banxico certificate and not the certificate itself, so `verifySignature` has to
  be handed one out of band. With none, the document keeps the `signatureValid: false` and
  `signatureReason: "not_checked"` that `parseCep` wrote. What never happens is a
  `signatureValid: true` nobody earned.
- **`not checked` is not `invalid`.** `not_checked`, `unconfirmed_scheme` and `invalid_certificate`
  all mean the seal could not be proven, and the UI renders them as "firma no verificada"; only a
  defect in the document itself (no `sello`, a `sello` that is not base64 or not RSA-2048, no
  `cadenaCDA`) or a `signature_mismatch` reads as invalid. `UNPROVEN_SEAL_REASONS` in
  `packages/engine/src/beneficiary.ts` is where that line is drawn, and the severity of the finding
  follows it: accusing a supplier's document because this server holds no certificate would be our
  mistake printed as their fault.

### The cent inside the run

`POST /api/v1/instructions/:id/verify-account` is control 5 with the person taken out
of it. Before it, the beneficiary check was a procedure with a button on top: somebody
sent one cent from the company's bank, read the clave de rastreo off a statement,
typed it into `POST /api/v1/cep/verify`, and SentryOne did the rest. Mexico has no
confirmation-of-payee API and the Banxico CEP is the only document a central bank
signs about who held an account, so the cent stays. What goes away is the typing.

**The pipeline, in the order it runs.** `packages/rail` sends 0.01 MXN and answers with
the clave de rastreo it filed the transfer under; `cent_sent` is appended. The CEP for
that clave is looked for in the order the section above describes: the verified
beneficiary registry, then the CEPs committed to this repository indexed by clave, then
the Banxico portal and only with `ALLOW_CEP_FETCH=1`. With no CEP yet, `cep_awaited` is
appended and a bounded poll keeps asking (`CEP_POLL_INTERVAL_MS`, default 3000, and
`CEP_POLL_DEADLINE_MS`, default 60000, and zero on either disables the background
work). With the CEP in hand the registry row is stored, which is what ARMS control 5 for
that account, the six controls run again over the instruction, and `decide` in
`packages/core` chooses the action. Nothing in `apps/api` authors a finding or weighs a
peso.

**The state machine.** `GET .../verification` answers `VerificationState` from
`packages/core/src/domain.ts`, folded out of the ledger and never stored as a row.

| `state` | What it means |
|---|---|
| `not_started` | no cent has been sent for this instruction |
| `cent_sent` | the rail accepted the probe and the ledger holds its clave de rastreo |
| `awaiting_cep` | the cent is out and Banxico has published no CEP for that clave yet. A CEP appears once the transfer settles, so this is a wait and not a failure |
| `cep_signed` | the CEP is in hand and the payment is still stopped for some other reason. The decision says which |
| `released` | the engine released it: nothing stops this payment. It does NOT mean SentryOne paid anything |
| `blocked` | the CEP contradicts the documents: the beneficiary control came back critical, so the payment does not leave on this evidence |

`blocked` and the engine's own action are two different fields on purpose. The action is
`hold` when the evidence is provable on its own and `verify` when a person has to
confirm it, and the state machine reports `blocked` for both, because from the clerk's
side the money has stopped either way. A `decision_made` a PERSON signed is never read
as a verification outcome: `POST /decide` is their call and is recorded as theirs.

**Status codes.** `202` and not `200`, because on a real rail the CEP is published after
the transfer settles and the work this call started is not finished when the response is
written; the body says how far it got. `409` once the instruction is released or blocked,
because a second cent costs another centavo and proves nothing new. `503` when this
server has no rail, with a message naming `RAIL`, `NESSIE_API_KEY` and the `STP_*`
variables, and the same `503` when there is a rail and it refused the cent: nothing about
the request was wrong in either case, and nothing is appended, because a `cent_sent` for a
cent that never left is the one entry this ledger must not hold.

**What is claimed and what is not.** `sealState` is `valid` only when
`BANXICO_CEP_CERT_PEM` verified the sello; otherwise it is `not_checked`, which the UI
renders as "firma no verificada" and never as valid, and `invalid` is reserved for a
defect in the document itself. The `cent_sent` event carries `simulated`, true only for
the in-process rail the suite and `bun run demo` use, so a probe nothing sent can never
be read later as a transfer that settled. The rail writes no name, no CLABE and no
amount other than the cent into anybody else's system, and the ledger event carries four
digits of the account rather than the CLABE.

**Which parts are the Nessie mirror and which are Banxico.** `RAIL=nessie` records the
cent as a withdrawal on the company's bank mirror with our own team key. Nessie is a
sandbox and not a bank: no pesos move and no CEP is produced, and a cent sent that way
cannot even build a portal query, because Nessie is not a SPEI participant and has no
clave SPEI. It proves the flow and nothing about the pesos. Which account it lands on is
stated rather than assumed: our key holds two accounts under the mirror nickname, the
rail takes the first one `GET /accounts` answers, and on 2026-09-12 that was
`3fce172e-1591-43b8-b112-08e4491e3651`, the account abandoned during development in issue
#45, and not `ad2841a5-c274-47e4-84c8-e830667feea6`, the mirror `bun run nessie:mirror`
keeps reconciled. Nothing downstream reads the probe as reconciliation evidence, because
`bank_reconciliation` reads `ledger_tx` and the pipeline hangs off the clave de rastreo.
`RAIL=stp` is the rail that produces a Banxico-signed CEP, it is written out in
`packages/rail/src/stp.ts` with its `registraOrden` request, its cadena original and its
RSA signature, and it refuses to run without `STP_*` configuration, so nothing here can
pretend to be live. The CEP side is the same seam the pasted-XML path uses.

### The assistant, and what it may not do

`POST /api/v1/assistant/messages` is the panel Lupita types into, and it is the endpoint most able to
become the thing ADR-0002 and ADR-0004 forbid, so the boundary is written out here and argued in
ADR-0007.

**What it is.** A reader and a proposer. It reads what the engine already computed, it answers in
Spanish, and it ends a turn with at most one `ActionProposal`: the one-cent verification, the call,
a decision, the run, or an intake. A person presses the button, the ordinary endpoint runs, and the
ordinary ledger event is appended with their name on it.

**What it is not.** It is not in the decision. No level, no action, no finding, no amount and no
ranking on any screen of this product comes from a language model: `confidenceOf`,
`transactionStateOf`, `decide` and the six controls are deterministic and unit-tested, which is the
answer to "is this a wrapper around a language model" that can be given by running the suite rather
than argued. A model that returned `alerta` would be a different product and a worse one.

**The request.** `multipart/form-data` with `text`, an optional `sessionId` and zero or more `images`
parts, or the same thing as JSON with base64 images. Every write on this endpoint carries `X-Actor`
like every other write, and a turn with no actor is `400`. A new `sessionId` is minted when none is
sent and comes back on the first event. Images are the reason the panel exists: the clerk drops the
screenshot she already received on WhatsApp, and `intake_image` records the reference, the media type
and who dropped it. The bytes are never on the ledger.

**What a screenshot becomes.** The image goes to `packages/extract`, which transcribes it and
nothing else, and then the supplier is attributed deterministically: the transcribed account against
the accounts this company has already paid, and then the payee as written against the legal names of
the suppliers in the run, with `nameMatch` from `@hackmty/cep` and only on an exact match. When that
answers, the instruction is created through `POST /api/v1/instructions`, in process, the same handler
the QR page posts to, so the six controls that run are the six controls, and the reply carries the
card the endpoint answered: the level, the state and the findings behind them. When it does not
answer, nothing is created and the turn ends with an `intake` proposal carrying what was read, for a
person to complete. No model is ever asked who is being paid.

**The stream.** `text/event-stream`, and five event names:

| `event` | `data` | When |
|---|---|---|
| `token` | `{ text }` | the answer, as it is written |
| `tool_call` | `AssistantToolCall` with no `result` | a read started |
| `tool_result` | `AssistantToolCall` with `result` or `error` | that read answered |
| `proposal` | `ActionProposal` | the turn offers an action, at most one |
| `done` | `AssistantMessage` | the whole stored turn, which is what the session replays |

Every `data` also carries `sessionId`, which is how a minted session id reaches the client on the
first event without a sixth event name existing to carry it. `done` carries it inside the
`AssistantMessage` it already had. A client that reads only the columns above is unaffected.

`token` is our chunking of a finished answer and it is stated here rather than implied: a
function-calling turn is several round trips to the provider, only the last one writes prose, and
the call is not streamed. `tool_call` and `tool_result` are live, and `done` is the stored turn.

**The tools are reads, and the type says so.** `AssistantTool` is the whole list (`get_run`,
`get_instruction`, `get_supplier`, `get_verification`, `get_execution`, `get_receipt`,
`sat_lookup`, `consortium_signal`, `get_metrics`) and `AssistantToolCall.readOnly` is the literal
`true`, so a tool that writes cannot be expressed in the contract at all. `result` is
`Record<string, EvidenceValue>`, the same evidence the finding panel renders as chips, so nothing
a model wrote arrives dressed as a fact.

Every one of the nine is a GET this API already serves, called in process through the very handler
the web app calls over the wire, which is what stops the panel telling a clerk something the screen
next to it cannot show. `consortium_signal` is asked for by `instructionId` and not by the pair the
endpoint takes, because every account the model has ever seen came back masked to four digits: a
tool that asked it for eighteen could only be answered by inventing them, and the pair is resolved
inside this process instead.

**What a turn cost.** The `assistant_message` ledger event of an answer carries `AssistantUsage`:
the prompt and output tokens the provider billed, the model that answered, how many round trips the
turn took, and `costMxn`, computed from the token prices and the Banxico FIX that
`docs/06-regulatory-privacy.md` section 6.4 stamps with their dates. A person's turn carries none,
because typing a question costs nothing. Summing the column is how the cost question is answered
with rows instead of with an estimate.

**What leaves the perimeter.** The clerk's own sentence with every account in it masked to four
digits, and the evidence of the reads the turn performed, also masked. Never the CFDI ledger, never
a CLABE in full, never an XML or a CEP seal, never the bank mirror and never another company's data
from the consortium, which only ever answers counts and dates about a hashed pair. The image is not
sent to this model at all, which is narrower than ADR-0007 permits: it goes to `packages/extract`,
which transcribes it and nothing else. `docs/06-regulatory-privacy.md` section 6.2.1 holds the
extraction rule, section 6.4 holds this one and the cost, and ADR-0007 holds the boundary.

**Status codes.** `200` with the stream once the turn starts. `400 bad_request` for an empty `text`
with no image, or an actor header that does not parse. `404 not_found` for a `sessionId` nobody
holds. `422 unprocessable` on a server with no model configured, naming the variable: the panel is
not the product, and a server without it still answers every other endpoint. `429 rate_limited` per
client, like the lookup box.

### The payment execution

`POST /api/v1/run/:id/execute` is the one endpoint in this product that moves money that is not a
cent, and `GET /api/v1/run/:id/execution` is how the screen follows it.

**Nothing leaves without a person.** `confirm: true` in the body and a valid `X-Actor` are both
required, and a line is sent only when nothing stops it: a `hold`, a `verify`, a `blocked`
verification or a definitive SAT listing keeps it out, and `instructionIds` can only narrow the set
further, never widen it past what the decisions allow. A request that names a held line is
`409 conflict` and says which one, because silently dropping it would let a clerk believe they paid
somebody they did not.

**Nothing is sent twice.** Idempotence is per instruction and not per request: a line the ledger
already says was paid reads `enviado` through the same `transactionStateOf`, so it is never offered
to a rail again. That includes a `payment_sent` this endpoint did not write, which is every SPEI the
company sent from its own banking portal before ADR-0008, and it is why the run is read against the
whole ledger and not only against its own events. A line released after a first execution is new
work and goes out on the second call; a run with nothing left to send is `409`.

**The response.** `202` and `text/event-stream`: on a real rail the transfer is acknowledged after
the response is written, so the work is not finished when the status code is chosen. One
`event: line` per payment carrying a `PaymentExecutionLine`, one `event: skipped` per line the run
deliberately left alone, then one `event: done` carrying the whole `PaymentExecution` and nothing
wrapped around it. Every `line` is also an ordinary ledger event on `GET /api/v1/events`, so a second
screen watching the run moves with the first.

A `skipped` row is `{ instructionId, amount, state, rule, reason }` and it is on the stream rather
than in `PaymentExecution`, because a line nobody released was never part of what the run did on the
rail: it is on the run screen, `rojo`, in front of a person. What a clerk watching the execution
needs is to see that it was left out on purpose rather than lost, and `rule` is the row of the
ADR-0009 state table that decided it, so the answer is auditable against the table. Nothing is
appended for a skipped line: a `payment_cancelled` against a line nobody released would claim the
run made a decision that nobody made.

**A `cancelled` line is a statement and a `skipped` one is not.** The run cancels exactly the line
whose decision says release and whose evidence says no: a definitive SAT listing nobody signed a
release over, or a beneficiary verification that came back blocked. That is a `payment_cancelled`
with the reason on it and no actor, because the evidence dropped the line rather than a person. A
line the run already cancelled is not cancelled again on a second call.

**The five line states.** `queued` accepted and not yet sent, `sent` gone, `settled` acknowledged by
the rail, `failed` refused with a sentence a clerk can act on, `cancelled` dropped before anything
was sent. `sent` and `settled` are two different claims and this API never collapses them: a
transfer is acknowledged when the rail says so and not when we asked.

**Status codes.** `202` with the stream. `400` for a missing `confirm`. `403 forbidden` for a role
that may not do it. `404` for a run nobody holds. `409` for a run already executed, or for a request
naming a line the decisions stop. `503 service_unavailable` when this server has no rail, with the
message `packages/rail` wrote, naming `RAIL`, `NESSIE_API_KEY` and the `STP_*` variables. On a `503`
nothing is appended, because a `payment_sent` for a payment that never left is the one entry this
ledger must not hold.

**Which rail, and what that proves.** `RAIL=nessie` writes the run to the company's bank mirror,
which is a sandbox and not a bank: no pesos move, no CEP is produced, and a receipt from that rail
carries `sealState: "not_checked"` for the honest reason that there is no Banxico document to check.
`RAIL=stp` is the rail that produces a signed CEP and it refuses to run without `STP_*`. The README
in `packages/rail` says which one has run live, and `GET /api/v1/rails` answers the same thing over
HTTP.

**What `settled` means on the mirror, stated so nobody has to shorten it.** The `status` on a Nessie
row is the one we posted: the sandbox echoes it back unchanged, so it can never be the sandbox
acknowledging anything, and writing "completed" there would be us signing a settlement on our own
behalf. What the sandbox can answer is whether the row is on the account, and that is the second
question `confirm` asks: one listing for the whole run, and a line it answers becomes `settled`.
That is the strongest thing a sandbox can acknowledge, no pesos moved, and the receipt still reads
"firma no verificada". A listing that fails is nothing confirmed rather than a failure, so those
lines stay `sent`. `StpRail` offers no `confirm` at all and that is the honest answer rather than an
omission: the proof an STP order became a transfer is the CEP Banxico publishes for its clave, and
asking STP to restate its own acceptance would be the same claim twice wearing a different name.

**The outflow reaches the company's own statement.** A sent line is written to the bank mirror as a
`LedgerTx` debit, keyed on a uuid derived from the clave de rastreo, because that is what lets
control 6 reconcile the payment instead of reporting it as `payment_not_in_mirror`. The row names no
payee, exactly like the rail's own row, and a second write of the same transfer is the same row: two
rows for one payment is control 6's `cfdi_paid_twice` finding raised by our own bookkeeping.

**The file path, for a company whose bank has a portal and no API.** `GET /api/v1/run/:id/layout`
hands over the dispersal CSV of exactly the lines the execution would send, through the same
`planRunExecution`, and `POST /api/v1/run/:id/layout/response` reads the file the portal hands back
and records the clave de rastreo per line. The rule the package is built on survives it: the clave
arrives from the bank and never from a keyboard, and a row the portal reports as paid with no clave on
it is dropped rather than recorded. The layout itself is generic, six columns every portal asks for,
and `packages/rail/README.md` says plainly that no named bank's exact file has been seen.

**There are two dispersal files in this repository right now, and that is one too many.**
`apps/web/src/lib/payments.ts` builds one in the browser, which is what the export button on the
payments screen downloads and what works with the API unplugged, and it carries the instruction id,
the legal name, the RFC, the bank, the CLABE, the amount and the CFDI. The endpoint above builds the
other, and its extra column is the one that makes the round trip close: a numeric `referencia` per
line, which is what a portal echoes in its response file and therefore what
`POST .../layout/response` joins the clave de rastreo back on. The browser file cannot be answered,
because nothing in it is the reference the bank will hand back. TODO(FabriBanda): point the export
button at `GET /api/v1/run/:id/layout` and keep the browser builder as the offline fallback only, or
say that the response path is not wanted and this endpoint goes. Two column orders for one bank file
is the kind of thing a judge finds by downloading both.

### The receipt and the carta

Two documents, one per payment and one per instruction, and both exist because the accountant files
paper and reads it again when the SAT asks.

- `GET /api/v1/payments/:id/receipt` answers the `PaymentReceipt` as JSON, and the same object as a
  PDF on `Accept: application/pdf` or `?format=pdf`. It carries what left, to whom, under which clave
  de rastreo, on which rail, against which CFDI, and who executed the run.
- `GET /api/v1/instructions/:id/carta` is the one-page evidence letter of issue #196. It is the page a
  clerk attaches to an email when a supplier asks why the payment has not arrived, which is why it is
  one page and not a constancia, and the page count is asserted by a test rather than intended. It
  carries, in this order: the instruction with its supplier, amount, CFDI and how it arrived; the level
  with the rule behind it and the state, plus the sentence that the level is the evidence we hold and
  not a guarantee; the seven signals; the resolution with the action, the person who signed it, when,
  and their written reason; every finding's explanation in plain Spanish; and the SHA-256 huella of the
  ledger range with the note that it is not an electronic signature.
- **The seven signals, and none of them is ever blank.** Both SAT lists (article 69-B from the versions
  this instance holds plus the committed download, article 49 Bis with the reason it could not be
  consulted when no machine-readable listing exists), the account with its participant and its plaza
  code, the payment history behind that account, the CEP with its seal state and the holder-name
  comparison, the verification call with its outcome, and what the clerk uploaded. A control that could
  not answer prints why. A blank next to a control reads as a control that passed, which is the failure
  `CompositionReport` prevents inside the engine and the same failure a letter can commit on paper.
- **No number about the risk, on any of it.** The level is one of three words, and the expected loss,
  the delay cost and the transcription confidence are all absent from the page: they are the engine's
  own arithmetic, and a figure next to a supplier's name on a document this company signs is a
  precision nobody earned. ADR-0009 forbids a probability, a percentage or a score on any document of
  this product.
- **The seal is `SealState` and never a boolean.** A receipt printed on a server with no
  `BANXICO_CEP_CERT_PEM`, or for a rail that produces no CEP at all, says "firma no verificada", and
  `valid` appears only when a sello actually validated. A document that claimed a seal nobody checked
  would be the one lie that costs the most.
- **Four digits, not eighteen.** The beneficiary account on a receipt is `beneficiaryAccountLast4`. A
  document that leaves the building does not need the rest, which is the same rule the `cent_sent`
  ledger event and the verification call already follow.
- Headers and the digest are the ones "The constancias" above already sets: `application/pdf`,
  `Content-Disposition: inline` with a filename, `Cache-Control: no-store`, the SHA-256 huella of the
  ledger range with the sentence that it is not an electronic signature, and the synthetic watermark
  from `synthetic: true` on the record.
- A payment or an instruction this instance never held is `404 not_found`. A receipt for something
  that does not exist would be a fabricated document.

### Which rails this server holds

`GET /api/v1/rails` answers `{ active, rails, message? }`, and it exists so a screen can say which
rail is live without reading an environment file it cannot see.

- `active` is the `RailId` this process resolved, or `null`. `message` is present only when it is
  `null` or when `RAIL` names something this build does not have, and it is the sentence
  `packages/rail/src/resolve.ts` already writes for each case.
- `rails` is one row per rail this build has: `{ id, configured, producesCep, live, detail }`.
  `configured` is whether the variables exist and **never what they contain**: no key, no account, no
  fingerprint. `producesCep` is false for `nessie` and true for `stp`. `live` is whether that rail has
  ever actually moved money from this repository, read off the README in `packages/rail`, so a screen
  cannot claim the production path has run when it has not.
- No secret is ever in this payload. That is the whole reason it is a separate endpoint rather than a
  field on `/health` that somebody extends without thinking.

### Health, and what it may not check

`GET /health` stays liveness and grows a block that says what this instance was configured with.

- `{ ok: true, service, version, dependencies }`. `ok` is liveness and it is `true` whenever the
  process can answer, because a load balancer that restarts the container when the Banxico portal is
  slow takes the demo down for a reason that has nothing to do with the demo.
- `dependencies` is one row per capability: `database`, `nessie`, `rail`, `consortium`, `cep`,
  `extraction` and `voice`, each `{ configured, state, detail?, checkedAt }` with `state` one of `up`,
  `down` and `not_configured`. `not_configured` is a statement about this deployment and is never
  reported as a failure, which is the same distinction `503 service_unavailable` draws against `403`.
- **It may not touch the network.** No Nessie call, no Banxico fetch, no Snowflake query: a health
  check that depends on a third party is a health check that lies at 04:00, which is what the route
  comment in `apps/api/src/routes/health.ts` has said since the first day. `database` is the one
  dependency that may be probed, with a bounded `select 1`, and it reports `down` with a sentence
  rather than hanging.
- No secret, no connection string, no key fingerprint. `configured` is a boolean.

### The consortium, and what the network can say

`GET /api/v1/consortium/signal?rfc=&clabe=` is the second endpoint able to make a claim it has not
earned, so its three states are written out here rather than left to the table. Everything it
answers comes out of the local `consortium_snapshot` table, filled by `bun run consortium:pull`; the
plumbing lives in `packages/consortium` and its README carries the privacy argument in full.

- **It is never on the hot path.** The engine reads the same snapshot through the repository, so a
  payment decision never waits on a warehouse and the demo works with the network unplugged. That
  is a property a judge can test by unplugging it.
- **`503 service_unavailable` names the flag.** With `ALLOW_CONSORTIUM` unset the route exists and
  this instance will not answer it, which is a different statement from a 404 that pretends the
  endpoint is not there. The message names the variable.
- **`404 not_found` says which of two things happened.** Either nothing has ever been pulled here,
  and the message names `bun run consortium:pull`, or the network was consulted and holds nothing
  for this pair, and the message says that is an answer and not a failure.
- **A `200` with `tenants: 0` is a real answer.** `NetworkSignal.source` separates
  `not_consulted`, which is the network nobody read, from `snapshot`, which is the network that
  answered. Zero tenants on a `snapshot` means the network has never seen this account, and
  `otherAccounts` then says how many accounts it does hold for that supplier, which is the
  impersonation case: forty companies pay this supplier, and none of them pays it here.
- **There is no request shape that lists a supplier's accounts.** Both the RFC and the exact
  eighteen-digit CLABE are required, so only somebody who already holds both can ask, exactly like
  the CEP endpoint. No listing, no prefix match, no "which accounts does this supplier have". The
  rule is `docs/06-regulatory-privacy.md` section 6.4 and a route test asserts all three refusals.
- **Nothing personal is in the answer.** The warehouse holds salted HMAC-SHA256 hashes of the
  normalised RFC and CLABE, a three-digit bank code that is printed on every SPEI receipt, dates,
  counts and one of four outcomes. No name, no amount, no invoice, no clave de rastreo.
- **The network in this repository is synthetic and the docs say so.** SentryOne has one tenant, so
  the other tenants are generated deterministically from seed 69 with `synthetic = TRUE` on every
  warehouse row. The mechanism is real, the other companies are not, and `consortium_pull.source`
  says `snowflake` or `synthetic` so no screen can confuse the two.

### The hold window

`hold` is on the instruction detail and on a recorded verification call, and it is the answer to two
questions a Capital One judge asked at the table on 2026-09-12: what happens if the supplier does not
answer, and what happens if the payment is urgent.

- `{ action, days, deadline, hoursLeft, expired, outcome?, nextSteps }`, computed by `holdWindow` in
  `packages/core/src/hold.ts`. It is never stored: a deadline in a column could disagree with the
  delay the expected-loss arithmetic charged for, and a derived one cannot.
- `days` is `EXPECTED_DELAY_DAYS` for that action, the same table `decide` weighed the expected loss
  against: three days for a hold, one for a verification. The deadline is measured from the
  decision's own `decidedAt`, so a call does not reset it and confirming the decision does, because
  then a person looked at it.
- **The deadline decides nothing.** When it passes, `expired` is true and the payment goes back in
  front of a person. Nothing is released and nothing is refused, which is binding under ADR-0002. What
  the deadline buys is a bound on the retry loop: the call is retried until the window closes, and
  then a person answers instead of the supplier.
- `nextSteps` is ordered, best first, and never empty. `one_cent_cep` is the one worth naming out
  loud, because it needs nobody to answer a telephone. After a `denied` the only step is `keep_held`:
  the supplier said the account is not theirs, and offering "release anyway" next to that would be the
  product arguing against its own finding.
- `null` rather than a zero-hour window when the action is `release`. A payment that was let go is not
  a hold that ran out.

### The blind evaluation, per control and per level

`GET /api/v1/metrics` answers the same `Metrics` the terminal prints, computed by the same function over the same labelled cases, so `bun run eval` and the screen can never disagree.

It carries two views of one evaluation and they answer different questions.

- `perDetector` is what a detector author fixes: did control 2 fire on the case that expected it.
- `perLevel` is what a judge asks: did the line come out `alerta` when it should have. A control can be right and the payment still read `precaucion` when the documents say `alerta`, and the per-control table cannot show that. One case contributes to exactly one expected level and one predicted level, so both columns sum to `cases`. Precision on a level is "of the lines we called this, how many were", recall is "of the lines that were, how many we called".

The row to defend is `confiable`. A line the product called trustworthy and that was not is the one mistake it cannot make twice, and a test on the endpoint fails if that precision ever drops below one.

An `info` finding is scored as context and never as a false positive: a supplier that cleared its name and a beneficiary already verified with a CEP are both good news, and counting them as alerts would report a false-positive rate the product does not have.

### The constancias

Two endpoints answer with a PDF rather than JSON, because the accountant files the document and reads it again when the SAT asks. They are the only non-JSON responses in the API.

- `Content-Type: application/pdf`, `Content-Disposition: inline` with a filename, and `Cache-Control: no-store`. A constancia is a statement about a moment, and a cached one would hand back yesterday's exposure after a new list version landed.
- The sweep constancia carries the company, the list version and its DOF publication date, where the snapshot came from, how many suppliers were checked against it, the newly listed suppliers with their deducted base and ISR plus IVA exposure, and the digest of the ledger range.
- The run constancia carries the company, the run and its week, the number of instructions and the amount reviewed, the resolution counts, one row per instruction and the full explanation of every finding, and the same digest block. Since ADR-0008 it also carries what left the bank: who executed the run, the counts per line state, the pesos that actually went out, and one row per line with its clave de rastreo, which is the column that makes the page worth filing because it is what an auditor asks Banxico about. A run nothing has sent says so in one sentence rather than printing an empty table.
- Both print a SHA-256 digest of the canonicalised ledger range they describe. The page calls it a huella and states, on the document, that it is not an electronic signature: it proves two printings of the same range describe the same facts, and it does not prove who produced the file.
- A version or a run this instance never held answers `404 not_found`. A constancia for something that does not exist would be a fabricated document.
- Synthetic figures are watermarked on the page itself, from `synthetic: true` on the record.

## Streaming

`GET /api/v1/events` is Server-Sent Events. Every appended `LedgerEvent` is pushed as `event: ledger`, so the payment-run screen and the sweep animation update without polling. That includes `cent_sent` and `cep_awaited`: the verification is not on a private channel, and the screen re-reads `GET /api/v1/instructions/:id/verification` whenever an event names that instruction. It also includes the five kinds of issues #195 and #196: `payment_sent`, `payment_settled`, `payment_failed`, `payment_cancelled` and `assistant_message`, so a second screen watching the run moves with the first one and the timeline holds the conversation next to the payments it is about.

Three endpoints stream on their own connection rather than through that one, because each of them is one piece of work a caller started and is waiting on: `POST /api/v1/assistant/messages` (`token`, `tool_call`, `tool_result`, `proposal`, `done`), `POST /api/v1/run/:id/execute` (`line` per payment, `skipped` per line the run left alone, then `done`), and `POST /api/v1/instructions/:id/verify-account`, which answers `202` with the state it reached and leaves the rest to the ledger channel. What those two new streams push is also appended to the ledger, so nothing is only visible to whoever happened to hold the connection.

## Curl a judge can paste

The ids are the seeded ones from `docs/10-demo-script.md`, which `bun run demo` prints. A local
instance is `SEED=sentryone bun run dev` in `apps/api`, which serves the generated company from
memory; with a database it is `bun run migrate && bun run seed` once and then
`DATABASE_URL=postgres://... bun run --filter '@hackmty/api' dev`, which serves the same company
out of Postgres. The boot log says which of the two is live.

```bash
curl -s 'https://<host>/api/v1/sat/lookup?rfc=AAA080808HL8' | jq
# Both SAT lists, and which of the two could answer at all.
curl -s 'https://<host>/api/v1/sat/lookup?rfc=AAA080808HL8' \
  | jq '.lists | map({article, answered, coverage, listed})'
curl -s https://<host>/api/v1/instructions/INS-2026-09-07-047 | jq '.findings[0].evidence'
curl -s -X POST https://<host>/api/v1/instructions -H 'content-type: application/json' \
  -d '{"supplierRfc":"SYN990202S02","amount":38417.48,"clabe":"012180102091764611","source":"whatsapp"}' | jq
curl -s -X POST https://<host>/api/v1/sat/publish -H 'content-type: application/json' \
  -d '{"simulate":true,"rfcs":["SYN080910HI8"],"status":"definitivo"}' \
  | jq '{totalExposure, rescored: [.rescored[] | {instructionId, before, after: .decision.action}]}'
# And the run, which now carries the part of that exposure the suppliers it pays account for.
curl -s https://<host>/api/v1/run/current | jq '.totals | {retroactive69bBase, retroactive69bExposure}'
# The consortium, for one beneficiary pair. Both halves are required, and the answer comes
# out of the local snapshot: this call reaches no warehouse and works with the network down.
curl -s 'https://<host>/api/v1/consortium/signal?rfc=SYN980101S01&clabe=072180100000000007' | jq '.network'
# A CEP the clerk pasted. jq -Rs turns the file into one JSON string, newlines and all,
# because the signature is over bytes and a re-serialised document is a different document.
jq -Rs '{xml: ., supplierRfc: "SYN201123S23"}' packages/cep/src/fixtures/synthetic-cep.xml \
  | curl -s -X POST https://<host>/api/v1/cep/verify -H 'content-type: application/json' \
    --data-binary @- | jq '{nameMatch, seal: .cep.signatureReason, finding: .finding.severity}'
# The one-cent verification. The POST sends a real 0.01 on the configured rail, so on a
# deployed instance it is a write: the GET is the read-only half and answers not_started
# until somebody presses the button.
curl -s https://<host>/api/v1/instructions/INS-2026-09-07-047/verification | jq
curl -s -X POST https://<host>/api/v1/instructions/INS-2026-09-07-047/verify-account \
  -H 'x-actor: role=clerk; name=Lupita Elizondo' \
  | jq '{state, rail, claveRastreo, sealState, nameMatch, action: .decision.action}'
# Which rails this server holds, and which of them has ever moved money. No secret in it.
curl -s https://<host>/api/v1/rails | jq '{active, rails: [.rails[] | {id, configured, producesCep, live}]}'
# What the instance was configured with. Never a key, and never a network call.
curl -s https://<host>/health | jq '{ok, version, dependencies}'
# The actor, which every write needs. A clerk cannot release a payment a finding
# stopped: 403 with the sentence that says who can, and nothing is appended.
curl -s -X POST https://<host>/api/v1/instructions/INS-2026-09-07-047/decide \
  -H 'content-type: application/json' -H 'x-actor: role=clerk; name=Lupita Elizondo' \
  -d '{"action":"release","decidedBy":"Lupita Elizondo","reason":"urge"}' | jq '.error'
# The owner can, with the reason, and the decision carries both the name and the role.
curl -s -X POST https://<host>/api/v1/instructions/INS-2026-09-07-047/decide \
  -H 'content-type: application/json' -H 'x-actor: role=owner; name=Gerardo Villarreal' \
  -d '{"action":"release","decidedBy":"Gerardo Villarreal","reason":"Hable con el proveedor, la cuenta es la suya."}' \
  | jq '{action: .decision.action, by: .decision.decidedBy, role: .decision.decidedByRole, reason: .decision.reason}'
# And with no header at all, the write is refused naming the header.
curl -s -X POST https://<host>/api/v1/sat/publish -H 'content-type: application/json' \
  -d '{"simulate":true,"rfcs":["SYN080910HI8"]}' | jq '.error.message'
# The level and the state of every line of the run, which is the vocabulary of the whole product.
curl -s https://<host>/api/v1/run/current \
  | jq '[.items[] | {id: .instruction.id, confidence, state, action: .decision.action}] | .[0:5]'
# The run by level and by state. Each group adds up to .totals.instructions.
curl -s https://<host>/api/v1/run/current \
  | jq '.totals | {instructions, confiable, precaucion, alerta, rojo, cancelado, enviado, pendiente, liberado}'
# The one-page evidence letter. A real PDF, inline, never cached.
curl -sD - -o carta.pdf \
  https://<host>/api/v1/instructions/INS-2026-09-07-047/carta | head -4
# Reopening a line a definitive listing cancelled. A clerk is refused with a 403 and
# an owner with a written reason goes through. Both answers reach the ledger.
curl -s -X POST https://<host>/api/v1/instructions/INS-2026-09-07-070/decide \
  -H 'content-type: application/json' -H 'x-actor: role=clerk; name=Lupita Elizondo' \
  -d '{"action":"release","decidedBy":"Lupita Elizondo","reason":"el proveedor insiste"}' \
  | jq '.error.code'
# The assistant. It reads, it answers and it proposes: the stream carries the reads as tool_result
# and the offer as proposal, and nothing is written but the conversation until somebody clicks.
curl -sN -X POST https://<host>/api/v1/assistant/messages \
  -H 'content-type: application/json' -H 'x-actor: role=clerk; name=Lupita Elizondo' \
  -d '{"text":"Por que esta en rojo el pago de INS-2026-09-07-047?"}'
# The run leaving on the rail. confirm and the actor are both required, the stream carries one
# line per payment, and a held line is refused with a 409 rather than quietly dropped.
curl -sN -X POST https://<host>/api/v1/run/current/execute \
  -H 'content-type: application/json' -H 'x-actor: role=clerk; name=Lupita Elizondo' \
  -d '{"confirm":true}'
curl -s https://<host>/api/v1/run/current/execution | jq '.totals'
# The receipt of one payment, as the accountant files it. The id is the receiptId the
# execution line carries, and the seal reads not_checked on a rail that produces no CEP.
curl -s https://<host>/api/v1/payments/rcp-NSS43633C642E8B4EAD833CCA4A94B/receipt   | jq '{claveRastreo, rail, amount, sealState, beneficiaryAccountLast4, executedBy}'
# The dispersal file, for a bank with a portal and no API. Exactly the lines the run
# would send, and writing it sends nothing.
curl -s https://<host>/api/v1/run/current/layout
```

## Where the SAT rows a control sees come from

Two sources, and the difference is binding under ADR-0002. `sat_69b` is handed the versions this
instance has been posted, plus the rows the committed official snapshot holds **for that one RFC**.
Every supplier in the seeded company is synthetic and a synthetic RFC is on no real list, so the
official snapshot contributes nothing to any of them and a real RFC never stands next to a
fabricated invoice. What the second source buys is that an instruction naming an RFC that is on the
official list is caught by the control rather than only by the lookup box.

The same control reads a second list. `sat_69b` is control 1 of ADR-0002 and control 1 is the SAT
lists cross-check, so a supplier published under article 49 Bis produces a **second finding** from the
same detector, with an id prefixed `sat49bis:` and `article: "49 Bis"` in its evidence. The detector
id does not change: it is persisted in `decision_findings`, constrained by a CHECK in
`0003_sentryone.sql` and counted per detector by the metrics harness, and ADR-0002 has six controls
rather than seven. A supplier on both lists gets both findings, which is correct rather than
duplication: two statutes voided the same invoices on two different clocks and the clerk has a
complementary return to file under each. The 49 Bis finding names the article, the DOF publication
date, the days left of the thirty natural days of fraccion X and the restriction of the company's own
digital seal under article 17-H Bis fraccion XIV, and it is always `comprobable`, because fraccion X
publishes a resolution that is already final. Today `composeInputFor` adds no 49 Bis rows, because
`official49BisListing()` reports the list as not published in a machine-readable form, so the finding
appears on a seeded instance only when a caller supplies the rows.

## Nessie, verified quirks

HTTPS only. Docs at https://prod.nessieisreal.com/docs, API base https://api.nessieisreal.com. Auth is `?key=` in the query string. Our team key lives in each teammate's local `.env` (never in the repo or the chat); it was validated with a write on 2026-09-12 (POST /customers returned 201). `403 {"message":"Missing Authentication Token"}` means wrong path, not a bad key. An invalid key returns `200 []` on reads and `401` only on writes: validate the key with a write before the demo. Sub-collections live under `/accounts/{id}/{purchases,bills,deposits,withdrawals,loans,transfers}`; there is no top-level `/bills`, `/loans`, `/purchases` or `/withdrawals`. Empty sub-collections are inconsistent (`200 []` or a `404` with a bare string body): map 404 to `[]`. Dates are `YYYY-MM-DD` with no time. `amount` mixes int and float. `_id` mixes UUID and ObjectId. `/enterprise/*` is a shared pool contaminated by other teams: never compute on it. In SentryOne, Nessie is the company's bank mirror: `bank_reconciliation` compares outflows against instructions and CFDIs and flags payments with no document behind them.

Three more quirks, verified with our own key on 2026-09-12 while seeding that mirror. `POST /merchants` wants `category` as a bare STRING and answers `400 category str type expected` for the array that `GET /merchants` hands back. An address `state` may be at most two characters on a create, so "Nuevo Leon" is refused and "NL" is not. And a purchase `amount` is stored as a whole number: a row posted at 31320.50 reads back as 31320, which is why the reconciliation tolerates a shortfall of under one peso per row, and why the exact centavos live in `ledger_tx` and never in the mirror.

### The bank mirror, pushed with our key

`bun run nessie:mirror` seeds the company's bank mirror into Nessie and reads it back. What goes up is the BANK MIRROR and nothing else: one purchase per outflow that has already settled on the company's account, newest `--limit` first, 200 of 2446 by default on seed 69. Never the pending instructions of the current payment run, which have not left the account and have no business on a bank statement. Around those rows it creates one customer built from the trade name, one Checking account ("Cuenta operativa SPEI", whose 16-digit account number is derived from the CLABE and is deliberately not the CLABE), and one merchant per supplier in the `proveedores` category. Purchases and not bare withdrawals: a purchase carries a payee and a withdrawal does not, and a bank mirror with no payee cannot be reconciled against a supplier. In substance these are the settled withdrawals and transfers of the account, dated, signed outwards, with the beneficiary named, and they are the same shape `packages/seed` already builds, so the read-back runs through the same `normalizePurchase` the live import uses. The mirror is read at `GET /accounts/{id}/purchases`. Every date on it is a Monterrey calendar day with no time, because that is all Nessie can hold; the intraday order is ours.

The POST that creates the customer is what validates the key, since an invalid key answers `200 []` on every read. The instant it was accepted goes to the gitignored `.seed/nessie.json` as `keyValidatedAt`, next to `keyFingerprint`: the first twelve hex characters of SHA-256 over the key that made it, never the key. `bun run doctor` computes the same fingerprint over the key in `.env` and is green only when the two agree, because an instant on its own says that SOME key once wrote, which is not what a teammate holding a rotated key needs to hear. The state file also records the `--limit` the account was pushed with, and the verify pass reconciles against exactly that set: a later run with a narrower default must not report the rest of the account as missing days.

`--import` replaces the generator's `ledger_tx` rows for the company account with the rows Nessie answered, scoped by account and by source, and the delete and the insert run inside one transaction so a failure between them cannot leave the company with a ledger shorter than its bank. It needs `--limit=0`, because the import replaces the mirror rather than adding to it, and the imported rows carry the bank's whole-peso amounts. It refuses outright when the push reported failures, when the read-back threw or was partly rejected, or when the reconciliation reported any differing day: a replacement built on a partial push is a ledger that is quietly short of the bank, and every rolling baseline the engine computes off it moves with it.

One kind of row is not mirror history: the one-cent verification writes a WITHDRAWAL,
because the probe must name nobody and a withdrawal carries no payee at all.
Verified on 2026-09-12 with our own key: `POST /accounts/{id}/withdrawals` with
`{medium: "balance", transaction_date: "<Monterrey day>", amount: 0.01, status:
"pending", description: "Verificacion de cuenta SPEI 0.01 MXN"}` answers a row whose
`_id` becomes the clave de rastreo, and the amount reads back as `0` because Nessie
stores a whole number. The exact centavo is in our ledger, like every other amount. No
customer and no account is ever created by that path: the account is one the key already
holds, found by its nickname through `GET /accounts`. Re-read on 2026-09-12 while closing
issue #165, with `GET` only: the key holds 3 customers and 2 accounts, which is exactly
what issue #45 recorded, so the probes created neither. Both probes sit on
`3fce172e-1591-43b8-b112-08e4491e3651` (390 purchases, the account abandoned during
development) rather than on `ad2841a5-c274-47e4-84c8-e830667feea6` (206 purchases, the
reconciled mirror), because the two carry the same nickname and the rail takes the first
one listed. Cleaning that up is the sandbox's problem and not the pipeline's.

A re-seed undoes an import, on purpose and without doubling anything. `bun run seed` loads the company through `PostgresRepository.load`, which deletes the company account's `ledger_tx` rows by account id and writes the generator's mirror back, so after a `bun run seed` the ledger holds the generator's rows with their exact centavos again and `bun run nessie:mirror --import --limit=0` has to run once more to put Nessie's whole-peso rows back. The row count for the account equals the generator's mirror either way.

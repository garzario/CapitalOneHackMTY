# 13. Devpost submission copy

Written at M3 while awake. Pasted at M5. Submission goes to hackmty-26.devpost.com.

**A draft is submitted at M4 and edited until the deadline.** That is the cheapest disaster
insurance available and it removes the 07:50 panic entirely.

Owner: Patricio (`garzario`), drafted for the team to validate. Reviewer and submitter: Fabricio
(`FabriBanda`). Issues #56 and #76. Due M3, draft submitted at M4.

Everything below is submission copy, ready to paste. Cells marked TODO are the ones that need a
value we do not have yet, and a TODO is submitted rather than a guess.

## Tagline

> Stop a fiscally toxic or misdirected supplier payment before the SPEI leaves

76 characters.

## Elevator pitch, the short field

> Ceptinela is the check that runs in the minutes before a Mexican SMB pays its suppliers. It joins
> three things nobody joins at that moment: the company's own invoice ledger, the SAT's official
> Article 69-B list, and the receipt Banxico signs for every SPEI. Each payment comes back hold,
> verify or release, with the evidence on screen and a person deciding.

## The problem it solves

> Thursday is payment day at a 28-person metalworking shop in Apodaca, Nuevo Leon. One
> administrative clerk sends between seventy and a hundred and ten transfers before the bank cutoff,
> with a spreadsheet, WhatsApp and the bank portal. There is no ERP, so there is no supplier
> validation module, no maker-checker and no second pair of eyes.
>
> Two things can go wrong there and neither can be undone. If a supplier is published on the SAT's
> Article 69-B list, the deductions already taken on its invoices are voided retroactively, and the
> exposure is created by a publication that happens after the money is gone. And if the account is
> wrong, the SPEI is final: there is no chargeback for an executed transfer.
>
> The Article 69-B check is public, free and takes a minute. Nobody in this profile runs it weekly,
> because the cadence is the hard part, not the check.

TODO(garzario) verify before submitting: the retroactive effect and its correction window against
the CFF Article 69-B text, and the finality of an executed SPEI against Banxico's published rules.
Cite both in `docs/04-market.md` and keep the wording here aligned with the citation. TODO(FabriBanda):
add one cited market number from `docs/04-market.md`, or leave the paragraph without a number.

## What it does

- Turns the weekly payment run into a triaged list: every instruction carries hold, verify or
  release, sorted by pesos at risk instead of alphabetically.
- Quantifies the retroactive fiscal exposure when the SAT publishes a new list version, by replaying
  the company's own event ledger: which invoices were already paid, the deducted base, and the ISR
  and IVA at risk per newly listed supplier.
- Establishes that a bank account really belongs to a supplier before the first payment, by reading
  the Banxico-signed receipt of a one-cent transfer and comparing the account holder name with the
  legal name on the invoice.
- Explains every finding in plain Spanish with the evidence that produced it, including which digits
  of an account differ from the one that supplier has actually been paid on.
- Reports its own accuracy on labelled cases the detector author never read, per detector, with the
  case count next to every rate.

## How we built it

> A bun and TypeScript workspace monorepo. The intelligence is `packages/core`: six detectors and an
> expected-loss decision engine written as pure, dependency-free functions over one domain contract,
> with no network and no database access, which is why the whole engine runs in unit tests offline.
> `apps/api` is a thin Hono transport that validates, reads and streams, with no business logic in
> it. The spine is an append-only event ledger in Postgres, which is what makes the retroactive
> sweep a replay rather than a recomputation, and Timescale turns that ledger into a hypertable with
> one continuous aggregate, the weekly outflow per supplier that feeds the behaviour detector. The
> web client is a static build that reads the documented HTTP contract and updates from a
> Server-Sent Events stream, which is why an instruction sent from a judge's phone appears on the
> main screen in under two seconds. The data is deterministic synthetic Mexican invoice data with a
> committed seed and a watermark flag on every object. There is no language model anywhere in the
> decision path: scoring is deterministic, auditable and reproducible in a test.

## Challenges we ran into

- **The Nessie sandbox has a shape you have to discover.** Dates carry no time component, so
  intraday ordering had to live in our own ledger. Empty sub-collections answer inconsistently, some
  with `200 []` and `/transfers` with a 404 carrying a bare string body. Amounts mix integers and
  floats and identifiers mix UUIDs with ObjectIds. A 403 means the wrong path, not a bad key. The
  shared enterprise pool is contaminated by other teams, so we never compute on it.
- **A signed XML is byte-exact.** The Banxico CEP signature only verifies against the bytes as they
  were served, so the receipt is stored as `bytea` and never re-encoded on the way in or out. That
  is a one-line decision that would have cost hours to debug later.
- **Server-Sent Events need a long-lived process**, which contradicted our first deploy decision and
  forced an amendment: the web client stays a static build on Vercel and the API moved to a Vultr
  instance next to the database. We kept the original constraint that the API imports no
  runtime-specific modules, so the function runtime is still a live fallback.
- **A continuous aggregate cannot be created inside a transaction**, so the Timescale DDL is its own
  conditionally applied migration, and a hypertable's unique indexes must include the partitioning
  column, which changed our primary keys.
- **Measuring ourselves honestly took more design than the detectors.** The labelled cases are
  written by a different person from the detectors, in a folder the detector author does not open
  until the code is merged, and the thresholds we would refuse to ship at were written before the
  first run.

## What we learned

- **Technical.** Keeping the intelligence free of IO is not a style preference. It is what made the
  retroactive sweep, the blind evaluation and an offline demo the same code path.
- **Product.** The hard part of a compliance check is never the check, it is the cadence and the
  moment. A control that runs at onboarding protects nothing against a list published afterwards.
- **Four people across 36 hours.** Written decisions beat conversations at 03:00. The ADRs and the
  one-file agent contract in this repository are why four people building in parallel did not merge
  four different products.

## What is next

- Measure the false-positive rate against real payment runs in real companies rather than against
  our own hard negatives.
- Ship the accounting-firm view: one screen, thirty companies, since the firm already holds the XML.
- Add the supplier's own side of the verification, so a new account is established once and travels
  with the supplier instead of being re-verified by each of its clients.

## Built with

`bun`, `typescript`, `hono`, `postgres`, `timescaledb`, `react`, `vite`, `tailwindcss`, `vercel`,
`vultr`, `tiger-data`, `server-sent-events`, `nessie-api`, `sat-69b`, `banxico-cep`.

Add `gemini` only if the explanation layer is in the final build. Add `elevenlabs` only if #60 lands.
Keep this list honest and short: a tag for something that is not in the build is the cheapest lie a
judge can catch.

## Prize categories to select

Never select a category we did not genuinely use. A claim a judge can falsify costs more than the
prize is worth. Each row below carries the gate that has to be true at submission time.

| Category | Our honest use | Gate before selecting |
|---|---|---|
| Capital One challenge, track 3, Real-Time Anomaly and Security Sentinel | The whole product: anomaly detection over a payment ledger at the moment of an irreversible transfer | Always. This is the submission |
| Best Use of Tiger Data | The event ledger is a hypertable and the supplier weekly outflow is a continuous aggregate that feeds the behaviour detector (#72) | `0002_timescale.sql` applied on the deployed database and the aggregate actually read by a detector. If we are running on plain Postgres at submission time, do not select it |
| Best Use of Vultr | `apps/api` runs on a Vultr instance because the Server-Sent Events stream needs a long-lived process, with the database next to it (#44) | The deployed API URL in the README answers `/health` over HTTPS |
| Best Use of Gemini API | Plain-Spanish explanation of an already-computed finding, on demand, strictly outside the decision path (ADR-0004) | The explanation endpoint is in the build and a judge can trigger it. TODO(garzario): there is no implementation issue for this yet. If it does not land, do not select this category |
| Best .Tech Domain Name | `ceptinela.tech` pointing at the web deploy (#59) | The domain resolves to the production site |
| Best Use of ElevenLabs | Conditional. A voice call to the supplier to confirm a new account, as a second verification channel (#60, explicitly optional) | #60 is merged and demonstrable. If it is not, do not select it, and do not mention voice anywhere in the copy |

TODO(FabriBanda): at M4, walk this table with the deployed build open and tick only what is live.

## Links and attachments

| Field | Value |
|---|---|
| Repository | https://github.com/garzario/CapitalOneHackMTY |
| Live URL | TODO(fabbyyyy), from #44 and #59 |
| Demo video | TODO(FabriBanda), from #73, hosted per the event's stated requirement |
| Screenshots | Three stills from `assets/screenshots/`: the payment run with the alert rail, the finding panel with its evidence chips, the sweep with its exposure counters |

## Team members to add

| Name | Devpost handle |
|---|---|
| Patricio Garza | TODO(garzario) |
| Fabian | TODO(fabbyyyy) |
| Adan | TODO(Apanawa) |
| Fabricio | TODO(FabriBanda) |

## Submission checklist

- [ ] Draft submitted at M4, not at M5
- [ ] All four teammates added and they confirmed they can see it
- [ ] Every category in the table above passed its gate, checked against the deployed build
- [ ] Video plays from the link in a private browser window
- [ ] Live URL loads on a phone on cellular data
- [ ] Repository is public and the README carries the live URL
- [ ] No real personal data in any screenshot, and the synthetic watermark is visible in at least one
- [ ] Screenshot of the submission confirmation saved

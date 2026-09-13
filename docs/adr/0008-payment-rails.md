# ADR-0008: The run leaves through a rail, and only what SentryOne already holds

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** the team meeting of 2026-09-12, recorded in issue #195; written up by `garzario`
- **Affects:** `packages/rail`, `packages/core/src/domain.ts`, `apps/api`, `apps/web`, `docs/09-api.md`, ADR-0002, ADR-0005

## Context

Until 2026-09-12 SentryOne stopped payments and the SPEI left from the company's own banking portal.
That is defensible and it has one hole the meeting could not get past: if the payment leaves somewhere
else, nothing forces the instruction to exist here, and the honest answer to "why would Lupita upload
the screenshot" is "because we asked her to". A control nobody has to pass is a control that gets
skipped on the Thursday it matters.

The rail also already exists for another reason. `packages/rail` sends the 0.01 MXN verification probe,
because Mexico has no confirmation-of-payee API and the only way to learn who holds a CLABE is to send
a transfer and read the CEP that Banxico signs for it. So the seam that moves money, mints a clave de
rastreo and resolves a CEP is built, tested and, for the Nessie mirror, verified live on 2026-09-12.
What the meeting decided was to send the run through it too.

## Decision

**The payment run leaves through `packages/rail`, and the rail sends only what SentryOne already
holds: one line of one instruction, for exactly that instruction's amount, to exactly the account that
instruction names.**

That sentence is the product argument. The instruction has to exist in SentryOne before any money
moves, so the screenshot is uploaded because it is how the payment gets made rather than because a
policy says so, and every peso that leaves has a CFDI, a decision and a name behind it in the
append-only ledger.

`packages/rail` therefore grows a second capability next to the cent, and the rule it had ("0.01 MXN
and nothing else") becomes narrower than it sounds rather than looser: a rail sends either the probe or
the amount of an instruction this product holds, and nothing else. Everything the package already
refused it still refuses. The description names nobody and `assertNoIdentity` fails a send that carries
a long digit run, so a CLABE cannot reach somebody else's system. The clave de rastreo comes back from
the rail and never from a keyboard. A rail that cannot run refuses at construction.

**Which rail, and what each one proves.** This is the table that may not be blurred when somebody
quotes it on stage.

| Rail | What the execution is | What it proves |
|---|---|---|
| `NessieRail` | An outflow per line on the company's bank mirror, written with our own team key. Verified against `api.nessieisreal.com` on 2026-09-12 for the probe | The flow end to end. Nessie is a sandbox and not a bank: no pesos move, no CEP is produced, and amounts read back as whole numbers, so the exact centavos stay in our own ledger |
| `StpRail` | `registraOrden` at STP, the SPEI participant a small company can contract. The rail that produces a Banxico-signed CEP | That the production path exists and is written. It has NEVER run live: we hold no `empresa` contract and the constructor refuses on every machine |
| `FakeRail` | In process, nothing leaves. What `bun test` and `bun run demo` use | That the pipeline is testable with no network. Every event it produces carries `simulated: true` |

The README in `packages/rail` is the source for that table and `GET /api/v1/rails` answers the same
thing over HTTP, so no screen has to guess and no pitch has to remember.

**Nothing leaves without a person.** `POST /api/v1/run/:id/execute` needs `confirm: true` and a valid
`X-Actor`, and it sends only lines nothing stops: a hold, a verification, a blocked beneficiary or a
definitive SAT listing keeps a line out, and a request that names one is refused with a `409` rather
than quietly dropped. No schedule, no retry that sends, no automatic release.

**`sent` and `settled` are two claims.** `PaymentExecutionLine` carries five states and the API never
collapses the middle two: a transfer is acknowledged when the rail says so, not when we asked. A
`payment_sent` for a payment that never left is the one entry this ledger must not hold, so a rail
refusal appends nothing at all and answers `503` with the message the package wrote.

**The receipt states what can be proven and not what would look better.** `PaymentReceipt.sealState` is
a `SealState` and never a boolean: on the mirror there is no Banxico document to check, so it is
`not_checked` and the document reads "firma no verificada". The beneficiary account on it is four
digits.

## Consequences

- Positive: the answer to "what makes her upload the picture" is now structural. The instruction is
  the payment order, so the control is on the path and not beside it.
- Positive: one seam moves money in this product, and it is the seam that was already written, tested
  and verified for the probe. The execution reuses the clave de rastreo minting, the identity guard and
  the CEP resolution rather than adding a second way to do any of them.
- Positive: the demo can show a run leaving and a receipt coming back without claiming a bank
  relationship nobody has, because the table above is on the screen through `GET /api/v1/rails`.
- Negative: this product now sends payments, which is a bigger thing to be wrong about than stopping
  them. The mitigations are the ones above and they are all refusals: one amount per line from the
  instruction, no line that a decision stopped, an actor on the request, and nothing appended when a
  send fails.
- Negative: the regulatory story grows. Sending SPEI for a third party needs an STP contract and the
  obligations that come with it, which is why `StpRail` refuses to run and why
  `docs/06-regulatory-privacy.md` has to say that the payer remains the company and SentryOne remains
  payer-side software instructing the company's own participant.
- Negative: on the mirror an executed run proves the flow and nothing about the pesos, and somebody
  will be tempted to shorten that sentence. The README, the rails endpoint and the receipt's
  `sealState` are the three places that make the short version fail.
- Follow-on: `packages/rail` gains the payment order next to the probe with its own tests;
  `apps/api` streams the execution; `apps/web` builds the payments screen; `docs/06` gains the
  paragraph above; `docs/10-demo-script.md` says which rail the rehearsal runs on.
- Now forbidden: sending an amount that is not an instruction's amount; sending to an account the
  instruction does not name; executing without an actor; a ledger entry for a send that failed; the
  claim that `StpRail` has run live.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Keep the SPEI in the company's banking portal and stay read-only | Nothing forces the instruction to exist in SentryOne, which leaves the intake unexplained and the control optional |
| Export a payment file for the bank to upload | The file is the portal problem again with a worse demo, and the clave de rastreo comes back hours later, so the receipt and the CEP story both break |
| Execute on Nessie and call it a payment | Nessie is a sandbox. Saying the pesos moved would be the exact pretending the judges said they are hunting for |
| Contract STP for the event | Weeks of paperwork and an `empresa` agreement we do not have. The adapter is written so the path is demonstrable in code rather than asserted |

## Revisit if

An STP contract exists, at which point the table above changes one row and the receipt gains a real
CEP, or a line ever needs to be sent that does not correspond to an instruction this product holds, in
which case the decision above is the one being broken and it needs a new ADR rather than a patch.

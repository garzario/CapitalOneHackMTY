# ADR-0007: The assistant reads and proposes, a person executes

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** the team meeting of 2026-09-12, recorded in issue #195; written up by `garzario`
- **Affects:** `packages/core/src/domain.ts`, `apps/api`, `apps/web`, `docs/06-regulatory-privacy.md`, `docs/09-api.md`, ADR-0004

## Context

The meeting of 2026-09-12 settled the product the judges will see: Lupita works inside one web app
where she drops the screenshots she already receives on WhatsApp and by email, asks why a line is red,
confirms what the app proposes, and sends the payment run from there. That panel is a language model
inside a payments product, which is the exact architecture ADR-0004 refused to put in the decision
path, so the boundary has to be drawn before any of it is built rather than defended afterwards.

Three forces make the line sharp. ADR-0004 already banned a model call that returns a score, a flag or
a ranking, for cost, latency, testability and the LFPDPPP transfer that financial data would require.
The rubric says third-party models are allowed with explicit awareness of privacy, banking regulation,
ethical and reputational risk and cost per transaction, which is an invitation to be asked about all
four. And the judging brief says the panel is looking for prototypes that only pretend to work, so
"the assistant decided" would be the worst possible answer to "how does it decide".

## Decision

**The assistant is a reader and a proposer. It never decides, never writes and never moves money.**

It reads what the deterministic engine already computed, answers in Spanish, and ends a turn with at
most one `ActionProposal`. A person presses the button; the ordinary endpoint runs; the ordinary
ledger event is appended with their name on it. The proposal's `payload` is field for field the body
of that endpoint, so the panel shows what is about to happen in the words of the request itself.

Four properties carry the boundary, and three of them are in the type rather than in this paragraph.

1. **The tools are reads, and a writing tool is unrepresentable.** `AssistantTool` is the whole list:
   `get_run`, `get_instruction`, `get_verification`, `get_execution`, `get_receipt`, `sat_lookup`,
   `consortium_signal`. `AssistantToolCall.readOnly` is the literal `true`, so a tool call that writes
   cannot be constructed, and `result` is `Record<string, EvidenceValue>`, the same evidence the
   finding panel renders as chips. Nothing a model wrote arrives dressed as a fact.
2. **No level, no action and no number comes from the model.** `confidenceOf`, `transactionStateOf`,
   `decide` and the six controls are deterministic, pure and unit-tested, which is how "is this a
   wrapper around a language model" gets answered by running the suite instead of by arguing.
3. **Every write still carries `X-Actor`**, and the role rule is the one `docs/02-persona.md`
   supports: `owner` for the exception that page says the owner approves, a release over a finding,
   and `clerk` for everything else including sending the run. A maker-checker chain is in the
   anti-persona column of that page, so inventing one would be inventing a control this company does
   not have.
4. **What leaves the perimeter is bounded and written down.** The clerk's own sentence, the image she
   dropped, and the evidence of the findings the turn is about. Never the CFDI ledger, never a full
   CLABE, never the bank mirror, never another tenant's data: the consortium only ever answers counts
   and dates about a hashed pair, and `intake_image` keeps a reference rather than the bytes.
   Extraction from an image stays transcription only, which is `packages/extract` and
   `docs/06-regulatory-privacy.md` section 6.2.1.

The conversation is on the append-only ledger as `assistant_message`, because a proposal somebody
acted on is part of the history of that payment. `AssistantSession` is projected from those rows and
never stored twice.

## What the build of 13 September settled

Three things the decision above left open, recorded here rather than in a second ADR because none
of them moves the boundary. Issue #197 is where they were built.

- **The list of reads grew by two and stayed a list of reads.** `get_supplier`, the supplier drawer,
  and `get_metrics`, the blind holdout evaluation, are both GET endpoints that already existed and
  both answer what the engine computed. The property that matters is unchanged: `AssistantTool` is a
  closed union, `readOnly` is the literal `true`, and every tool is served by the one function in
  `apps/api/src/assistant/tools.ts` that issues a request, which hardcodes `GET`.
- **The screenshot a clerk drops is her own action, so it reaches the ordinary intake.** The panel
  does not decide to create an instruction: she attached a file, the transcription is
  `packages/extract` under ADR-0004, the supplier is attributed by matching accounts and legal names
  with no model involved, and the instruction is created by `POST /api/v1/instructions` in process,
  with `intake_image` carrying her name. The model is not consulted about whether to create it and
  cannot create one: there is no tool for it, and when the attribution does not answer, the turn ends
  with the `intake` proposal this ADR already named and a person completes it. Nothing else about
  "it writes nothing but the conversation" changes: no `decision_made`, no cent, no payment.
- **What leaves is narrower than this ADR allows.** The image is not sent to the panel's model at
  all, and neither is the clerk's name. Everything the turn needs from a screenshot is what the
  extractor already read, and `decidedBy` on a proposal is filled in from the `X-Actor` header on our
  side. `docs/06-regulatory-privacy.md` section 6.4 is the transfer paragraph and the measured cost.

## Consequences

- Positive: the panel is the thing the judges asked for and the decision is still the thing the judges
  can test. Pulling the model out leaves a working product with a worse front door, which is the
  property that makes the boundary credible.
- Positive: cost still scales with questions a human asked, not with transaction volume, which is the
  arithmetic ADR-0004 already wrote down.
- Positive: an audit of one payment reads in one list: the turns, the reads, the proposal, the click,
  the decision, the payment, the receipt.
- Negative: the assistant cannot do the obvious thing a demo wants, which is to fix the line itself.
  Every action needs a click, and that is exactly the part that must not be optimised away.
- Negative: a proposal can be wrong and a tired clerk can confirm it anyway. The mitigations are that
  the proposal shows the request it would send, the level always arrives with the findings behind it,
  and the release path demands a written reason.
- Follow-on: `apps/api` implements the stream (`token`, `tool_call`, `tool_result`, `proposal`,
  `done`) and the actor header; `apps/web` builds the panel; `docs/06` gains the transfer paragraph
  for the panel next to the one it has for extraction.
- Now forbidden: a model call that returns a level, an action, a score, a ranking or an amount; a tool
  that writes; a proposal that executes itself; sending anything to a model that the list above does
  not name.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Let the assistant execute what it proposes, with a confirmation dialog | A dialog is not a decision record. The click has to produce a ledger event with a name on it, and at that point the endpoint is the endpoint |
| Let the model classify the line and have the engine check it afterwards | Non-deterministic, untestable, and it puts the model back in the decision. ADR-0004 settled this |
| No assistant at all, keep the forms | Loses the reason the screenshot arrives at the product at all, which is the answer to "why would she upload the picture" |
| A local small model, so nothing leaves | Still non-deterministic, and the boundary problem is unchanged: the question is what the model is allowed to decide, not where it runs. Worth revisiting for cost, not for this |

## Revisit if

A turn genuinely needs semantic judgment inside a decision, which under ADR-0004 needs its own ADR
with a measured cost per call and a stated consent and transfer position, or the panel's answers start
being quoted as evidence anywhere, at which point the quoting screen is the bug.

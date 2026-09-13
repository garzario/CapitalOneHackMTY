# @hackmty/voice

The verification call.

When the decision engine says `verify`, somebody still has to ask the supplier
whether the account change we received came from them. This package is that phone
call: an ElevenLabs conversational agent that says it is the automated payments
line of the company that owes the money, speaks Mexican Spanish, reads a script
built from the payment instruction, confirms the change and the last four digits
of the account and never the whole CLABE, hangs up on its own goodbye, and hands
back a transcript that a deterministic parser turns into one of four outcomes.

It is control 5's sibling. The CEP proves who received money after a transfer;
this call asks the supplier before one leaves. Neither of them releases a
payment: both are evidence a person weighs.

Three functions, in the order the product calls them.

| Function | Does |
|---|---|
| `buildVerificationScript(input)` | Writes what is said, from the instruction |
| `VoiceClient` | Creates the agent, places the call, reads the transcript |
| `parseVerificationOutcome(transcript)` | `confirmed`, `denied`, `no_answer` or `unclear`, with the sentence it was read from |

Server only. `apps/web` never imports this package: the browser fallback at
`/verify-call` talks to the same agent through the public widget, which needs no
key at all.

There are two lines, not one. Everything above and below is the supplier line.
The second one calls the OWNER of the company and is under "The second line" near
the foot of this file: same provider, same client, a second agent, a different
script, a different question and a different parser.

## The call, word for word

Three lines, in this order. The first is stored at the provider with its slots
empty; the other two are built per call and travel as dynamic variables.

```
Buen día. Le habla {{caller}}, de la línea automática de pagos a proveedores de
{{company}}. ¿Hablo con {{supplier}}?

Recibimos una instrucción para depositarle {amount} a una cuenta distinta de la
que le hemos pagado antes, y antes de que salga el pago necesito confirmarla con
ustedes.

¿Me confirma que ustedes cambiaron su cuenta y que la que termina en {4 digits}
es de ustedes?
```

And it always ends on this one, `VERIFICATION_CLOSING_LINE`, said once and
followed by the `end_call` tool:

```
Eso sería todo por hoy. Le agradezco mucho su tiempo y que tenga excelente día.
```

When the supplier has no other account on file the purpose line drops the
comparison and the question asks only whether this account is theirs. There is no
third wording.

## The rules the script may not break

0. **The call says what it is, in the greeting.** "La línea automática de pagos a
   proveedores de {{company}}", before anything is asked, and again whenever it is
   asked who is speaking. This is not only ethics. The provider refused every call
   of the first version with `call_initialization_error 3000` and the word unsafe,
   because that prompt claimed to be a person and then asked for account
   confirmations: the calls dropped at zero seconds. A line that discloses itself
   is the only version of this control that rings at all. `REQUIRED_DISCLOSURE` is
   asserted against the first message and the prompt, and `BANNED_PHRASES` is
   asserted against both and against every sentence a call renders.
1. **Only four digits of one account are ever spoken.** Reading a CLABE out loud
   to whoever answered a telephone hands them the account. Four digits are enough
   for the real supplier to recognise their own and useless to anybody else. The
   account the supplier has always been paid on is never read out either, not even
   its four digits: the call says this account is not that one, which is the fact,
   and reads no digits of it. Tests assert that no full CLABE and no run of five
   digits appears in the prompt, the first message, the spoken lines, the dynamic
   variables or the body `bun run voice-setup` uploads.
2. **When the account changed, the call confirms the change.** "Is this account
   yours" can be answered yes by somebody who opened it yesterday. "Did you change
   your account, and is this one yours" cannot be answered yes by accident.
3. **The answer is asked for in words, never as a choice between two.** The
   earlier question ended on a two word either-or, and the model then repeated it
   on every re-ask, which is what a recording sounds like. It also handed the
   parser a monosyllable, and a bare "sí" is deliberately not a confirmation. So
   the question asks to be confirmed, and when a single word is all that came back
   the agent asks once more, shorter, without reading the digits again. On
   `conv_7801m2cw1wxve2kv9yf768p3600f` that second ask turned "Sí" into "Sí, es
   mía", which is an answer the parser can read.
4. **Nothing is promised.** The call never says the payment will be made, or when,
   or that it already went out. If asked, the agent says the payment is still
   under review and a person will follow up.
5. **Nobody is accused.** No fraud, no suspicion, no impersonation. ADR-0002 fixes
   the states as `comprobable` or `requiere_verificacion`, and an automated call
   that accuses a supplier is the one way this product could do real damage. If
   asked why we are calling, the agent says we confirm the account before paying
   and that it is a normal step, and never that something looks wrong.
6. **No data is requested.** One confirmation. No account, no code, no password,
   nothing personal. A call that asks for those is indistinguishable from the
   fraud it exists to catch, and a supplier who has been trained by it is worse
   off than before we called.
7. **The agent hangs up, and on its own line.** Closing is a fixed sequence: what
   was recorded in the supplier's own words, then the goodbye above word for word,
   then `end_call`. An agent that is merely told to finish says the goodbye and
   then holds the line open to the duration cap, which is what a supplier who has
   already said goodbye hears.

Whether the account changed is not a flag a caller sets. `scriptForInstruction`
reads it off `supplier.knownAccounts`: an account the supplier has been paid on,
compared on digits so separators do not matter. No history answers "not a change"
rather than "a change", because a brand-new supplier has changed nothing and
saying otherwise would be a claim about a history that does not exist. The CLABE
forensics control already raises `first_time_seen` and `new_supplier` on the
screen where that belongs.

## What the provider stores, and what travels per call

The agent at ElevenLabs holds `VERIFICATION_TEMPLATE`: the rules and the guion
with `{{caller}}`, `{{company}}`, `{{supplier}}`, `{{supplier_sentence}}`,
`{{purpose}}`, `{{question}}` and `{{account_last4}}` where the instruction's own
words go. It carries no supplier, no amount and no account, and a test asserts it
carries no two digits in a row at all. The values travel with each call as
`conversation_initiation_client_data.dynamic_variables`, so an account number
never sits in somebody else's dashboard waiting to be read, and two calls placed a
minute apart cannot read each other's four digits.

`{{company}}` is the company that owes the supplier money and never this product.
A supplier who has invoiced the same metalworking shop for years has never heard
of SentryOne, so a call that introduced SentryOne was a stranger telephoning about
their bank account, which is the exact shape of the fraud this control exists to
catch. `DEFAULT_COMPANY_NAME` is the seeded company of `docs/02-persona.md` and
`scripts/voice-agent.json` overrides it per deployment. It is the one string in
this package written with its accent for a reason that is not only orthography:
"Metalicos" ends in s, so the ordinary Spanish rule stresses the second last
syllable and the model says "me-ta-LI-cos".

`VERIFICATION_VARIABLE_DEFAULTS` is uploaded alongside it as
`dynamic_variable_placeholders`, and it is what the agent says if a call ever
arrives with no variables: that we are confirming a payment, that the information
is not complete right now, and that a person will follow up. It asks nothing and
names no account. The reason it exists is the failure mode it prevents, which is a
text to speech model reading the literal text `{{supplier}}` to a real person.
`renderVerificationText` throws rather than return a string with a slot left in
it, so that failure cannot reach a telephone from our side either.

The Spanish here is accented, with inverted question marks, and it is the one
place in this repository that breaks the ASCII convention. It does it on purpose:
these strings are not read by a person on a screen, they are read out loud by a
text to speech model, where `dia` and `día` are the same word to a reader and
"DI-a" against "di-A" to the model. Everything the ledger stores, `clabeLast4`
included, is unchanged.

## The outcome parser

`parseVerificationOutcome` is a deterministic function over the transcript, not a
model. `docs/06-regulatory-privacy.md` keeps an LLM out of the per-transaction
path; a judge can read the file and predict its answer on any sentence; and the
same transcript gives the same outcome in a rehearsal and in the demo ten minutes
later.

How it reads a call:

1. Only the supplier's turns are scored. The agent's own turns carry the question
   and the words "confirme" and "cuenta", so scoring them would make every call a
   confirmation.
2. Each turn is cut into sentences, and each sentence into comma-separated
   clauses. Matching happens on the clause and the quote handed back is the whole
   sentence. The comma is load bearing: "no, es correcta" is two clauses and "no
   es correcta" is one, and they mean opposite things.
3. The strongest class found anywhere in the call wins: **denial, then
   uncertainty, then confirmation**. That order is the cost asymmetry written
   down. A false `confirmed` releases money a SPEI will never bring back; a false
   `denied` costs a clerk a telephone call.

Three behaviours worth knowing, each covered by a named test:

- **A bare "si" is not a confirmation.** The agent's first question is whether it
  is speaking to the supplier at all, so the "si" that answers it must never be
  counted as agreement about a bank account. A confirmation needs a verb or an
  object: "si es correcta", "asi es", "confirmo", "es nuestra cuenta", "es mia".
  This is also why the guion asks once more, shorter, when a single word came
  back: the second ask is what produces a clause the parser can read.
- **A negation right before a confirmation makes it a denial.** That is how "no es
  correcta" is read without enumerating every negated spelling in a list.
- **"No estoy seguro" is `unclear`, never `denied`.** Uncertainty outranks a
  confirmation said earlier in the same call and is never rounded into a refusal.

`no_answer` covers both nobody speaking and a voicemail greeting answering.

## The second line: the owner, and the guided tour

`buildOwnerScript` and `parseOwnerOutcome` are the second call. It exists for the
guided tour of `apps/web`: a visitor at the stand types their own mobile number
and the payments line telephones them as the owner of the seeded company, reads
them one payment a control stopped, and asks what to do with it.
`apps/api/src/routes/tour.ts` is the caller and `docs/09-api.md` specifies the
three endpoints it sits behind.

It is a separate file with a separate agent at the provider, deliberately. The two
calls say different things to different people, and one prompt that tried to do
both would end up asking a supplier to authorise a payment.

| Function | Does |
|---|---|
| `buildOwnerScript(input)` | Writes what is said, from the held instruction |
| `parseOwnerOutcome(transcript)` | `hold`, `release`, `no_answer` or `unclear`, with the sentence it was read from |

**This is the one call that can end in a release, and that is not a hole in the
rule above.** A release over a line that is not `confiable` is the owner's to sign
and always was, which is `decideRequirement` in `packages/core/src/actor.ts`. What
the call produces is still a `decision_made` carrying the name of the person who
said it and the sentence it was read from, written through the same
`recordDecision` that `POST /api/v1/instructions/:id/decide` calls. The supplier
line still releases nothing at all. `no_answer` and `unclear` apply nothing
either: the payment stays exactly where the control left it.

**The question, word for word**, and it is the whole call:

> ¿La retenemos hasta verificarla, o la libera bajo su nombre?

It offers the two actions rather than asking for a yes, for the reason the parser
enforces at the other end: a bare monosyllable is refused as `unclear`, because
"sí" to a two-way question names neither action. That is the same rule
`BANNED_PHRASES` already carried for the supplier line, applied to a question that
had more room to get it wrong.

**The five rules of the supplier script hold here**, and three matter most. The
line says it is an automated payments line in its first sentence, which is also
what keeps the provider from refusing the prompt with `call_initialization_error
3000`. Only four digits of one account are ever spoken, spaced so they are read
one at a time, and never a digit of the account the supplier has always been paid
on. And nothing is promised and nobody is accused: a control that stopped a
payment has found a document that does not add up, not a criminal.

Two rules are this script's own. One question is the whole call, and it confirms
what it understood in the words of the decision about to be recorded before it
hangs up, because the owner has to hear what they authorised before the line
closes.

`bun run voice-setup --owner` creates the agent and prints its id, which goes in
`ELEVENLABS_OWNER_AGENT_ID`; `--dry-run` prints the prompt and touches nothing.
The agent was created for real on 2026-09-13 and the disclosure did not need
tightening. `packages/voice/src/owner-fixtures.ts` holds the transcripts the
parser is tested against, in the shape the provider returns them.

## The endpoints, and where each was verified

All read from the ElevenLabs API reference on 2026-09-12.

| Method | Path | Source |
|---|---|---|
| POST | `/v1/convai/agents/create` | https://elevenlabs.io/docs/api-reference/agents/create |
| GET | `/v1/convai/agents/{agent_id}` | https://elevenlabs.io/docs/api-reference/agents/get |
| PATCH | `/v1/convai/agents/{agent_id}` | https://elevenlabs.io/docs/api-reference/agents/update |
| POST | `/v1/convai/twilio/outbound-call` | https://elevenlabs.io/docs/api-reference/twilio/outbound-call |
| GET | `/v1/convai/conversations/{conversation_id}` | https://elevenlabs.io/docs/api-reference/conversations/get |
| GET | `/v1/convai/conversations` | https://elevenlabs.io/docs/api-reference/conversations/list |
| GET | `/v1/convai/phone-numbers` | https://elevenlabs.io/docs/api-reference/phone-numbers/list |

Base URL `https://api.elevenlabs.io`. Authentication is the `xi-api-key` request
header (https://elevenlabs.io/docs/api-reference/authentication); it is never a
query parameter here, so a key cannot end up in a log line or a screenshot.

What each page confirmed:

- **Agent creation** takes a required `conversation_config` object holding
  `agent.prompt.prompt` (the system prompt), `agent.first_message`,
  `agent.language` (default `"en"`, so we send `"es"`) and `tts.voice_id` /
  `tts.model_id`. The reference documents a default `voice_id`; this package sends
  none unless the team picks one, because an absent key means "your default" and a
  present one would be a voice nobody in this repo has heard. Slot defaults go in
  `agent.dynamic_variables.dynamic_variable_placeholders`, documented at
  https://elevenlabs.io/docs/agents-platform/customization/personalization/dynamic-variables,
  which is also where the `{{name}}` syntax comes from.
- **The outbound call** requires `agent_id`, `agent_phone_number_id` and
  `to_number`, takes an optional `conversation_initiation_client_data` whose
  `dynamic_variables` is a map of string to any, and answers `success`, `message`,
  `conversation_id` (nullable) and `callSid` (nullable). A refusal can arrive as
  `success: false` inside a 200, which is why the client reads the flag and does
  not trust the status alone.
- **The conversation** answers `conversation_id`, `agent_id`, `status` (one of
  `initiated`, `in-progress`, `processing`, `done`, `failed`), a `transcript`
  array of `{ role: "user" | "agent", message, time_in_call_secs }`, an `analysis`
  object with `call_successful` (`success`, `failure`, `unknown`) and
  `transcript_summary`, and `metadata.call_duration_secs`. The provider's `role`
  is `"user"` for the person on the telephone; this package renames it to
  `supplier` at the boundary, once.
- **Phone numbers** answer `phone_number_id`, `phone_number`, `provider`
  (`twilio`, `sip_trunk`, `exotel`) and `label`. That id is the
  `agent_phone_number_id` the outbound call needs, which is what
  `scripts/voice-setup.ts` prints. It prints the id, the provider and the label
  and not the number itself, for the reason the voice id is masked.
- **Reading the agent** answers the whole stored `conversation_config`, and the
  update merges: a `PATCH` carrying `conversation_config.agent.prompt.prompt`
  leaves `prompt.llm`, `built_in_tools` and `asr` exactly as they were. Verified
  on 2026-09-13 by patching the prompt alone and reading the agent back. That is
  why `voice-setup` can own twelve fields without owning the other forty.

## The configuration a rerun reproduces

Every value here was measured or heard on a live call, and every one of them is in
`scripts/voice-agent.json` so that `bun run voice-setup` puts it back. The diff the
script prints before it sends is what proves it: on 2026-09-13 the only fields that
changed were the prompt and the accented defaults, and the twelve below already
matched.

| Field | Value | Why |
|---|---|---|
| `tts.model_id` | `eleven_flash_v2_5` | First audio byte in 195 to 266 ms against 3812 to 4962 ms for `eleven_multilingual_v2`, same sentence, three runs each |
| `tts.voice_id` | `ELEVENLABS_VOICE_ID` | A male Mexican Spanish voice, measured at 133.3 Hz median on the provider's own preview. The id is in `.env` only, and `voice-setup` prints it masked |
| `tts.optimize_streaming_latency` | 3 | Time to first byte over prosody. The supplier hears the seconds |
| `tts.stability` | 0.55 | Low enough that two consecutive turns are not the same delivery, high enough that the tone does not drift inside one call |
| `tts.similarity_boost` | 0.85 | |
| `tts.speed` | 1.0 | A payments call read fast sounds evasive |
| `turn.turn_timeout` | 3.0 s | 7 was the dead air. 1 cut suppliers off mid sentence |
| `turn.turn_eagerness` | `normal` | `patient` reads as hesitation on a business call |
| `turn.speculative_turn` | false | It drafts against half a sentence, and the half sentence that matters here is the one where a supplier says no after saying sí |
| `agent.disable_first_message_interruptions` | true | The greeting is where the disclosure lives, so it is the one turn that finishes |
| `prompt.llm` | `gemini-2.5-flash-lite` | Measured at 1 to 3 s per reply on six live calls. The text to speech model was the cost, not this |
| `prompt.temperature` | 0.25 | The guion is the control. Naturalness comes from the prompt and the voice settings |
| `prompt.built_in_tools.end_call` | enabled | The agent hangs up. Without it the line stays open to the cap |
| `conversation.max_duration_seconds` | 150 | A call cannot run up a bill unattended |

Measured reply gaps, agent turn minus the supplier turn before it, read off
`time_in_call_secs` on the six live calls of 2026-09-13: **1 s, 2 s, 2 s** on
`conv_4601m2cvy1prf9qswpd8yp3hmwmk`, **1 s, 2 s, 1 s** on
`conv_7801m2cw1wxve2kv9yf768p3600f`, **1 s, 1 s, 1 s** on
`conv_0301m2cw4j7jfhran9v90zfhr989`, and eighteen gaps across all six between 0 and
3 seconds, fifteen of them at 1 s. The same measurement before this work gave 5 s
and 9 s. `docs/14-process.md#live-integrations-verified` carries every id and what
each call settled.

## What is not verified

- **The call is never retried.** A retried outbound call is a second telephone
  call to a real person. A rate limit comes back as `rate_limited` and stops
  there.
- **`analysis.call_successful` is not used to decide anything.** It is the
  provider's own view of whether the conversation went well, which is not the
  question we are asking. Our answer comes from the words.
- **The voice, now that one is pinned.** `ELEVENLABS_VOICE_ID` names a voice in
  each local `.env`, it is on the agent, and it is what was heard on the three
  calls of 2026-09-13. What is still not verified is how it reads anything beyond
  the sentences those calls exercised. One thing it got wrong is fixed here rather
  than hoped about: given `4611` it said "cuatro mil seiscientos once", a quantity,
  so `spokenLast4` spaces the digits and the prompt says to read them one by one.
  The call of `conv_0901m2cp6eh3fy4bn7fcsvvyd9d7` is where "cuatro seis uno uno"
  was heard.
- **The transcription itself.** The parser reads whatever the speech to text
  returns. A missed "no" is a wrong outcome, which is the strongest argument for
  the rule that no outcome releases a payment on its own.
- **A live `denied`.** Six calls were placed on 2026-09-13 and the clean
  confirmation is `conv_7801m2cw1wxve2kv9yf768p3600f`, read as `confirmed` off
  "Sí, es mía". The denial is covered live only as far as the agent's own close:
  on `conv_4601m2cvy1prf9qswpd8yp3hmwmk` the answer was "No creo", the agent took
  it as a change that did not come from them and closed on that, and the parser
  answered `unclear`, because it will not round a doubt into a refusal. Both
  outcomes stop the payment and neither releases it, so the two readings differ in
  the word on the ledger and not in what happens to the money. `denied` itself is
  covered by the fixtures and by eleven cases in `outcome.test.ts`.
- **The owner line has never rung a telephone.** The agent exists at the provider,
  created on 2026-09-13 by `bun run voice-setup --owner`, and `GET /api/v1/tour`
  reports `callsEnabled` against it. No outbound owner call has been placed from
  any instance, because `ALLOW_TOUR_CALLS` is deliberately in no `.env` here. The
  script, the parser and the four outcomes are covered by `owner-fixtures.ts` and
  by the 46 cases of `owner-script.test.ts` and `owner-outcome.test.ts`, and what
  six real calls taught the supplier line is inherited rather than re-proved. The
  first live one will be a visitor at the stand.
- **Anything the supplier says that no phrase list has.** Two phrases were added
  to `CONFIRMATIONS` from the calls above rather than from imagination, "es mía"
  and "la cambiamos", which is the whole method here: the list grows from
  transcripts, and the conservative direction is unchanged. A bare "sí" is still
  not a confirmation.

## Running it

```
bun run voice-setup --dry-run     # prints the template and the exact body, no key
bun run voice-setup               # creates or updates the agent, prints the ids
```

`--dry-run` needs no account and touches no network, so the wording can be
reviewed by the team before a supplier hears it. Without it the script reads
`ELEVENLABS_API_KEY`, reads the live agent with `GET` and prints the difference
field by field, updates the one in `ELEVENLABS_AGENT_ID` (or creates it), and
prints `ELEVENLABS_AGENT_ID` and every `ELEVENLABS_PHONE_NUMBER_ID` the account
has.

The `GET` is the half that matters on the day of an event. The `PATCH` carries only
the fields in the table above, so everything else on the agent survives a rerun;
the printed diff is what turns that from a claim into something somebody read
before pressing enter, including the case that costs the most, a rerun from an
older checkout that would quietly revert a fix made an hour ago.

`scripts/voice-agent.json` is the config and it holds the company name, the caller
name, the language, the delivery settings, the turn settings, the model and the
duration cap. It holds no sample instruction and no voice id: the voice lives in
`ELEVENLABS_VOICE_ID`, which is why no eighteen-digit account and no voice id
appears in it or in anything this script uploads, and
`scripts/voice-setup.test.ts` is what keeps that true.

The API side is `POST /api/v1/instructions/:id/verify-call`, with `GET` on the
same path returning the script and nothing else. Without the three variables the
POST answers 422 carrying the script, so the clerk reads it on their own
telephone and records what they heard. The browser fallback is `/verify-call` in
`apps/web`.

## Tests

`bun test packages/voice`. Nothing in the suite touches the network and nothing
needs a key: `VoiceClient` takes `http` as a constructor argument and every case
passes a stub. This API bills per minute and dials real people, so a test runner
that could reach it is a test runner that eventually will, at three in the
morning.

The fixtures in `src/fixtures.ts` are invented end to end: no recording of a real
supplier, no real company, no real telephone number, no real account. They are
written the way a speech to text engine returns Spanish, accented and
half-punctuated, so the accent folding is exercised rather than assumed.

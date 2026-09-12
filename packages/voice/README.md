# @hackmty/voice

The verification call.

When the decision engine says `verify`, somebody still has to ask the supplier
whether the account we are about to pay is theirs. This package is that phone
call: an ElevenLabs conversational agent that speaks Mexican Spanish, reads a
script built from the payment instruction, and hands back a transcript that a
deterministic parser turns into one of four outcomes.

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

## The script, and the four rules it may not break

The script names the supplier's legal name from its CFDI, the amount, and the
**last four digits** of the new account, then asks one question: is that account
yours, yes or no.

1. **Only four digits of the account are ever spoken.** Reading a CLABE out loud
   to whoever answered a telephone hands them the account. Four digits are enough
   for the real supplier to recognise their own and useless to anybody else. A
   test asserts the full CLABE appears nowhere in the prompt, the first message or
   the spoken lines.
2. **Nothing is promised.** The call never says the payment will be made, or when,
   or that it already went out. If asked, the agent says the payment is still
   under review and a person will follow up.
3. **Nobody is accused.** No fraud, no suspicion, no impersonation. ADR-0002 fixes
   the states as `comprobable` or `requiere_verificacion`, and an automated call
   that accuses a supplier is the one way this product could do real damage.
4. **No data is requested.** One yes or no. No account, no code, no password,
   nothing personal. A call that asks for those is indistinguishable from the
   fraud it exists to catch, and a supplier who has been trained by it is worse
   off than before we called.

The Spanish is ASCII, with no accents and no inverted question marks, which is the
convention every user-facing string in this repo already follows. The affected
words are pronounced the same either way. If a rehearsal hears a mispronunciation,
the fix is accents in `src/script.ts` and nowhere else.

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
  object: "si es correcta", "asi es", "confirmo", "es nuestra cuenta".
- **A negation right before a confirmation makes it a denial.** That is how "no es
  correcta" is read without enumerating every negated spelling in a list.
- **"No estoy seguro" is `unclear`, never `denied`.** Uncertainty outranks a
  confirmation said earlier in the same call and is never rounded into a refusal.

`no_answer` covers both nobody speaking and a voicemail greeting answering.

## The endpoints, and where each was verified

All read from the ElevenLabs API reference on 2026-09-12.

| Method | Path | Source |
|---|---|---|
| POST | `/v1/convai/agents/create` | https://elevenlabs.io/docs/api-reference/agents/create |
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
  present one would be a voice nobody in this repo has heard.
- **The outbound call** takes exactly `agent_id`, `agent_phone_number_id` and
  `to_number`, and answers `success`, `message`, `conversation_id` (nullable) and
  `callSid` (nullable). A refusal can arrive as `success: false` inside a 200,
  which is why the client reads the flag and does not trust the status alone.
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
  `scripts/voice-setup.ts` prints.

## What is not verified

- **The call is never retried.** A retried outbound call is a second telephone
  call to a real person. A rate limit comes back as `rate_limited` and stops
  there.
- **`analysis.call_successful` is not used to decide anything.** It is the
  provider's own view of whether the conversation went well, which is not the
  question we are asking. Our answer comes from the words.
- **No voice id is pinned.** The team has not listened to a Mexican Spanish voice
  and chosen one, so `ELEVENLABS_VOICE_ID` is empty and the provider default
  applies. Pick one, put the id in `.env`, and `bun run voice-setup` pushes it.
- **The transcription itself.** The parser reads whatever the speech to text
  returns. A missed "no" is a wrong outcome, which is the strongest argument for
  the rule that no outcome releases a payment on its own.

## Running it

```
bun run voice-setup --dry-run     # prints the script and the exact body, no key
bun run voice-setup               # creates or updates the agent, prints the ids
```

`--dry-run` needs no account and touches no network, so the wording can be
reviewed by the team before a supplier hears it. Without it the script reads
`ELEVENLABS_API_KEY`, creates the agent (or updates the one in
`ELEVENLABS_AGENT_ID`), and prints `ELEVENLABS_AGENT_ID` and every
`ELEVENLABS_PHONE_NUMBER_ID` the account has.

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

# apps/web

The judge-facing UI. Vite, React, Tailwind, motion. Nine screens, one design system,
no state manager and no router dependency.

The visual design is done and is documented in `docs/design.md`, which is the file to read
before changing a colour, a size or a weight: the token file is the law and that document is
why. Anything that belongs to another workspace is marked with that owner in the source.

## Run it

```
bun install --frozen-lockfile
bun run --filter @hackmty/web dev      # http://localhost:5173, proxies /api and /health to :3000
bun run --filter @hackmty/web build    # static build into dist/
bun run --filter @hackmty/web typecheck
bun test                               # from the repo root
```

The app renders with or without the API. Which one it used is stated on screen, never assumed.

## Data modes

Read from the page query string, before the hash, by `src/lib/resource.ts`:

| URL | Behaviour |
|---|---|
| `/` or `?data=auto` | API first, synthetic run as the fallback, with a visible notice. The default. |
| `?data=api` | API only. A failure renders the error state. This is how a judge proves the deployed backend answers. |
| `?data=mock` | Synthetic only. No request leaves the browser. |

"No request leaves the browser" is a property somebody checks rather than an intention. It covers
everything the page opens and not only the screens that load through `useResource`: the run screen's
event stream and the API status card reach the network on their own, and both ask `reachesApi` in
`src/lib/resource.ts` first. `src/lib/resource.test.ts` walks every source in `src/` and fails when a
component calls `useEvents` without an `enabled:` or reads `/health` without consulting the mode.

Two things never fall back, on purpose:

- `GET /sat/lookup`, because the official Article 69-B list does not travel in the bundle
  and inventing an answer for a real RFC is the exact failure mode the challenge warns about.
- `POST /cep/verify`, because a Banxico signature cannot be validated by a mock.

### The synthetic run is the API's run

`src/lib/mock-data.ts` is generated, not written. `bun run web:mock` builds it from the same seeded
company the API serves under `SEED=sentryone`, at seed 69 for the week the judged documents cite: 44
suppliers, 92 instructions, the findings and decisions the six controls in `@hackmty/engine` produce
over them, and the 156 invoices of the company's 4103 that a screen of this app can reach. Do not
edit it; edit `scripts/web-mock.ts` and run the command.

This matters because it was not true. The API and this file used to disagree about the legal name of
every RFC they shared, so a supplier row and the drawer above it could name two different companies
for one RFC, and an API that dropped mid-demo renamed every company on the projector. That is issue
#125. `scripts/web-mock.test.ts` now fails when the committed file stops matching the generator, and
when the two sides stop answering the same legal name, amount, CLABE, action, finding or total.

Three things in the offline copy are deliberately narrower than the API's, all for the same reason and
all explained where they live in `src/lib/mock.ts`: the invoices are the ones this run settles, the
retroactive sweep prices or a finding names, the payment complements are the ones that settle those,
and the verified-beneficiary registry starts empty, which is what the API starts with too. The
invoices are the one narrowing a screen can see, because the supplier profile counts them, so that
field is read off the API whenever the API answered and labelled for this run when it was not.
`docs/07-architecture.md` carries the numbers.

## Layout

```
src/
  design/
    fonts.css         Hanken Grotesk, self-hosted, one variable file per subset
    tokens.css        colour, type scale, weights, spacing, radius, motion, light and dark
    base.css          element rules, in Tailwind's base layer
    primitives.css    .well .well-panel .card-dark .btn-pill .segmented .decision .badge
                      .level .state .data-table .toast .btn .chip .watermark, in the
                      components layer
    tokens.test.ts    the enforcement: no colour outside tokens.css, no token without a dark pair
    TokenSheet.tsx    every token and every base component on one page, at #/design
  lib/
    actor.ts          who the screens are acting as, the store the selector writes to,
                      and why a name and a role are not authentication
    api.ts            typed client for every route in docs/09-api.md, plus useEvents (SSE),
                      streamSse (a POST that answers a stream), executeRun and the
                      X-Actor header
    api-status.ts     one shared answer to "is the backend answering", for the status
                      card and the offline banner
    entry.ts          the entry screen's own rules: what each person may do, asked of
                      packages/core, and the thresholds with the file each one lives in
    contract.ts       the HTTP shapes, composed from packages/core/src/domain.ts
    mock.ts           the synthetic payment run, with every object flagged synthetic
    mock-data.ts      GENERATED by bun run web:mock: the API's own company, rows only
    resource.ts       useResource: loading, ready, error, and the API-or-mock decision
    router.tsx        hash router, ~120 lines, no dependency
    run-view.ts       how the run screen reads the run: order, verdict, the level and
                      the state per line, the facets and what the last refresh moved
    run-local.ts      a decision applied to the run in this browser and nowhere else,
                      which is how the recorrido's telephone call moves the figure
    keyboard.ts       arrow-key movement over a list of rows, as arithmetic
    count-up.ts       a figure that travels to its new value when the run re-scores itself
    payments.ts       which lines leave, which do not and why, and the bank layout
    supplier-profile.ts  the expediente: the weekly buckets, the accounts with their
                      plazas, both SAT lists and the consortium line
    format.ts         money, dates, CLABE blocks, digit diffs
    labels.ts         every Spanish word the clerk reads, in one dictionary
    sse.ts            the event-stream decoder, chunk boundaries included
    assistant.ts      the assistant contract: what a frame may say and what a click sends
    assistant-mock.ts the panel with no API, answered out of the synthetic run
    assistant-dock.ts whether the drawer is open, as a store the tour can write
    dictation.ts      voice input through the browser's own recogniser
    tour.ts           the nine stops of the recorrido, and the line it is about
    tour-call.ts      the call of the last stop: the number, the outcome, the refusals
    tour-store.ts     whether the recorrido is open, and that this browser has seen it
    theme.ts          light or dark, as a choice a person makes and this browser
                      remembers, never read off the operating system
  components/         AppShell (the rail and the top bar), Wordmark,
                      Icons (Rune Icons, Apache-2.0, vendored as paths; the active one draws
                      once per section change),
                      RunVerdict (the one figure), RunDonut (how the run splits),
                      RunFilter, Controls (the six controls),
                      States, Primitives, Evidence, Decision, Findings,
                      BehaviourChart (what a supplier invoiced, week by week),
                      StatusCard, OfflineBanner, IntakeQr, QrCode, Receipt,
                      AssistantDock, AssistantPanel, AssistantCards,
                      Tour (the recorrido over the real app), TourCall
  screens/            EntryScreen, RunScreen, PaymentsScreen, InstructionScreen, SupplierScreen,
                      IntakeScreen, SatScreen, CepScreen, MetricsScreen, VerifyCallScreen
```

The base components, which every screen is built from: `Button`, the `ConfidenceBadge` and
`TransactionStateBadge` of `Primitives.tsx` (the two vocabularies of ADR-0009), `DataTable`,
`Drawer`, `Toast`, and the `LoadingBlock`, `EmptyBlock` and `ErrorBlock` of `States.tsx`.
`docs/design.md` says what each one is responsible for. If a second screen needs the same
object, it belongs there rather than inside one screen.

Routes, all hash based so the static build needs no rewrite rule and the QR code survives a
change of host: `#/entrada`, `#/run?state=&level=&control=`, `#/payments`, `#/instructions/:id`,
`#/suppliers/:rfc`, `#/intake`, `#/sat`, `#/cep`, `#/metrics`, `#/verify-call`.

`#/design` is the token sheet: every token and every base component on one page. It is a
reference rather than a screen, so it is not in the rail and nothing in the product links
to it.

The rail holds seven of them, in four groups: the run, the payments and the intake, then
`Evidencia` with the 69-B list and the CEP, then the metrics, then `Entrada` on its own at the
foot, because who is acting and how this instance is configured is not a section of the run.
`#/verify-call` and `#/suppliers/:rfc` are not in it and are reached from the line they are about,
because a call is a step in a decision and an expediente is opened from a payment, and neither is a
place you go; the rail keeps `Corrida` lit while you are on either.

A finding links to the screen that proves it: a 69-B finding to `#/sat?rfc=...` with the lookup box
filled but not run, a beneficiary finding to `#/cep?rfc=...`, a CLABE or behaviour finding to the
call. The map is `EVIDENCE_ACTION` in `src/lib/labels.ts`. Nothing a link carries is submitted on
arrival: the official list is queried only when a person presses the button.

## The entry screen

`#/entrada` answers two questions the rest of the app assumes: who is acting, and what this
instance was configured with.

The person selector writes `src/lib/actor.ts`, which is the identity `X-Actor` carries on every
write, so the ledger records the name that is on screen. It is **not** authentication and the
screen says so where a judge reads it rather than only in
`docs/06-regulatory-privacy.md#44-the-identity-selector-is-a-demo-affordance-not-authentication`:
there is no password, no session and no check, the header is caller-controlled, and a deployment
that needs real identity puts authentication in front of the API.

Switching the person changes what the app lets you do, and the list that says so is not prose:
each row carries the `DecideRequest` it is about and `decideRequirement` in
`packages/core/src/actor.ts` answers it, the same function `apps/api` enforces. So the clerk sees
two rows she may not do, the owner sees three she may, and the screen cannot offer a button the
API would answer `403` to. The assistant panel reads the same selection, which is what decides
whether its proposal card asks for a second signature.

The settings are read-only and every number names the file and the constant it came from.
`entry.test.ts` opens those files and fails when one of them no longer exports what a row claims,
which is this repository's rule about numbers applied to a screen. The rail comes from
`GET /api/v1/rails` and is asked only of a server: under `?data=mock` the panel says nothing was
asked rather than inventing a configuration.

The offline banner is in the shell rather than on this screen, because it is true of the whole
page load: one line above every screen when the API was asked and did not answer, and nothing at
all when it answers or when `?data=mock` never asked. It and the status card read one shared
answer from `src/lib/api-status.ts`, so the two can never disagree and a page load asks `/health`
once.

## The payment run

`#/run` opens on the money, in pesos, and the four figures beside the dark card are the ones a
Capital One judge asked for: what was released, what this run puts at risk, what an Article 69-B
publication has already exposed retroactively over the base it was deducted on, and the total.
All four come from `runMoney` in `packages/core`, which is the same arithmetic behind
`totals` on `GET /api/v1/run/current`, so the tile and a judge's `curl` cannot disagree, and it is
read over the items rather than off the totals so it stays true after a decision applied with no
API behind the page. Each one counts up when it changes rather than being replaced between two
frames, and the same change is written out as a sentence in a live region under them, because a
figure that climbs is only visible to whoever happened to be looking at it.

Every line of the table carries its level and its state as words, `Nivel` and `Estado`, from
`lineLevels` in `src/lib/run-view.ts`: it reads the two fields the API attaches to each item and
falls back to `confidenceOf` and `transactionStateOf` from `packages/core` when a payload does not
carry them, which is the offline run and any server older than that field. The fallback is the same
function the API calls and never a second implementation, which is the whole of ADR-0009, and it is
narrower in exactly one way that is written down where it lives: the run payload carries no
verification, so a line the CEP blocked reads its decision here and reads `cancelado` on the server.

Three facets narrow the table under the segmented slice, `Estado`, `Nivel` and `Control`, plus
`Limpiar` and the count of what is visible. They live in the route query rather than in the
screen's own state, so a filtered table is a link somebody can send and a reload lands on the same
rows: `#/run?state=cancelado&level=alerta&control=sat_69b`. A value the domain does not have is
ignored rather than rendered as an empty table.

The number beside an option is counted over the slice the segmented control is showing and not over
the whole run, so an option offering a number yields that many rows, and one worth none in this
slice cannot be picked. A link that arrives with a facet the slice does not hold is the case that
survives: the table is empty, and the block under it says how many lines of the run do match and
offers the wider slice rather than telling a clerk to drop the filter they came with.

The table is navigable from the keyboard. Every row is focusable, the arrow keys move between rows
and do not wrap at either end, `Home` and `End` go to the first and the last, and `Enter` opens the
instruction. `nextRowIndex` in `src/lib/keyboard.ts` is that arithmetic with a test per edge. The
links and the buttons inside a row are still reachable with `Tab`, and `Enter` on one of them is the
link's.

The screen also moves on its own. A ledger event re-reads the run in place and never through the
loading state, because a page that blinks back to its skeleton while a judge watches the figures has
shown them nothing; the burst a publication emits is coalesced into one read. What moved is computed
by `diffRuns` and `verdictDelta`, the rows that moved are lit for a moment, and the sentence in the
live region names them.

## The payments screen

`#/payments` is where the run leaves and the one screen of this app that moves money, so the
rules it follows are written next to the code rather than here. Three are worth knowing before
reading it.

It answers two different questions with two different fields. Whether the run TAKES a line is
the decision, which is what `POST /api/v1/run/:id/execute` hands the rail; whether a line the
run took will be PAID is `transactionStateOf`, because a released line whose beneficiary came
back blocked reads `cancelado` and comes off the rail as a `cancelled` line with a reason. Both
tables show their lines with that reason, because a payment that disappears quietly is a payment
somebody believes they made.

Nothing leaves without a person: the button needs a second press and a name, the name travels on
`X-Actor`, and the ledger records it per line. The layout export is the no-API path, a CSV of the
lines that may still be paid and that no rail is holding, in SentryOne's own columns, which the
screen says out loud because every bank publishes its own template.

Offline it is the whole beat with no connection at all: `?data=mock` replays the generated
execution line by line, so the review, the progress, the receipts and the export are all
demonstrable on a phone in a corridor.

TODO(FabriBanda): this screen landed beside the redesign of issue 82 rather than inside it, so it
still wears the older panel language. The data layer is done and none of it is visual: adopting the
wells, the dark card and the row tiles is a restyle of `PaymentsScreen.tsx` and nothing under it.

The intake page reads `rfc`, `amount` and `clabe` out of its own query, so the QR code can
carry a prefilled instruction: `#/intake?rfc=SYN990202S02&amount=38417.48`. That RFC is the
one the screen's own placeholder shows, read off the run through `EXAMPLE_SUPPLIER_RFC`:
the example here used to carry `SYN010101AAA`, which belongs to the hand-written fixture in
`apps/api/src/synthetic.ts` and not to the company this app falls back to, so scanning it
prefilled a supplier the offline run does not hold and the demo API answers 404 for.

## The assistant drawer

`AssistantDock` mounts beside the shell rather than on a route, because the panel reads the line the
clerk is already looking at and opening it must not replace the screen underneath. The drawer itself
is `AssistantPanel`, the cards are `AssistantCards`, and the boundary they implement is ADR-0007: the
assistant reads and proposes, and a person executes.

Four properties, and each one is a function with a test rather than a paragraph here.

- **A tool call that writes cannot be rendered.** `decodeToolCall` in `lib/assistant.ts` refuses a
  frame whose `tool` is outside the seven reads of `AssistantTool` and any frame whose `readOnly` is
  not the literal `true`. The domain makes that shape unrepresentable in TypeScript; this is the half
  that matters when the bytes come off a socket.
- **No verdict reaches the screen.** `forbiddenVerdict` reads a sentence for the word "seguro" in
  either language and for a probability, a percentage or a score, all of which ADR-0009 forbids. A
  token, a proposal summary or a stored turn carrying one is dropped and counted, and the panel says
  how many frames it dropped. The same function is run over this folder's own sources by
  `lib/assistant.test.ts`, because the rule is about what a component renders and not only about what
  a model sends.
- **Nothing executes itself.** `ProposalCard` prints the method, the path and the body of the
  ordinary endpoint that would run, and the write happens in the click handler and nowhere else.
  `confirmProposal` sends `X-Actor` and puts the name of whoever pressed the button into `decidedBy`
  or `recordedBy`, because the API refuses a body and a header that disagree about who acted. A
  release over a finding asks for the owner's name and a written reason before the button enables.
  `execute_run` is the one proposal the panel does not execute: the run leaves from the payment-run
  screen, which follows its own stream line by line.
- **The level and the state are never the model's.** `assessConfidence` and `transactionStateOf` from
  `packages/core` compute both on the card, so a line in the drawer reads the same as the same line
  in the table.

Under `?data=mock` the drawer opens on the conversation the generator wrote out of this run's own
finding and answers every turn from the synthetic run, with no request and no model: `lib/assistant-mock.ts`
builds the reads out of the findings and the totals, and the header says so in one sentence rather
than letting a canned answer look like a generated one. Under `?data=api` it posts a turn to
`POST /api/v1/assistant/messages` and reports a failure as a failure; under `auto` a failure falls
back to the synthetic answer with the reason printed, exactly like `useResource`.

Voice input is the browser's own dictation (`lib/dictation.ts`), in `es-MX`, and this app uploads no
audio: the assistant endpoint takes `text` and `images`, so a recording would mean inventing a part
the contract does not have. The transcription path in `packages/extract` stays where it is documented,
on the intake, where a voice note arrives with a payment instruction.

## The guided tour

`Recorrido` is the answer to the judge who walks up while nobody is presenting. The app opens on a
dense financial table, and ninety-two rows of pesos do not explain themselves: `docs/10-demo-script.md`
is what a person says over this product, and the tour is what the product says when nobody is talking.

**It opens itself, once.** The first load of a browser gets the tour without asking for it, because
an invitation that has to be found is an invitation nobody takes, and a judge who walks up to an
unattended stand is not going to go looking for a button. That one visit is remembered in
`localStorage` under `sentryone:tour-seen`, written the moment it opens and read through a `try`, so
a private window is greeted every time rather than left in front of an unexplained table. The card
that appears carries `Saltar` and `Ver despues`, so the way out is on screen before anything else is.
It replaced a banner on `#/entrada`, which a visitor landing on the run never saw.

Two ways back in after that. The `Recorrido` button sits in the top bar beside the title, on every
screen and at every width, because the one free corner was already spent twice over by the assistant
dock and the toasts; closing the tour hands focus back to it. And `#/run?tour=1` opens it on arrival,
which is what a printed card or a message can carry.

The nine stops are `tourSteps` in `src/lib/tour.ts`. The first is a welcome card and not a stop: the
lockup, the headline `El ultimo control antes de que un pago sea irrevocable`, the three lines of
Lupita's Thursday, `Empezar el recorrido` and how long the whole thing takes. The other eight are the
run, the capture arriving on WhatsApp, the account and its plaza, the cent and the Banxico receipt,
the SAT publication, the run leaving, who signs, and the call. Each of those is `Paso N de 9`, a
title, at most two short sentences under twenty-eight words, and **one line that says what to look
at** -- `Mira la cifra grande`, `Presiona Simular publicacion 69-B` -- printed in its own style
because a visitor who reads nothing else on the card reads that one. `lib/tour.test.ts` counts every
one of those lengths and fails a stop that lights something up without naming it, and it fails a line
that names a side of the screen, because the assistant panel a stop used to place `a la derecha` is
the whole viewport at 390. The SAT stop carries both lists in one sentence each, the 69-B that this
screen replays and the 49 Bis that the SAT publishes one oficio at a time with no file to check. The
overlay that renders them is `components/Tour.tsx`.

It drives the real app rather than drawing pictures of it. Every stop navigates with `navigate`, the
screen underneath is the screen the copy is about, and the stop that is about the assistant opens the
real drawer -- which is why `AssistantDock` keeps its open state in a store (`lib/assistant-dock.ts`)
instead of in itself. The spotlight is four veils around a hole rather than one box with a hole cut in
it: the veils take the pointer so a stray click cannot derail the tour, and the gap does not, so the
control a stop is pointing at is still pressable. It polls for the element for two seconds after the
navigation, scrolls it once, draws a three-pixel ring in the hold red and re-measures on resize and
on scroll; a target that never appears leaves the card with no ring rather than a ring around
nothing. The ring travels from one target to the next under `--motion-base`.

The scroll is `scrollTopFor` in `lib/tour.ts` and not `scrollIntoView`, at both widths, because both
of that method's blocks were wrong here in their own way. `block: "start"` puts the element at `y: 0`,
which is under the sticky top bar: every ring measured at 390 had `top: 0` with the bar itself inside
the hole, and the stop that says `Presiona Simular publicacion 69-B` ringed the page title with the
button hidden behind the bar. `block: "center"` puts a block as tall as a findings section across the
middle of a desktop screen, where all four corners the card can take overlap it. The top of the
target goes `SPOT_TOP_GAP` under the bar instead, `.screen` keeps a screen of room at its foot while
the tour is open so that is reachable for a target near the end of a page, and scroll anchoring is
off there so a run that re-scores itself does not slide its own spotlight under the bar. A
`position: fixed` panel is left where it is, because scrolling for the assistant drawer would move
the screen underneath it and change nothing.

The card takes the first of the four corners that does not touch that hole, `placeCard` in
`lib/tour.ts`, and the rectangle it chooses is a unit test rather than a thing to check by eye. It
used to choose between left and right only, so the stop about the button that sends the run put its
card on top of that button whichever side it took. A top corner stands under the top bar rather than
on it, which is why `--topbar-h` is a token: the stylesheet and `CARD_TOP_GAP` have to agree about
that distance or the measurement is of a card that is not where it looks. Below `48rem` the card is a
bottom sheet instead. Progress is nine dots, arrows move, `Escape` leaves, focus goes to the card on
every step, and `useReducedMotion` is read where the animation is in JavaScript, exactly like the
drawer.

The arrows are on the window, because the stop that opens the assistant drawer hands the Tab order to
that panel, and the one exemption is a field of the tour's own card: the last stop has a telephone
number in it and a left arrow there has to move the caret. It was written as `INPUT`, `TEXTAREA` or
`SELECT` anywhere, which is how a judge driving by keyboard got stranded at `Paso 3 de 9`, the stop
that puts focus in the assistant's composer. `fieldKeepsKey` in `lib/tour.ts` is the rule and it takes
whether the field is inside the card.

What a stop points at is a `data-tour` attribute on the real element, and the names are
`TOUR_TARGETS` in `lib/tour.ts`. `lib/tour.test.ts` walks `src/` and fails when a name in that map is
not on any element, because an attribute removed in a refactor fails silently: the veil covers the
whole viewport and the step still reads fine.

**Two folios, one figure, and no constants.** The line the tour is about arrives from
`GET /api/v1/tour`, which derives it the way `heroOf` does offline: the largest held amount carrying a
CLABE forensics finding. A folio written into the tour is a tour that opens on a not-found page the
day the seed moves, which is the rule `brand/shoot.ts` already follows, and the peso figure the
welcome card says in prose is the same kind of constant, so it travels on `TourLinks` beside the two
folios rather than being typed into the paragraph a judge reads first.

`brand/shoot.ts` and `audit/audit.ts` both set `sentryone:tour-seen` on every document they open,
because a headless profile is a first visit every time and the first frame of a session would
otherwise come back with the welcome card over whichever screen it was meant to be of.

`heroOf` answers the API's own shape for both plazas, which is load-bearing rather than cosmetic:
`plazasOf` in `apps/api/src/routes/tour.ts` sends plain place names because the telephone call says
them out loud, and the usual one is computed from the accounts the supplier has actually been paid on
rather than read off `previousPlazaPlaces`, which only a `plaza_changed` finding carries. Reading that
key was one field with two shapes: offline the stop said the account had no history to compare
against while the API's script said it had moved city.

### The call

The last stop rings the visitor as the owner of the company, and it is the part of the product that
does not fit on a screen: the person who decides a held payment in a twenty-eight-employee company is
not at a desk, he answers his telephone between two other things.

- **The field takes the number the way a person writes it.** With spaces, brackets, a leading `+` or
  `00`, or none of that: `toE164` in `lib/tour-call.ts` normalises it and the line under the field
  says which telephone is about to ring, before anything is pressed. Ten bare digits are Mexican,
  eleven starting in `1` are the United States and Canada, twelve or thirteen starting in `52` are a
  Mexican number that lost its plus, and anything else is sent as it was written. The only refusal is
  fewer than eight digits. The version this replaced kept ten digits and deleted the rest, so a
  number typed with its country code became a different number and the button stayed dead in front of
  a full field.
- **The number is never stored.** It goes in the body of one `POST /api/v1/tour/call` and nowhere
  else, and the API keeps `sha256(salt + phone)` and not the number. The box has to be ticked before
  the button enables, and the card says so next to the button rather than leaving a dead control to
  be guessed at.
- **The actor is the owner, and the stored identity is untouched.** The request carries
  `X-Actor: role=owner; name=Visitante`, passed explicitly, while the browser keeps acting as whoever
  `#/entrada` selected.
- **It follows the ledger, not a poll.** The page reads the same `GET /api/v1/events` stream the run
  screen reads and asks `GET /api/v1/tour/call/:id` every four seconds only while that stream is not
  open. The run screen underneath re-reads itself on the same events, which is why the figure on the
  dark card moves while the visitor is still on the telephone.
- **And the answer reaches that figure with no server at all.** `hold` and `release` are applied to
  the line the stop is about through `lib/run-local.ts`, an overlay the run screen folds in while it
  renders. Without it the card printed `El dueno la libero bajo su nombre` over a figure that read
  the same string before and after the press, which is exactly what the stop exists to show: the
  spotlight is the figure rather than the row precisely because a released line leaves the slice the
  table is showing and the figure is always there to move. It is the decision and nothing else, it
  answers the same run object when nothing applies, and a reload is the seeded run again.
- **It does not release a payment.** The answer lands as a `verification_call` event and then as an
  ordinary decision with the owner's name on it, through the same path `POST /instructions/:id/decide`
  uses. `hold` and `release` are the two a person can say; `no_answer` and `unclear` are the telephone
  rather than the owner and leave the line exactly where it was.
- **It reverts itself.** The decision stands for `revertAfterMs`, ten minutes by default, and the
  sentence on the card is computed from the number the API sent rather than written out in words.
- **It refuses politely, and it always says something.** `403` says the calls are off on this server,
  `422` says the voice is not configured and shows the script anyway, and a `400` carries the API's
  own sentence. Anything else is printed exactly as it arrived, because a press that produces no
  request and no words is the one outcome a visitor cannot act on.

The stop is three things in a column and only ever one of them at a time is a form: the compact block
with the field, the consent line and the button; a strip of three underneath it, `Marcando`,
`En llamada`, `Termino`, because `processing` is the provider reading its own transcript and not a
thing that happens to the person holding the telephone; and then the result card with the badge and
the sentence. The block goes as soon as the call is under way, because a form still on screen while
the telephone is ringing is a form that gets pressed twice.

Under `?data=mock`, or against a server with `ALLOW_TOUR_CALLS` off or no voice configured, nothing
rings, and then the field and the consent box are not rendered at all: they are for placing a call.
What stands in their place is the reason nobody is dialling and the two answers a person can give,
`Retener el pago` and `Liberar el pago`, as the card's own primary pair. They used to sit under a
small `Simular` eyebrow beneath a live telephone field, so a judge filled in a number, ticked the box
and found nothing to press while the two loudest buttons on the card were `Anterior` and `Terminar`.
The strip and the result card then run exactly as they do for a real call, over the same seconds:
`SIMULATED_RING_MS` and `SIMULATED_TALK_MS` in `lib/tour-call.ts` are the call taking time rather
than an animation, so reduced motion does not collapse them and three chips lighting at once is not a
progression. The result says `simulado` on it and says that the corrida moved in this browser and the
ledger did not, because a simulated answer that looks like a real one is the one thing this stop must
not do. The script the agent would read, built from the same line by `localScript`, is under the
result in a `details` a visitor can open.

`localScript` is the stand-in and the card says so. The stored prompt lives in `packages/voice` and
the rendered call comes back from the API, including inside its `422`, so what the browser builds is
close to the words the owner hears without being them: it opens with the same `REQUIRED_DISCLOSURE`
the real line opens with, because a printed opening that claimed to be a person would be the one the
agent is forbidden to use, and `LOCAL_SCRIPT_NOTE` sits above it until the API sends its own script.
The two plazas go through `plazaNote` on the subject line and through the same three cases in the
script, the ones `plazasFor` in `packages/voice/src/owner-script.ts` reads: two places, one place, or
no history to compare against. The hero of the seeded run is the middle one, and a screen that
branched only on emptiness printed one city as though it were two.

The copy of the whole tour goes through the same rule as everything else: `lib/tour.test.ts` runs
`forbiddenVerdict` over every string a stop can render, so the word this product may not say, a
percentage and a probability cannot reach it, and the two loss figures in the first stop are written
as "de cada 100 pesos" for that reason. Both of them are this repository's own numbers, cited in
`docs/04-market.md` and `docs/05-business-model.md`.

## Picking up UI work here

Start the web on its own. It needs no Postgres, no API and no key: with the backend down it
renders the synthetic run and says on screen that it did.

```
bun install --frozen-lockfile
bun run --filter @hackmty/web dev      # http://localhost:5173
```

Three things are enforced, not requested, and each one fails a test rather than a review:

1. **No colour, radius, duration or font size outside `design/tokens.css`.** A hex, an `rgb(`
   or an `hsl(` anywhere else under `src/` fails `design/tokens.test.ts`. Add a token named
   for what it means -- `--c-hold`, never `--c-red`.
2. **Every colour token needs a dark counterpart.** A token defined only in `:root` keeps its
   light value on a near-black page, and the person who added it was in light mode. Same test.
3. **Exactly one `h1` per page**, and it belongs to the shell's top bar. A screen that wants a
   page-level heading renders at most one `SectionHeader`, which is an `h2`.
   `screens/states.test.ts` checks it, along with every screen having a loading, an error and
   an empty state.

Then verify what you changed, in this order:

```
bun run --filter @hackmty/web typecheck
bun test apps/web
bun run lint                           # biome, and it catches CSS specificity inversions
bun run --filter @hackmty/web build
bun run --filter @hackmty/web preview --port 4173   # in one terminal
bun run audit:web                                   # in another
bun run shoot:web                                   # regenerate assets/screenshots
```

`bun run audit:web` is the one worth knowing about. It drives a real browser over all six
screens at 390, 768, 1440 and 1920, and reports anything that pushes the document wider than
the viewport, anything focusable that Tab cannot reach or that has no name or no focus ring,
whether reduced motion actually reaches the tokens, and the contrast of every colour pair in
both themes. It has caught, in this order: a rail that scrolled the page sideways on a phone,
six invisible links a keyboard user tabbed through, an amber that measured 2.4 where 3.0 was
needed, and a muted ink that was fine on one ground and under AA on another. It needs a
preview server on `:4173`, and it exits non-zero on any failure. Add a pair to its `PAIRS`
list whenever you add a surface: a surface only one screen uses is the one that ships
unmeasured.

## Design system

`tokens.css` is the only file allowed to hold a colour, a radius, a duration or a font size.
A component that needs a new one adds a token there, named for what it means.

Every value in it is taken from Gravity, Capital One's own design system, rather than
invented. The long version is `docs/design.md`; the short version:

- **One accent** (`--c-accent`), Capital One's brand navy, used for focus, links and the
  primary action, nothing else.
- **Three semantic decision colours**, mapped one to one onto the `Action` union in the
  domain: `--c-hold`, `--c-verify`, `--c-release`. Severity reuses the same three, so one
  colour always means one thing. Colour is never the only signal: every state also says what
  it is in words.
- **Weight does the work a second typeface usually would**, which is the thing that makes
  Capital One's pages read as two fonts when they are one. Display is `--weight-light` (300),
  navigation and table data are 400, emphasis is 600. Below 15px nothing goes lighter than
  400. `--weight-thin` (100) exists for display copy that is not money.
- **The rail has its own palette** (`--c-rail*`) because it is a navy brand panel and every
  ink token on the page is dark on dark inside it. That includes the focus ring, which is
  inverted by `.rail :focus-visible`.
- **One dark card per screen** (`--c-card-dark`), under the single figure the screen exists
  for. It is the rail's navy with a dot grain, not a status colour, because the status
  colours are in the table below it. Everything else sits in a pale well (`--c-well`), with
  a white panel (`.well-panel`) inside the dense ones.
- Tabular numerals everywhere money appears (`.num`, `.num-lg`, `.num-xl`),
  so a column of pesos lines up digit over digit. `<Amount size="inherit">` takes the size of
  the block around it.
- **The level and the state** of ADR-0009 have their own named colours (`--c-level-*` and
  `--c-state-*`). The level aliases the three decision triplets, because a level and an
  action are two readings of one body of evidence. The state does not: `enviado` is the
  informational tone and not green, because money that left is a fact and not a verdict.
  Never a probability and never the word "seguro" in either, which `src/lib/labels.test.ts`
  enforces over the whole dictionary and then over every source file.
- **Light is the default, on every machine, and dark is a choice.** The app opens light
  whatever the operating system is set to, and the switch is the sun-and-moon button in the
  top bar, remembered in `localStorage` under `sentryone:theme` by `src/lib/theme.ts`. The
  dark palette hangs off `:root[data-theme="dark"]` rather than `prefers-color-scheme`, and
  `main.tsx` writes the attribute before the first render so there is no flash. Only colour
  tokens change between the two. The rail palette is the exception and is identical in both.
- **Icons come from Rune Icons** (Apache-2.0, copyright Nexvyn) and from nowhere else. No
  icon library is installed: the paths are vendored into `Icons.tsx`. The active rail icon
  draws itself once per section change, over `--motion-draw` and on `--ease-draw`.
- **Charts are Recharts, styled only through the tokens**: `var(--…)` strings for every fill
  and stroke, and the `useToken` hook in `src/lib/tokens.ts` for the few props that have to be
  numbers. Two of them ship, both on the run: the donut that splits the week's money and the
  bars that show the pesos at risk per control.
- Reduced motion switches every duration token to 1ms, so CSS transitions stop in one
  place. Components that animate in JavaScript read the same preference through
  `useReducedMotion` from `motion/react`.

Primitives live in Tailwind's `components` cascade layer, so a utility class on the same
element still wins and spacing can be nudged without fighting specificity.

## Rules this folder follows

From ADR-0002, and they are not negotiable:

- The `datos sinteticos` watermark is rendered from the `synthetic` flag on the payload, by
  `SyntheticMark`, and never from a hardcoded name. `src/lib/mock.test.ts` fails if any
  object in the synthetic run loses the flag.
- A real RFC appears only in the SAT lookup box. Every synthetic RFC has the shape
  `SYN<6 digits><3 letters>` and the test asserts it.
- No finding accuses anyone. States are `comprobable` and `requiere_verificacion`, and a
  person confirms every decision.
- The raw message text of an instruction is shown as context and never feeds a decision.

## What is deliberately not here

- **The detectors.** They belong in `packages/core` and land in their own pull request. The
  UI reads `Finding` and `Decision` and renders them; it never computes one.
- **Screenshots by hand.** `assets/screenshots/` is generated: `bun run shoot:web` against a
  running preview writes all ten, so a UI change is one command away from updated evidence.
  Never edit those files; re-shoot them.
- **The replay animation** on the SAT screen. The months are real and the bar moves; walking
  the ledger month by month and lighting up each newly listed supplier is the next step.
- **A QR image.** Generating one needs a dependency, and the rule is zero new dependencies.
  The intake URL is a plain hash link that any QR generator can take.

## Accessibility

Every route is reachable by keyboard: navigation is real anchors, the drawer is a
`role="dialog"` that takes focus, traps Tab, closes on Escape and gives focus back, and the
scrim is a button rather than a div with a click handler. Tables have scoped headers, a
caption and a row header. The focus ring is defined once in `base.css`, from `--c-focus`,
`--focus-width` and `--focus-offset`.

`bun run audit:web http://localhost:4173` measures it against the built app: overflow at four
widths, every control named and ringed under a real Tab press, reduced motion, and every
colour pairing in both themes. It reports clean as of #207. Two environment variables keep it
from colliding with somebody else's browser on the same machine: `AUDIT_PORT` here and
`SHOOT_PORT` in `brand/shoot.ts`, each with its own profile directory derived from the port.

`TODO(FabriBanda)`: a pass with a screen reader on the intake page.

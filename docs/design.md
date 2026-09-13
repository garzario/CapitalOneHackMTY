# Design system

The rationale behind `apps/web/src/design/tokens.css`. Read this before adding a
colour, a size or a transition. The token file is the law; this file is why.

Audience check first, because it decides everything below: the person using this
is the sole administrative clerk in `docs/02-persona.md`, on a laptop, on a
Thursday, deciding whether to release money that does not come back. The other
audience is a judge standing at the table for four minutes. Neither of them
wants to be delighted. Both of them want to read a number and be sure of it.

## The one rule

Nothing outside `tokens.css` writes a hex value, a pixel radius or a transition
duration. A component that needs a colour adds a token named for what it means,
never for what it looks like: `--c-hold`, not `--c-red`. This is enforced, not
requested: see `apps/web/src/design/tokens.test.ts`.

The payoff is the reason to bother. The three decision colours map one to one
onto the `Action` union in `packages/core/src/domain.ts`. When the engine gains
a fourth action, the compiler and the token file disagree in the same commit,
which is the cheapest place to find out.

## Colour

Sober and financial. One accent, three semantic decision colours, no decorative
colour anywhere. None of the values are invented.

SentryOne is presented as an extension of Capital One, so the palette is lifted
from Gravity, Capital One's own design system, read from the `--gds-*` custom
properties their production stylesheet ships. Two of those values do most of the
work of making the app look like it belongs to them:

- **The page is white**, exactly as `--gds-color-background-page` is. The warm
  cream `#f7f4ee` from `background-base-02` appears only where a surface has to
  sit *below* the page: a hover, a track, a recessed tile. A cream page and a
  white card is a different product than a white page and a bordered card, and
  capitalone.com is the second one.
- **The neutrals are warm.** Gravity's darkest ink is `hsl(34 21% 6%)`, a
  brown-black. The blue-black a default palette reaches for is the single
  quietest tell that nobody chose the colours.

Then:

- **One accent, `--c-accent`,** Capital One's brand navy `#013d5b`, Gravity's
  `background-brand`. Focus rings, links, the active rail item, the primary
  action. Nothing else. A second accent would compete with the decision colours,
  and the decision colours are the only thing on screen that should pull the eye.
- **Three semantic colours,** `hold`, `verify`, `release`. Each has a `-soft`
  background and an `-ink` foreground so a chip never mixes a token from one
  triplet with a token from another. `release` is Gravity's
  `favorable-emphasis-high`, an olive rather than the emerald every component
  kit ships, and it is the most recognisably Capital One colour in the app.
- **`--c-info`** is the neutral tone for a finding that carries no decision
  weight, so an informational chip cannot be mistaken for a hold.
- **An alias is a token too.** `--c-level-alerta: var(--c-hold)` is how the level
  palette is defined, and the alias has no entry in the dark block because a
  custom property resolves where it is used: it picks up whatever the token it
  points at is worth under the current scheme. The token test knows that rule and
  checks the other half of it, that the target exists.
- **`--c-watermark`** is deliberately low contrast. The synthetic-data mark has
  to survive a screenshot without competing with the pesos. It is rendered from
  the `synthetic` boolean on the object, never from a name, so it cannot be
  faked off.

Red, amber and green carry an obvious risk: roughly one man in twelve cannot
separate the first two reliably. Colour is therefore never the only channel.
Every decision state also carries its word (`Retener`, `Verificar`, `Liberar`)
and its own position in the layout. If you find yourself adding a state that is
distinguishable only by hue, you have added a bug.

### The rail is a brand panel

The rail's ground is `--c-rail`, Capital One's brand navy, the same value as
`--c-accent`. That is the point: the one piece of furniture that is on every
screen is theirs, and it is the first thing in the reading order.

It therefore carries its own small palette -- `--c-rail-ink`, `-ink-muted`,
`-active`, `-active-ink`, `-line` -- because every one of the page's ink tokens
is dark on dark in there. Two consequences that are easy to miss and were both
real bugs before the audit caught them: the app's focus ring is the brand navy,
which is this panel's ground, so `.rail :focus-visible` inverts it or keyboard
focus vanishes exactly where a keyboard user starts; and `.subtle` and `.muted`
are overridden once at the rail's root rather than element by element.

The rail palette does not change between themes. A brand colour that shifts with
the operating system is not a brand colour, and the navy holds on both grounds.

Capital One's lockup in the rail's foot is the reverse version in both themes
for the same reason: their navy wordmark on their navy is nothing.

### The one tinted surface

`--c-accent-tint` is the pale end of the same Capital One blue ramp, and it has
one job: it is the ground under the single figure each screen exists for. A
dashboard of white cards on a white page has no centre, and the eye starts
reading rows before it has read the number those rows explain. The tint is brand
blue rather than a status colour precisely because the status colours are three
centimetres below it in the table, and a summary that competes with its own
exceptions has spent its loudest signal in the wrong place. It is checked against
`--c-ink`, `--c-ink-muted` and `--c-ink-subtle` by `bun run audit:web`, in both
themes, because a surface only one screen uses is exactly the one that ships
unmeasured.

`--c-brand-red` is Capital One's swoosh red, taken from their own lockup. It
appears in exactly one place, the attribution in the rail, and never as a UI
colour: a red that means "Capital One" and a red that means "this payment is
held" cannot be the same red on the same screen.

### What colour is spent on, and what it is not

The run used to paint a decision chip and three decision buttons on every row.
Thirteen rows made fifty-two coloured objects and the eye stopped reading any of
them. A row's decision is now a 3 px mark on its left edge and a word in its own
column. Colour in a table marks the exception; a table where every row is
coloured has marked nothing.

## The level and the state

ADR-0009 gives the product two vocabularies and `packages/core/src/levels.ts` is
the only place either is derived. They are two different questions and a screen
shows both, so they are two different chips.

**The level** is `confiable`, `precaucion` or `alerta`: how much the evidence is
trusted. Its palette aliases the three decision triplets, and that is deliberate.
The level and the action are two readings of one body of evidence, so a fourth
hue on the same row would mean nothing pulls the eye. The names exist anyway, so
the mapping is a line in `tokens.css` instead of a decision buried in a
component.

**The state** is `rojo`, `cancelado` or `enviado`, plus the two the run counts
internally, `pendiente` and `liberado`: where the money stands. Its palette is
deliberately not the decision one repeated, because a state is a fact about money
and not a verdict about risk:

- `enviado` is the informational tone and **not green**. Money that left is a
  fact. A green chip would say the payment was fine, which is a claim nobody can
  make about a transfer that cannot be recalled and that a list published on
  Friday can still poison.
- `cancelado` is neutral and firm rather than red. It is a closed line, not an
  alarm. The thing that needs somebody now is `rojo`.
- `pendiente` fills with the surface it sits on and carries a dashed border, so
  the chip is its outline and its word. Nothing has decided that line and the
  chip must not imply otherwise.

Two rules bind both chips and they come from the product, not from taste.

**Never a number.** No probability, no percentage, no score, in either chip or
anywhere else on a screen. `estimateLoss` says in its own comment that its figure
is an upper bound on the evidence rather than a calibrated probability, so 0.73
next to a supplier's name would be a precision nobody earned.

**Never the word "seguro", in any language.** `confiable` is a statement about the
documents we hold. "Safe" would be a guarantee about a SPEI. Both rules are
enforced over the whole copy dictionary by `apps/web/src/lib/labels.test.ts`,
which also walks every source file for the second one.

The level chip carries a three step meter beside its word, one bar for
`confiable` and three for `alerta`. That is not a score and must never become
one: it encodes exactly the information the word encodes, an ordinal over three
values, and it exists because roughly one man in twelve cannot separate the red
from the amber reliably. The state chip carries a dot and, for `pendiente`, a
dashed border. In both, the word is real text and the colour is the second
channel.

## The base components

`apps/web/src/components/` holds them and every screen is built from them. Two
web fronts are adding screens on top of this set, so the rule is the same as for
tokens: if a second screen needs the same object, it belongs here.

| Component | What it is responsible for |
|---|---|
| `Button` | The `.btn` family with a tone, a size and `busy`. A busy button disables itself and swaps its label for one that says what is happening, because a spinner is not a sentence and a run sent twice does not come back |
| `ConfidenceBadge`, `TransactionStateBadge` | The two chips above, in `Primitives.tsx`, with their meter, their dot and their words |
| `DataTable` | A column list rather than hand-written markup, so the caption, `scope="col"`, the row header, the right-aligned money column and the horizontal scroll container are defaults instead of things each screen remembers |
| `Drawer` | Scrim, Escape, focus in, focus back, and a Tab trap. It closed a `TODO` in `apps/web/README.md`: focus used to walk out of the supplier drawer into the run behind the overlay, where the ring was invisible and the next Enter pressed a button nobody could see |
| `Toast` | One live region mounted by the shell. Confirmations clear themselves after six seconds; a refusal has no timer at all, because the line that says why a payment was rejected is the one the clerk has to read |
| `LoadingBlock`, `EmptyBlock`, `ErrorBlock` | The three states every screen owes a judge, enforced per screen by `apps/web/src/screens/states.test.ts` |

Focus is one ring, defined once in `design/base.css` from `--c-focus`,
`--focus-width` and `--focus-offset`. Every control in the app is a real
`button`, `a`, `input`, `select` or `summary`, so there is no second affordance to
maintain, and the audit presses Tab to check that the ring actually appears.

## The token sheet

`#/design` renders every token and every base component on one page, in whichever
theme the browser is in. It is a reference and not a screen: it is not in the
navigation and nothing in the product links to it.

The values on it are read out of the live stylesheet with `getComputedStyle`
rather than typed into the page, so it cannot drift from `tokens.css`. It is also
the one route where every chip, button and state is on screen at once, which is
why `apps/web/audit/audit.ts` audits it.

To capture it, with the app served:

```
bun run shoot:web http://localhost:4173
```

which writes `assets/screenshots/tokens-light.png` and `tokens-dark.png`.

## Type

**The finding that shaped this section.** Capital One's pages look like they use
two typefaces: a crisp one in the navigation and a soft, round, airy one in the
content. They do not. It is Optimist throughout, and the difference is entirely
weight. Measured off capitalone.com:

| Role | Weight | Size |
|---|---|---|
| Display headline | **100** | 48px |
| Sub-head | **300** | 24-40px |
| Body prose | **300** | 16px |
| Navigation, controls, table data | **400** | 14-16px |
| Emphasis, eyebrow | **600** | 14-16px |

Thin strokes expose a humanist face's round shapes; heavy ones hide them. That
is the whole trick, and it is why a heading here is `--weight-light` and not
semibold: a heading earns its hierarchy from size and space, and reaching for
weight as well is belt and braces that reads as shouting at 24px and up.

The rest:

- **`--font-sans` is Hanken Grotesk,** self-hosted from `public/fonts`. Optimist
  is licensed to Capital One; Hanken Grotesk is the closest open face, with the
  same humanist grotesque proportions and near-identical digits, which is the
  part that matters in a column of pesos. It is variable from 100 to 900, so it
  can do the weight trick above. Self-hosted and not from a CDN because the demo
  has to survive a room with no Wi-Fi, and a font that silently falls back to
  Arial takes the product's whole visual identity with it. One variable file per
  subset, two subsets, two requests.
- **`--font-mono`** is Gravity's `--gds-font-family-code`, verbatim. It is for a
  CLABE, a UUID and a clave de rastreo, where a character has to be identifiable
  one at a time.
- **The one place the weights stop at 300 rather than 100** is the run's headline
  figure. Capital One sets display copy at 100; these are digits somebody is
  about to act on, and at 100 the strokes of a 5 and a 6 start agreeing with
  each other. `--weight-thin` exists for display copy that is not money.
- **The table keeps 400 and 500.** Light type is for the editorial register, and
  a dense financial table is not one. Below 15px nothing goes lighter than 400.
- `--numeric-tabular` is applied to every peso figure. Digits share one advance
  width, so a column of amounts lines up digit over digit and a judge can compare
  two rows without reading them.
- **Nothing is uppercase.** `.eyebrow` and the table headers were uppercase with
  wide tracking, which is the fastest way to make six unrelated labels look like
  one generated template. Sentence case, one step down the scale, same job.

## Space, radius, elevation

A 4 px step scale, and Tailwind's own spacing scale is the same ruler, which
is why a `p-5` utility and `var(--space-5)` never disagree: both are 1.25 rem.
That is the reason utilities are allowed to sit next to primitives at all.

A 4 px step scale. `--layout-max` is 1600 px, and the width is spent on the
payment run: the table needs four columns and the controls panel beside it.
Prose inside that width is held to a reading measure by `max-w-prose` where it
matters.

**The rail.** The six sections live in a collapsible left rail rather than a row
of tabs, because they are not peers: the payment run is the product and the
other five are evidence you open from it. It collapses to `--rail-width-collapsed`
and the choice is stored, not inferred from a breakpoint, because the run is a
wide table on a 13-inch laptop and the person who wants the labels back should
get them at any width. Below 60rem the rail becomes an overlay: a 15rem column on
a phone leaves nothing for the table it exists to navigate.

Radius is Gravity's rounder scale, `xs` 4 px to `xl` 16 px, plus `pill`, which
is the one capitalone.com itself uses: 8 px on a control, 12 px on a card, 16 px
on a panel that holds other panels. It still steps -- a control is not as round
as the card it sits in -- because one radius stamped on every box is what
flattens a hierarchy into a pile of identical tiles.

Elevation is almost gone. `--shadow-1` is `none`: a card is a hairline border on
a white page, which is what capitalone.com does and what a dense financial table
needs. A shadow is a claim that an element is above the page, and only the drawer
makes that claim, with `--shadow-3`.

## Motion

Three durations, `fast`, `base`, `slow`, and two easings. Every transition in
the app reads one of them, which means reduced motion is a single switch: under
`prefers-reduced-motion: reduce` the three durations collapse to 1 ms and the
whole app stops moving without one component checking a media query.

Motion here is informational. A row changes state, the sweep replays a
publication, an instruction arrives from the intake page. It reports that
something happened. There is no motion whose purpose is to look expensive.

## Light and dark

Light is the default and dark follows the operating system. Only colour tokens
are redefined for dark. Type, spacing, radius and motion do not change with
theme, so a layout can never be correct in one theme and broken in the other.

Every colour token defined in `:root` has a dark counterpart. That is also
enforced by the token test, because a colour that exists only in light renders
as nothing in dark, and nothing is the one failure mode you do not notice in a
screenshot taken at midday.

## The mark

A solid shield in the brand navy.

It is the only figurative thing in the app and it earns that by being the
product: a sentry stands in front of a payment and does not let it past until
someone looks. There is no interior detail, because at 20 px interior detail is
mud and the collapsed rail renders it at 20 px more often than anywhere else.
Three cleverer marks were drawn and thrown away: a shield with a check in it,
which is the most reused shape in software and says "verified" about a product
whose entire point is that it does not tell you something is safe; a shield split
by a bar, which read as a battery; and the previous mark, a geometric C in a
rounded square, which was the initial of a name the product no longer has.

The word is set the way Capital One sets theirs: one word, semibold, tight
tracking, no italic and no swoosh of our own. Borrowing their typography is the
claim SentryOne is making; wearing their logo as our own would be a different and
untrue one. Their lockup does appear, once, in the rail's foot under a rule and
next to the words that say what the relationship is -- attribution, in the place
a credit line goes. It is deliberately as far as it can be from the SentryOne
mark at the top of the same rail, because two marks side by side in a product's
header is the visual grammar of "a Capital One product".

The lockup lives in `apps/web/src/components/Wordmark.tsx` and is the only place
the logo is drawn. It sits in the rail, small. What a judge should be reading is
the payment run.

## Screen states

Every screen is designed in four states, not one. The default is the state that
gets drawn in a mockup; the other three are the states a judge actually hits,
because the venue wifi is shared with four hundred people and the API is one
process on one box.

| Screen | Default | Loading | Empty | Error |
|---|---|---|---|---|
| Payment run | The week's run, exceptions first, alert rail beside it | Skeleton rows | No instructions this week, with a link to the intake page | Error block with retry, or the synthetic run with the fallback stated on screen |
| Instruction detail | The instruction, its findings, the decision | Skeleton rows | No findings: the six controls ran and found nothing | Not found, quoting the identifier that was asked for |
| QR intake | The form | The submit button reports itself busy, and a line says the controls are running | Submitted and clean: the six controls ran, nothing to review | The write failed, with the form still filled in so it can be retried |
| Article 69-B | The lookup box and the replay control | Busy on both controls | Nothing found for that RFC | The list could not be read |
| CEP viewer | The CEP, its signature and the name comparison | Skeleton for the registry | No beneficiary verified yet | The CEP could not be fetched or parsed |
| Metrics | Precision, recall and the false-positive rate per detector | Skeleton | No labelled cases loaded yet | The evaluation could not be computed |

Two rules behind that table. A screen that falls back to synthetic data says so
on the screen, every time, because a demo that quietly falls back is a demo that
lies. And an error state always names what failed and offers the retry, because
"algo salio mal" tells the clerk nothing and tells a judge less.

The empty states are not filler. Three of them are the good outcome: an
instruction with no findings, a run with nothing held, a supplier with no
verified beneficiary yet. They are written as answers, not as absences.

## The demo path

The five beats in `docs/10-demo-script.md` map onto these screens with nothing
left to improvise:

| Beat | Screen | The state it must be in |
|---|---|---|
| 1. The payment run | Payment run | Default, with the run loaded and the rail populated |
| 2. The 69-B replay and a real RFC | Article 69-B | Default, then busy during the replay, then the lookup answering |
| 3. An instruction arriving by QR | QR intake on the judge's phone, payment run on the projector | Intake busy then answered; the run gains the row over the event stream |
| 4. The real CEP | CEP viewer | Default, with the signature checked and the names side by side |
| 5. The metrics | Metrics | Default, with the case count next to every figure |

Beat 3 is the one to protect: it is the only beat where the judge's own action
produces the change, and it crosses two screens and the event stream. If the
stream drops, the run screen says the stream is closed and offers to reconnect
rather than showing a stale table, which is the difference between a recoverable
beat and a lost one.

## The accessibility pass, measured

`apps/web/audit/audit.ts` runs the four checks issue #96 asks for against the
built app, and exits non-zero when one fails. Run it with the app served:

```
bun run apps/web/audit/audit.ts http://localhost:4173
```

It reports clean on all four as of the run that closed #207: no horizontal
overflow at 390, 768, 1440 or 1920 on any of the ten screens or the token sheet;
every focusable control named, reached by a real Tab press and showing a focus
ring; reduced motion collapsing all three duration tokens to 1 ms with nothing on
the page still transitioning; and all 52 colour pairings at or above their floor
in both themes, the level chips, the state chips and the focus ring included.

Two defects in the audit itself were fixed to get that run, and both had been
quietly making it say less than it looked like it said.

- **The routes had no `#`.** This app is a hash router and `App.tsx` rewrites an
  empty hash to the payment run on the first paint, so navigating to `/metrics`
  served index.html, the app redirected itself, and the audit measured the run
  screen inside a row labelled "metrics". Every row of the report was the same
  screen, which is visible in hindsight: all seven answered with the same
  focusable count to the digit. `brand/shoot.ts` had already learned this lesson
  and written it down; the audit had not.
- **A fixed element was measured against the wrong box.** Under device emulation
  the initial containing block follows `window.innerWidth` rather than the layout
  viewport, so at a 390 override in a 751 px window the toast region, anchored
  with `left` and `right`, measured 719 and was reported as a horizontal overflow
  that does not exist on a phone. A fixed subtree is now measured against its own
  containing block, which still catches one that is genuinely too wide.

One token moved as a result, and it was not a close call:

| Token | Was | Is | Why |
|---|---|---|---|
| `--c-state-cancelado` | `--c-border-strong` | `--c-ink-subtle` | 2.99 against the sunken fill this chip has, under a floor of 3 for the boundary of a non-text element. `--c-border-strong` is tuned against a panel, and this chip's border is the thing that says the line is closed |

A third hazard is not in the app at all but cost a wrong screenshot, so it is
written down here: `brand/shoot.ts` takes `SHOOT_PORT` and `audit/audit.ts` takes
`AUDIT_PORT`, each deriving its own profile directory from the port. Two Chromes
launched with the same `--user-data-dir` are one Chrome, the second caller drives
the first caller's page, and on a build night with four people on one machine the
shutter fires on somebody else's screen with no error anywhere. It cost two wrong
screenshots on two branches before either of them was believed: one capture of
this token sheet came back holding another branch's not-found page, in the wrong
theme, under our file name.

Four values had moved earlier, in the run that closed #96, and they were not
close calls either:

| Token | Was | Is | Why |
|---|---|---|---|
| `--c-ink-subtle` light | `#7c838f` | `#676d77` | 3.34 on a sunken panel, against a floor of 4.5 |
| `--c-ink-subtle` dark | `#79828f` | `#7f8794` | 4.25 on a sunken panel |
| `--c-watermark-ink` | tracked ink-subtle | tracks it still | the sentence that says the data is synthetic has to be readable |
| `--c-border-strong` | `#c8cdd6` / `#39404c` | `#878b91` / `#646973` | 1.60 and 1.72 against a floor of 3. This is the border of `.btn` and `.input`, and `.btn` has the same background as the panel behind it, so the border is the only thing that says a button is there |

The border change is the one with a visible cost: buttons and inputs read
heavier than they did. That is the correct trade. A control whose boundary
measures 1.6 against its own background is not a subtle control, it is an
invisible one, and this is a screen where people move money.

Contrast is measured in the browser rather than read out of `tokens.css`,
because half the values are `rgba` over a surface and what matters is the
composited pixel, not the declaration.

## What this is not

No purple gradient. No emoji, in the interface or in the docs. No illustration.
No dashboard filler: a card that does not change a decision does not go on the
screen. No accented characters in interface copy, which is a repository-wide
convention rather than a design one, but it is visible here so it is written
down.

## Open

- The type is Hanken Grotesk, self-hosted in `apps/web/src/design/fonts.css`, so
  the bullet that used to sit here about a system font stack is answered.
- The base components are tested by reading sources and by the audit in a real
  browser, not by rendering them in a unit test. Adding a renderer means adding a
  dependency, and the rule for this repository is zero new ones before the demo.
  What that leaves uncovered is behaviour: the Tab trap in `Drawer` and the timer
  in `Toast` are verified by hand and by the keyboard pass of the audit.

# apps/web

The judge-facing UI. Vite, React, Tailwind, motion. Six screens, one design system,
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

Two things never fall back, on purpose:

- `GET /sat/lookup`, because the official Article 69-B list does not travel in the bundle
  and inventing an answer for a real RFC is the exact failure mode the challenge warns about.
- `POST /cep/verify`, because a Banxico signature cannot be validated by a mock.

## Layout

```
src/
  design/
    fonts.css         Hanken Grotesk, self-hosted, one variable file per subset
    tokens.css        colour, type scale, weights, spacing, radius, motion, light and dark
    base.css          element rules, in Tailwind's base layer
    primitives.css    .shell .rail .topbar .panel .card-head .figure-block .segmented .decision
                      .row-mark .data-table .btn .chip .badge .watermark, in the components layer
    tokens.test.ts    the enforcement: no colour outside tokens.css, no token without a dark pair
  lib/
    api.ts            typed client for every route in docs/09-api.md, plus useEvents (SSE)
    contract.ts       the HTTP shapes, composed from packages/core/src/domain.ts
    mock.ts           the synthetic payment run, with every object flagged synthetic
    resource.ts       useResource: loading, ready, error, and the API-or-mock decision
    router.tsx        hash router, ~120 lines, no dependency
    format.ts         money, dates, CLABE blocks, digit diffs
    labels.ts         every Spanish word the clerk reads, in one dictionary
  components/         AppShell (the rail and the top bar), Wordmark,
                      Icons (Rune Icons, Apache-2.0, vendored as paths; the active one draws
                      once per section change),
                      RunVerdict (the one figure), RunFilter, Controls (the six controls),
                      States, Primitives, Evidence, Decision, Findings, SupplierDrawer,
                      StatusCard, IntakeQr, QrCode
  screens/            RunScreen, InstructionScreen, IntakeScreen, SatScreen, CepScreen,
                      MetricsScreen, VerifyCallScreen
```

Routes, all hash based so the static build needs no rewrite rule and the QR code survives a
change of host: `#/run`, `#/instructions/:id`, `#/intake`, `#/sat`, `#/cep`, `#/metrics`,
`#/verify-call`.

The rail holds five of them, in three groups: the run and the intake, then `Evidencia` with the
69-B list and the CEP, then the metrics. `#/verify-call` is not one of them and is reached from
the instruction it is about, because a call is a step in a decision and not a place; the rail
keeps `Corrida` lit while you are on it.

A finding links to the screen that proves it: a 69-B finding to `#/sat?rfc=…` with the lookup box
filled but not run, a beneficiary finding to `#/cep?rfc=…`, a CLABE or behaviour finding to the
call. The map is `EVIDENCE_ACTION` in `src/lib/labels.ts`. Nothing a link carries is submitted on
arrival: the official list is queried only when a person presses the button.

The intake page reads `rfc`, `amount` and `clabe` out of its own query, so the QR code can
carry a prefilled instruction: `#/intake?rfc=SYN010101AAA&amount=184300`.

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
- **One tinted surface per screen** (`--c-accent-tint`), under the single figure the screen
  exists for. It is brand blue and not a status colour, because the status colours are in
  the table below it.
- Tabular numerals everywhere money appears (`.num`, `.num-lg`, `.num-xl`, `.figure-value`),
  so a column of pesos lines up digit over digit. `<Amount size="inherit">` takes the size of
  the block around it.
- Light is the default, dark follows the operating system, and only colour tokens change
  between them. The rail palette is the exception and is identical in both.
- **Icons come from Rune Icons** (Apache-2.0, copyright Nexvyn) and from nowhere else. No
  icon library is installed: the paths are vendored into `Icons.tsx`. The active rail icon
  draws itself once per section change, over `--motion-draw` and on `--ease-draw`.
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
- **`recharts`** is declared and currently unused. It is a vetted pin and the per-detector
  table is the obvious first chart. If it is still unused at the feature freeze, drop it.

## Accessibility

Every route is reachable by keyboard: navigation is real anchors, the supplier drawer is a
`role="dialog"` that takes focus, closes on Escape and gives focus back, and the scrim is a
button rather than a div with a click handler. Tables have scoped headers and a caption. The
focus ring is defined once in `base.css`.

`TODO(FabriBanda)`: a full focus trap inside the drawer, and a pass with a screen reader on
the intake page.

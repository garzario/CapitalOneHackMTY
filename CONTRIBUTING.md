# Contributing

Four people, 36 hours, one trunk. These rules exist so that nothing in the repository has to be
argued about at 04:00. Read `AGENTS.md` first: it is the contract, and this file is the mechanics.

## Setup

bun 1.3.11 is the runtime and it is pinned in `.bun-version`. Install exactly that version:

```bash
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.11"
bun --version      # must print 1.3.11
```

Do not run plain `bun upgrade`. It jumps to a newer bun and can rewrite `bun.lock` in a format
1.3.11 rejects. `bun upgrade --to` does not exist in 1.3.11. The install line above is also the
rollback.

```bash
git clone https://github.com/garzario/CapitalOneHackMTY.git
cd CapitalOneHackMTY
bun install --frozen-lockfile     # this also wires the git hooks, see below
cp .env.example .env              # the lead or Fabian shares the Nessie key in the team chat
bun run doctor                    # versions, env vars, database reachability
```

`bun install` runs a root `postinstall` that sets `core.hooksPath` to `.githooks`, so the
`commit-msg` and `pre-push` hooks are active on every laptop without anyone remembering a command.
Hook configuration is local to a clone and never travels with it, which is why it is automated.

## Dependencies

**Exact pins only. Never `@latest`, never a caret range.** `bunfig.toml` sets `exact = true`, so
`bun add pkg@1.2.3` writes `1.2.3`.

**Three-day supply-chain quarantine.** `bunfig.toml` sets `minimumReleaseAge = 259200`, so a
version published in the last three days cannot be installed, on any laptop or in CI. Never edit or
bypass that value. It is also a real answer when a judge asks about supply-chain posture.

Before adding anything that is not in the vetted table below, run the age check:

```bash
# must print a date older than 3 days, or bun add will refuse the version
curl -s "https://registry.npmjs.org/<pkg>" | bun -e \
 'const d=await Bun.stdin.json();const v=d["dist-tags"].latest;console.log(v, d.time[v])'

# and to find the newest version that IS installable today:
curl -s "https://registry.npmjs.org/<pkg>" | bun -e '
 const d=await Bun.stdin.json(), t=d.time, cut=Date.now()-259200000;
 const ok=Object.keys(d.versions).filter(v=>/^\d+\.\d+\.\d+$/.test(v)&&Date.parse(t[v])<cut)
   .sort((a,b)=>Date.parse(t[a])-Date.parse(t[b])).slice(-3);
 console.log(ok.map(v=>v+"  "+t[v]).join("\n"))'
```

### Vetted pins

Every version below was verified to exist and to be outside the quarantine window for the whole
event. Use these, and do not bump them during the event.

| Package | Pin | Role |
|---|---|---|
| bun (runtime) | 1.3.11 | `.bun-version`, CI and all four laptops |
| `typescript` | 5.9.3 | strict compiler, shared `tsconfig.base.json` |
| `@types/bun` | 1.3.14 | pairs with bun 1.3.x |
| `@biomejs/biome` | 2.5.12 | lint and format, one binary, advisory in CI |
| `hono` | 4.13.7 | `apps/api` framework |
| `@hono/zod-validator` | 0.9.1 | request validation middleware |
| `zod` | 4.5.4 | schemas shared across the wire |
| `postgres` | 3.4.9 | Postgres and Timescale driver, raw SQL |
| `vite` | 8.2.2 | `apps/web` bundler, required by the React plugin below |
| `@vitejs/plugin-react` | 6.1.1 | peer is `vite ^8.0.0`, so the vite 8 pin is load-bearing |
| `react` | 19.2.8 | pin with `react-dom`, which peers `react ^19.2.8` |
| `react-dom` | 19.2.8 | |
| `@types/react` | 19.2.18 | |
| `@types/react-dom` | 19.2.7 | |
| `tailwindcss` | 4.3.3 | styling |
| `@tailwindcss/vite` | 4.3.3 | keep both tailwind pins identical |
| `motion` | 13.2.0 | animation, first-class and not a polish task |
| `recharts` | 3.10.1 | charts over our own ledger |
| `uqr` | 0.1.3 | QR encoder for the intake code, zero dependencies, published 2026-04-03 |

Anything not on this list, including sponsor SDKs, a Python sidecar, an ORM, a second database and
any deploy CLI, is out of scope unless an ADR in `docs/adr/` argues it in. Four infrastructure
surfaces for four people in 36 hours is how the demo dies.

**Lockfile rule.** Whoever adds a dependency runs `bun add <pkg>@<exact>` and commits `bun.lock`
in the same pull request. CI runs `--frozen-lockfile`, so a forgotten lockfile update fails loudly,
which is the point. Never hand-edit or hand-merge `bun.lock`. On a conflict:

```bash
git checkout --theirs bun.lock && bun install && git add bun.lock
```

Never run `bun pm trust --all`. Trust postinstall scripts per package, deliberately.
npm, npx, yarn and pnpm are denied in the local assistant permission template (`docs/playbooks/assistant-permissions.json`). Do not reintroduce them.

## Workspaces

Every workspace `package.json` must define:

```json
"scripts": { "typecheck": "tsc --noEmit", "build": "echo ok" }
```

`build` can be `echo ok` for packages that emit nothing, but it has to exist. The root scripts use
`bun run --filter '*'`, which silently skips a workspace with no matching script, and a green CI
that checked nothing is worse than a red one.

## Branches

- Two long-lived branches. `dev` is the integration branch: every feature PR targets `dev` and is
  squash-merged as soon as CI is green (no approval gate during the build night; post-merge reviews are still expected). `main` is the release branch: it only receives release PRs from `dev`, merged with
  a merge commit (`gh pr merge --merge`) and tagged (`v1.0.0` at M4). Vercel production deploys
  from `main`, previews from `dev` and from every PR. The exact commands for that release, in
  order, are in `docs/playbooks/release.md`, and `bun run release-check` is the gate that runs
  before it.
- Branch names: `feat/<issue#>-<slug>`, `fix/<issue#>-<slug>`, `docs/<issue#>-<slug>`.
- Branch from a freshly pulled `dev`. Merge within four hours or split the issue.
- **Never push to `main` or `dev`.** This is a team repo and the pull requests are the judged
  artifact. The `.githooks/pre-push` hook refuses any push whose remote ref is `refs/heads/main` or
  `refs/heads/dev`, whatever the refspec, so `git push` with no arguments while on either branch is
  blocked too. The single documented exception is the one-time bootstrap push, which used
  `--no-verify`.
- Do not force-push a branch someone else has reviewed. `--force-with-lease` on your own branch
  after an amend or a soft reset is fine.

## Commits

- **Few, meaningful commits.** One logical commit per pull request. Granular commit noise reads as
  machine-generated, and the git history is something the judges actually scroll.
- Format: `<type>(<scope>): <imperative summary> (#<issue>)`, for example
  `feat(core): add cash-flow window scorer (#14)`. Types: `feat`, `fix`, `docs`, `chore`, `test`,
  `refactor`. Body is what and why in at most three lines. Never how, the diff says how.
- Collapse local work in progress into one commit with a soft reset rather than an interactive
  rebase, which is unavailable here:

```bash
git reset --soft $(git merge-base HEAD origin/dev)
git commit     # write the one real message
```

- **No AI attribution, anywhere.** No `Co-Authored-By` trailers, no "Generated with" lines, no tool
  credit in commit messages, pull request bodies, issues, review comments, docs or code comments.
  your local assistant config switches attribution off so the trailer is never generated in
  the first place, and `.githooks/commit-msg` rejects any commit whose message still contains an
  attribution line. If the hook fires, rewrite the message. Do not bypass it with `--no-verify`.
- **One identity per clone, and it is yours.** Commit with the clone's own `user.name` and
  `user.email`, the ones the postinstall left in place. Never export `GIT_AUTHOR_*` or
  `GIT_COMMITTER_*`, never pass `-c user.email=`, never let a tool pick an account email for you.
  GitHub's squash merge writes a `Co-authored-by` trailer for every distinct commit author in a pull
  request, so a single commit under a stray email becomes an attribution line on `dev` that only a
  history rewrite removes. `.githooks/pre-commit` refuses identities that name a tool, a bot or a
  throwaway mailbox before the commit exists.
- No em dashes in prose. No emoji in commits, docs, YAML or UI copy. Plain ASCII punctuation.

## Pull requests

- Fill the template: what, how, evidence, rubric impact, checklist, and a "For the reviewer"
  line naming the part you are least sure about.
- Squash merge only. The squash title is `<type>(<scope>): <summary> (#<issue>)`. Merge commits and
  rebase merges are disabled on the repository, and the head branch is deleted automatically.
- Update `CHANGELOG.md` under `[Unreleased]` in the same commit as the change.
- Update `docs/01-rubric-mapping.md` when the change is new rubric evidence.
- There are **no required status checks**, deliberately: a runner queue or a billing hiccup must
  never strand a pull request at 04:00. CI is advisory and the reviewer reads it.
- Never merge your own pull request, except under the stall rule below.

### Review contract

1. The author opens the PR with evidence attached and the risky part named.
2. Automated pass: `/code-review high --comment` on the PR. Findings land inline as the author's
   own account, with no attribution lines.
3. Human pass: the `CODEOWNERS` owner for the touched paths reviews. **At least two substantive
   comments per PR**: a question, a suggestion, or a "this will break when X". A bare approve with
   no comment does not count as a review here.
4. The author replies in the thread, pushes a fixup, and resolves the thread saying what changed.
   The resolved conversation is an artifact the judges read, and the best three go into
   `docs/14-process.md`.
5. Merge: squash, by the reviewer or by the lead.
6. Rotation: Patricio is reviewed by Fabian. Fabian by Patricio, or Adan for API-shape questions.
   Adan by Fabricio, or Patricio for data contracts. Fabricio by Adan, or Patricio for `docs/07`,
   `docs/08` and the ADRs.
7. **Stall rule.** Half the team is asleep by design. A PR waiting 45 minutes gets pinged in the
   is awake, the author merges their own PR and writes `merged unreviewed at <time>, nobody awake`
   in the PR body, then raises it at the next standup. The reviewer leaves a real review comment on
   the merged PR afterwards, which still appears in the history. A stalled PR at hour 20 is worse
   than an imperfect merge.
8. If the lead lands a demo blocker alone, the PR body records
   `bypassed review: demo blocker, reviewed post-merge by <name>`, so the history stays honest.

## Evidence

Evidence is what turns a claim into a rubric point, so capture it while the feature is fresh.

- Attach it to the pull request directly. gh 2.99.0 supports `--attach` on `gh pr create`,
  `gh issue create` and `gh pr comment`, up to 50 files per command, in `<file>#<alt text>` form:

```bash
gh pr create --base dev --fill-first --attach './shot.png#the empty state'
gh pr comment <n> --attach ./before.png --attach ./after.png
```

- Screenshots go to `assets/screenshots/<NN>-<slug>.png`. The README GIF is `assets/demo.gif`,
  under 6 MB, looping, 10 to 15 seconds, no cursor jitter.
- Use deterministic viewports so shots are comparable: 1440 by 900 for desktop, 390 by 844 for
  mobile, after `bun run seed && bun run dev`.
- **Puppeteer always reports `prefers-reduced-motion: reduce`**, so animated transitions will not
  appear in a Puppeteer capture and will look broken or missing. Capture motion with a screen
  recording instead, or override the media feature explicitly before asserting anything about it.
- **Close every Puppeteer instance when you are done.** Orphaned browsers melt the battery, and
  battery is a real resource at hour 30.
- Scrub every frame before it is committed or posted: no real names, no keys, no `.env` contents,
  no personal data, no other team's data. See `SECURITY.md`.

## CI and automation

- One workflow only, `.github/workflows/ci.yml`: install, advisory lint, typecheck, test, build.
  Keep it under three minutes.
- **No `schedule:` trigger anywhere in this repository.** Nothing runs while the team sleeps,
  nothing burns the minute budget, and nobody is greeted by a red badge at 06:00. Do not add a cron
  "to be helpful".
- **No `dependabot.yml`.** Dependabot version updates are opt-in through the file existing, so
  there is nothing to disable, and a file with an empty `updates` list fails GitHub's own validator
  and leaves a permanent configuration error on the repository. No automated dependency pull
  requests during the event either way: bumps fight the three-day quarantine and add noise to a
  history the judges read. Revisit after 2026-09-13.
- Actions are pinned to floating majors (`actions/checkout@v7`, `actions/cache@v6`,
  `oven-sh/setup-bun@v2`) as a deliberate exception to the exact-pin policy. A mid-event SHA hunt
  earns nothing. Do not "fix" these into commit SHAs.
- `bun test --pass-with-no-tests` is intentional: plain `bun test` exits non-zero on a tree with no
  test files, which would fail the first run. Drop the flag once `packages/core` has real tests, if
  you want the stricter behaviour, and not before.

## Labels and milestones

Labels: `rubric/{originality,tech-depth,impact,design}`, `area/{engine,data,api,web,infra,docs,pitch}`,
`type/{feat,bug,doc}`, `P0-demo-blocker`, `cut`.

Put a `rubric/*` label on every issue, so coverage is queryable and so a judge scrolling the issues
sees that the work was planned against their criteria. `cut` is not a failure label: an issue closed
as `cut` with one line of reasoning is evidence of scope judgment, which is exactly what an engineer
is looking for when they ask what you left out.

Milestones are M0 through M5 with the exit criteria listed in `AGENTS.md`. After the 20:00 feature
freeze on 2026-09-12, only `P0-demo-blocker` issues merge.

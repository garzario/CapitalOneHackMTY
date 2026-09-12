---
name: pr-flow
description: Use when opening a pull request in this repository, when work on an issue is complete, or when the user says ship it, open the PR, push this up, or let's merge this. Handles the branch, the single squashed commit, the changelog entry, evidence attachment and the reviewer request.
---

# pr-flow

The pull requests are the judged artifact in this repository, so the shape of the PR matters as
much as the diff. Read `AGENTS.md` and the review contract in `CONTRIBUTING.md` before deviating
from any step below.

## Procedure

1. **Refuse and stop if on `main` or `dev`.** Create `feat|fix|docs/<issue#>-<slug>` from a freshly
   pulled `dev` (`git switch dev && git pull --ff-only`). Pushing to `main` or `dev` is blocked by
   `.githooks/pre-push` anyway, so the only outcome of trying is lost time. `main` only ever
   receives a release PR from `dev`, merged with a merge commit and tagged.
2. Run `bun run typecheck && bun test`. If either is red, fix that before anything else. Do not
   open a PR on a red tree and do not "fix it in review".
3. Run `bun run format` so lint is never the reviewer's topic. Lint is advisory in CI, which means
   it is your job, not the pipeline's.
4. Collapse local work in progress into one logical commit:
   `git reset --soft $(git merge-base HEAD origin/dev)` followed by a single `git commit`.
   Do not use interactive rebase, it is unavailable here and `git rebase` is denied in
   `.claude/settings.json`. Message format is
   `<type>(<scope>): <imperative summary> (#<issue>)`, with a body of what and why in three lines
   maximum.
5. Scan the message and the body for attribution: `Co-Authored-By` trailers, "Generated with"
   lines, any tool or vendor credit, and the robot emoji. Strip every hit. Never add attribution.
   `includeCoAuthoredBy` is already false in `.claude/settings.json`, and `.githooks/commit-msg`
   will reject the commit anyway, so a hit here only costs a round trip.
6. Add the `CHANGELOG.md` `[Unreleased]` entry in the same commit, under Added, Changed, Fixed or
   Removed. One line, outcome-shaped.
7. If the branch was already pushed and you amended or soft-reset, push with `--force-with-lease`,
   and only on your own branch. Never force-push a branch someone else has already reviewed.
8. `gh pr create --base dev --fill-first`, then `gh pr edit <n> --body-file <file>` with the
   pull request template filled in: what, how, evidence, the rubric boxes ticked with a one-line
   justification each, and the checklist.
9. Attach evidence in the same command where possible:
   `gh pr create --attach './shot.png#the empty state'`, or afterwards with
   `gh pr comment <n> --attach ./before.png --attach ./after.png`. gh 2.99.0 supports `--attach`
   on `gh pr create`, `gh issue create` and `gh pr comment`, up to 50 files per command.
10. Request the `.github/CODEOWNERS` reviewer for the touched paths. If the owner is the author,
    request the lead (`garzario`) instead.
11. Post the pull request URL back to the user and set the project item to `In review` on the
    `HackMTY 2026, Capital One` board.
12. **Never merge your own pull request** unless the stall rule in `CONTRIBUTING.md` applies, and
    if it does, say so in the PR body: `merged unreviewed at <time>, nobody awake`.

## Checks before you finish

- The PR names the risky part under "For the reviewer". A reviewer with a pointer leaves a real
  comment; a reviewer without one leaves a thumb, and a thumb is not a review here.
- `docs/01-rubric-mapping.md` is updated if this PR is new rubric evidence.
- The PR body contains no attribution, no em dashes and no emoji.
- If this PR changed a route, a screen or a seeded ID, the demo script is now stale: run the
  `demo-brief` skill rather than hand-editing `docs/10-demo-script.md`.

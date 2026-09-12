# release

One release is cut for this event, `v1.0.0` at M4, from `dev` into `main`. This file is the
procedure so that nobody has to reconstruct it at 00:30 with a rehearsal in twenty minutes.

Read `AGENTS.md` and the branch rules in `CONTRIBUTING.md` first. Two of them decide the shape of
everything below. `main` only ever receives a release pull request from `dev`, merged with a merge
commit and not a squash, because squashing `dev` into `main` would rewrite forty commits into one
and lose the history the judges are reading. And nobody pushes to `main` or `dev`, ever, including
during a release: `.githooks/pre-push` refuses the push whatever the refspec.

The tag push is the one exception that is not an exception. The hook matches `refs/heads/main` and
`refs/heads/dev`; a tag is `refs/tags/v1.0.0`, so `git push origin v1.0.0` passes it cleanly and no
`--no-verify` is needed. If you find yourself typing `--no-verify`, stop, because you are pushing a
branch.

## Before you start

- M3 feature freeze has passed (12 Sep 20:00). After the tag, only `P0-demo-blocker` merges.
- Every pull request that has to be in `v1.0.0` is merged into `dev`. Check with
  `gh pr list --state open --base dev`. Anything still open is either merged now or is not in the
  release, and saying which is the release manager's call, not a default.
- `docs/10-demo-script.md` is still true for what is on `dev`.

## 1. Prove the tree

```bash
git switch dev && git pull --ff-only
bun install --frozen-lockfile
bun run release-check
```

`release-check` runs typecheck, the tests, the build, `bun run demo` and `bun run scrub`, stops at
the first red gate and tags nothing. `demo` and `scrub` are the two gates CI does not run, which is
the reason the command exists at all. Red at this point means there is no release today, not that
there is a release with a caveat.

## 2. Cut the version in the changelog

The changelog entry is a normal pull request against `dev`, because `dev` takes no direct pushes.

```bash
git switch -c chore/66-cut-v1.0.0 origin/dev
```

In `CHANGELOG.md`, rename `## [Unreleased]` to `## [1.0.0] - 2026-09-13`, keep the Added, Changed
and Fixed groups as they are, and open a fresh empty `## [Unreleased]` above it. Then:

```bash
git commit -am "chore(release): cut 1.0.0 (#66)"
git push -u origin chore/66-cut-v1.0.0
gh pr create --base dev --fill-first
gh pr merge <n> --squash --delete-branch
```

## 3. Open the release pull request

```bash
git switch dev && git pull --ff-only
gh pr create --base main --head dev --title "release: v1.0.0" --body-file - <<'BODY'
## What

Release of SentryOne v1.0.0 for HackMTY 2026, Capital One challenge, track 3.

Closes #66

## How

Merge commit, not a squash, so the history stays readable on `main`. The changelog section for
1.0.0 is the list of what is in it.

## Evidence

`bun run release-check`: five gates green. Paste the output.

## Checklist

- [ ] `bun run release-check` green on the merge base
- [ ] `CHANGELOG.md` has `[1.0.0]` with a date and an empty `[Unreleased]` above it
- [ ] No open `P0-demo-blocker` issue that belongs in this release
BODY
```

## 4. Merge it with a merge commit

```bash
gh pr checks <n> --watch
gh pr merge <n> --merge            # NOT --squash, and NOT --rebase
```

`--merge` is load-bearing. It is what produced `v0.1.0`, `v0.1.1` and `v0.1.2`, each of which
points at a `Merge pull request #N from garzario/dev` commit, and it is what keeps every commit
message on `dev` reachable from `main`.

## 5. Verify main before tagging

A tag on a red commit is worse than no tag, because it is a claim.

```bash
git switch main && git pull --ff-only
git log --oneline -1                        # this is the commit the tag goes on
gh run list --branch main --limit 3         # find the run for that commit
gh run watch <run-id>                       # until the verify job is green
```

CI skips a push whose files are all under `docs/`, `assets/` or `*.md`, so a documentation-only
release produces no run on `main` and `gh run list` shows the previous one. That is not a green
check, it is no check, and the correct reading is that the last run on `dev` is the evidence.

## 6. Tag

```bash
git tag -a v1.0.0 -m "SentryOne v1.0.0, HackMTY 2026 submission"
git push origin v1.0.0
git describe --tags --exact-match HEAD   # prints v1.0.0
```

Annotated, like the three tags before it. A lightweight tag carries no author and no date and is
not worth the two characters it saves.

Optional, and only if the submission links to it:

```bash
gh release create v1.0.0 --title "SentryOne v1.0.0" --notes-file - <<'NOTES'
The 1.0.0 section of CHANGELOG.md, pasted.
NOTES
```

## 7. Verify Vercel production

Vercel deploys `apps/web` from `main` as production and from `dev` and every pull request as a
preview, driven by the Vercel GitHub App and not by a workflow in this repository (ADR-0005). So
the production deploy is triggered by step 4, not by anything here, and this step is a check.

1. Open the Vercel dashboard, find the deployment whose commit is the merge commit from step 5, and
   confirm it is `Ready` and promoted to production. A `Ready` preview on `dev` is not production.
2. Open the production URL on a phone, not only on the laptop. The judge card and the QR point at
   it and both are printed.
3. Check the four things a static build gets wrong after a release: the app loads with no console
   error, the API base URL is the production one and not `localhost`, the six screens render, and
   the favicon and social card resolve.
4. Run the demo beats against the deployment, which is the same command the rehearsal uses:

```bash
bun run demo --base https://<production-url>
```

`TODO(fabbyyyy)`: the production URL, the Vercel project name and the `apps/api` origin on Vultr
are still open in issue #44. Until that issue closes, this step is "the local instance is the demo
path and we say so", per the gate table in `docs/11-pitch.md`. Do not write a URL into this file,
the README or the printed card before it answers.

## 8. Close out

```bash
gh issue comment 66 --body "v1.0.0 tagged on <sha>, main CI green, production verified."
```

- Move the issue to `Done` on the `HackMTY 2026, Capital One` board.
- Tell the team in the channel that the tag is cut, so everyone knows the freeze is now real.
- After the tag, only `P0-demo-blocker` merges, and each one repeats steps 1, 3, 4, 5 and 7 as a
  `v1.0.1`. There is no path where something reaches `main` without a pull request.
- The key rotation in `SECURITY.md` runs after the closing ceremony, not now. Rotating before the
  demo kills the demo.

## If something is wrong after the tag

Do not delete or move the tag. A moved tag is the one git operation that silently breaks every
clone that already fetched it, and at least one judge will have cloned the repository.

Fix forward: branch from `dev`, pull request into `dev`, release pull request into `main`, merge
commit, and tag `v1.0.1`. The same seven steps, and they take eight minutes when nothing is on
fire.

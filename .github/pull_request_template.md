## What

<!-- One paragraph. What changed and why, in product terms. -->

Closes #

## How

<!-- The approach, and one thing you deliberately did NOT do. -->

## Evidence

<!-- Screenshot, GIF, test output, or the curl and its response.
     Required for UI and engine PRs. gh pr comment --attach ./shot.png works. -->

## Rubric impact

- [ ] **Originality**, differentiates us or widens the gap versus a generic submission
- [ ] **Technical Depth**, real algorithmic or data logic, covered by a test
- [ ] **Impact and Feasibility**, moves the business, regulatory or GTM story
- [ ] **Design and Experience**, serves the persona in docs/02, follows the journey in docs/03
- [ ] **None of the above**, pure plumbing. Say why it is worth the review time.

## Checklist

- [ ] `bun run typecheck && bun test` pass locally
- [ ] If I added a dependency: it is pinned exact, older than 3 days, and `bun.lock` is in this PR
- [ ] No secrets, no real PII, no `.env` committed
- [ ] `CHANGELOG.md` updated under `## [Unreleased]`
- [ ] Docs touched if behaviour or the contract changed (`docs/09-api.md`)
- [ ] `docs/10-demo-script.md` still accurate if this is on the demo path
- [ ] Commit messages carry no AI attribution lines

## For the reviewer

<!-- Point at the risky part. Ask a real question.
     A thumbs-up with no comment is not a review. -->

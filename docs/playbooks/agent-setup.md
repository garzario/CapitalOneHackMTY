# Working with a coding assistant in this repo

Any assistant (any vendor) is welcome as long as the repository never shows it. Rules:

1. Read `AGENTS.md` first, then `docs/00-challenge.md` and `docs/adr/0002-track-and-thesis.md`. They are the contract.
2. Keep the assistant's configuration **local and out of git**. Vendor config folders and files are gitignored on purpose; never commit them.
3. Load the permission template `docs/playbooks/assistant-permissions.json` into your assistant's local settings if it supports allow and deny lists. It denies npm, npx, yarn and pnpm, force pushes, merging your own PR, and reading `.env`.
4. Switch off any attribution feature (co-author trailers, "generated with" lines). `.githooks/commit-msg` rejects any `Co-Authored-By` trailer and any "Generated with" line regardless of vendor. Commits, PR bodies, issues, comments and docs name no tool.
5. Follow the playbooks in this folder instead of improvising: `pr-flow.md` (branch, commit, PR), `nessie-seed.md` (seed and reset), `rubric-audit.md` (score the repo against the rubric), `demo-brief.md` (keep the demo script true).
6. One assistant per workstream per person. Two assistants on the same files at 03:00 produce conflicts, not features.

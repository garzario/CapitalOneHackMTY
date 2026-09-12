# ADR-0005: Static web on Vercel, API on the Node runtime

- **Status:** Proposed
- **Date:** 2026-09-11
- **Deciders:** `garzario`, with `fabbyyyy`
- **Affects:** `apps/api`, `apps/web`, `CONTRIBUTING.md`, milestone M1

## Context

M1 requires a vertical slice that is **deployed and clickable from a phone** by 04:00, including the
API. An earlier draft of the plan sent `apps/web` to Vercel and left `apps/api` deployed nowhere while
still calling the slice deployed, which is how a 04:00 gate gets missed.

This decision also determines what `apps/api` is allowed to import, so it cannot be deferred. Three
targets are viable.

| Option | Shape | Constraint |
|---|---|---|
| 1 | `apps/web` static on Vercel plus `apps/api` as a Vercel Bun function | One vendor, preview URLs per PR, no server to babysit. Requires verifying that the Bun runtime tolerates every Bun-specific API we use, before depending on it |
| 2 | `apps/web` static on Vercel plus `apps/api` as a Hono app on the Node runtime | Most boring, most certain. `apps/api` may then import **no** `bun:*` modules at all |
| 3 | One Bun process serving both the static build and the API on a single small container | Simplest mental model, no preview URLs, one more thing to keep alive |

## Decision

**Option 2.** `apps/web` builds to static output and deploys on Vercel. `apps/api` is a Hono app on
the Node runtime. Deployment is driven by the Vercel GitHub App rather than by a workflow in this
repo, so there is no deploy YAML to debug at 04:00 and every PR still gets a preview URL.

Option 1 is chosen instead only if someone on the team has actually shipped a Vercel Bun function
before. Nobody has stated that, so the default stands.

## Consequences

- **`apps/api` may import no `bun:*` modules.** No `bun:sqlite`, no `Bun.file` in a request path, no
  `bun:test` helpers in shipped code. This constraint is recorded in `CONTRIBUTING.md` so that nobody
  reaches for them by habit. Bun remains the local runtime, the test runner, the script runner and the package
  manager, which is where its value actually is for us.
- Hono and `postgres@3.4.9` both run on Node, so no pin changes.
- Preview URLs per PR become the evidence attached to UI pull requests.
- The demo has a deployed URL as its primary path and the local instance as its offline fallback, which
  is the resilience story in `docs/10-demo-script.md`.
- Negative: two deploy units instead of one, so two things can be stale. `scripts/demo.ts` runs against
  the deployed origin before every rehearsal, which catches exactly that.

## Alternatives considered

Recorded in the table above. Option 1 loses on the cost of discovering a runtime incompatibility at
03:00. Option 3 loses the per-PR preview URLs and adds a process to keep alive for 36 hours, for a
simplicity gain we do not need.

## Revisit if

The Node runtime blocks something the product genuinely needs, such as a streaming primitive that does
not work there. That reopens option 1, and the first step would be verifying the Bun runtime against
our actual imports rather than assuming.

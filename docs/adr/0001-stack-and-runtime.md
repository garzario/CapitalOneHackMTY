# ADR-0001: Bun and TypeScript monorepo, with the intelligence as a pure package

- **Status:** Accepted, 2026-09-12 02:30 CST. Option A. No Python sidecar: every detector fits in TypeScript
- **Date:** 2026-09-11
- **Deciders:** `garzario`, with `fabbyyyy`
- **Affects:** the whole tree, `docs/07-architecture.md`, milestone M0

## Context

Four people, 36 hours, and a rubric where fit for purpose is graded explicitly. Capital One
evaluates continuously: engineers walk up to the table and probe the logic, the architecture and the
data structures, and they are actively looking for Wizard-of-Oz prototypes. That pushes hard toward a
stack where the intelligence can be opened and run in front of a judge with no network, and where a
judge can reach the product from their own phone on a URL.

The team's existing strengths are TypeScript and Swift. Two members have Swift and iOS shipping
experience. The lead's machine is bun-only by policy, with a three-day supply-chain quarantine on new
package versions.

Scored matrix, weights from the confirmed rubric, scores 1 to 5.

| Criterion | A. Bun TS monorepo, web-first | B. SwiftUI iOS plus Bun API | C. Python-first |
|---|---|---|---|
| All four can commit on day one | 5, everyone writes TS | 3, two people idle on UI | 4 |
| Originality (30) | 3, a web fintech dashboard is the default hackathon artifact | 5, on-device inference and camera capture are hard to copy in 36 h | 3 |
| Technical depth (25) | 5, pure-TS engine, tests in under two seconds, a judge can read the function | 4, engine still in the TS API | 5 if a genuine model |
| Judge accessibility across repeated walk-ups | 5, a URL on their own phone | 2, needs our device, invites suspicion | 4 |
| Design and experience (20) | 4 | 5, native polish reads as a product | 2, a notebook UI reads as a notebook |
| Regulatory and privacy story | 3 | 5, "raw transactions never leave the device" is the strongest answer available | 3 |
| 04:00 failure risk | 5, no build step, no signing | 2, signing and provisioning, no shareable link | 3, environment and wheel drift |
| Demo backup if a laptop dies | 5, a deployed URL | 3, a screen recording | 4 |

## Decision

We use **option A**: one Bun 1.3.11 and TypeScript workspace monorepo. The intelligence lives in
`packages/core` as pure, dependency-free, unit-tested functions. `apps/api` is a thin Hono transport
with no business logic. `apps/web` is the judge-facing surface and is one consumer of a documented
HTTP contract. Exact dependency pins only, never a floating range, and the three-day release
quarantine stays on.

The justification we say out loud: one runtime for the API, the tests, the seeder and the migrations,
native TypeScript with no build step so there is nothing to debug at 03:00, and a cold start fast
enough for a streaming endpoint.

## Consequences

- Positive: all four people are productive from minute one. The engine being pure functions is the
  direct, demonstrable answer to the Wizard-of-Oz suspicion. A deployed URL is both the demo and the
  backup.
- Negative: a web financial dashboard is the default hackathon artifact, so option A buys us nothing
  on originality. **Originality has to come from the idea and the persona, not from the stack.** That
  is accepted, and it raises the stakes on ADR-0002.
- Follow-on: every workspace `package.json` must define `typecheck` and `build`, or the root
  `--filter` scripts skip it silently and CI goes green having checked nothing.
- Now forbidden: new algorithmic logic in a route handler. It goes in `packages/core` or it does not
  exist.

## Alternatives considered

| Alternative | Why not |
|---|---|
| B, SwiftUI iOS client plus a Bun API | Strongest originality and privacy story, and the worst fit for continuous evaluation. Signing and provisioning on the critical path, no link a judge can open, and two people idle on UI work. Kept as a deviation, see below |
| C, Python-first | Only justified by a library with no TypeScript equivalent. A testable TypeScript implementation scores higher on algorithmic logic than an opaque artifact. Rule: if the model is under 150 lines of math, it goes in `packages/core` |
| Separate repos per surface | Nothing to gain in 36 hours, and the engine could not be imported by the API, the tests and the demo script without publishing |

## Deviate to B only if

The differentiator is **inherently on-device**: scanning a document or a ticket with the camera, live
alerts on the lock screen, on-device inference so raw transactions never leave the phone, or NFC and
CoDi. If so, the engine stays in TypeScript inside the API so that `garzario` and `fabbyyyy` build
intelligence while `Apanawa` and `FabriBanda` build SwiftUI, and `apps/ios` is created in that PR. B
is a superset of A in the same repo, never a rewrite.

**Decide by 2026-09-11 22:00.** After M1 the cost of this change is fatal.

## Revisit if

A dependency we genuinely need does not run on Bun, or the chosen idea's differentiator turns out to
be inherently on-device.

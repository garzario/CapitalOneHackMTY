import type { SatListEntry } from "@hackmty/core";
import {
  matchRfc,
  OFFICIAL_SNAPSHOT_LIST_VERSION,
  OFFICIAL_SNAPSHOT_RETRIEVED_AT,
  OFFICIAL_SNAPSHOT_URL,
  simulatePublication,
} from "@hackmty/sat";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { rejectInvalid } from "../http";
import { createRateLimit } from "../middleware/rate-limit";
import { runRetroactiveSweep } from "../pipeline";
import {
  type SatPublishBody,
  satLookupQuerySchema,
  satPublishBodySchema,
} from "../schemas";

/**
 * The SAT Article 69-B surface.
 *
 * `GET /lookup` is the endpoint a judge uses: they type a real RFC from the
 * official list and we answer from the list, with no scoring and no invention.
 * It is read-only on purpose. The rows come from the committed download of the
 * real SAT list in `@hackmty/sat` together with whatever versions this instance
 * has been posted, merged and ordered newest publication first by `matchRfc`.
 *
 * Three things that endpoint has to get right, because it is the one a judge
 * drives themselves.
 *
 * - The RFC is normalised before anything else. It arrives typed by hand, so it
 *   arrives lowercase, with spaces, or with a hyphen before the homoclave, and
 *   all three mean the same taxpayer. `normalizeRfc` in `@hackmty/sat` is the
 *   one place that decides what is separator and what is meaning, and the
 *   answer echoes the normalised form back so the screen shows what was
 *   actually searched.
 * - Not listed is an answer, not an absence. The response says `listed: false`
 *   with an empty `entries` and still names the snapshot that was searched, so
 *   "we found nothing" can never be confused with "no list was loaded". A
 *   blacklist that quietly answers nothing is worse than no blacklist.
 * - It is rate limited per client. It is our own service in front of a public
 *   download, and 14234 taxpayers is one afternoon of requests for anybody who
 *   decides to enumerate it. See `middleware/rate-limit.ts` for what that does
 *   and, more importantly, what it does not.
 *
 * `POST /publish` loads a list version and replays the ledger against it, which
 * is the retroactive sweep. The `simulate` form exists so the demo can publish a
 * list on stage, and it accepts synthetic RFCs only: ADR-0002 forbids a real RFC
 * standing next to fabricated evidence, and both `satPublishBodySchema` here and
 * `simulatePublication` in the package enforce it, rather than trusting whoever
 * is driving the laptop.
 *
 * That is also the line between the two endpoints, and it is the ADR: the
 * official list is read here and joined to nothing, and the only publication
 * that ever meets an invoice is one built from the company's own synthetic
 * suppliers.
 */
export function satRoutes(deps: ApiDeps) {
  return new Hono()
    .get(
      "/lookup",
      createRateLimit(),
      zValidator("query", satLookupQuerySchema, rejectInvalid),
      async (c) => {
        const { rfc } = c.req.valid("query");
        const official = await deps.satList();
        const match = matchRfc(
          [...(await deps.repo.satLookup(rfc)), ...official.lookup(rfc)],
          rfc,
        );

        // An RFC that is not on the list is the normal answer, not a 404: the
        // clerk asked a question and "it is not listed" is the answer.
        return c.json({
          rfc: match.rfc,
          entries: match.entries,
          // `listed` is the newest situation, not "any row exists": a taxpayer
          // who was presunto in March and desvirtuado in June is not listed,
          // and a product that says otherwise is one the clerk stops trusting.
          listed: match.listed,
          ...(match.effective === undefined
            ? {}
            : { effective: match.effective }),
          source: {
            listVersion: OFFICIAL_SNAPSHOT_LIST_VERSION,
            retrievedAt: OFFICIAL_SNAPSHOT_RETRIEVED_AT,
            url: OFFICIAL_SNAPSHOT_URL,
            taxpayers: official.taxpayers,
            rows: official.size,
          },
        });
      },
    )
    .get("/versions", async (c) => {
      return c.json({ versions: await deps.repo.satVersions() });
    })
    .post(
      "/publish",
      zValidator("json", satPublishBodySchema, rejectInvalid),
      async (c) => {
        const body = c.req.valid("json");
        const now = deps.clock.now();
        const { listVersion, entries } = await materialise(deps, body, now);

        const subjects = await deps.repo.publishSatList(listVersion, entries);
        const sweep = await runRetroactiveSweep(listVersion, subjects);

        await deps.emit({
          type: "sat_list_published",
          at: now,
          listVersion,
          entries,
        });

        return c.json(sweep);
      },
    );
}

/**
 * Turns either accepted body into the rows the repository stores. The simulated
 * form is built by `simulatePublication` in `@hackmty/sat`, handed the supplier
 * legal names we already hold: an RFC we hold no name for keeps the RFC as its
 * name, because a name we do not have is not a name we make up on a row that
 * reads as an accusation.
 */
async function materialise(
  deps: ApiDeps,
  body: SatPublishBody,
  now: string,
): Promise<{ listVersion: string; entries: SatListEntry[] }> {
  if ("entries" in body) {
    return { listVersion: body.listVersion, entries: body.entries };
  }

  const names: Record<string, string> = {};
  for (const rfc of body.rfcs) {
    const supplier = await deps.repo.findSupplier(rfc);
    if (supplier !== undefined) {
      names[rfc] = supplier.legalName;
    }
  }

  const simulated = simulatePublication(body.rfcs, {
    now,
    names,
    ...(body.status === undefined ? {} : { status: body.status }),
  });

  return { listVersion: simulated.listVersion, entries: simulated.entries };
}

import type { SatListEntry } from "@hackmty/core";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { rejectInvalid } from "../http";
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
 * It is read-only on purpose.
 *
 * `POST /publish` loads a list version and replays the ledger against it, which
 * is the retroactive sweep. The `simulate` form exists so the demo can publish a
 * list on stage, and it accepts synthetic RFCs only: ADR-0002 forbids a real RFC
 * standing next to fabricated evidence, and `satPublishBodySchema` enforces it
 * rather than trusting whoever is driving the laptop.
 *
 * TODO(garzario): issue #35, `packages/sat` fetches and parses the list, so a
 * real version can be loaded instead of posted by hand.
 */
export function satRoutes(deps: ApiDeps) {
  return new Hono()
    .get(
      "/lookup",
      zValidator("query", satLookupQuerySchema, rejectInvalid),
      async (c) => {
        const { rfc } = c.req.valid("query");
        const entries = await deps.repo.satLookup(rfc);

        // An RFC that is not on the list is the normal answer, not a 404: the
        // clerk asked a question and "it is not listed" is the answer.
        return c.json({ rfc, entries });
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
 * form takes the supplier's own legal name when we hold one and otherwise keeps
 * the RFC as the name, because a name we do not have is not a name we make up.
 */
async function materialise(
  deps: ApiDeps,
  body: SatPublishBody,
  now: string,
): Promise<{ listVersion: string; entries: SatListEntry[] }> {
  if ("entries" in body) {
    return { listVersion: body.listVersion, entries: body.entries };
  }

  const listVersion = `sim-${now}`;
  const publishedAt = now.slice(0, 10);
  const status = body.status ?? "presunto";

  const entries = await Promise.all(
    body.rfcs.map(async (rfc) => {
      const supplier = await deps.repo.findSupplier(rfc);
      return {
        rfc,
        name: supplier?.legalName ?? rfc,
        status,
        publishedAt,
        listVersion,
      } satisfies SatListEntry;
    }),
  );

  return { listVersion, entries };
}

import type { SatListEntry } from "@hackmty/core";
import {
  ART_49BIS_LABEL,
  matchRfc,
  OFFICIAL_SNAPSHOT_LIST_VERSION,
  OFFICIAL_SNAPSHOT_RETRIEVED_AT,
  OFFICIAL_SNAPSHOT_URL,
  official49BisListing,
  simulatePublication,
} from "@hackmty/sat";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { rejectInvalid } from "../http";
import { createRateLimit } from "../middleware/rate-limit";
import { rescoreSweptLines, runRetroactiveSweep } from "../pipeline";
import {
  type SatPublishBody,
  satLookupQuerySchema,
  satPublishBodySchema,
} from "../schemas";

/**
 * The SAT lists surface: Article 69-B, and Article 49 Bis next to it.
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
 * - **It answers for both lists and says which one answered.** `lists` carries one
 *   block per article with an `answered` flag on each. Article 69-B answers from
 *   the committed download. Article 49 Bis, in force since 1 January 2026, is
 *   published by the SAT one oficio at a time in the DOF with no machine-readable
 *   listing, so its block answers `answered: false` with the coverage reason, the
 *   publication counts and the URL to check them. A screen that showed an empty
 *   49 Bis answer as "no esta listado" would be claiming a check nobody ran, and
 *   that is the failure this shape exists to make impossible. See
 *   `packages/sat/src/snapshot/README.md`.
 *
 * `POST /publish` loads a list version and replays the ledger against it, which
 * is the retroactive sweep. The `simulate` form exists so the demo can publish a
 * list on stage, and it accepts synthetic RFCs only: ADR-0002 forbids a real RFC
 * standing next to fabricated evidence, and both `satPublishBodySchema` here and
 * `simulatePublication` in the package enforce it, rather than trusting whoever
 * is driving the laptop.
 *
 * That endpoint also finishes what it starts, which is issue #175 and the
 * amendment to ADR-0002. Pricing the ledger is only half a publication: the lines
 * of this week's run were scored before the list existed, so in the same request
 * the pending ones belonging to the suppliers it names are scored again with the
 * sweep in hand, their findings are stored, and a `decision_made` goes out per
 * line so the SSE stream announces them. `rescored` on the response says which
 * lines moved and where they moved to. Released lines and lines a person decided
 * are not touched.
 *
 * And the lines the publication made DEFINITIVE are cancelled in the same request,
 * with a `payment_cancelled` naming the article. That is issue #204 and ADR-0009
 * row 4: a definitive listing voids the fiscal effect of the comprobantes
 * retroactively, so the line does not wait in front of a person, it stops, and the
 * only way back is a release signed by a named owner with a written reason on
 * `POST /api/v1/instructions/:id/decide`. This is the live beat of the demo: the
 * list lands, the exposure climbs and one line goes to `cancelado` on the screen.
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

        const source = {
          article: ART_69B_LABEL,
          listVersion: OFFICIAL_SNAPSHOT_LIST_VERSION,
          retrievedAt: OFFICIAL_SNAPSHOT_RETRIEVED_AT,
          url: OFFICIAL_SNAPSHOT_URL,
          taxpayers: official.taxpayers,
          rows: official.size,
        };

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
          source,
          // The top four keys are the 69-B answer and stay where they were. This
          // is the whole answer: one block per SAT list, each saying whether it
          // could answer at all.
          lists: [
            {
              article: ART_69B_LABEL,
              answered: true,
              listed: match.listed,
              entries: match.entries,
              ...(match.effective === undefined
                ? {}
                : { effective: match.effective }),
              source,
            },
            lookup49Bis(match.rfc),
          ],
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

        /* The publication is not finished when it is priced. Issue #175: the
           lines of this week's run were scored before this list existed, so they
           are scored again here, inside the same request, and the findings that
           come back are stored. That is what makes the retroactive pair on
           `GET /api/v1/run/current` climb in the same second the list lands
           instead of staying at zero next to a `totalExposure` in six figures.
           Released lines and lines a person decided are left alone; see
           `rescoreSweptLines`. */
        const rescored = await rescoreSweptLines(deps, sweep);
        /* After `sat_list_published` and never before it: the ledger has to read
           as the publication and then its consequences, so a replay a year later
           cannot show a payment re-decided by a list that had not been posted. */
        for (const line of rescored) {
          await deps.emit({
            type: "decision_made",
            at: line.decision.decidedAt,
            decision: line.decision,
          });
          /* And the cancellation, for the lines this publication made definitive.
             A definitive listing is not a hold somebody can wait out, because the
             comprobantes have no fiscal effect at all, so the line is cancelled on
             the spot with the article in the sentence and only a named owner reopens
             it with a written reason. `actor` is absent because nobody dropped the
             line by hand. Issue #204 and ADR-0009 row 4.

             `cancellation` is null on a line that already carried a definitive row,
             so a second publication naming the same supplier re-scores the pesos and
             appends no second event: one cancellation per line, once. */
          if (line.cancellation !== null) {
            await deps.emit({
              type: "payment_cancelled",
              at: line.decision.decidedAt,
              instructionId: line.instructionId,
              reason: line.cancellation,
            });
          }
        }

        /* `RescoredLine` is the wire shape, stated once in `satPublishResponseSchema`
           and asserted there by the route tests, so it is spread rather than
           remapped into an identical object. */
        return c.json({ ...sweep, rescored });
      },
    );
}

/** How the two articles are written in every answer this endpoint gives. */
const ART_69B_LABEL = "69-B";

/**
 * The Article 49 Bis block of the lookup answer.
 *
 * Today it is the `not_published_machine_readable` arm, and the shape is the
 * argument: `answered: false` plus the reason, the counts and the URL, rather than
 * an empty `entries` a screen could render as "no esta listado". The `loaded` arm
 * is written too, so the day the SAT publishes a file this endpoint answers from
 * it without another change here.
 */
function lookup49Bis(rfc: string) {
  const listing = official49BisListing();

  if (listing.coverage === "loaded") {
    const match = listing.index.match(rfc);
    return {
      article: ART_49BIS_LABEL,
      answered: true,
      coverage: listing.coverage,
      listed: match.listed,
      entries: match.entries,
      ...(match.effective === undefined ? {} : { effective: match.effective }),
      source: {
        article: ART_49BIS_LABEL,
        listVersion: listing.listVersion,
        retrievedAt: listing.retrievedAt,
        url: listing.source,
        taxpayers: listing.index.taxpayers,
        rows: listing.index.size,
      },
    };
  }

  return {
    article: ART_49BIS_LABEL,
    answered: false,
    coverage: listing.coverage,
    entries: [],
    /* The honest sentence, in the Spanish the screen shows, because a clerk
       reading "49 Bis: sin datos" would conclude the supplier is clean. */
    note: `El SAT publica el listado del articulo 49 Bis un oficio a la vez en el DOF y no lo distribuye en ningun formato descargable. Al ${listing.surveyedAt} habia ${String(listing.oficiosPublished)} oficios publicados, del ${listing.firstPublishedAt} al ${listing.lastPublishedAt}. Esta consulta no cubre esa lista.`,
    publications: {
      oficios: listing.oficiosPublished,
      taxpayers: listing.taxpayersPublished,
      firstPublishedAt: listing.firstPublishedAt,
      lastPublishedAt: listing.lastPublishedAt,
      surveyedAt: listing.surveyedAt,
      url: listing.source,
    },
  };
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

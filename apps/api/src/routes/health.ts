import { Hono } from "hono";
import {
  type Dependency,
  dependencyReport,
  railFactsOf,
} from "../dependencies";
import type { ApiDeps } from "../deps";
import { requestIdOf } from "../http";

export const SERVICE_NAME = "api";

/**
 * Bumped by hand. The API has no build step, so there is no generated version
 * to read and nothing to drift out of sync.
 */
export const SERVICE_VERSION = "0.1.0";

export type HealthPayload = {
  ok: true;
  service: typeof SERVICE_NAME;
  version: string;
  dependencies: Dependency[];
};

/**
 * Liveness, plus what this instance was configured with.
 *
 * `ok` is liveness and it is `true` whenever the process can answer, however many
 * dependencies are down. A load balancer that restarts the container because the
 * Banxico portal is slow takes the demo down for a reason that has nothing to do
 * with the demo, so a row says `down` and the envelope stays 200.
 *
 * It must never reach a third party, which is what this comment has said since the
 * first day and what `docs/09-api.md` now says in those words. Exactly two things
 * are probed and both are ours and bounded: a `select 1` against the ledger, and
 * building the payment rail, which is local work. `src/dependencies.ts` owns every
 * sentence, so `bun run doctor` prints the same lines out of the same function.
 *
 * No secret is in this payload. `configured` is a boolean, every detail names
 * variables rather than values, and the driver's own message for a failed probe is
 * logged here against the request id instead of being put on the wire.
 */
export function healthRoutes(deps: ApiDeps) {
  return new Hono().get("/", async (c) => {
    const [database, rail] = await Promise.all([
      deps.dependencies.database().catch(() => undefined),
      deps.rail(),
    ]);

    if (database !== undefined && !database.ok) {
      deps.log(
        `[${requestIdOf(c)}] health: the ledger refused a select 1 after ${database.ms} ms: ${database.error ?? "no message"}`,
      );
    }

    const payload: HealthPayload = {
      ok: true,
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      dependencies: dependencyReport({
        config: deps.dependencies.config,
        ...(database === undefined ? {} : { database }),
        rail: railFactsOf(rail),
        checkedAt: deps.clock.now(),
      }),
    };

    return c.json(payload);
  });
}

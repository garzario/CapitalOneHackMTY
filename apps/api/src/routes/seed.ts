import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { fail, rejectInvalid } from "../http";
import { requireActor } from "../middleware/actor";
import { seedBodySchema } from "../schemas";

/**
 * Regenerates the demo company.
 *
 * It is destructive, so it is off unless `ALLOW_SEED=1` is set, and the guard is
 * a 403 rather than a 404: hiding a dangerous endpoint behind a lie makes it
 * harder to notice when it is accidentally enabled in a deployment.
 *
 * `seed` is honoured by both stores: `MemoryRepository` rebuilds from the factory
 * it was constructed with and `PostgresRepository` reloads the generated company
 * through `@hackmty/seed`, so two laptops that ask for the same seed get the same
 * rehearsal. That was issue #43 and it is done.
 *
 * There is deliberately no way to add to the company without replacing it, which
 * is why `reset: false` is refused rather than ignored. Silently wiping a store
 * for a caller who asked us not to is the one failure mode this endpoint can
 * cause that nobody could undo.
 *
 * It carries `X-Actor` like every other write, before the `ALLOW_SEED` check and
 * not after it: the most destructive endpoint in the product is the last one that
 * should be reachable without a name, and the 403 about the flag is no reason to
 * skip the 400 about the header. Nothing about the regenerated company is
 * attributed to that name, because a rebuilt company has no history to attribute.
 */
export function seedRoutes(deps: ApiDeps) {
  return new Hono().post(
    "/",
    requireActor,
    zValidator("json", seedBodySchema, rejectInvalid),
    async (c) => {
      if (!deps.allowSeed) {
        return fail(
          c,
          403,
          "forbidden",
          "Seeding is disabled. Set ALLOW_SEED=1 to enable it in development.",
        );
      }

      const { seed, reset } = c.req.valid("json");
      if (reset === false) {
        return fail(
          c,
          422,
          "unprocessable",
          "This endpoint always rebuilds the company from the seed, so `reset: false` cannot be honoured. Omit it, or send `reset: true`.",
        );
      }

      return c.json(await deps.repo.reset(seed ?? 0));
    },
  );
}

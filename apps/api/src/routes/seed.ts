import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { fail, rejectInvalid } from "../http";
import { seedBodySchema } from "../schemas";

/**
 * Regenerates the demo company.
 *
 * It is destructive, so it is off unless `ALLOW_SEED=1` is set, and the guard is
 * a 403 rather than a 404: hiding a dangerous endpoint behind a lie makes it
 * harder to notice when it is accidentally enabled in a deployment.
 *
 * TODO(garzario): issue #43, drive this from @hackmty/seed with the seed, so two
 * laptops can ask for the same data and a rehearsal is reproducible.
 */
export function seedRoutes(deps: ApiDeps) {
  return new Hono().post(
    "/",
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

      const { seed } = c.req.valid("json");
      return c.json(await deps.repo.reset(seed ?? 0));
    },
  );
}

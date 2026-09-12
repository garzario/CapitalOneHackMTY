import { Hono } from "hono";
import type { ApiDeps } from "../deps";

/**
 * The payment run is the one screen the product is about: everything the clerk
 * has to pay this week, sorted by what is at risk.
 *
 * One request, one payload. The alert rail, the totals and the table all read
 * from this, because three requests that can disagree with each other is how a
 * demo shows a held instruction inside a released total.
 */
export function runRoutes(deps: ApiDeps) {
  return new Hono().get("/current", async (c) => {
    return c.json(await deps.repo.currentRun());
  });
}

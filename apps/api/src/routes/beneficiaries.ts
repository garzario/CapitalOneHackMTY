import { Hono } from "hono";
import type { ApiDeps } from "../deps";

/**
 * The registry of beneficiaries we have actually proven, one row per account,
 * each carrying the CEP it was proven with. It is the asset that makes the
 * second payment to a supplier cheaper than the first, and the reason a clerk
 * sees "verificado" instead of another alert.
 */
export function beneficiaryRoutes(deps: ApiDeps) {
  return new Hono().get("/", async (c) => {
    return c.json({ items: await deps.repo.beneficiaries() });
  });
}

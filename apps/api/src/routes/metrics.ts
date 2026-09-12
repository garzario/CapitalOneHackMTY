import { Hono } from "hono";
import type { ApiDeps } from "../deps";

/**
 * The blind evaluation, recomputed on demand.
 *
 * The numbers are not flattering and that is the point: the labelled cases are
 * written by somebody who has not read the detectors, so precision and recall
 * mean something. A metrics screen that always shows 1.00 is the first thing a
 * judge stops believing.
 */
export function metricsRoutes(deps: ApiDeps) {
  return new Hono().get("/", async (c) => {
    return c.json(await deps.repo.metrics());
  });
}

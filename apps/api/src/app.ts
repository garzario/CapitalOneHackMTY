import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { type ApiDeps, createDeps } from "./deps";
import { errorBody, rejectInvalid, UNKNOWN_REQUEST_ID } from "./http";
import { requestId } from "./middleware/request-id";
import { beneficiaryRoutes } from "./routes/beneficiaries";
import { cepRoutes } from "./routes/cep";
import { eventRoutes } from "./routes/events";
import { health } from "./routes/health";
import { instructionRoutes } from "./routes/instructions";
import { ledgerRoutes } from "./routes/ledger";
import { metricsRoutes } from "./routes/metrics";
import { runRoutes } from "./routes/run";
import { satRoutes } from "./routes/sat";
import { seedRoutes } from "./routes/seed";
import { supplierRoutes } from "./routes/suppliers";

/**
 * This app is transport only: read the request, validate it, delegate, shape a
 * response.
 *
 * Business logic and anything algorithmic belongs in packages/core, which is
 * pure TypeScript with no dependencies and is unit tested there. If a handler
 * in this workspace starts doing arithmetic on money, it is in the wrong file.
 *
 * The route tree mirrors docs/09-api.md one to one, and each group lives in its
 * own file under src/routes. `createApp(deps)` takes its dependencies instead of
 * reaching for a singleton, so a test can hand it a fresh repository and two
 * tests never share state.
 */

const pingQuery = z.object({
  echo: z.string().min(1).max(64).optional(),
});

export function createApp(deps: ApiDeps = createDeps()) {
  const app = new Hono();

  app.use("*", requestId);

  app.route("/health", health);

  const v1 = new Hono().get(
    "/ping",
    zValidator("query", pingQuery, rejectInvalid),
    (c) => {
      const { echo } = c.req.valid("query");

      return c.json({
        pong: true,
        echo: echo ?? null,
        requestId: c.get("requestId"),
        at: new Date().toISOString(),
      });
    },
  );

  v1.route("/run", runRoutes(deps));
  v1.route("/instructions", instructionRoutes(deps));
  v1.route("/suppliers", supplierRoutes(deps));
  v1.route("/sat", satRoutes(deps));
  v1.route("/cep", cepRoutes(deps));
  v1.route("/beneficiaries", beneficiaryRoutes(deps));
  v1.route("/metrics", metricsRoutes(deps));
  v1.route("/ledger", ledgerRoutes(deps));
  v1.route("/events", eventRoutes(deps));
  v1.route("/seed", seedRoutes(deps));

  app.route("/api/v1", v1);

  app.notFound((c) => {
    const id: string | undefined = c.get("requestId");

    return c.json(
      errorBody(
        "not_found",
        "No route matches this request.",
        id ?? UNKNOWN_REQUEST_ID,
      ),
      404,
    );
  });

  /**
   * One JSON envelope for every failure, and never a stack trace, a driver
   * message or an internal path on the wire. Details stay in the server log,
   * keyed by the request id the client also holds.
   */
  app.onError((err, c) => {
    const id: string | undefined = c.get("requestId");
    const safeId = id ?? UNKNOWN_REQUEST_ID;

    if (err instanceof HTTPException) {
      return c.json(errorBody("http_error", err.message, safeId), err.status);
    }

    console.error(`[${safeId}] unhandled error:`, err);

    return c.json(
      errorBody("internal_error", "Unexpected server error.", safeId),
      500,
    );
  });

  return app;
}

export const app = createApp();

export { REQUEST_ID_HEADER } from "./middleware/request-id";

export default app;

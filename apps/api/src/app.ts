import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { requestId } from "./middleware/request-id";
import { health } from "./routes/health";

/**
 * This app is transport only: read the request, validate it, delegate, shape a
 * response.
 *
 * Business logic and anything algorithmic belongs in packages/core, which is
 * pure TypeScript with no dependencies and is unit tested there. If a handler
 * in this workspace starts doing arithmetic on money, it is in the wrong file.
 */

const UNKNOWN_REQUEST_ID = "unknown";

type ErrorBody = {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};

function errorBody(code: string, message: string, id: string): ErrorBody {
  return { error: { code, message, requestId: id } };
}

const pingQuery = z.object({
  echo: z.string().min(1).max(64).optional(),
});

export function createApp() {
  const app = new Hono();

  app.use("*", requestId);

  app.route("/health", health);

  const v1 = new Hono().get(
    "/ping",
    zValidator("query", pingQuery, (result, c) => {
      if (!result.success) {
        return c.json(
          errorBody(
            "bad_request",
            "Query parameters are invalid.",
            c.get("requestId"),
          ),
          400,
        );
      }
    }),
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

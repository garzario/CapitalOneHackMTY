import { createMiddleware } from "hono/factory";

/**
 * Every response carries a correlation id so a judge can point at a request in
 * the logs and we can find it. The id is echoed back when the caller supplies
 * one, which keeps traces intact across the web app and the API.
 */
export const REQUEST_ID_HEADER = "X-Request-Id";

/** Defensive cap: an attacker controls this header, so it never grows unbounded. */
const MAX_REQUEST_ID_LENGTH = 200;

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}

export const requestId = createMiddleware(async (c, next) => {
  const incoming = c.req.header(REQUEST_ID_HEADER);
  const id =
    incoming && incoming.length > 0 && incoming.length <= MAX_REQUEST_ID_LENGTH
      ? incoming
      : crypto.randomUUID();

  c.set("requestId", id);
  c.header(REQUEST_ID_HEADER, id);

  await next();
});

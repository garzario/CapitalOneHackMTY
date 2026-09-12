import type { Context } from "hono";

/**
 * One error envelope for the whole API, in one file, so no handler can invent a
 * second failure shape. docs/09-api.md promises
 * `{ error: { code, message, requestId } }` and this module is the only place
 * that builds it.
 *
 * Nothing here touches the database, the network or a stack trace: the message
 * on the wire is written for a clerk and for a judge reading the response, and
 * the detail stays in the server log keyed by the same request id.
 */

export const UNKNOWN_REQUEST_ID = "unknown";

/**
 * A closed set, because an error code is part of the contract the web app
 * switches on. Adding a code is a deliberate change to docs/09-api.md.
 */
export type ErrorCode =
  | "bad_request"
  | "forbidden"
  | "not_found"
  | "unprocessable"
  | "rate_limited"
  | "http_error"
  | "internal_error";

/** Statuses this API actually returns. Anything else is a bug, not a choice. */
export type ErrorStatus = 400 | 403 | 404 | 422 | 429 | 500;

export type ErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
  };
};

export function errorBody(
  code: ErrorCode,
  message: string,
  requestId: string,
): ErrorBody {
  return { error: { code, message, requestId } };
}

export function requestIdOf(c: Context): string {
  const id: string | undefined = c.get("requestId");
  return id ?? UNKNOWN_REQUEST_ID;
}

/** The only way a route reports a failure. */
export function fail(
  c: Context,
  status: ErrorStatus,
  code: ErrorCode,
  message: string,
) {
  return c.json(errorBody(code, message, requestIdOf(c)), status);
}

export function notFound(c: Context, message: string) {
  return fail(c, 404, "not_found", message);
}

/**
 * The zValidator hook. It deliberately does not echo the zod issue tree: the
 * body of a payment instruction can carry a supplier name and a CLABE, and a
 * validation error is the one response most likely to end up pasted into a
 * chat. The client gets the field list, never the values it sent.
 */
export function rejectInvalid(
  result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } },
  c: Context,
) {
  if (result.success) {
    return undefined;
  }

  const fields = (result.error?.issues ?? [])
    .map((issue) => issue.path.join("."))
    .filter((path) => path.length > 0);
  const detail =
    fields.length > 0
      ? ` Check: ${[...new Set(fields)].sort().join(", ")}.`
      : "";

  return fail(
    c,
    400,
    "bad_request",
    `The request did not match the contract in docs/09-api.md.${detail}`,
  );
}

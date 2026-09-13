/**
 * The bun test runner is the one bun-specific surface in this workspace, and it
 * never ships: no route or module under src/ imports `bun:*` or a Bun global.
 */
import { describe, expect, it } from "bun:test";
import { app, REQUEST_ID_HEADER } from "./app";
import { createTestApp } from "./test-app";

/**
 * Response.json() is typed as unknown under strict mode, so the shapes the
 * handlers promise are restated here. A change in app.ts that breaks the
 * contract therefore fails typecheck, not only the assertion.
 */
type PingBody = {
  pong: boolean;
  echo: string | null;
  requestId: string;
  at: string;
};

type ErrorBody = {
  error: { code: string; message: string; requestId: string };
};

/**
 * Every request here goes through a test app rather than the module-level one, for
 * the reason `test-app.ts` gives in full: the exported `app` reads the environment,
 * so on a laptop holding a live `DATABASE_URL` a request to `/health` would probe
 * Tiger Data from inside a unit test and a request to anything would print a log
 * line into the suite's output. The module-level app is still asserted below, as the
 * thing `index.ts` exports.
 */
describe("the app index.ts serves", () => {
  it("builds with no overrides at all", () => {
    /* `createApp()` with no arguments reads the environment for every dependency,
       which is exactly what a deployed process does, and a constructor that threw
       there would be a boot failure rather than a test failure. */
    expect(typeof app.fetch).toBe("function");
  });
});

/**
 * The payload of `/health` is asserted in `routes/health.test.ts`. What is left here
 * is the request id, and the reason it is checked on `/health` is that it is the one
 * route a deploy script and a load balancer call.
 */
describe("GET /health", () => {
  it("stamps a request id on the response", async () => {
    const { app: test } = createTestApp();
    const res = await test.request("/health");
    const id = res.headers.get(REQUEST_ID_HEADER);

    expect(id).toBeTruthy();
    expect(id).not.toBe("unknown");
  });

  it("reuses the caller's request id", async () => {
    const { app: test } = createTestApp();
    const res = await test.request("/health", {
      headers: { [REQUEST_ID_HEADER]: "trace-abc" },
    });

    expect(res.headers.get(REQUEST_ID_HEADER)).toBe("trace-abc");
  });
});

describe("GET /api/v1/ping", () => {
  it("answers with the request id it was given", async () => {
    const { app: test } = createTestApp();
    const res = await test.request("/api/v1/ping", {
      headers: { [REQUEST_ID_HEADER]: "trace-ping" },
    });
    const body = (await res.json()) as PingBody;

    expect(res.status).toBe(200);
    expect(body.pong).toBe(true);
    expect(body.echo).toBeNull();
    expect(body.requestId).toBe("trace-ping");
    expect(typeof body.at).toBe("string");
  });

  it("echoes a valid echo parameter", async () => {
    const { app: test } = createTestApp();
    const res = await test.request("/api/v1/ping?echo=hola");

    expect(res.status).toBe(200);
    expect(((await res.json()) as PingBody).echo).toBe("hola");
  });

  it("rejects an empty echo parameter with the shared error envelope", async () => {
    const { app: test } = createTestApp();
    const res = await test.request("/api/v1/ping?echo=");
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("bad_request");
    expect(typeof body.error.requestId).toBe("string");
  });
});

describe("unknown routes", () => {
  it("returns the error envelope and leaks nothing", async () => {
    const { app: test } = createTestApp();
    const res = await test.request("/nope");
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("not_found");
    expect(JSON.stringify(body)).not.toContain("at ");
  });
});

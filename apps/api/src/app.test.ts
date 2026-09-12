/**
 * The bun test runner is the one bun-specific surface in this workspace, and it
 * never ships: no route or module under src/ imports `bun:*` or a Bun global.
 */
import { describe, expect, it } from "bun:test";
import { app, REQUEST_ID_HEADER } from "./app";
import { SERVICE_NAME, SERVICE_VERSION } from "./routes/health";

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

describe("GET /health", () => {
  it("reports the service as healthy", async () => {
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
    });
  });

  it("stamps a request id on the response", async () => {
    const res = await app.request("/health");
    const id = res.headers.get(REQUEST_ID_HEADER);

    expect(id).toBeTruthy();
    expect(id).not.toBe("unknown");
  });

  it("reuses the caller's request id", async () => {
    const res = await app.request("/health", {
      headers: { [REQUEST_ID_HEADER]: "trace-abc" },
    });

    expect(res.headers.get(REQUEST_ID_HEADER)).toBe("trace-abc");
  });
});

describe("GET /api/v1/ping", () => {
  it("answers with the request id it was given", async () => {
    const res = await app.request("/api/v1/ping", {
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
    const res = await app.request("/api/v1/ping?echo=hola");

    expect(res.status).toBe(200);
    expect(((await res.json()) as PingBody).echo).toBe("hola");
  });

  it("rejects an empty echo parameter with the shared error envelope", async () => {
    const res = await app.request("/api/v1/ping?echo=");
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("bad_request");
    expect(typeof body.error.requestId).toBe("string");
  });
});

describe("unknown routes", () => {
  it("returns the error envelope and leaks nothing", async () => {
    const res = await app.request("/nope");
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("not_found");
    expect(JSON.stringify(body)).not.toContain("at ");
  });
});

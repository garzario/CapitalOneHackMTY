import { describe, expect, it } from "bun:test";
import { createTestApp, flush } from "../test-app";
import { REQUEST_ID_HEADER } from "./request-id";

/**
 * One line per request, the request id first.
 *
 * The line the tests care about most is the last one in this file. `GET
 * /api/v1/sat/lookup?rfc=` is the only endpoint in this API that reads real data,
 * and it takes its argument in the query string, so a logger that printed the URL
 * would write the RFC of a real Mexican taxpayer into a file somebody pastes into an
 * issue. `docs/06-regulatory-privacy.md` is what that breaches, and `c.req.path` is
 * the one-word fix that has to stay.
 */

function harness() {
  const lines: string[] = [];
  const { app } = createTestApp({ log: (line) => lines.push(line) });
  return { app, lines };
}

describe("the request log", () => {
  it("writes one line per request, whatever the route answered", async () => {
    const { app, lines } = harness();

    await app.request("/api/v1/ping");
    await app.request("/nope");

    expect(lines.length).toBe(2);
  });

  it("puts the request id the response carries at the front of the line", async () => {
    const { app, lines } = harness();

    const res = await app.request("/api/v1/ping", {
      headers: { [REQUEST_ID_HEADER]: "trace-log" },
    });

    expect(res.headers.get(REQUEST_ID_HEADER)).toBe("trace-log");
    expect(lines[0]).toStartWith("[trace-log] ");
  });

  it("carries the method, the path, the status and the duration", async () => {
    const { app, lines } = harness();

    await app.request("/api/v1/ping");

    expect(lines[0]).toMatch(/^\[[^\]]+] GET \/api\/v1\/ping 200 \d+ms$/);
  });

  it("logs the status the route actually answered, not the one it wanted", async () => {
    const { app, lines } = harness();

    /* A write with no `X-Actor` is a 400, and the line has to say 400 or the log is
       a list of requests that all look fine. */
    await app.request("/api/v1/instructions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 1, source: "manual" }),
    });

    expect(lines[0]).toContain("POST /api/v1/instructions 400");
  });

  it("logs a streaming response when the stream opens, not when it ends", async () => {
    const { app, lines } = harness();

    const controller = new AbortController();
    const res = await app.request("/api/v1/events", {
      signal: controller.signal,
    });

    expect(res.status).toBe(200);
    /* The line is written the moment the handler hands back the stream, because a
       line that waited for an SSE connection to close would be written at the end of
       the demo or never. */
    expect(lines[0]).toContain("GET /api/v1/events 200");

    controller.abort();
    await res.body?.cancel();
    await flush();
  });

  it("never puts a query string in a line, because one of them carries a real RFC", async () => {
    const { app, lines } = harness();

    await app.request("/api/v1/sat/lookup?rfc=CTV060531CV2");
    await app.request("/api/v1/ping?echo=hola");

    for (const line of lines) {
      expect(line).not.toContain("CTV060531CV2");
      expect(line).not.toContain("?");
    }
    expect(lines[0]).toContain("GET /api/v1/sat/lookup 200");
  });

  it("keeps the path parameters, which are ids of our own synthetic company", async () => {
    const { app, lines } = harness();

    await app.request("/api/v1/instructions/pi-unknown-0001");

    /* A 404 is the right answer here and the id is the point of the line: it is what
       lets somebody reading the log see which instruction a screen asked for. */
    expect(lines[0]).toContain("/api/v1/instructions/pi-unknown-0001 404");
  });
});

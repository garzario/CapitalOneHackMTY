import { describe, expect, it } from "bun:test";
import type { LedgerEvent } from "@hackmty/core";
import { createTestApp, flush, TEST_NOW } from "../test-app";

/**
 * Driving SSE through `app.request()` keeps these tests socket free: the
 * response body is a ReadableStream, so one chunk is one `writeSSE`. Every test
 * cancels the reader at the end, which is also how the route's cleanup path gets
 * exercised rather than assumed.
 */
async function openStream(app: ReturnType<typeof createTestApp>["app"]) {
  const controller = new AbortController();
  const res = await app.request("/api/v1/events", {
    signal: controller.signal,
  });
  const body = res.body;
  if (body === null) {
    throw new Error("the SSE response carried no body");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();

  return {
    res,
    async next(): Promise<string> {
      const { value, done } = await reader.read();
      return done ? "" : decoder.decode(value);
    },
    async close(): Promise<void> {
      controller.abort();
      await reader.cancel();
      await flush();
    },
  };
}

const SAMPLE_EVENT: LedgerEvent = {
  type: "payment_sent",
  at: "2026-09-12T03:05:00.000Z",
  instructionId: "ins-2026w37-03",
  claveRastreo: "SYNSPEI20260912001",
};

describe("GET /api/v1/events", () => {
  it("answers as an event stream and says it is ready straight away", async () => {
    const { app } = createTestApp();
    const stream = await openStream(app);

    expect(stream.res.status).toBe(200);
    expect(stream.res.headers.get("content-type")).toContain(
      "text/event-stream",
    );
    // A buffering reverse proxy would otherwise hold the first chunk.
    expect(stream.res.headers.get("x-accel-buffering")).toBe("no");

    const ready = await stream.next();
    expect(ready).toContain(`event: ready`);
    expect(ready).toContain(TEST_NOW);

    await stream.close();
  });

  it("pushes every appended ledger event as event: ledger", async () => {
    const { app, deps } = createTestApp();
    const stream = await openStream(app);
    await stream.next();

    await deps.emit(SAMPLE_EVENT);
    const chunk = await stream.next();

    expect(chunk).toContain("event: ledger");
    const payload = chunk
      .split("\n")
      .find((line) => line.startsWith("data: "))
      ?.slice("data: ".length);
    expect(JSON.parse(payload ?? "null")).toEqual(SAMPLE_EVENT);

    await stream.close();
  });

  it("stores the event before it streams it", async () => {
    const { app, deps } = createTestApp();
    const stream = await openStream(app);
    await stream.next();

    await deps.emit(SAMPLE_EVENT);
    await stream.next();

    const ledger = (await (
      await app.request("/api/v1/ledger?since=2026-09-12T00:00:00.000Z")
    ).json()) as { events: LedgerEvent[] };
    expect(ledger.events).toEqual([SAMPLE_EVENT]);

    await stream.close();
  });

  it("reaches two clients at once", async () => {
    const { app, deps } = createTestApp();
    const first = await openStream(app);
    const second = await openStream(app);
    await first.next();
    await second.next();

    expect(deps.events.subscribers).toBe(2);

    await deps.emit(SAMPLE_EVENT);
    expect(await first.next()).toContain("event: ledger");
    expect(await second.next()).toContain("event: ledger");

    await first.close();
    await second.close();
  });

  it("drops the subscription when the client goes away", async () => {
    const { app, deps } = createTestApp();
    const stream = await openStream(app);
    await stream.next();

    expect(deps.events.subscribers).toBe(1);

    await stream.close();

    // A leak here is one listener per browser reload, which is invisible until
    // the demo has been open for an hour.
    expect(deps.events.subscribers).toBe(0);
  });
});

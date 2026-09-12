import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { clientKey, createRateLimit } from "./rate-limit";
import { requestId } from "./request-id";

/**
 * The window arithmetic, driven by an injected clock so a test never waits for
 * a minute to pass. The route-level behaviour is in routes/sat.test.ts; this
 * file is about the counter itself and about the two things easy to get wrong,
 * which are the reset boundary and who shares a bucket.
 */
function appWith(now: () => number, limit = 2) {
  return new Hono()
    .use(requestId)
    .use(createRateLimit({ limit, windowMs: 1000, now }))
    .get("/x", (c) => c.json({ ok: true }));
}

function from(ip: string): RequestInit {
  return { headers: { "x-forwarded-for": ip } };
}

describe("createRateLimit", () => {
  it("allows the limit and refuses the one after it", async () => {
    const clock = 0;
    const app = appWith(() => clock);

    expect((await app.request("/x", from("1.1.1.1"))).status).toBe(200);
    expect((await app.request("/x", from("1.1.1.1"))).status).toBe(200);
    expect((await app.request("/x", from("1.1.1.1"))).status).toBe(429);
  });

  it("starts a fresh window once the old one has expired", async () => {
    let clock = 0;
    const app = appWith(() => clock);

    await app.request("/x", from("1.1.1.1"));
    await app.request("/x", from("1.1.1.1"));
    expect((await app.request("/x", from("1.1.1.1"))).status).toBe(429);

    clock = 1000;
    const after = await app.request("/x", from("1.1.1.1"));

    expect(after.status).toBe(200);
    expect(after.headers.get("RateLimit-Remaining")).toBe("1");
  });

  it("does not expire the window one millisecond early", async () => {
    let clock = 0;
    const app = appWith(() => clock);

    await app.request("/x", from("1.1.1.1"));
    await app.request("/x", from("1.1.1.1"));

    clock = 999;
    expect((await app.request("/x", from("1.1.1.1"))).status).toBe(429);
  });

  it("reports a Retry-After of at least a second, never zero", async () => {
    let clock = 0;
    const app = appWith(() => clock);

    await app.request("/x", from("1.1.1.1"));
    await app.request("/x", from("1.1.1.1"));
    // Deep inside the window, where the remaining milliseconds round to zero.
    clock = 999;
    const refused = await app.request("/x", from("1.1.1.1"));

    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).toBe("1");
  });

  it("keeps one client's budget away from another's", async () => {
    const clock = 0;
    const app = appWith(() => clock);

    await app.request("/x", from("1.1.1.1"));
    await app.request("/x", from("1.1.1.1"));

    expect((await app.request("/x", from("2.2.2.2"))).status).toBe(200);
    expect((await app.request("/x", from("1.1.1.1"))).status).toBe(429);
  });
});

describe("clientKey", () => {
  it("takes the first address of a forwarded chain, which is the client", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178",
    });

    expect(clientKey(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when there is no chain", () => {
    expect(clientKey(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
  });

  it("puts everything unattributable in one shared bucket", () => {
    // Local development and a health checker land here together, which is why
    // the real limit is set high enough that sharing it costs nobody anything.
    expect(clientKey(new Headers())).toBe("unattributed");
    expect(clientKey(new Headers({ "x-forwarded-for": "   " }))).toBe(
      "unattributed",
    );
  });
});

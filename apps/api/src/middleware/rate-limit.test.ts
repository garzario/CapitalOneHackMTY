import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { clientKey, createRateLimit, isWrite } from "./rate-limit";
import { requestId } from "./request-id";

/**
 * The bucket arithmetic, driven by an injected clock so a test never waits for a
 * second to pass. The route-level behaviour is in `routes/sat.test.ts`,
 * `assistant/routes.test.ts` and `app.test.ts`; this file is about the counter
 * itself and about the four things easy to get wrong: the refill, the partial
 * refill, who shares a bucket, and what `Retry-After` says.
 *
 * Every app here uses a limit of 2 over a window of 1000 ms, so one token is worth
 * 500 ms and the arithmetic is readable in the assertions.
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

  it("counts the budget down on every answer", async () => {
    const clock = 0;
    const app = appWith(() => clock);

    const first = await app.request("/x", from("1.1.1.1"));
    const second = await app.request("/x", from("1.1.1.1"));

    expect(first.headers.get("RateLimit-Limit")).toBe("2");
    expect(first.headers.get("RateLimit-Remaining")).toBe("1");
    expect(second.headers.get("RateLimit-Remaining")).toBe("0");
  });

  it("refills continuously, so one token is back before the whole budget is", async () => {
    let clock = 0;
    const app = appWith(() => clock);

    await app.request("/x", from("1.1.1.1"));
    await app.request("/x", from("1.1.1.1"));
    expect((await app.request("/x", from("1.1.1.1"))).status).toBe(429);

    /* Half the window is one token of two, and this is the whole reason the fixed
       window was replaced: the clerk who confirms a line every few seconds is never
       refused, and the loop is throttled rather than released in batches. */
    clock = 500;
    const half = await app.request("/x", from("1.1.1.1"));

    expect(half.status).toBe(200);
    expect(half.headers.get("RateLimit-Remaining")).toBe("0");
  });

  it("does not hand back a whole token before it has been earned", async () => {
    let clock = 0;
    const app = appWith(() => clock);

    await app.request("/x", from("1.1.1.1"));
    await app.request("/x", from("1.1.1.1"));

    clock = 499;
    expect((await app.request("/x", from("1.1.1.1"))).status).toBe(429);
  });

  it("fills to the capacity and never past it, however long a client waits", async () => {
    let clock = 0;
    const app = appWith(() => clock);

    await app.request("/x", from("1.1.1.1"));
    clock = 60_000;

    const after = await app.request("/x", from("1.1.1.1"));

    /* An idle client comes back to a full bucket and not to a bigger one, which is
       what stops a day of silence from buying a burst nobody budgeted for. */
    expect(after.status).toBe(200);
    expect(after.headers.get("RateLimit-Remaining")).toBe("1");
  });

  it("reports a Retry-After of at least a second, never zero", async () => {
    let clock = 0;
    const app = appWith(() => clock);

    await app.request("/x", from("1.1.1.1"));
    await app.request("/x", from("1.1.1.1"));
    // Deep inside the window, where the milliseconds left round to zero.
    clock = 499;
    const refused = await app.request("/x", from("1.1.1.1"));

    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).toBe("1");
  });

  it("mints nothing when the clock jumps backwards", async () => {
    let clock = 1000;
    const app = appWith(() => clock);

    await app.request("/x", from("1.1.1.1"));
    await app.request("/x", from("1.1.1.1"));

    clock = 0;
    expect((await app.request("/x", from("1.1.1.1"))).status).toBe(429);
  });

  it("keeps one client's budget away from another's", async () => {
    const clock = 0;
    const app = appWith(() => clock);

    await app.request("/x", from("1.1.1.1"));
    await app.request("/x", from("1.1.1.1"));

    expect((await app.request("/x", from("2.2.2.2"))).status).toBe(200);
    expect((await app.request("/x", from("1.1.1.1"))).status).toBe(429);
  });

  it("answers with the shared envelope and the label it was given", async () => {
    const clock = 0;
    const app = new Hono()
      .use(requestId)
      .use(
        createRateLimit({
          limit: 1,
          windowMs: 1000,
          now: () => clock,
          label: "writes",
        }),
      )
      .get("/x", (c) => c.json({ ok: true }));

    await app.request("/x", from("1.1.1.1"));
    const refused = await app.request("/x", from("1.1.1.1"));
    const body = (await refused.json()) as {
      error: { code: string; message: string; requestId: string };
    };

    expect(body.error.code).toBe("rate_limited");
    expect(body.error.message).toContain("Too many writes");
    expect(typeof body.error.requestId).toBe("string");
  });
});

describe("writesOnly", () => {
  function tree(now: () => number) {
    return new Hono()
      .use(requestId)
      .use(createRateLimit({ limit: 1, windowMs: 1000, now, writesOnly: true }))
      .get("/x", (c) => c.json({ ok: true }))
      .post("/x", (c) => c.json({ ok: true }));
  }

  it("charges a write and lets a read through unmetered", async () => {
    const clock = 0;
    const app = tree(() => clock);

    expect((await app.request("/x", from("1.1.1.1"))).status).toBe(200);
    expect((await app.request("/x", from("1.1.1.1"))).status).toBe(200);
    expect(
      (await app.request("/x", { ...from("1.1.1.1"), method: "POST" })).status,
    ).toBe(200);
    expect(
      (await app.request("/x", { ...from("1.1.1.1"), method: "POST" })).status,
    ).toBe(429);
    /* And a read is still free once the writes are spent, because a screen that
       stopped rendering the run would be the limit taking the demo down. */
    expect((await app.request("/x", from("1.1.1.1"))).status).toBe(200);
  });

  it("puts no rate limit headers on a read it did not count", async () => {
    const clock = 0;
    const app = tree(() => clock);

    const read = await app.request("/x", from("1.1.1.1"));

    expect(read.headers.get("RateLimit-Limit")).toBeNull();
  });
});

describe("isWrite", () => {
  it("counts everything that is not a read", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      expect(isWrite(method)).toBe(true);
    }
    for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
      expect(isWrite(method)).toBe(false);
    }
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

import { describe, expect, it } from "bun:test";
import { createExtractor } from "./extraction";
import { createTestApp } from "./test-app";

/**
 * The test harness protects the whole suite from the environment it runs in, so
 * it is worth a test of its own.
 *
 * The failure this guards against is quiet and expensive: CI has no `.env`, a
 * laptop that followed the setup does, and a suite that reads either one is
 * green in one place and red in the other. Whoever hits that spends the night
 * debugging their own machine instead of the product.
 */
describe("createTestApp", () => {
  function withEnv<T>(name: string, value: string, run: () => T): T {
    const previous = process.env[name];
    process.env[name] = value;
    try {
      return run();
    } finally {
      if (previous === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previous;
      }
    }
  }

  it("serves the fixture company even when SEED asks for the generated one", async () => {
    const baseline = createTestApp();
    const expected = await (
      await baseline.app.request("/api/v1/run/current")
    ).json();

    const seeded = await withEnv("SEED", "sentryone", async () => {
      const { app } = createTestApp();
      return (await app.request("/api/v1/run/current")).json();
    });

    expect(seeded).toEqual(expected);
  });

  it("keeps POST /api/v1/seed shut even when ALLOW_SEED is 1", async () => {
    const res = await withEnv("ALLOW_SEED", "1", async () => {
      const { app } = createTestApp();
      return app.request("/api/v1/seed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    });

    expect(res.status).toBe(403);
  });

  it("hands intake an extractor that refuses, whatever key is in the environment", async () => {
    const { deps } = withEnv("GEMINI_API_KEY", "not-a-real-key", () =>
      createTestApp(),
    );

    // The one built from that key reports itself available and would reach the
    // network on the first image a test posted.
    expect(createExtractor("not-a-real-key").available).toBe(true);
    expect(deps.extractor.available).toBe(false);
    expect((await deps.extractor.image("")).ok).toBe(false);
  });
});

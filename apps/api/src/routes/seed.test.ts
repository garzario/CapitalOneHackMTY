import { describe, expect, it } from "bun:test";
import { paymentRunSchema, seedResponseSchema } from "../schemas";
import { createTestApp } from "../test-app";

type ErrorBody = { error: { code: string; message: string } };

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("POST /api/v1/seed", () => {
  it("is off by default and says so rather than pretending not to exist", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/seed", json({}));
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
    expect(body.error.message).toContain("ALLOW_SEED");
  });

  it("reports what it rebuilt when seeding is enabled", async () => {
    const { app } = createTestApp({ allowSeed: true });
    const res = await app.request("/api/v1/seed", json({ seed: 86 }));

    expect(res.status).toBe(200);
    const body = seedResponseSchema.parse(await res.json());

    expect(body.seed).toBe(86);
    expect(body.suppliers).toBe(8);
    expect(body.instructions).toBe(12);
    expect(body.events).toBe(47);
  });

  it("discards anything posted after the last reset", async () => {
    const { app } = createTestApp({ allowSeed: true });

    await app.request(
      "/api/v1/instructions",
      json({
        supplierRfc: "SYN010101AAA",
        amount: 1000,
        clabe: "058580000123456715",
        source: "manual",
      }),
    );
    const grown = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );
    expect(grown.items).toHaveLength(13);

    await app.request("/api/v1/seed", json({ reset: true }));

    const reset = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );
    expect(reset.items).toHaveLength(12);
  });

  it("rejects a seed that is not a non-negative integer", async () => {
    const { app } = createTestApp({ allowSeed: true });

    expect((await app.request("/api/v1/seed", json({ seed: -1 }))).status).toBe(
      400,
    );
    expect(
      (await app.request("/api/v1/seed", json({ seed: 1.5 }))).status,
    ).toBe(400);
  });

  /**
   * There is no "add without replacing" on the repository, so a caller asking for
   * one has to be told. Wiping the company anyway would be the one thing this
   * endpoint can do that nobody could undo.
   */
  it("refuses reset: false instead of wiping the company anyway", async () => {
    const { app } = createTestApp({ allowSeed: true });

    await app.request(
      "/api/v1/instructions",
      json({
        supplierRfc: "SYN010101AAA",
        amount: 1000,
        clabe: "058580000123456715",
        source: "manual",
      }),
    );

    const res = await app.request("/api/v1/seed", json({ reset: false }));
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("unprocessable");

    const after = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );
    expect(after.items).toHaveLength(13);
  });
});

import { describe, expect, it } from "bun:test";
import { ledgerResponseSchema } from "../schemas";
import { createTestApp } from "../test-app";

type ErrorBody = { error: { code: string; message: string } };

describe("GET /api/v1/ledger", () => {
  it("returns the seeded events in chronological order", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/ledger");

    expect(res.status).toBe(200);
    const body = ledgerResponseSchema.parse(await res.json());

    expect(body.events.length).toBe(47);

    const instants = body.events.map((event) => Date.parse(event.at));
    const sorted = [...instants].sort((left, right) => left - right);
    expect(instants).toEqual(sorted);
  });

  it("covers every event type the timeline has to render", async () => {
    const { app } = createTestApp();
    const body = ledgerResponseSchema.parse(
      await (await app.request("/api/v1/ledger")).json(),
    );

    const types = new Set(body.events.map((event) => event.type));
    expect([...types].sort()).toEqual([
      "cep_verified",
      "cfdi_received",
      "complement_received",
      "decision_made",
      "instruction_received",
      "payment_sent",
      "sat_list_published",
    ]);
  });

  it("treats since as an exclusive instant", async () => {
    const { app } = createTestApp();
    const all = ledgerResponseSchema.parse(
      await (await app.request("/api/v1/ledger")).json(),
    );
    const cutoff = all.events[10]?.at;
    expect(cutoff).toBeDefined();

    const after = ledgerResponseSchema.parse(
      await (
        await app.request(
          `/api/v1/ledger?since=${encodeURIComponent(cutoff ?? "")}`,
        )
      ).json(),
    );

    for (const event of after.events) {
      expect(Date.parse(event.at)).toBeGreaterThan(Date.parse(cutoff ?? ""));
    }
  });

  it("compares since as an instant, so an offset and a Z agree", async () => {
    const { app } = createTestApp();

    const withZ = ledgerResponseSchema.parse(
      await (
        await app.request("/api/v1/ledger?since=2026-09-08T18:00:00.000Z")
      ).json(),
    );
    // Monterrey is UTC minus 6 all year, so this is the same instant.
    const withOffset = ledgerResponseSchema.parse(
      await (
        await app.request(
          `/api/v1/ledger?since=${encodeURIComponent("2026-09-08T12:00:00.000-06:00")}`,
        )
      ).json(),
    );

    expect(withOffset.events.length).toBe(withZ.events.length);
  });

  it("honours limit", async () => {
    const { app } = createTestApp();
    const body = ledgerResponseSchema.parse(
      await (await app.request("/api/v1/ledger?limit=5")).json(),
    );

    expect(body.events).toHaveLength(5);
  });

  it("rejects a since that is not an instant", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/ledger?since=yesterday");
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("bad_request");
  });

  it("rejects a limit outside the allowed range", async () => {
    const { app } = createTestApp();

    expect((await app.request("/api/v1/ledger?limit=0")).status).toBe(400);
    expect((await app.request("/api/v1/ledger?limit=5000")).status).toBe(400);
  });
});

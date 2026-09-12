import { describe, expect, it } from "bun:test";
import { paymentRunSchema } from "../schemas";
import { createTestApp } from "../test-app";

describe("GET /api/v1/run/current", () => {
  it("answers with a payload that matches the documented shape", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/run/current");

    expect(res.status).toBe(200);
    // Parsing with the schema is the assertion: a field that drifts from
    // docs/09-api.md fails here and not in the web app.
    const run = paymentRunSchema.parse(await res.json());

    expect(run.items).toHaveLength(12);
    expect(run.totals.instructions).toBe(12);
  });

  it("counts the three actions and sums the money to the cent", async () => {
    const { app } = createTestApp();
    const run = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );

    expect(run.totals.held).toBe(3);
    expect(run.totals.toVerify).toBe(4);
    expect(run.totals.released).toBe(5);
    expect(run.totals.held + run.totals.toVerify + run.totals.released).toBe(
      run.items.length,
    );
    // Twelve amounts including 96450.8 and 51230.25: a float sum drifts here.
    expect(run.totals.amount).toBe(1369901.55);
  });

  it("carries the synthetic flag on every object the UI renders", async () => {
    const { app } = createTestApp();
    const run = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );

    for (const item of run.items) {
      expect(item.instruction.synthetic).toBe(true);
      expect(item.supplier.synthetic).toBe(true);
      expect(item.supplier.rfc.startsWith("SYN")).toBe(true);
    }
  });

  it("attaches supplier-level findings to every instruction of that supplier", async () => {
    const { app } = createTestApp();
    const run = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );

    const listed = run.items.filter(
      (item) => item.supplier.rfc === "SYN020202BBB",
    );

    expect(listed).toHaveLength(2);
    for (const item of listed) {
      expect(item.findings.map((finding) => finding.detector)).toContain(
        "sat_69b",
      );
    }
  });
});

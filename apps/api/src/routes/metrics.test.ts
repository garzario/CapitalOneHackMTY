import { describe, expect, it } from "bun:test";
import { metricsSchema } from "../schemas";
import { createTestApp } from "../test-app";

describe("GET /api/v1/metrics", () => {
  it("reports the blind evaluation over the labelled cases", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/metrics");

    expect(res.status).toBe(200);
    const metrics = metricsSchema.parse(await res.json());

    expect(metrics.cases).toBe(12);
    expect(metrics.truePositives).toBe(4);
    expect(metrics.falsePositives).toBe(3);
    expect(metrics.falseNegatives).toBe(1);
  });

  it("derives precision, recall and the false positive rate from those counts", async () => {
    const { app } = createTestApp();
    const metrics = metricsSchema.parse(
      await (await app.request("/api/v1/metrics")).json(),
    );

    expect(metrics.precision).toBeCloseTo(4 / 7, 10);
    expect(metrics.recall).toBeCloseTo(0.8, 10);
    // Four of the twelve cases are clean and silent, so the denominator is 3+4.
    expect(metrics.falsePositiveRate).toBeCloseTo(3 / 7, 10);
    // A fixture that scored 1.00 would teach the UI nothing and convince nobody.
    expect(metrics.recall).toBeLessThan(1);
  });

  it("attributes every count to a detector, including the miss", async () => {
    const { app } = createTestApp();
    const metrics = metricsSchema.parse(
      await (await app.request("/api/v1/metrics")).json(),
    );

    const rows = Object.values(metrics.perDetector);
    expect(rows).toHaveLength(6);

    const sum = (key: "tp" | "fp" | "fn") =>
      rows.reduce((total, row) => total + row[key], 0);

    expect(sum("tp")).toBe(metrics.truePositives);
    expect(sum("fp")).toBe(metrics.falsePositives);
    expect(sum("fn")).toBe(metrics.falseNegatives);

    expect(metrics.perDetector.sat_69b).toEqual({ tp: 2, fp: 0, fn: 0 });
    expect(metrics.perDetector.supplier_behaviour).toEqual({
      tp: 0,
      fp: 1,
      fn: 1,
    });
    // An info finding is not an alert, so a verified beneficiary is not a
    // false positive.
    expect(metrics.perDetector.beneficiary_cep).toEqual({
      tp: 0,
      fp: 0,
      fn: 0,
    });
  });
});

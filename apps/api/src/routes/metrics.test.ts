import { describe, expect, it } from "bun:test";
import { HOLDOUT_CASES } from "@hackmty/seed";
import { metricsSchema } from "../schemas";
import { createTestApp } from "../test-app";

/**
 * These assertions are deliberately about invariants and provenance rather than
 * about the exact numbers. The numbers move whenever a detector improves, and a
 * test that pins them turns every real improvement into a red build. What must
 * not move is where they come from: the labelled cases, scored by running the
 * detectors, never by counting a column the fixture wrote about itself.
 */
describe("GET /api/v1/metrics", () => {
  it("scores every labelled holdout case", async () => {
    const { app } = createTestApp();
    const res = await app.request("/api/v1/metrics");

    expect(res.status).toBe(200);
    const metrics = metricsSchema.parse(await res.json());

    expect(metrics.cases).toBe(HOLDOUT_CASES.length);
    expect(metrics.cases).toBeGreaterThanOrEqual(25);
  });

  it("keeps every count attributed to a detector", async () => {
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
  });

  it("derives precision, recall and the false positive rate from those counts", async () => {
    const { app } = createTestApp();
    const metrics = metricsSchema.parse(
      await (await app.request("/api/v1/metrics")).json(),
    );

    const {
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
    } = metrics;

    expect(metrics.precision).toBeCloseTo(tp / (tp + fp), 10);
    expect(metrics.recall).toBeCloseTo(tp / (tp + fn), 10);
    expect(metrics.falsePositiveRate).toBeGreaterThanOrEqual(0);
    expect(metrics.falsePositiveRate).toBeLessThanOrEqual(1);
  });

  it("reports a recall below one, because four labels and the engine disagree", async () => {
    const { app } = createTestApp();
    const metrics = metricsSchema.parse(
      await (await app.request("/api/v1/metrics")).json(),
    );

    // The disagreements are named in packages/seed/src/holdout/README.md and
    // they are left in the table on purpose. A metrics screen that reported
    // 1.00 would be reporting a set that was edited until it agreed.
    expect(metrics.recall).toBeLessThan(1);
    expect(metrics.precision).toBeLessThan(1);
    expect(metrics.falseNegatives).toBeGreaterThan(0);
  });

  it("does not count an info row as a false positive", async () => {
    const { app } = createTestApp();
    const metrics = metricsSchema.parse(
      await (await app.request("/api/v1/metrics")).json(),
    );

    // A supplier that was listed and cleared its name, and a beneficiary whose
    // CEP already checked out, both produce an info row. Neither is an alert,
    // so neither may inflate the false positive rate the clerk is sold on.
    expect(metrics.falsePositiveRate).toBeLessThan(0.1);
  });

  it("answers with the same numbers twice, because the harness reads no clock", async () => {
    const { app } = createTestApp();
    const first = await (await app.request("/api/v1/metrics")).json();
    const second = await (await app.request("/api/v1/metrics")).json();

    expect(second).toEqual(first);
  });

  it("reports the evaluation per confidence level as well as per control", async () => {
    const { app } = createTestApp();
    const metrics = metricsSchema.parse(
      await (await app.request("/api/v1/metrics")).json(),
    );

    const levels = Object.keys(metrics.perLevel).sort();
    expect(levels).toEqual(["alerta", "confiable", "precaucion"]);
  });

  it("counts every case once on each axis of the level matrix", async () => {
    const { app } = createTestApp();
    const metrics = metricsSchema.parse(
      await (await app.request("/api/v1/metrics")).json(),
    );

    const rows = Object.values(metrics.perLevel);
    const expected = rows.reduce((total, row) => total + row.expected, 0);
    const predicted = rows.reduce((total, row) => total + row.predicted, 0);

    expect(expected).toBe(metrics.cases);
    expect(predicted).toBe(metrics.cases);
  });

  it("never calls a payment confiable that was not", async () => {
    const { app } = createTestApp();
    const metrics = metricsSchema.parse(
      await (await app.request("/api/v1/metrics")).json(),
    );

    // The one mistake this product cannot make twice. A line it called
    // trustworthy and that was not is worse than ten it stopped for nothing,
    // so this is the row to defend and the one to watch in review.
    expect(metrics.perLevel.confiable.precision).toBe(1);
  });
});

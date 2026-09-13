import { describe, expect, it } from "bun:test";
import { assessLine } from "@hackmty/core";
import { paymentRunSchema } from "../schemas";
import { createTestApp, writeHeaders } from "../test-app";

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

  it("says the run in pesos and not only in line counts", async () => {
    /* The value of this product is the loss it prevents, which a judge told us on
       2026-09-12 is the only framing that interests them. So the run answers in
       pesos: what is stopped, what was let go, what is at risk. */
    const { app } = createTestApp();
    const run = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );

    expect(run.totals.heldAmount).toBe(325650.8);
    expect(run.totals.toVerifyAmount).toBe(597040.5);
    expect(run.totals.releasedAmount).toBe(447210.25);
    expect(run.totals.stoppedAmount).toBe(922691.3);
    expect(run.totals.amountAtRisk).toBeGreaterThan(0);

    /* The three add up to the run, to the centavo, which is the check a judge
       does on the screen with a calculator. */
    expect(
      run.totals.heldAmount +
        run.totals.toVerifyAmount +
        run.totals.releasedAmount,
    ).toBeCloseTo(run.totals.amount, 2);
  });

  it("reports no retroactive 69-B exposure until a sweep priced one", async () => {
    /* Honest zero, not a missing field: this fixture has a presunto supplier and
       no publication swept against the ledger yet, so nothing has been priced.
       The whole-ledger figure for a publication is SweepResult.totalExposure. */
    const { app } = createTestApp();
    const run = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );

    expect(run.totals.retroactive69bBase).toBe(0);
    expect(run.totals.retroactive69bExposure).toBe(0);
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

/**
 * Issue #204. The level and the state travel with every line and the run
 * summarises both, and neither is ever a number.
 *
 * The assertions compare the payload against `assessLine` over the same payload
 * rather than against a hand-written expectation, which is the property that
 * matters: the API answers what the pure rule answers, and a rule that changes
 * moves both sides of the comparison. The hand-written half is the vocabulary,
 * because an enum that grows a fourth word is a product change and not a refactor.
 */
describe("the level and the state of every line", () => {
  it("carries both on every line, with the rule and the findings behind the level", async () => {
    const { app } = createTestApp();
    const run = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );

    for (const item of run.items) {
      const assessed = assessLine({
        findings: item.findings,
        decision: item.decision,
      });

      expect(item.confidence).toBe(assessed.confidence.level);
      expect(item.confidenceRule).toBe(assessed.confidence.rule);
      expect(item.confidenceFindingIds).toEqual(assessed.confidence.findingIds);
      expect(item.state).toBe(assessed.state.state);
      expect(item.stateRule).toBe(assessed.state.rule);
    }
  });

  it("never answers a level or a state outside the ones ADR-0009 allows", async () => {
    const { app } = createTestApp();
    const run = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );

    for (const item of run.items) {
      expect(["confiable", "precaucion", "alerta"]).toContain(item.confidence);
      expect([
        "rojo",
        "cancelado",
        "enviado",
        "pendiente",
        "liberado",
      ]).toContain(item.state);
    }
  });

  it("shows the level with its evidence, never on its own", async () => {
    /* A level with nothing under it is a colour, and a colour is not something a
       clerk can act on. Every level names the findings that produced it, and each
       of those findings is on the line.

       One rule has its evidence somewhere else and it is the honest exception:
       `pending_verification` also fires when the engine's own action is `verify`
       with no finding standing open, and there the evidence is the action on the
       decision rather than a row in the alert rail. */
    const { app } = createTestApp();
    const run = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );

    for (const item of run.items) {
      const held = new Set(item.findings.map((finding) => finding.id));
      for (const id of item.confidenceFindingIds) {
        expect(held.has(id)).toBe(true);
      }

      if (item.confidence === "confiable") {
        expect(item.confidenceFindingIds).toEqual([]);
        continue;
      }
      if (item.confidenceFindingIds.length === 0) {
        expect(item.confidenceRule).toBe("pending_verification");
        expect(item.decision?.action).toBe("verify");
        continue;
      }
      expect(item.confidenceFindingIds.length).toBeGreaterThan(0);
    }
  });

  it("summarises the run by level and by state, as counts that add up", async () => {
    const { app } = createTestApp();
    const run = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );
    const { totals } = run;

    expect(totals.confiable + totals.precaucion + totals.alerta).toBe(
      totals.instructions,
    );
    expect(
      totals.rojo +
        totals.cancelado +
        totals.enviado +
        totals.pendiente +
        totals.liberado,
    ).toBe(totals.instructions);

    // And the counts are the rows, not a second arithmetic over them.
    const countOf = (level: string) =>
      run.items.filter((item) => item.confidence === level).length;
    expect(totals.alerta).toBe(countOf("alerta"));
    expect(totals.precaucion).toBe(countOf("precaucion"));
    expect(totals.confiable).toBe(countOf("confiable"));
  });

  it("reads the listed supplier at alerta, because the engine found the list", async () => {
    const { app } = createTestApp();
    const run = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );

    const listed = run.items.filter(
      (item) => item.supplier.rfc === "SYN020202BBB",
    );
    expect(listed).toHaveLength(2);
    for (const item of listed) {
      expect(item.confidence).toBe("alerta");
    }
  });

  it("cancels the listed lines once a publication makes the listing definitive", async () => {
    /* The acceptance criterion of issue #204, end to end. Before the publication
       the supplier is presunto, which is a hold somebody can answer. After it the
       comprobantes have no fiscal effect at all, so the line is cancelled and not
       stopped, and the ledger carries the event that says so. */
    const { app } = createTestApp();
    const before = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );
    expect(before.items.every((item) => item.state !== "cancelado")).toBe(true);

    const published = await app.request("/api/v1/sat/publish", {
      method: "POST",
      headers: writeHeaders(),
      body: JSON.stringify({
        simulate: true,
        rfcs: ["SYN020202BBB"],
        status: "definitivo",
      }),
    });
    expect(published.status).toBe(200);

    const after = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );
    const listed = after.items.filter(
      (item) => item.supplier.rfc === "SYN020202BBB",
    );

    expect(listed).toHaveLength(2);
    for (const item of listed) {
      expect(item.confidence).toBe("alerta");
      expect(item.state).toBe("cancelado");
      expect(item.stateRule).toBe("sat_definitive");
    }
    expect(after.totals.cancelado).toBe(2);
  });

  it("never puts a probability, a percentage or a score on the payload", async () => {
    /* ADR-0009 forbids it and this is the cheap check that keeps it true: the two
       derived fields are words, and the only numbers on a line are pesos and
       counts, which are not claims about how likely a fraud is. */
    const { app } = createTestApp();
    const run = paymentRunSchema.parse(
      await (await app.request("/api/v1/run/current")).json(),
    );

    for (const item of run.items) {
      expect(typeof item.confidence).toBe("string");
      expect(typeof item.state).toBe("string");
      expect(Number.isNaN(Number(item.confidence))).toBe(true);
    }
  });
});

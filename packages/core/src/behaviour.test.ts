import { describe, expect, it } from "bun:test";
import {
  assessSupplierBehaviour,
  detectSupplierBehaviour,
  poissonUpperTail,
  robustLogScale,
  SUPPLIER_BEHAVIOUR_DEFAULTS,
} from "./behaviour";
import type { Cfdi, Supplier } from "./domain";

const NOW = "2026-09-10T18:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const MS_PER_WEEK = 604_800_000;
const HEAVY = "SYN010101AAA";
const OTHER = "SYN020202BBB";

function at(weeksAgo: number): string {
  return new Date(NOW_MS - weeksAgo * MS_PER_WEEK).toISOString();
}

let sequence = 0;

function cfdi(issuerRfc: string, weeksAgo: number, total: number): Cfdi {
  sequence += 1;
  return {
    uuid: `uuid-${sequence}`,
    issuedAt: at(weeksAgo),
    issuerRfc,
    issuerName: `${issuerRfc} SA de CV`,
    receiverRfc: "SYN990101ZZ9",
    subtotal: total,
    iva: 0,
    total,
    paymentMethod: "PUE",
    synthetic: true,
  };
}

function supplier(rfc: string, firstInvoiceWeeksAgo: number): Supplier {
  return {
    rfc,
    legalName: `${rfc} SA de CV`,
    knownAccounts: [],
    firstInvoiceAt: at(firstInvoiceWeeksAgo),
    synthetic: true,
  };
}

/**
 * Sixteen weeks of a real looking supplier: one invoice a week, amounts that
 * already swing between 15,200 and 27,400 because that is what a materials
 * supplier looks like. Every hard negative below is measured against this, so a
 * detector that fires on it fires on an ordinary Tuesday.
 */
const BASELINE_AMOUNTS = [
  15200, 18400, 22600, 16900, 25300, 19800, 27400, 17600, 23900, 21200, 16300,
  24700, 18900, 26100, 20500, 22100,
];

function baselineLedger(): Cfdi[] {
  const rows: Cfdi[] = [];
  BASELINE_AMOUNTS.forEach((total, index) => {
    rows.push(cfdi(HEAVY, 1.4 + index, total));
  });
  for (let index = 0; index < 16; index += 1) {
    rows.push(cfdi(OTHER, 1.2 + index, 30000));
  }
  return rows;
}

describe("detectSupplierBehaviour, validity gating", () => {
  it("returns null for a new supplier ramping up, with fewer than 8 prior invoices", () => {
    // The legitimate ramp: five invoices of history, six this week, each one
    // bigger than the last. Every signal would fire on the numbers alone.
    const rows: Cfdi[] = [];
    for (let index = 0; index < 5; index += 1) {
      rows.push(cfdi(HEAVY, 1.5 + index * 0.6, 12000 + index * 2000));
    }
    for (let index = 0; index < 6; index += 1) {
      rows.push(cfdi(HEAVY, 0.1 + index * 0.15, 40000 + index * 5000));
    }
    for (let index = 0; index < 16; index += 1) {
      rows.push(cfdi(OTHER, 1.2 + index, 30000));
    }

    const assessment = assessSupplierBehaviour({
      supplier: supplier(HEAVY, 4),
      cfdis: rows,
      now: NOW,
    });

    expect(assessment.gate).toBe("insufficient_history");
    expect(assessment.signals).toEqual([]);
    expect(assessment.finding).toBeNull();
    // The numbers that would have fired are still reported, so the drawer can
    // say "sin historial suficiente" instead of showing an empty panel.
    expect(assessment.baseline.invoices).toBe(5);
    expect(assessment.recent.ratePValue).toBeLessThan(0.01);
    expect(assessment.recent.amountZScore).toBeGreaterThan(3.5);
  });

  it("returns null when the supplier issued nothing in the window under review", () => {
    const assessment = assessSupplierBehaviour({
      supplier: supplier(HEAVY, 60),
      cfdis: baselineLedger(),
      now: NOW,
    });

    expect(assessment.gate).toBe("no_recent_activity");
    expect(assessment.finding).toBeNull();
    expect(assessment.baseline.invoices).toBe(16);
  });

  it("measures a ramping supplier against its own exposure, not a flat 16 weeks", () => {
    // Twelve invoices, all inside the last five weeks, then five this week.
    // Against a flat 16 week denominator the rate test fires at p = 0.0011.
    const rows: Cfdi[] = [];
    for (let index = 0; index < 12; index += 1) {
      rows.push(cfdi(HEAVY, 1.3 + index * 0.4, 30000));
    }
    for (let index = 0; index < 5; index += 1) {
      rows.push(cfdi(HEAVY, 0.1 + index * 0.2, 30000));
    }
    for (let index = 0; index < 12; index += 1) {
      rows.push(cfdi(OTHER, 1.1 + index * 1.2, 30000));
    }
    for (let index = 0; index < 6; index += 1) {
      rows.push(cfdi(OTHER, 0.15 + index * 0.12, 30000));
    }

    const assessment = assessSupplierBehaviour({
      supplier: supplier(HEAVY, 6),
      cfdis: rows,
      now: NOW,
    });

    expect(assessment.gate).toBe("none");
    expect(assessment.baseline.invoices).toBe(12);
    expect(assessment.baseline.exposureWeeks).toBe(5);
    expect(assessment.baseline.ratePerWeek).toBe(2.4);
    expect(assessment.recent.ratePValue).toBeGreaterThan(0.05);
    expect(poissonUpperTail(5, 12 / 16)).toBeLessThan(0.01);
    expect(assessment.finding).toBeNull();
  });
});

describe("detectSupplierBehaviour, hard negatives", () => {
  it("stays silent on a seasonal spike that is inside the supplier's own noise", () => {
    // Two invoices instead of one and a 32,000 peak: December, not fraud.
    const rows = baselineLedger();
    rows.push(cfdi(HEAVY, 0.6, 26500));
    rows.push(cfdi(HEAVY, 0.3, 32000));
    rows.push(cfdi(OTHER, 0.5, 30000));
    rows.push(cfdi(OTHER, 0.2, 31000));

    const assessment = assessSupplierBehaviour({
      supplier: supplier(HEAVY, 60),
      cfdis: rows,
      now: NOW,
    });

    expect(assessment.gate).toBe("none");
    expect(assessment.signals).toEqual([]);
    expect(assessment.finding).toBeNull();
    expect(assessment.recent.ratePValue).toBeCloseTo(0.264, 3);
    expect(assessment.recent.amountZScore).toBeCloseTo(1.89, 2);
    expect(assessment.recent.share - assessment.baseline.share).toBeLessThan(
      SUPPLIER_BEHAVIOUR_DEFAULTS.minConcentrationJump,
    );
  });

  it("ignores a supplier that suddenly bills much less than usual", () => {
    const rows = baselineLedger();
    rows.push(cfdi(HEAVY, 0.5, 1200));
    rows.push(cfdi(OTHER, 0.4, 30000));

    const assessment = assessSupplierBehaviour({
      supplier: supplier(HEAVY, 60),
      cfdis: rows,
      now: NOW,
    });

    expect(assessment.recent.amountZScore).toBeLessThan(0);
    expect(assessment.signals).toEqual([]);
  });

  it("does not fire on one peso of difference from a supplier that always bills the same", () => {
    // MAD is exactly zero here, so without the log sigma floor the z would be
    // infinite and every rounding difference would be a critical finding.
    const rows: Cfdi[] = [];
    for (let index = 0; index < 12; index += 1) {
      rows.push(cfdi(HEAVY, 1.5 + index, 12000));
    }
    for (let index = 0; index < 12; index += 1) {
      rows.push(cfdi(OTHER, 1.4 + index, 30000));
    }
    const penny = [...rows, cfdi(HEAVY, 0.4, 12001), cfdi(OTHER, 0.3, 30000)];
    const double = [...rows, cfdi(HEAVY, 0.4, 24000), cfdi(OTHER, 0.3, 30000)];

    const quiet = assessSupplierBehaviour({
      supplier: supplier(HEAVY, 60),
      cfdis: penny,
      now: NOW,
    });
    const loud = assessSupplierBehaviour({
      supplier: supplier(HEAVY, 60),
      cfdis: double,
      now: NOW,
    });

    expect(quiet.baseline.logSigma).toBeCloseTo(Math.log(1.05), 4);
    expect(quiet.recent.amountZScore).toBeLessThan(0.1);
    expect(quiet.finding).toBeNull();
    expect(loud.recent.amountZScore).toBeGreaterThan(3.5);
    expect(loud.signals).toEqual(["amount_drift"]);
  });
});

describe("detectSupplierBehaviour, real change", () => {
  it("fires on a real jump in rate, amount and concentration", () => {
    // One invoice a week around 20,000 becomes five invoices in seven days
    // topping at 240,000, and the supplier takes 93 percent of the run.
    const rows = baselineLedger();
    rows.push(cfdi(HEAVY, 0.9, 19000));
    rows.push(cfdi(HEAVY, 0.8, 21000));
    rows.push(cfdi(HEAVY, 0.6, 48000));
    rows.push(cfdi(HEAVY, 0.4, 96000));
    rows.push(cfdi(HEAVY, 0.2, 240000));
    rows.push(cfdi(OTHER, 0.5, 30000));

    const assessment = assessSupplierBehaviour({
      supplier: supplier(HEAVY, 60),
      cfdis: rows,
      now: NOW,
    });
    const finding = detectSupplierBehaviour({
      supplier: supplier(HEAVY, 60),
      cfdis: rows,
      now: NOW,
    });

    expect(assessment.gate).toBe("none");
    expect(assessment.signals).toEqual([
      "issuance_rate",
      "amount_drift",
      "concentration",
    ]);
    expect(finding).not.toBeNull();
    if (finding === null) {
      throw new Error("expected a finding");
    }
    expect(finding.detector).toBe("supplier_behaviour");
    expect(finding.state).toBe("requiere_verificacion");
    expect(finding.severity).toBe("critical");
    expect(finding.subject).toEqual({ kind: "supplier", id: HEAVY });
    expect(finding.amountAtRisk).toBe(424000);
    expect(finding.createdAt).toBe(NOW);

    // The evidence is the finding: every number the clerk needs is a chip.
    expect(finding.evidence.signals).toBe(
      "issuance_rate,amount_drift,concentration",
    );
    expect(finding.evidence.baselineInvoices).toBe(16);
    expect(finding.evidence.baselineExposureWeeks).toBe(16);
    expect(finding.evidence.baselineRatePerWeek).toBe(1);
    expect(finding.evidence.recentInvoices).toBe(5);
    expect(finding.evidence.expectedInvoices).toBe(1);
    expect(finding.evidence.ratePValue).toBe(0.00366);
    expect(finding.evidence.recentMaxAmount).toBe(240000);
    expect(finding.evidence.amountZScore).toBe(10.77);
    expect(finding.evidence.baselineMedianAmount).toBe(20847.06);
    expect(finding.evidence.minBaselineInvoices).toBe(8);
    expect(Number(finding.evidence.recentShare)).toBeGreaterThan(0.9);
    expect(finding.explanation).toContain("5 facturas");
    expect(finding.explanation).toContain("240,000.00 MXN");
    expect(finding.explanation).not.toContain("fraude");
  });

  it("reports concentration alone as a warning, not a critical", () => {
    // Same rate, same amounts, but every other supplier went quiet this week.
    const rows = baselineLedger();
    rows.push(cfdi(HEAVY, 0.5, 21000));

    const assessment = assessSupplierBehaviour({
      supplier: supplier(HEAVY, 60),
      cfdis: rows,
      now: NOW,
    });

    expect(assessment.signals).toEqual(["concentration"]);
    expect(assessment.finding?.severity).toBe("warning");
    expect(assessment.finding?.state).toBe("requiere_verificacion");
    expect(assessment.recent.share).toBe(1);
    expect(assessment.baseline.share).toBeCloseTo(0.4124, 4);
  });
});

describe("detectSupplierBehaviour, dirty input", () => {
  it("skips rows with an unparsable date or a non finite total", () => {
    const rows = baselineLedger();
    rows.push({ ...cfdi(HEAVY, 0.5, 21000), issuedAt: "ayer" });
    rows.push({ ...cfdi(HEAVY, 0.4, Number.NaN) });
    rows.push({ ...cfdi(HEAVY, 0.3, Number.POSITIVE_INFINITY) });

    const assessment = assessSupplierBehaviour({
      supplier: supplier(HEAVY, 60),
      cfdis: rows,
      now: NOW,
    });

    expect(assessment.recent.invoices).toBe(0);
    expect(assessment.gate).toBe("no_recent_activity");
  });

  it("ignores invoices dated after the run, which is a clock or a typo", () => {
    const rows = baselineLedger();
    rows.push(cfdi(HEAVY, -3, 500000));

    const assessment = assessSupplierBehaviour({
      supplier: supplier(HEAVY, 60),
      cfdis: rows,
      now: NOW,
    });

    expect(assessment.recent.invoices).toBe(0);
  });

  it("does not mutate the caller's array", () => {
    const rows = baselineLedger();
    const before = rows.map((row) => row.uuid);

    assessSupplierBehaviour({
      supplier: supplier(HEAVY, 60),
      cfdis: rows,
      now: NOW,
    });

    expect(rows.map((row) => row.uuid)).toEqual(before);
  });

  it("throws when the clock or an option is unusable", () => {
    const input = {
      supplier: supplier(HEAVY, 60),
      cfdis: baselineLedger(),
      now: NOW,
    };

    expect(() =>
      detectSupplierBehaviour({ ...input, now: "el jueves" }),
    ).toThrow(RangeError);
    expect(() =>
      detectSupplierBehaviour({ ...input, options: { baselineWeeks: 0 } }),
    ).toThrow(RangeError);
    expect(() =>
      detectSupplierBehaviour({ ...input, options: { recentWeeks: -1 } }),
    ).toThrow(RangeError);
  });
});

describe("poissonUpperTail", () => {
  it("is 1 for k at or below zero and 0 for an impossible rate", () => {
    expect(poissonUpperTail(0, 3)).toBe(1);
    expect(poissonUpperTail(-2, 3)).toBe(1);
    expect(poissonUpperTail(4, 0)).toBe(0);
  });

  it("matches the closed form on the cases the detector actually uses", () => {
    // P(X >= 1 | 1) = 1 - e^-1.
    expect(poissonUpperTail(1, 1)).toBeCloseTo(1 - Math.exp(-1), 12);
    // P(X >= 2 | 1) = 1 - 2 e^-1, the seasonal spike that must stay silent.
    expect(poissonUpperTail(2, 1)).toBeCloseTo(1 - 2 * Math.exp(-1), 12);
    // P(X >= 5 | 1), the real jump.
    expect(poissonUpperTail(5, 1)).toBeCloseTo(0.00365984682, 10);
  });

  it("does not underflow to a useless 1 at a large rate", () => {
    // exp(-1000) is 0 in double precision, so a naive sum answers 1 and the
    // test never fires again. The log space sum keeps the tail.
    const tail = poissonUpperTail(1200, 1000);
    expect(tail).toBeGreaterThan(0);
    expect(tail).toBeLessThan(1e-6);
    expect(poissonUpperTail(900, 1000)).toBeGreaterThan(0.99);
  });
});

describe("robustLogScale", () => {
  it("uses the median and the scaled MAD, not the mean", () => {
    const logs = [1, 2, 3, 4, 100];

    const scale = robustLogScale(logs, 0);

    expect(scale.median).toBe(3);
    expect(scale.mad).toBe(1);
    expect(scale.sigma).toBeCloseTo(1.4826, 4);
  });

  it("floors the scale so an identical baseline cannot divide by zero", () => {
    const scale = robustLogScale([5, 5, 5, 5]);

    expect(scale.mad).toBe(0);
    expect(scale.sigma).toBeCloseTo(Math.log(1.05), 6);
  });

  it("survives an empty baseline", () => {
    const scale = robustLogScale([]);

    expect(scale.median).toBe(0);
    expect(scale.sigma).toBeGreaterThan(0);
  });
});

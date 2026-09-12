import { describe, expect, it } from "bun:test";
import {
  asDetectorModule,
  assessInstruction,
  composeFindings,
  composeFindingsReport,
  type DetectorContext,
  type DetectorModule,
  decide,
  delayCost,
  estimateLoss,
  isFinding,
  type SupplierModel,
  sortFindings,
} from "./decision";
import type { Cep, Finding, PaymentInstruction, Supplier } from "./domain";

/**
 * The Thursday payment run of the persona: one instruction for 184,300 pesos to
 * a supplier that has been paid before. Every scenario below changes one thing
 * about it, so the name of the test is the whole difference.
 */
function anInstruction(
  overrides: Partial<PaymentInstruction> = {},
): PaymentInstruction {
  return {
    id: "inst-1",
    supplierRfc: "SYN010101AAA",
    cfdiUuids: ["11111111-1111-4111-8111-111111111111"],
    clabe: "012180001234567895",
    amount: 184300,
    source: "whatsapp",
    receivedAt: "2026-09-10T16:00:00.000Z",
    synthetic: true,
    ...overrides,
  };
}

function aFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-1",
    detector: "clabe_forensics",
    severity: "warning",
    state: "requiere_verificacion",
    subject: { kind: "instruction", id: "inst-1" },
    amountAtRisk: 184300,
    explanation: "La CLABE no coincide con la cuenta historica del proveedor.",
    evidence: { digitosDistintos: 2 },
    createdAt: "2026-09-10T16:05:00.000Z",
    ...overrides,
  };
}

/** An ordinary supplier: 3,000 pesos a day of delay, nothing exceptional. */
const ordinarySupplier: SupplierModel = {
  delayCostPerDay: 3000,
  relationshipWeight: 1,
};

describe("decide", () => {
  it("releases an instruction with no findings at all", () => {
    const decision = decide(anInstruction(), [], ordinarySupplier);

    expect(decision.action).toBe("release");
    expect(decision.expectedLoss).toBe(0);
    expect(decision.findings).toEqual([]);
    expect(decision.instructionId).toBe("inst-1");
    expect(decision.delayCostPerDay).toBe(3000);
  });

  it("holds a supplier on the definitive 69-B list, whatever the delay costs", () => {
    // A critical finding that the documents already prove is not weighed.
    const listed = aFinding({
      detector: "sat_69b",
      severity: "critical",
      state: "comprobable",
      subject: { kind: "supplier", id: "SYN010101AAA" },
    });

    const decision = decide(anInstruction(), [listed], {
      delayCostPerDay: 500000,
      relationshipWeight: 1,
    });

    expect(decision.action).toBe("hold");
    expect(decision.expectedLoss).toBe(110580); // 184,300 x 0.6
  });

  it("verifies a critical finding that still requires a human check", () => {
    const changedAccount = aFinding({
      severity: "critical",
      state: "requiere_verificacion",
    });

    const decision = decide(anInstruction(), [changedAccount], {
      delayCostPerDay: 500000,
      relationshipWeight: 1,
    });

    expect(decision.action).toBe("verify");
  });

  it("never auto-releases while a critical finding exists", () => {
    // The product promise, over every combination the domain allows and with a
    // delay cost large enough to drown any expected loss.
    const expensiveToDelay: SupplierModel = {
      delayCostPerDay: 10_000_000,
      relationshipWeight: 5,
    };

    for (const state of ["comprobable", "requiere_verificacion"] as const) {
      for (const amountAtRisk of [0, 1, 184300]) {
        const decision = decide(
          anInstruction(),
          [aFinding({ severity: "critical", state, amountAtRisk })],
          expensiveToDelay,
        );

        expect(decision.action).not.toBe("release");
      }
    }
  });

  it("verifies a warning whose expected loss beats one day of delay", () => {
    // 184,300 x 0.15 = 27,645 against 3,000 of delay.
    const decision = decide(anInstruction(), [aFinding()], ordinarySupplier);

    expect(decision.action).toBe("verify");
    expect(decision.expectedLoss).toBe(27645);
  });

  it("releases a warning under the delay cost, with the findings attached", () => {
    const decision = decide(anInstruction(), [aFinding()], {
      delayCostPerDay: 40000,
      relationshipWeight: 1,
    });

    expect(decision.action).toBe("release");
    // Released is not dismissed: the clerk still sees why it was looked at.
    expect(decision.findings).toHaveLength(1);
    expect(decision.findings[0].id).toBe("finding-1");
  });

  it("releases on an exact tie, because the delay cost is the certain money", () => {
    // 200,000 x 0.15 = 30,000, exactly one day of delay.
    const decision = decide(
      anInstruction(),
      [aFinding({ amountAtRisk: 200000 })],
      { delayCostPerDay: 30000, relationshipWeight: 1 },
    );

    expect(decision.action).toBe("release");
  });

  it("verifies for free when the supplier does not care about being late", () => {
    const decision = decide(anInstruction(), [aFinding({ severity: "info" })], {
      delayCostPerDay: 3000,
      relationshipWeight: 0,
    });

    expect(
      delayCost({ delayCostPerDay: 3000, relationshipWeight: 0 }, "verify"),
    ).toBe(0);
    expect(decision.action).toBe("verify");
  });

  it("verifies on an info finding alone when the amount is large enough", () => {
    // 1,000,000 x 0.02 = 20,000 against 500 of delay. Severity is an input to
    // the arithmetic, not a gate in front of it.
    const decision = decide(
      anInstruction({ amount: 1_000_000 }),
      [aFinding({ severity: "info", amountAtRisk: 1_000_000 })],
      { delayCostPerDay: 500, relationshipWeight: 1 },
    );

    expect(decision.action).toBe("verify");
    expect(decision.expectedLoss).toBe(20000);
  });

  it("survives a detector that reports a non-finite amount at risk", () => {
    const broken = aFinding({ id: "broken", amountAtRisk: Number.NaN });
    const sound = aFinding({ id: "sound", amountAtRisk: 50000 });

    const decision = decide(anInstruction(), [broken, sound], ordinarySupplier);

    // The broken row counts as zero pesos and still stacks its probability.
    expect(decision.expectedLoss).toBe(13875); // 50,000 x (1 - 0.85 x 0.85)
    expect(decision.findings).toHaveLength(2);
  });

  it("stamps the newest evidence instant and leaves decidedBy absent", () => {
    const decision = decide(
      anInstruction(),
      [
        aFinding({ id: "old", createdAt: "2026-09-10T16:05:00.000Z" }),
        aFinding({ id: "new", createdAt: "2026-09-10T18:30:00.000Z" }),
      ],
      ordinarySupplier,
    );

    expect(decision.decidedAt).toBe("2026-09-10T18:30:00.000Z");
    expect(decision.decidedBy).toBeUndefined();
  });

  it("takes the clock from the caller when one is given", () => {
    const decision = decide(anInstruction(), [], ordinarySupplier, {
      now: "2026-09-12T03:00:00.000Z",
    });

    expect(decision.decidedAt).toBe("2026-09-12T03:00:00.000Z");
  });

  it("ignores an unparsable finding date instead of throwing", () => {
    const decision = decide(
      anInstruction(),
      [aFinding({ createdAt: "ayer" })],
      ordinarySupplier,
    );

    expect(decision.decidedAt).toBe("2026-09-10T16:00:00.000Z");
  });

  it("rejects a supplier model that is negative or not finite", () => {
    expect(() =>
      decide(anInstruction(), [], {
        delayCostPerDay: -1,
        relationshipWeight: 1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      decide(anInstruction(), [], {
        delayCostPerDay: 3000,
        relationshipWeight: Number.NaN,
      }),
    ).toThrow(RangeError);
  });

  it("does not mutate the findings it was given", () => {
    const findings = [
      aFinding({ id: "small", amountAtRisk: 10 }),
      aFinding({ id: "large", amountAtRisk: 900000 }),
    ];

    decide(anInstruction(), findings, ordinarySupplier);

    expect(findings.map((finding) => finding.id)).toEqual(["small", "large"]);
  });
});

describe("assessInstruction", () => {
  it("names the rule that fired and prices every action", () => {
    const assessment = assessInstruction(
      anInstruction(),
      [aFinding({ severity: "critical", state: "comprobable" })],
      ordinarySupplier,
    );

    expect(assessment.rule).toBe("critical_comprobable");
    expect(assessment.decision.action).toBe("hold");
    expect(assessment.delayCost).toEqual({
      hold: 9000,
      verify: 3000,
      release: 0,
    });
    expect(assessment.loss.probability).toBeCloseTo(0.6, 10);
  });

  it("writes one sentence for the clerk with both numbers in it", () => {
    const assessment = assessInstruction(
      anInstruction(),
      [aFinding()],
      ordinarySupplier,
    );

    expect(assessment.rule).toBe("expected_loss_over_delay_cost");
    expect(assessment.rationale).toBe(
      "Perdida esperada 27,645.00 MXN por encima de 3,000.00 MXN de costo por verificar: se pide verificacion.",
    );
  });

  it("says so plainly when nothing was found", () => {
    const assessment = assessInstruction(anInstruction(), [], ordinarySupplier);

    expect(assessment.rule).toBe("no_findings");
    expect(assessment.rationale).toBe("Sin hallazgos: nada detiene este pago.");
  });
});

describe("estimateLoss", () => {
  it("is amount at risk times the severity probability for one finding", () => {
    expect(
      estimateLoss([aFinding({ severity: "critical" })]).expectedLoss,
    ).toBe(110580);
    expect(estimateLoss([aFinding({ severity: "warning" })]).expectedLoss).toBe(
      27645,
    );
    expect(estimateLoss([aFinding({ severity: "info" })]).expectedLoss).toBe(
      3686,
    );
  });

  it("is zero on no findings, never NaN", () => {
    expect(estimateLoss([])).toEqual({
      exposure: 0,
      exposureCents: 0,
      probability: 0,
      expectedLoss: 0,
      expectedLossCents: 0,
      counted: 0,
    });
  });

  it("stacks two warnings on the same pesos instead of adding the pesos", () => {
    const estimate = estimateLoss([
      aFinding({ id: "a", amountAtRisk: 100000 }),
      aFinding({
        id: "b",
        detector: "duplicate_invoice",
        amountAtRisk: 100000,
      }),
    ]);

    // 1 - 0.85 x 0.85 = 0.2775 of 100,000, not 0.15 of 200,000.
    expect(estimate.exposure).toBe(100000);
    expect(estimate.expectedLoss).toBe(27750);
    expect(estimate.expectedLoss).toBeLessThan(30000);
    expect(estimate.counted).toBe(2);
  });

  it("takes the largest amount at risk, not the last or the first", () => {
    const estimate = estimateLoss([
      aFinding({ id: "duplicate", amountAtRisk: 50000 }),
      aFinding({
        id: "listed",
        detector: "sat_69b",
        severity: "critical",
        state: "comprobable",
        // The retroactive sweep counts everything already deducted, so this
        // legitimately exceeds the instruction and must survive.
        amountAtRisk: 1_240_000,
      }),
    ]);

    expect(estimate.exposure).toBe(1_240_000);
    expect(estimate.probability).toBeCloseTo(0.66, 10);
    expect(estimate.expectedLoss).toBe(818400);
  });

  it("never lets the probability reach or pass 1", () => {
    const many = Array.from({ length: 40 }, (_unused, index) =>
      aFinding({ id: `f-${index}`, severity: "critical" }),
    );

    const estimate = estimateLoss(many);

    expect(estimate.probability).toBeLessThan(1);
    expect(estimate.expectedLoss).toBeLessThanOrEqual(estimate.exposure);
  });

  it("reads a negative or absurd amount at risk as zero pesos", () => {
    const estimate = estimateLoss([
      aFinding({ id: "negative", amountAtRisk: -5000 }),
      aFinding({ id: "absurd", amountAtRisk: 1e20 }),
    ]);

    expect(estimate.exposure).toBe(0);
    expect(estimate.counted).toBe(0);
    expect(estimate.expectedLoss).toBe(0);
  });
});

describe("delayCost", () => {
  it("charges three days for a hold, one for a verification, none to release", () => {
    expect(delayCost(ordinarySupplier, "hold")).toBe(9000);
    expect(delayCost(ordinarySupplier, "verify")).toBe(3000);
    expect(delayCost(ordinarySupplier, "release")).toBe(0);
  });

  it("scales with the relationship, because a late payment is not one event", () => {
    const singleSource: SupplierModel = {
      delayCostPerDay: 3000,
      relationshipWeight: 2.5,
    };

    expect(delayCost(singleSource, "verify")).toBe(7500);
    expect(delayCost(singleSource, "hold")).toBe(22500);
  });

  it("rejects a negative daily cost", () => {
    expect(() =>
      delayCost({ delayCostPerDay: -0.01, relationshipWeight: 1 }, "hold"),
    ).toThrow(RangeError);
  });
});

describe("sortFindings", () => {
  it("puts the biggest pesos at risk at the top of the rail", () => {
    const sorted = sortFindings([
      aFinding({ id: "small", amountAtRisk: 12000 }),
      aFinding({ id: "large", amountAtRisk: 184300 }),
      aFinding({ id: "middle", amountAtRisk: 90000 }),
    ]);

    expect(sorted.map((finding) => finding.id)).toEqual([
      "large",
      "middle",
      "small",
    ]);
  });

  it("breaks a tie on severity, then on the oldest evidence", () => {
    const sorted = sortFindings([
      aFinding({
        id: "warning-late",
        severity: "warning",
        createdAt: "2026-09-10T18:00:00.000Z",
      }),
      aFinding({
        id: "warning-early",
        severity: "warning",
        createdAt: "2026-09-10T09:00:00.000Z",
      }),
      aFinding({ id: "critical", severity: "critical" }),
    ]);

    expect(sorted.map((finding) => finding.id)).toEqual([
      "critical",
      "warning-early",
      "warning-late",
    ]);
  });

  it("collapses the same finding id emitted twice", () => {
    const sorted = sortFindings([aFinding(), aFinding({ amountAtRisk: 1 })]);

    expect(sorted).toHaveLength(1);
    expect(sorted[0].amountAtRisk).toBe(184300);
  });
});

describe("composeFindings", () => {
  const supplier: Supplier = {
    rfc: "SYN010101AAA",
    legalName: "Refacciones Sinteticas del Norte SA de CV",
    knownAccounts: [
      {
        clabe: "012180001234567895",
        establishedBy: "payment_complement",
        establishedAt: "2026-03-01T00:00:00.000Z",
        timesPaid: 9,
      },
    ],
    firstInvoiceAt: "2025-11-04T00:00:00.000Z",
    synthetic: true,
  };

  function detectorThatFinds(id: string, amountAtRisk: number): DetectorModule {
    return {
      detector: "clabe_forensics",
      run: () => [aFinding({ id, amountAtRisk })],
    };
  }

  it("merges injected detectors and returns them in rail order", async () => {
    const findings = await composeFindings(
      anInstruction(),
      supplier,
      [],
      [],
      [],
      undefined,
      {
        detectors: [
          detectorThatFinds("small", 1000),
          detectorThatFinds("large", 700000),
        ],
      },
    );

    expect(findings.map((finding) => finding.id)).toEqual(["large", "small"]);
  });

  it("hands every detector the whole context, CEP and SAT list included", async () => {
    const seen: DetectorContext[] = [];
    const cep = { claveRastreo: "ABC123" } as Cep;

    await composeFindings(
      anInstruction(),
      supplier,
      [],
      [],
      [
        {
          rfc: "SYN010101AAA",
          name: "Refacciones Sinteticas del Norte SA de CV",
          status: "definitivo",
          publishedAt: "2026-09-01",
          listVersion: "2026-09-01",
        },
      ],
      cep,
      {
        detectors: [
          {
            detector: "beneficiary_cep",
            run: (context) => {
              seen.push(context);
              return [];
            },
          },
        ],
      },
    );

    expect(seen).toHaveLength(1);
    expect(seen[0].supplier?.rfc).toBe("SYN010101AAA");
    expect(seen[0].satEntries).toHaveLength(1);
    expect(seen[0].cep).toBe(cep);
  });

  it("awaits a detector that answers with a promise", async () => {
    const findings = await composeFindings(
      anInstruction(),
      supplier,
      [],
      [],
      [],
      undefined,
      {
        detectors: [
          {
            detector: "sat_69b",
            run: async () => [aFinding({ id: "async" })],
          },
        ],
      },
    );

    expect(findings.map((finding) => finding.id)).toEqual(["async"]);
  });

  it("keeps the payment run alive when one detector throws", async () => {
    const report = await composeFindingsReport(
      {
        instruction: anInstruction(),
        supplier,
        cfdis: [],
        complements: [],
        satEntries: [],
      },
      {
        detectors: [
          {
            detector: "duplicate_invoice",
            run: () => {
              throw new Error("bad fixture");
            },
          },
          detectorThatFinds("survivor", 5000),
        ],
      },
    );

    expect(report.findings.map((finding) => finding.id)).toEqual(["survivor"]);
    expect(report.ran).toEqual(["clabe_forensics"]);
    expect(report.skipped).toEqual([
      { detector: "duplicate_invoice", reason: "threw" },
    ]);
  });

  it("drops a malformed finding rather than showing the clerk half a row", async () => {
    const findings = await composeFindings(
      anInstruction(),
      supplier,
      [],
      [],
      [],
      undefined,
      {
        detectors: [
          {
            detector: "supplier_behaviour",
            run: () =>
              [
                aFinding({ id: "good" }),
                { id: "half-built", severity: "warning" },
              ] as unknown as Finding[],
          },
        ],
      },
    );

    expect(findings.map((finding) => finding.id)).toEqual(["good"]);
  });

  it("reports a detector that answers with the wrong shape entirely", async () => {
    const report = await composeFindingsReport(
      {
        instruction: anInstruction(),
        supplier,
        cfdis: [],
        complements: [],
        satEntries: [],
      },
      {
        detectors: [
          {
            detector: "bank_reconciliation",
            run: () => "not findings" as unknown as Finding[],
          },
        ],
      },
    );

    expect(report.findings).toEqual([]);
    expect(report.skipped).toEqual([
      { detector: "bank_reconciliation", reason: "no_result" },
    ]);
  });

  it("accounts for all six controls when it discovers them on disk", async () => {
    // No injected detectors, so this walks the registry as apps/api does on a
    // machine where some detector pull requests have merged and others have
    // not. The assertion is deliberately about the accounting and not about
    // which ones exist today, so it stays true as the other PRs land.
    const report = await composeFindingsReport({
      instruction: anInstruction(),
      supplier,
      cfdis: [],
      complements: [],
      satEntries: [],
    });

    expect(report.ran.length + report.skipped.length).toBe(6);
    expect(report.findings.every(isFinding)).toBe(true);
    expect(new Set(report.ran).size).toBe(report.ran.length);
  });
});

describe("asDetectorModule", () => {
  const context: DetectorContext = {
    instruction: anInstruction(),
    cfdis: [],
    complements: [],
    satEntries: [],
  };

  it("wraps a function that takes the whole context", async () => {
    const module = asDetectorModule("clabe_forensics", (given: unknown) => [
      aFinding({ id: (given as DetectorContext).instruction.id }),
    ]);

    expect(await module?.run(context)).toHaveLength(1);
  });

  it("wraps a function written with positional arguments", async () => {
    const detect = (instruction: PaymentInstruction, supplier?: Supplier) => [
      aFinding({ id: `${instruction.id}:${supplier === undefined ? 0 : 1}` }),
    ];

    const module = asDetectorModule("clabe_forensics", detect, (given) => [
      given.instruction,
      given.supplier,
    ]);
    const findings = await module?.run(context);

    expect(findings?.[0].id).toBe("inst-1:0");
  });

  it("tries the other call shape when the first one finds nothing", async () => {
    // Declared with two parameters, so the positional shape is tried first and
    // returns nothing, and the context shape is what actually answers.
    const detect = (given: unknown, _second?: unknown) =>
      Array.isArray((given as DetectorContext).cfdis)
        ? [aFinding({ id: "by-context" })]
        : [];

    const module = asDetectorModule("duplicate_invoice", detect, (given) => [
      given.instruction,
      given.cfdis,
    ]);

    expect((await module?.run(context))?.[0].id).toBe("by-context");
  });

  it("wraps an object that exposes run", async () => {
    const module = asDetectorModule("sat_69b", {
      run: () => [aFinding({ id: "from-object" })],
    });

    expect((await module?.run(context))?.[0].id).toBe("from-object");
  });

  it("refuses an export that is neither a function nor a runnable object", () => {
    expect(asDetectorModule("sat_69b", 42)).toBeUndefined();
    expect(asDetectorModule("sat_69b", { notRun: () => [] })).toBeUndefined();
    expect(asDetectorModule("sat_69b", undefined)).toBeUndefined();
  });
});

describe("isFinding", () => {
  it("accepts a finding built by a detector", () => {
    expect(isFinding(aFinding())).toBe(true);
  });

  it("rejects rows missing the fields the screen reads", () => {
    expect(isFinding({ ...aFinding(), severity: "urgent" })).toBe(false);
    expect(isFinding({ ...aFinding(), state: "culpable" })).toBe(false);
    expect(isFinding({ ...aFinding(), subject: undefined })).toBe(false);
    expect(isFinding({ ...aFinding(), amountAtRisk: "184300" })).toBe(false);
    expect(isFinding(null)).toBe(false);
  });
});

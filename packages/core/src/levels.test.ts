/**
 * The rule table of ADR-0009, asserted row by row.
 *
 * Two things are covered and the second one is the reason this file is long. The
 * rows themselves are ordinary table tests. What matters more is the precedence
 * between them, because every argument about these two functions is an argument
 * about which rule wins: money that left against a list published afterwards, a
 * definitive listing against a release a person signed, a hold against a blocked
 * verification. Each of those pairs has a case here.
 */

import { describe, expect, it } from "bun:test";
import type {
  Confidence,
  Decision,
  Finding,
  PaymentExecution,
  Severity,
  TransactionState,
} from "./domain";
import { SYSTEM_DECIDER } from "./domain";
import {
  assessConfidence,
  assessLine,
  assessTransactionState,
  blockedByCep,
  type ConfidenceRule,
  confidenceOf,
  definitiveListingReason,
  executionLineOf,
  isAccountWithoutHistory,
  isDefinitiveSatListing,
  type LevelLine,
  releasedByAPerson,
  runLevels,
  SAT_49BIS_ARTICLE,
  type TransactionStateRule,
  transactionStateOf,
} from "./levels";

const NOW = "2026-09-12T18:00:00.000Z";
const INSTRUCTION = "INS-2026-09-07-047";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: overrides.id ?? "f-1",
    detector: overrides.detector ?? "duplicate_invoice",
    severity: overrides.severity ?? "info",
    state: overrides.state ?? "comprobable",
    subject: overrides.subject ?? { kind: "instruction", id: INSTRUCTION },
    amountAtRisk: overrides.amountAtRisk ?? 0,
    explanation: overrides.explanation ?? "Contexto para la persona que paga.",
    evidence: overrides.evidence ?? {},
    createdAt: overrides.createdAt ?? NOW,
  };
}

function severe(severity: Severity, id = `f-${severity}`): Finding {
  return finding({ id, severity });
}

/** A 69-B finding in the shape `@hackmty/engine` writes it. */
function satFinding(status: string, extra: Finding["evidence"] = {}): Finding {
  return finding({
    id: `sat69b:SYN080910HI8:2026-09-12:${status}`,
    detector: "sat_69b",
    severity: "critical",
    subject: { kind: "supplier", id: "SYN080910HI8" },
    evidence: { rfc: "SYN080910HI8", status, listedNow: true, ...extra },
  });
}

/** A CLABE forensics finding in the shape `detectClabe` writes it. */
function clabeFinding(signals: string, knownAccounts: number): Finding {
  return finding({
    id: `clabe-${INSTRUCTION}`,
    detector: "clabe_forensics",
    severity: "warning",
    state: "requiere_verificacion",
    evidence: { clabe: "012180101391764613", signals, knownAccounts },
  });
}

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    instructionId: overrides.instructionId ?? INSTRUCTION,
    action: overrides.action ?? "release",
    expectedLoss: overrides.expectedLoss ?? 0,
    delayCostPerDay: overrides.delayCostPerDay ?? 0,
    findings: overrides.findings ?? [],
    decidedAt: overrides.decidedAt ?? NOW,
    ...(overrides.decidedBy === undefined
      ? {}
      : { decidedBy: overrides.decidedBy }),
    ...(overrides.reason === undefined ? {} : { reason: overrides.reason }),
  };
}

describe("isDefinitiveSatListing", () => {
  it("is true for a 69-B row that is definitivo and still listed", () => {
    expect(isDefinitiveSatListing(satFinding("definitivo"))).toBe(true);
  });

  it("is false for a presunto row, which is published and still answerable", () => {
    expect(isDefinitiveSatListing(satFinding("presunto"))).toBe(false);
  });

  it("is false once the taxpayer cleared their name", () => {
    /* The history stays on the screen. Reading an old definitivo row as an alert
       forever would be the product refusing to notice a taxpayer won. */
    const cleared = satFinding("definitivo", { listedNow: false });

    expect(isDefinitiveSatListing(cleared)).toBe(false);
  });

  it("is true for a 49 Bis row, whatever else it carries", () => {
    const art49 = finding({
      id: "sat49bis:SYN080910HI8:2026-07-10",
      detector: "sat_69b",
      severity: "critical",
      evidence: { article: SAT_49BIS_ARTICLE, rfc: "SYN080910HI8" },
    });

    expect(isDefinitiveSatListing(art49)).toBe(true);
  });

  it("is false for a finding from any other detector", () => {
    expect(isDefinitiveSatListing(severe("critical"))).toBe(false);
  });
});

describe("isAccountWithoutHistory", () => {
  it("is true for a supplier nobody has ever paid", () => {
    expect(isAccountWithoutHistory(clabeFinding("new_supplier", 0))).toBe(true);
  });

  it("is true for a known supplier on an account we have never paid", () => {
    expect(
      isAccountWithoutHistory(clabeFinding("first_time_seen,bank_changed", 3)),
    ).toBe(true);
  });

  it("is false when the account is one the supplier has been paid on", () => {
    expect(isAccountWithoutHistory(clabeFinding("plaza_changed", 4))).toBe(
      false,
    );
  });

  it("falls back to the count when no signals key was written", () => {
    const legacy = finding({
      detector: "clabe_forensics",
      evidence: { knownAccounts: 0 },
    });

    expect(isAccountWithoutHistory(legacy)).toBe(true);
  });

  it("does not read one signal name as another by substring", () => {
    /* The signals travel as one comma-joined string, because Finding.evidence
       holds no arrays. Splitting and not matching is what keeps that safe. */
    expect(isAccountWithoutHistory(clabeFinding("near_miss", 2))).toBe(false);
  });
});

describe("confidenceOf", () => {
  const cases: Array<[string, Finding[], Confidence, ConfidenceRule]> = [
    ["nothing at all", [], "confiable", "no_open_signal"],
    ["an info finding only", [severe("info")], "confiable", "no_open_signal"],
    [
      "a definitive SAT listing",
      [satFinding("definitivo")],
      "alerta",
      "sat_definitive",
    ],
    ["a critical finding", [severe("critical")], "alerta", "critical_finding"],
    [
      "an account with no history",
      [clabeFinding("new_supplier", 0)],
      "precaucion",
      "new_account_without_history",
    ],
    [
      "a finding that needs a person",
      [finding({ severity: "info", state: "requiere_verificacion" })],
      "precaucion",
      "pending_verification",
    ],
    ["a warning", [severe("warning")], "precaucion", "warning_finding"],
  ];

  for (const [name, findings, level, rule] of cases) {
    it(`reads ${name} as ${level}`, () => {
      expect(confidenceOf(findings)).toBe(level);
      expect(assessConfidence(findings).rule).toBe(rule);
    });
  }

  it("never answers anything but the three levels", () => {
    /* The product says confiable, precaucion or alerta and never the word
       seguro, in any language. ADR-0009 is the binding statement and this is the
       assertion behind it. */
    const levels = new Set(
      cases.map(([, findings]) => confidenceOf(findings) as string),
    );

    for (const level of levels) {
      expect(["confiable", "precaucion", "alerta"]).toContain(level);
    }
  });

  it("reads a pending verification off the decision when no finding says so", () => {
    const assessment = assessConfidence([], decision({ action: "verify" }));

    expect(assessment.level).toBe("precaucion");
    expect(assessment.rule).toBe("pending_verification");
  });

  it("carries the findings that produced the level, so the level has evidence", () => {
    const sat = satFinding("definitivo");
    const assessment = assessConfidence([severe("warning"), sat]);

    expect(assessment.findingIds).toEqual([sat.id]);
  });

  it("carries no finding ids only when nothing is open", () => {
    expect(assessConfidence([]).findingIds).toEqual([]);
  });

  it("lets the most specific rule report, without changing the level", () => {
    /* A new account is a warning in the severity table, so both rules answer
       precaucion. The one that gets reported is the one a clerk can act on. */
    const newAccount = clabeFinding("new_supplier", 0);
    const assessment = assessConfidence([severe("warning"), newAccount]);

    expect(assessment.level).toBe("precaucion");
    expect(assessment.rule).toBe("new_account_without_history");
  });

  it("is not changed by the action on the decision when a finding is critical", () => {
    const findings = [severe("critical")];

    expect(confidenceOf(findings, decision({ action: "release" }))).toBe(
      "alerta",
    );
  });

  it("does not mutate or reorder the findings it was handed", () => {
    const findings = [severe("warning"), severe("critical")];
    const snapshot = [...findings];

    confidenceOf(findings);

    expect(findings).toEqual(snapshot);
  });
});

describe("transactionStateOf", () => {
  const rows: Array<
    [
      string,
      Parameters<typeof assessTransactionState>,
      TransactionState,
      TransactionStateRule,
    ]
  > = [
    [
      "nothing decided it",
      [undefined, undefined, undefined],
      "pendiente",
      "undecided",
    ],
    [
      "the engine held it",
      [decision({ action: "hold" }), undefined, undefined],
      "rojo",
      "stopped_for_a_person",
    ],
    [
      "the engine asked for a verification",
      [decision({ action: "verify" }), undefined, undefined],
      "rojo",
      "stopped_for_a_person",
    ],
    [
      "nothing stops it and nothing was sent",
      [decision({ action: "release" }), undefined, undefined],
      "liberado",
      "released",
    ],
    [
      "the CEP contradicts the documents",
      [decision({ action: "hold" }), { state: "blocked" }, undefined],
      "cancelado",
      "verification_blocked",
    ],
    [
      "a definitive SAT listing and nobody signed a release",
      [
        decision({ action: "hold", findings: [satFinding("definitivo")] }),
        undefined,
        undefined,
      ],
      "cancelado",
      "sat_definitive",
    ],
    [
      "the rail sent it",
      [decision({ action: "release" }), undefined, { state: "sent" }],
      "enviado",
      "executed",
    ],
    [
      "the rail acknowledged it",
      [decision({ action: "release" }), undefined, { state: "settled" }],
      "enviado",
      "executed",
    ],
    [
      "the rail refused it",
      [decision({ action: "release" }), undefined, { state: "failed" }],
      "rojo",
      "execution_failed",
    ],
    [
      "the run dropped the line",
      [decision({ action: "release" }), undefined, { state: "cancelled" }],
      "cancelado",
      "execution_cancelled",
    ],
    [
      "the line is queued and has not left",
      [decision({ action: "release" }), undefined, { state: "queued" }],
      "liberado",
      "released",
    ],
  ];

  for (const [name, args, state, rule] of rows) {
    it(`reads ${name} as ${state}`, () => {
      expect(transactionStateOf(...args)).toBe(state);
      expect(assessTransactionState(...args).rule).toBe(rule);
    });
  }

  it("keeps enviado once money left, whatever the list published afterwards", () => {
    /* The retroactive sweep prices what a publication costs. It does not un-send
       a SPEI, and a screen that said cancelado over a transfer that settled would
       be the demo lying about the one thing that cannot be taken back. */
    const listed = decision({
      action: "release",
      findings: [satFinding("definitivo")],
    });

    expect(
      transactionStateOf(listed, { state: "released" }, { state: "settled" }),
    ).toBe("enviado");
  });

  it("lets a release a person signed outrank a definitive listing", () => {
    const released = decision({
      action: "release",
      findings: [satFinding("definitivo")],
      decidedBy: "Lupita Hernandez",
      reason: "El proveedor entrego y la linea de produccion esta detenida.",
    });

    expect(transactionStateOf(released)).toBe("liberado");
    expect(assessTransactionState(released).rule).toBe("released");
  });

  it("does not let the engine's own signature do that", () => {
    /* SYSTEM_DECIDER is the one decision the engine signs itself. It is not a
       person taking responsibility, so it cannot overrule the listing. */
    const automatic = decision({
      action: "release",
      findings: [satFinding("definitivo")],
      decidedBy: SYSTEM_DECIDER,
    });

    expect(transactionStateOf(automatic)).toBe("cancelado");
  });

  it("blocks over a hold, because from the clerk's side both stopped the money", () => {
    const held = decision({ action: "hold" });

    expect(transactionStateOf(held, { state: "blocked" })).toBe("cancelado");
  });

  it("is pendiente for a verification in flight that nothing has decided", () => {
    expect(transactionStateOf(undefined, { state: "awaiting_cep" })).toBe(
      "pendiente",
    );
  });

  it("answers without the findings, which are optional on the input", () => {
    expect(transactionStateOf({ action: "hold" })).toBe("rojo");
  });
});

describe("releasedByAPerson", () => {
  it("is false for nothing, for a hold and for the engine's own release", () => {
    expect(releasedByAPerson()).toBe(false);
    expect(releasedByAPerson(decision({ action: "hold" }))).toBe(false);
    expect(
      releasedByAPerson(
        decision({ action: "release", decidedBy: SYSTEM_DECIDER }),
      ),
    ).toBe(false);
    expect(releasedByAPerson(decision({ action: "release" }))).toBe(false);
  });

  it("is true for a release with a name against it", () => {
    expect(
      releasedByAPerson(decision({ action: "release", decidedBy: "Lupita" })),
    ).toBe(true);
  });
});

describe("executionLineOf", () => {
  const execution: PaymentExecution = {
    runId: "RUN-2026-W37",
    lines: [
      { instructionId: INSTRUCTION, state: "sent", amount: 38417.48 },
      { instructionId: "INS-2026-09-07-048", state: "queued", amount: 12000 },
    ],
    totals: {
      lines: 2,
      queued: 1,
      sent: 1,
      settled: 0,
      failed: 0,
      cancelled: 0,
      amount: 50417.48,
      queuedAmount: 12000,
      sentAmount: 38417.48,
      settledAmount: 0,
      failedAmount: 0,
      cancelledAmount: 0,
    },
    updatedAt: NOW,
  };

  it("finds the line that pays one instruction", () => {
    expect(executionLineOf(execution, INSTRUCTION)?.state).toBe("sent");
  });

  it("answers undefined for a line the execution does not carry", () => {
    expect(executionLineOf(execution, "INS-NOPE")).toBeUndefined();
  });

  it("answers undefined when there is no execution at all", () => {
    expect(executionLineOf(undefined, INSTRUCTION)).toBeUndefined();
  });

  it("composes with transactionStateOf, which is how a run line is read", () => {
    const state = transactionStateOf(
      decision({ action: "release" }),
      undefined,
      executionLineOf(execution, INSTRUCTION),
    );

    expect(state).toBe("enviado");
  });
});

/** A `beneficiary_cep` finding in the shape `beneficiaryCepAdapter` writes it. */
function cepFinding(severity: Severity): Finding {
  return finding({
    id: `cep-${INSTRUCTION}`,
    detector: "beneficiary_cep",
    severity,
    evidence: { nameMatch: severity === "critical" ? "mismatch" : "match" },
  });
}

/** A 49 Bis finding in the shape `sat49BisAdapter` writes it. */
function bisFinding(): Finding {
  return finding({
    id: "sat49bis:SYN080910HI8:2026-09-01",
    detector: "sat_69b",
    severity: "critical",
    subject: { kind: "supplier", id: "SYN080910HI8" },
    evidence: {
      article: SAT_49BIS_ARTICLE,
      rfc: "SYN080910HI8",
      publishedAt: "2026-09-01",
      oficio: "500-05-2026-1234",
    },
  });
}

describe("blockedByCep", () => {
  it("is true on the critical finding control 5 writes", () => {
    expect(blockedByCep([cepFinding("critical")])).toBe(true);
  });

  it("is false when the CEP agreed with the documents", () => {
    expect(blockedByCep([cepFinding("info")])).toBe(false);
  });

  it("is false when no CEP was ever read, which is not a clean one", () => {
    expect(blockedByCep([severe("critical")])).toBe(false);
  });
});

describe("assessLine", () => {
  it("answers both halves with the rule behind each", () => {
    const line: LevelLine = {
      findings: [satFinding("definitivo")],
      decision: decision({ action: "hold" }),
    };

    expect(assessLine(line)).toEqual({
      confidence: {
        level: "alerta",
        rule: "sat_definitive",
        findingIds: ["sat69b:SYN080910HI8:2026-09-12:definitivo"],
      },
      state: { state: "cancelado", rule: "sat_definitive" },
    });
  });

  it("reads the definitive listing off the line and not off the decision", () => {
    /* `recordEngineDecision` unions findings into the line's index, so the index
       is the wider set. A decision that remembers weighing nothing must not turn
       a cancelled line green. */
    const line: LevelLine = {
      findings: [satFinding("definitivo")],
      decision: { action: "hold", findings: [] },
    };

    expect(assessLine(line).state.state).toBe("cancelado");
  });

  it("reads the blocked verification off the findings with no fold handed in", () => {
    const line: LevelLine = {
      findings: [cepFinding("critical")],
      decision: decision({ action: "hold" }),
    };

    expect(assessLine(line).state).toEqual({
      state: "cancelado",
      rule: "verification_blocked",
    });
  });

  it("prefers a folded verification over the one the findings imply", () => {
    const line: LevelLine = {
      findings: [cepFinding("critical")],
      decision: decision({ action: "hold" }),
      verification: { state: "cep_signed" },
    };

    expect(assessLine(line).state.state).toBe("rojo");
  });

  it("lets a named owner reopen a line a definitive listing cancelled", () => {
    const reopened: LevelLine = {
      findings: [bisFinding()],
      decision: decision({
        action: "release",
        decidedBy: "Mariana Trevino",
        reason: "La resolucion se impugno y el proveedor entrego el acuse.",
      }),
    };

    expect(assessLine(reopened).state).toEqual({
      state: "liberado",
      rule: "released",
    });
    // The level does not move. The listing is still on the line.
    expect(assessLine(reopened).confidence.level).toBe("alerta");
  });

  it("does not let the engine's own release reopen one", () => {
    const line: LevelLine = {
      findings: [bisFinding()],
      decision: decision({ action: "release", decidedBy: SYSTEM_DECIDER }),
    };

    expect(assessLine(line).state.state).toBe("cancelado");
  });

  it("answers pendiente for a line nothing has decided", () => {
    expect(assessLine({ findings: [] }).state).toEqual({
      state: "pendiente",
      rule: "undecided",
    });
  });
});

describe("runLevels", () => {
  const lines: LevelLine[] = [
    { findings: [], decision: decision({ action: "release" }) },
    { findings: [severe("warning")], decision: decision({ action: "hold" }) },
    {
      findings: [satFinding("definitivo")],
      decision: decision({ action: "hold" }),
    },
    { findings: [] },
  ];

  it("counts every line once per level and once per state", () => {
    expect(runLevels(lines)).toEqual({
      confiable: 2,
      precaucion: 1,
      alerta: 1,
      rojo: 1,
      cancelado: 1,
      enviado: 0,
      pendiente: 1,
      liberado: 1,
    });
  });

  it("adds up to the number of lines on both halves", () => {
    const totals = runLevels(lines);

    expect(totals.confiable + totals.precaucion + totals.alerta).toBe(
      lines.length,
    );
    expect(
      totals.rojo +
        totals.cancelado +
        totals.enviado +
        totals.pendiente +
        totals.liberado,
    ).toBe(lines.length);
  });

  it("answers zeroes for a run with no lines", () => {
    expect(Object.values(runLevels([])).every((count) => count === 0)).toBe(
      true,
    );
  });
});

describe("definitiveListingReason", () => {
  it("names article 69-B, the version and the publication date", () => {
    const reason = definitiveListingReason([
      satFinding("definitivo", {
        listVersion: "2026-09-12",
        publishedAt: "2026-09-12",
      }),
    ]);

    expect(reason).toContain("articulo 69-B");
    expect(reason).toContain("version 2026-09-12");
    expect(reason).toContain("publicada el 2026-09-12");
    expect(reason).toContain("Solo el propietario puede reabrirla");
  });

  it("names article 49 Bis and the oficio when that is the listing", () => {
    const reason = definitiveListingReason([bisFinding()]);

    expect(reason).toContain(`articulo ${SAT_49BIS_ARTICLE}`);
    expect(reason).toContain("oficio 500-05-2026-1234");
  });

  it("never says the word this product may not say", () => {
    const reason = definitiveListingReason([satFinding("definitivo")]) ?? "";

    expect(reason.toLowerCase()).not.toContain("seguro");
    expect(reason).not.toContain("%");
  });

  it("answers undefined when no listing is definitive", () => {
    expect(definitiveListingReason([satFinding("presunto")])).toBeUndefined();
    expect(definitiveListingReason([])).toBeUndefined();
  });
});

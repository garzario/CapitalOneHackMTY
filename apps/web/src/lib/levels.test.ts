/**
 * Tests for the three derivations the instruction detail reads.
 *
 * None of them is arithmetic this file owns: the level, the state and the window
 * come out of `@hackmty/core`, and what is under test is that the browser feeds
 * them the same inputs the API does and survives the two things a screen cannot
 * survive, an unreadable instant and a field the server has not shipped yet.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Finding, Severity } from "@hackmty/core";
import { amountAtRiskOf, assessLine, holdOf, remainingLabel } from "./levels";

let seq = 0;

function finding(severity: Severity, amountAtRisk: number): Finding {
  seq += 1;

  return {
    id: `f-${seq}`,
    detector: "duplicate_invoice",
    severity,
    state: "comprobable",
    subject: { kind: "instruction", id: "INS-1" },
    amountAtRisk,
    explanation: "Hallazgo sintetico para la prueba.",
    evidence: {},
    createdAt: "2026-09-10T10:00:00.000Z",
  };
}

function decision(
  action: Decision["action"],
  findings: Finding[] = [],
  decidedBy?: string,
): Decision {
  return {
    instructionId: "INS-1",
    action,
    expectedLoss: 0,
    delayCostPerDay: 0,
    findings,
    decidedAt: "2026-09-10T10:00:00.000Z",
    ...(decidedBy === undefined ? {} : { decidedBy }),
  };
}

describe("assessLine", () => {
  test("answers the level with the findings that produced it", () => {
    const critical = finding("critical", 1000);
    const line = assessLine({
      decision: decision("hold", [critical]),
      findings: [critical],
    });

    expect(line.confidence.level).toBe("alerta");
    expect(line.confidence.rule).toBe("critical_finding");
    expect(line.confidence.findingIds).toEqual([critical.id]);
  });

  test("reads the findings off the argument and not off the decision's copy", () => {
    /* The API fills both lists and the offline row fills one. Passing the
       screen's own findings to both derivations is what stops a line reading
       `rojo` here and `cancelado` on the run for the same payment. */
    const critical = finding("critical", 1000);
    const line = assessLine({
      decision: decision("hold"),
      findings: [critical],
    });

    expect(line.confidence.level).toBe("alerta");
  });

  test("cancels a line whose verification came back blocked", () => {
    const line = assessLine({
      decision: decision("verify"),
      findings: [],
      verification: { state: "blocked" },
    });

    expect(line.state.state).toBe("cancelado");
    expect(line.state.rule).toBe("verification_blocked");
  });

  test("stops a line for a person when nothing else has happened to it", () => {
    const line = assessLine({ decision: decision("hold"), findings: [] });

    expect(line.state.state).toBe("rojo");
  });

  test("never answers a number for the level", () => {
    const line = assessLine({
      decision: decision("release"),
      findings: [finding("info", 0)],
    });

    expect(["confiable", "precaucion", "alerta"]).toContain(
      line.confidence.level,
    );
  });
});

describe("amountAtRiskOf", () => {
  test("is the largest single amount and never the sum", () => {
    /* Six controls looking at one payment describe the same pesos from six
       angles. Summing would inflate the headline exactly on the instructions
       carrying the most evidence, which is the number a judge checks first. */
    expect(
      amountAtRiskOf([finding("critical", 184300), finding("warning", 9000)]),
    ).toBe(184300);
  });

  test("is zero when nothing was found", () => {
    expect(amountAtRiskOf([])).toBe(0);
  });
});

describe("holdOf", () => {
  const now = "2026-09-11T10:00:00.000Z";

  test("prefers the window the API measured against its own clock", () => {
    const sent = {
      action: "hold",
      days: 3,
      deadline: "2026-09-30T00:00:00.000Z",
      hoursLeft: 99,
      expired: false,
      nextSteps: ["call_supplier"],
    } as const;

    expect(holdOf(decision("hold"), now, sent)?.deadline).toBe(sent.deadline);
  });

  test("computes the window itself when the API sent none", () => {
    const window = holdOf(decision("verify"), now);

    expect(window?.days).toBe(1);
    expect(window?.nextSteps).toContain("one_cent_cep");
  });

  test("answers null for a released payment rather than a zero-hour window", () => {
    expect(holdOf(decision("release"), now)).toBeNull();
  });

  test("answers null for an instant no runtime can read, instead of throwing", () => {
    /* `holdWindow` throws a RangeError on an unreadable date, and on a screen
       that is a blank page in front of a judge. "Sin plazo" is the honest
       reading and it renders. */
    expect(
      holdOf({ action: "hold", decidedAt: "no es una fecha" }, now),
    ).toBeNull();
  });
});

describe("remainingLabel", () => {
  const base = {
    action: "hold",
    days: 3,
    deadline: "2026-09-14T00:00:00.000Z",
    nextSteps: ["call_supplier"],
  } as const;

  test("says the hours under a day, because zero days reads as expired", () => {
    expect(remainingLabel({ ...base, hoursLeft: 11, expired: false })).toBe(
      "Quedan 11 horas",
    );
  });

  test("says the days above one", () => {
    expect(remainingLabel({ ...base, hoursLeft: 49, expired: false })).toBe(
      "Quedan 2 dias",
    );
  });

  test("says the window closed, and nothing about what that did", () => {
    const label = remainingLabel({ ...base, hoursLeft: 0, expired: true });

    expect(label).toBe("El plazo ya se cumplio");
    expect(label).not.toContain("liber");
  });
});

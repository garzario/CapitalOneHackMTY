import { describe, expect, it } from "bun:test";
import type { Action, Finding } from "./domain";
import { type RunLine, runMoney } from "./exposure";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    detector: "sat_69b",
    severity: "critical",
    state: "comprobable",
    subject: { kind: "supplier", id: "SYN080910HI8" },
    amountAtRisk: 100,
    explanation: "prueba",
    evidence: { deductedBase: 878592.59, retroactiveExposure: 404152.59 },
    createdAt: "2026-09-10T15:00:00.000Z",
    ...overrides,
  };
}

function line(
  amount: number,
  action: Action,
  findings: Finding[] = [],
): RunLine {
  return { instruction: { amount }, decision: { action }, findings };
}

describe("runMoney", () => {
  it("answers zeroes for an empty run rather than throwing", () => {
    expect(runMoney([])).toEqual({
      heldAmount: 0,
      toVerifyAmount: 0,
      releasedAmount: 0,
      stoppedAmount: 0,
      amountAtRisk: 0,
      retroactive69bBase: 0,
      retroactive69bExposure: 0,
    });
  });

  it("splits the pesos by the action that stopped them", () => {
    const money = runMoney([
      line(184300, "hold"),
      line(38417.48, "verify"),
      line(12000.5, "release"),
    ]);

    expect(money.heldAmount).toBe(184300);
    expect(money.toVerifyAmount).toBe(38417.48);
    expect(money.releasedAmount).toBe(12000.5);
  });

  it("adds held and to-verify into the money that has not left", () => {
    const money = runMoney([line(1000.01, "hold"), line(2000.02, "verify")]);

    /* Cent arithmetic, not floats: 1000.01 + 2000.02 is 3000.03 and not
       3000.0299999999997, and a judge adds up the column on the screen. */
    expect(money.stoppedAmount).toBe(3000.03);
  });

  it("counts nothing towards an action for a line the engine has not decided", () => {
    const money = runMoney([
      { instruction: { amount: 5000 }, decision: null, findings: [] },
      { instruction: { amount: 7000 }, findings: [] },
    ]);

    expect(money.heldAmount).toBe(0);
    expect(money.toVerifyAmount).toBe(0);
    expect(money.releasedAmount).toBe(0);
    expect(money.stoppedAmount).toBe(0);
  });

  it("adds the largest amount at risk per line and never the sum per line", () => {
    /* One payment with two findings about the same pesos is one exposure, and two
       payments are two. Summing inside a line would inflate exactly the rows with
       the most evidence, which is where a judge looks first. */
    const money = runMoney([
      line(184300, "hold", [
        finding({ id: "a", amountAtRisk: 184300 }),
        finding({
          id: "b",
          detector: "clabe_forensics",
          subject: { kind: "instruction", id: "INS-1" },
          amountAtRisk: 184300,
        }),
      ]),
      line(38247.73, "verify", [
        finding({
          id: "c",
          detector: "clabe_forensics",
          subject: { kind: "instruction", id: "INS-2" },
          amountAtRisk: 38247.73,
        }),
      ]),
    ]);

    expect(money.amountAtRisk).toBe(222547.73);
  });

  it("prices the retroactive 69-B pair off the finding evidence", () => {
    const money = runMoney([line(184300, "hold", [finding()])]);

    expect(money.retroactive69bBase).toBe(878592.59);
    expect(money.retroactive69bExposure).toBe(404152.59);
  });

  it("counts one supplier once, however many instructions it sits on", () => {
    /* The sweep prices the voided deductions per supplier. Three payments to the
       same listed supplier in one week are three payments and one exposure, and
       summing per line would treble the number on exactly the run a judge reads
       hardest. */
    const money = runMoney([
      line(184300, "hold", [finding()]),
      line(38247.73, "hold", [finding({ id: "f2" })]),
      line(17805.17, "verify", [finding({ id: "f3" })]),
    ]);

    expect(money.retroactive69bExposure).toBe(404152.59);
    expect(money.heldAmount).toBe(222547.73);
  });

  it("adds two different listed suppliers", () => {
    const money = runMoney([
      line(184300, "hold", [finding()]),
      line(38247.73, "hold", [
        finding({
          id: "f2",
          subject: { kind: "supplier", id: "SYN990202S02" },
          evidence: { deductedBase: 100000, retroactiveExposure: 46000 },
        }),
      ]),
    ]);

    expect(money.retroactive69bBase).toBe(978592.59);
    expect(money.retroactive69bExposure).toBe(450152.59);
  });

  it("prices nothing from a 69-B finding whose sweep did not touch the supplier", () => {
    /* `sat69bAdapter` writes the pair only when a publication was actually swept.
       A listed supplier nobody has paid yet is a real finding with no retroactive
       exposure, and reporting zero pesos of exposure is the truthful answer. */
    const money = runMoney([
      line(184300, "hold", [
        finding({
          evidence: { rfc: "SYN080910HI8", status: "definitivo" },
        }),
      ]),
    ]);

    expect(money.retroactive69bBase).toBe(0);
    expect(money.retroactive69bExposure).toBe(0);
  });

  it("ignores the other five detectors", () => {
    const money = runMoney([
      line(184300, "hold", [
        finding({
          detector: "clabe_forensics",
          subject: { kind: "instruction", id: "INS-1" },
          evidence: { deductedBase: 99999, retroactiveExposure: 99999 },
        }),
      ]),
    ]);

    expect(money.retroactive69bExposure).toBe(0);
  });

  it("survives a malformed pair instead of blanking the run", () => {
    const money = runMoney([
      line(184300, "hold", [
        finding({ evidence: { deductedBase: -1, retroactiveExposure: 46000 } }),
      ]),
      line(38247.73, "verify", [
        finding({
          id: "f2",
          subject: { kind: "supplier", id: "SYN990202S02" },
          evidence: { deductedBase: 100000, retroactiveExposure: 46000 },
        }),
      ]),
    ]);

    expect(money.retroactive69bExposure).toBe(46000);
    expect(money.heldAmount).toBe(184300);
    expect(money.toVerifyAmount).toBe(38247.73);
  });
});

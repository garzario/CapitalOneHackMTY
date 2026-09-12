/**
 * A payment run in pesos, which is the only unit the product's value is in.
 *
 * A Capital One judge told us the eight minutes we saved a clerk were not
 * interesting, and they were right: the minutes are a side effect. What the
 * product is worth is the loss it prevents, so a run has to be able to say how
 * much money it stopped, how much it let go, and how much of what was already
 * paid and already deducted a 69-B publication has put back on the table.
 *
 * The run screen already computed the first three from its own rows. This module
 * puts them in the API answer instead, so the constancia, the screen and a judge
 * with `curl` read the same numbers, and adds the fourth, which nothing computed
 * anywhere.
 *
 * Pure and dependency free, like everything in this package. Every total goes
 * through the cent arithmetic in `./money`, because a run of ninety-two
 * instructions summed as floats is off by centavos and a judge checks totals.
 */

import { estimateLoss } from "./decision";
import type { Action, Finding } from "./domain";
import { sumAmounts } from "./money";

/**
 * One line of a payment run, as little of it as this arithmetic needs.
 *
 * Structural on purpose: `PaymentRun` is assembled in `apps/api` and in
 * `packages/db`, and neither type belongs in a package with no dependencies.
 */
export interface RunLine {
  instruction: { amount: number };
  /** Absent or null while the engine has not decided this line yet. */
  decision?: { action: Action } | null;
  findings: readonly Finding[];
}

/** A payment run in pesos. Every field is MXN, exact to the centavo. */
export interface RunMoney {
  /** Pesos on the lines the engine holds. */
  heldAmount: number;
  /** Pesos on the lines waiting for a verification. */
  toVerifyAmount: number;
  /** Pesos on the lines nothing stops. */
  releasedAmount: number;
  /** `heldAmount` plus `toVerifyAmount`: the money that has not left. */
  stoppedAmount: number;
  /**
   * Pesos this run puts at risk: the largest single amount at risk on each line,
   * added across lines.
   *
   * The largest per line and not the sum per line, for the reason `estimateLoss`
   * gives: six detectors on one payment describe the same pesos six times. Added
   * across lines, because two payments are two payments.
   */
  amountAtRisk: number;
  /**
   * Subtotal already deducted to the suppliers this run's Article 69-B findings
   * name, priced by the retroactive sweep.
   *
   * Zero until a sweep has priced a supplier that this run pays, which is the
   * ordinary state of a Thursday: the whole-ledger figure for one publication is
   * `SweepResult.totalExposure` on `POST /api/v1/sat/publish`, and this pair is
   * the part of it the run in front of the clerk carries.
   */
  retroactive69bBase: number;
  /**
   * ISR plus IVA that reverses on `retroactive69bBase`. This is the loss that
   * needs no fraud at all: nobody stole anything, the SAT published a list.
   */
  retroactive69bExposure: number;
}

const ZERO: RunMoney = {
  heldAmount: 0,
  toVerifyAmount: 0,
  releasedAmount: 0,
  stoppedAmount: 0,
  amountAtRisk: 0,
  retroactive69bBase: 0,
  retroactive69bExposure: 0,
};

/**
 * The run in pesos.
 *
 * The one rule worth arguing about is the 69-B pair, and it is why this is a
 * function with a test rather than two additions inside a route. The retroactive
 * exposure is priced PER SUPPLIER by the sweep, and one supplier can sit on
 * several instructions in the same week. Summing the finding on every line would
 * count the same voided deductions three times on exactly the run where a judge
 * looks hardest, so each supplier's exposure is counted once, keyed on the RFC
 * the finding is about.
 *
 * The three action totals are per line, because those are different pesos: two
 * instructions to the same supplier are two payments.
 *
 * A line with no decision yet counts towards no action total and still
 * contributes its 69-B exposure, because the publication already happened
 * whatever the engine has got round to deciding.
 */
export function runMoney(lines: readonly RunLine[]): RunMoney {
  if (lines.length === 0) {
    return { ...ZERO };
  }

  const held: number[] = [];
  const toVerify: number[] = [];
  const released: number[] = [];
  const atRisk: number[] = [];
  /** RFC to [base, exposure], so one supplier is priced once per run. */
  const swept = new Map<string, readonly [number, number]>();

  for (const line of lines) {
    const action = line.decision?.action;
    const { amount } = line.instruction;

    if (action === "hold") {
      held.push(amount);
    } else if (action === "verify") {
      toVerify.push(amount);
    } else if (action === "release") {
      released.push(amount);
    }

    atRisk.push(estimateLoss(line.findings).exposure);

    for (const finding of line.findings) {
      const row = sweptRowOf(finding);
      if (row !== undefined) {
        swept.set(row.rfc, [row.base, row.exposure]);
      }
    }
  }

  const heldAmount = sumAmounts(held);
  const toVerifyAmount = sumAmounts(toVerify);

  return {
    heldAmount,
    toVerifyAmount,
    releasedAmount: sumAmounts(released),
    stoppedAmount: sumAmounts([heldAmount, toVerifyAmount]),
    amountAtRisk: sumAmounts(atRisk),
    retroactive69bBase: sumAmounts([...swept.values()].map((row) => row[0])),
    retroactive69bExposure: sumAmounts(
      [...swept.values()].map((row) => row[1]),
    ),
  };
}

interface SweptRow {
  rfc: string;
  base: number;
  exposure: number;
}

/**
 * The retroactive pair a 69-B finding carries, or undefined.
 *
 * `deductedBase` and `retroactiveExposure` are written on the evidence by
 * `sat69bAdapter` in `@hackmty/engine`, and only when a sweep actually priced
 * that supplier. Anything else on the evidence, including a value of the wrong
 * type from a detector with a bug, is read as "this finding prices nothing"
 * rather than as zero pesos of something, so one malformed finding cannot blank
 * out a run total.
 */
function sweptRowOf(finding: Finding): SweptRow | undefined {
  if (finding.detector !== "sat_69b" || finding.subject.kind !== "supplier") {
    return undefined;
  }

  const base = moneyOf(finding.evidence.deductedBase);
  const exposure = moneyOf(finding.evidence.retroactiveExposure);

  return base === undefined || exposure === undefined
    ? undefined
    : { rfc: finding.subject.id, base, exposure };
}

function moneyOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

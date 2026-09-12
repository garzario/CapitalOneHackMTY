/**
 * Supplier behaviour change, control 4 of the six in ADR-0002.
 *
 * A supplier that invoiced twice a month for a year and suddenly invoices six
 * times in one week, for amounts it never billed before, while taking half of
 * everything the company pays, is the signature of a compromised mailbox, an
 * inflated contract or a shell that is being emptied before it is listed. None
 * of those is provable from the invoices alone, so this detector never produces
 * a `comprobable` finding: it produces `requiere_verificacion` with the numbers
 * attached, and a person decides.
 *
 * Three signals, each against the supplier's own trailing 16 weeks, never
 * against a peer group or a global threshold. A small Mexican SMB has suppliers
 * that bill 8,000 pesos a month and suppliers that bill 900,000, and any fixed
 * threshold would be wrong for both.
 *
 * 1. **Issuance rate**, a Poisson upper tail test. The baseline gives a rate per
 *    week; the observed count in the recent window is compared against
 *    `Poisson(rate * recentWeeks)` and fires at `p <= 0.01`. The rate is divided
 *    by the supplier's actual exposure, not by a flat 16 weeks, so a supplier
 *    that only started 5 weeks ago is not measured against 11 weeks of silence
 *    it was never there for.
 * 2. **Amount drift**, a robust z-score on log amounts. Invoice amounts are
 *    multiplicative and right skewed, so the test runs on `ln(total)`; the
 *    centre is the median and the scale is `1.4826 * MAD` (Iglewicz and Hoaglin),
 *    so two inflated invoices inside the baseline cannot inflate the scale that
 *    is supposed to catch them, which is exactly what a mean and a standard
 *    deviation would do. Only the upper tail fires: a supplier billing less than
 *    usual is not a payment risk.
 * 3. **Concentration**, the share of the company's invoiced outflow this
 *    supplier takes in the recent window against the share it used to take.
 *
 * **Validity gating is explicit and it is the point.** With fewer than 8 prior
 * invoices in the baseline window there is no distribution to test against, so
 * `detectSupplierBehaviour` returns `null` and says why in the assessment. A new
 * supplier ramping up legitimately is the most common false positive of every
 * behaviour model, and the honest answer to it is to admit the sample is too
 * thin rather than to lower the threshold until something fires.
 *
 * Pure, total and dependency free: no clock, no network, no mutation. Rows with
 * an unparsable date or a non finite total are skipped, not thrown on.
 */

import type { Cfdi, Finding, Rfc, Severity, Supplier } from "./domain";
import { formatAmount, fromCents, toCents } from "./money";

const MS_PER_WEEK = 604_800_000;

/** Above this an amount is a parser artefact, not an invoice. See duplicates.ts. */
const MAX_SAFE_AMOUNT = 1e12;

/**
 * Scales a median absolute deviation into a standard deviation for normally
 * distributed data. Iglewicz and Hoaglin (1993) state the same constant as the
 * 0.6745 divisor of the modified z-score, which is where the 3.5 threshold
 * below comes from.
 */
const MAD_TO_SIGMA = 1.4826;

/** No supplier is measured against less than one week of exposure. */
const MIN_EXPOSURE_WEEKS = 1;

/** Which of the three signals fired. Rendered as chips, so part of the contract. */
export type BehaviourSignal =
  | "issuance_rate"
  | "amount_drift"
  | "concentration";

/** Why the detector stayed silent, or `none` when it was free to fire. */
export type BehaviourGate =
  | "none"
  | "insufficient_history"
  | "no_recent_activity";

export interface SupplierBehaviourOptions {
  /** Trailing history the supplier is measured against. Default 16 weeks. */
  baselineWeeks?: number;
  /** The window under review, ending at `now`. Default 1 week, one payment run. */
  recentWeeks?: number;
  /** Below this many baseline invoices the detector returns null. Default 8. */
  minBaselineInvoices?: number;
  /** Poisson upper tail at or below this fires the rate signal. Default 0.01. */
  rateAlpha?: number;
  /** Robust z at or above this fires the amount signal. Default 3.5. */
  amountZThreshold?: number;
  /**
   * Floor for the log scale. A supplier that always bills exactly the same
   * amount has a MAD of zero, and without a floor a one peso difference would
   * produce an infinite z. Default `ln(1.05)`, that is, a 5 percent noise floor.
   */
  minLogSigma?: number;
  /** Recent share of company outflow needed for the concentration signal. Default 0.35. */
  minConcentrationShare?: number;
  /** Jump in that share over the baseline share needed as well. Default 0.2. */
  minConcentrationJump?: number;
}

export const SUPPLIER_BEHAVIOUR_DEFAULTS: Required<SupplierBehaviourOptions> = {
  baselineWeeks: 16,
  recentWeeks: 1,
  minBaselineInvoices: 8,
  rateAlpha: 0.01,
  amountZThreshold: 3.5,
  minLogSigma: Math.log(1.05),
  minConcentrationShare: 0.35,
  minConcentrationJump: 0.2,
};

export interface SupplierBehaviourInput {
  supplier: Supplier;
  /**
   * Every CFDI the company received, from every issuer. Rows from other issuers
   * are not noise: they are the denominator of the concentration signal.
   */
  cfdis: readonly Cfdi[];
  /** The instant the run happens, ISO 8601. This package never reads a clock. */
  now: string;
  options?: SupplierBehaviourOptions;
}

export interface BehaviourWindows {
  baselineStart: string;
  baselineEnd: string;
  recentStart: string;
  recentEnd: string;
}

export interface BehaviourBaseline {
  invoices: number;
  /** Weeks the supplier was actually around for, capped by `baselineWeeks`. */
  exposureWeeks: number;
  ratePerWeek: number;
  /** Geometric centre of the baseline amounts, `exp(median(ln(total)))`. */
  medianAmount: number;
  /** `1.4826 * MAD` of the log amounts, floored by `minLogSigma`. */
  logSigma: number;
  amount: number;
  /** Share of the company's invoiced outflow in the baseline window. */
  share: number;
}

export interface BehaviourRecent {
  invoices: number;
  /** What the baseline rate predicts for this window. */
  expectedInvoices: number;
  /** `P(X >= invoices)` under that prediction. */
  ratePValue: number;
  maxAmount: number;
  /** Robust z of the largest recent amount, on logs. Negative means below centre. */
  amountZScore: number;
  amount: number;
  share: number;
}

/** Everything the detector computed, including why it stayed silent. */
export interface SupplierBehaviourAssessment {
  supplierRfc: Rfc;
  gate: BehaviourGate;
  windows: BehaviourWindows;
  baseline: BehaviourBaseline;
  recent: BehaviourRecent;
  signals: BehaviourSignal[];
  finding: Finding | null;
}

interface Accumulator {
  count: number;
  cents: number;
  logs: number[];
  maxCents: number;
}

/**
 * One finding for the supplier, or `null` when nothing fired or the history is
 * too thin to test. Call `assessSupplierBehaviour` when the numbers are wanted
 * even in the silent case, for example to render "sin historial suficiente".
 *
 * @throws RangeError when `now` is not a parsable instant or an option is not a
 *   positive finite number.
 */
export function detectSupplierBehaviour(
  input: SupplierBehaviourInput,
): Finding | null {
  return assessSupplierBehaviour(input).finding;
}

/** The full assessment: windows, numbers, signals and the finding if any. */
export function assessSupplierBehaviour(
  input: SupplierBehaviourInput,
): SupplierBehaviourAssessment {
  const options = resolveOptions(input.options);
  const nowMs = parseInstant(input.now, "now");
  const recentStart = nowMs - options.recentWeeks * MS_PER_WEEK;
  const baselineStart = recentStart - options.baselineWeeks * MS_PER_WEEK;
  const supplierKey = normaliseKey(input.supplier.rfc);

  const supplierBaseline = emptyAccumulator();
  const supplierRecent = emptyAccumulator();
  let companyBaselineCents = 0;
  let companyRecentCents = 0;
  let firstSeenAt = parseOptionalInstant(input.supplier.firstInvoiceAt);

  for (const cfdi of input.cfdis) {
    const at = Date.parse(cfdi.issuedAt);
    if (!Number.isFinite(at) || at > nowMs) {
      continue;
    }
    if (
      !Number.isFinite(cfdi.total) ||
      Math.abs(cfdi.total) > MAX_SAFE_AMOUNT
    ) {
      continue;
    }
    const cents = toCents(cfdi.total);
    const mine = normaliseKey(cfdi.issuerRfc) === supplierKey;
    if (mine && (firstSeenAt === undefined || at < firstSeenAt)) {
      firstSeenAt = at;
    }
    if (at > recentStart) {
      companyRecentCents += cents;
      if (mine) {
        add(supplierRecent, cents);
      }
      continue;
    }
    if (at > baselineStart) {
      companyBaselineCents += cents;
      if (mine) {
        add(supplierBaseline, cents);
      }
    }
  }

  const exposureWeeks = exposureOf(baselineStart, recentStart, firstSeenAt);
  const ratePerWeek = supplierBaseline.count / exposureWeeks;
  const expectedInvoices = ratePerWeek * options.recentWeeks;
  const ratePValue = poissonUpperTail(supplierRecent.count, expectedInvoices);
  const scale = robustLogScale(supplierBaseline.logs, options.minLogSigma);
  const amountZScore =
    supplierRecent.maxCents > 0 && supplierBaseline.logs.length > 0
      ? (Math.log(fromCents(supplierRecent.maxCents)) - scale.median) /
        scale.sigma
      : 0;
  const baselineShare = shareOf(supplierBaseline.cents, companyBaselineCents);
  const recentShare = shareOf(supplierRecent.cents, companyRecentCents);

  const gate: BehaviourGate =
    supplierBaseline.count < options.minBaselineInvoices
      ? "insufficient_history"
      : supplierRecent.count === 0
        ? "no_recent_activity"
        : "none";

  const signals: BehaviourSignal[] = [];
  if (gate === "none") {
    if (
      supplierRecent.count > expectedInvoices &&
      ratePValue <= options.rateAlpha
    ) {
      signals.push("issuance_rate");
    }
    if (
      supplierBaseline.logs.length >= options.minBaselineInvoices &&
      amountZScore >= options.amountZThreshold
    ) {
      signals.push("amount_drift");
    }
    if (
      companyRecentCents > 0 &&
      recentShare >= options.minConcentrationShare &&
      recentShare - baselineShare >= options.minConcentrationJump
    ) {
      signals.push("concentration");
    }
  }

  const baseline: BehaviourBaseline = {
    invoices: supplierBaseline.count,
    exposureWeeks: round(exposureWeeks, 2),
    ratePerWeek: round(ratePerWeek, 3),
    medianAmount:
      supplierBaseline.logs.length === 0 ? 0 : round(Math.exp(scale.median), 2),
    logSigma: round(scale.sigma, 4),
    amount: fromCents(supplierBaseline.cents),
    share: round(baselineShare, 4),
  };
  const recent: BehaviourRecent = {
    invoices: supplierRecent.count,
    expectedInvoices: round(expectedInvoices, 3),
    ratePValue: significant(ratePValue, 3),
    maxAmount: fromCents(supplierRecent.maxCents),
    amountZScore: round(amountZScore, 2),
    amount: fromCents(supplierRecent.cents),
    share: round(recentShare, 4),
  };
  const windows: BehaviourWindows = {
    baselineStart: new Date(baselineStart).toISOString(),
    baselineEnd: new Date(recentStart).toISOString(),
    recentStart: new Date(recentStart).toISOString(),
    recentEnd: new Date(nowMs).toISOString(),
  };

  return {
    supplierRfc: input.supplier.rfc,
    gate,
    windows,
    baseline,
    recent,
    signals,
    finding:
      signals.length === 0
        ? null
        : buildFinding(
            input.supplier,
            windows,
            baseline,
            recent,
            signals,
            options,
            new Date(nowMs).toISOString(),
          ),
  };
}

/**
 * `P(X >= k)` for `X ~ Poisson(lambda)`, summed from the left in log space so a
 * large lambda does not underflow `exp(-lambda)` to zero and silence the test.
 *
 * `k <= 0` is certain and returns 1. A lambda of zero with `k >= 1` is
 * impossible under the model and returns 0, which is why the caller gates on
 * sample size first: a supplier with no baseline would otherwise always fire.
 */
export function poissonUpperTail(k: number, lambda: number): number {
  if (!Number.isFinite(k) || k <= 0) {
    return 1;
  }
  if (!Number.isFinite(lambda) || lambda <= 0) {
    return 0;
  }
  const logLambda = Math.log(lambda);
  let logFactorial = 0;
  let cumulative = 0;
  for (let i = 0; i < k; i += 1) {
    if (i > 0) {
      logFactorial += Math.log(i);
    }
    cumulative += Math.exp(-lambda + i * logLambda - logFactorial);
  }
  return Math.min(1, Math.max(0, 1 - cumulative));
}

export interface LogScale {
  /** Median of the logs. `exp` of it is the geometric centre of the amounts. */
  median: number;
  /** `1.4826 * MAD`, floored so a degenerate baseline cannot divide by zero. */
  sigma: number;
  /** The raw median absolute deviation, before scaling. */
  mad: number;
}

/**
 * Robust centre and scale of a set of log amounts.
 *
 * Median and MAD have a breakdown point of 50 percent: half the baseline can be
 * contaminated and the estimate still holds. A mean and a standard deviation
 * have a breakdown point of zero, so the two inflated invoices this detector
 * exists to catch would widen the scale enough to hide themselves.
 */
export function robustLogScale(
  logs: readonly number[],
  minSigma = SUPPLIER_BEHAVIOUR_DEFAULTS.minLogSigma,
): LogScale {
  if (logs.length === 0) {
    return { median: 0, sigma: Math.max(minSigma, Number.MIN_VALUE), mad: 0 };
  }
  const median = medianOf(logs);
  const mad = medianOf(logs.map((value) => Math.abs(value - median)));
  return {
    median,
    sigma: Math.max(mad * MAD_TO_SIGMA, minSigma, Number.MIN_VALUE),
    mad,
  };
}

function buildFinding(
  supplier: Supplier,
  windows: BehaviourWindows,
  baseline: BehaviourBaseline,
  recent: BehaviourRecent,
  signals: readonly BehaviourSignal[],
  options: Required<SupplierBehaviourOptions>,
  createdAt: string,
): Finding {
  const severity: Severity = signals.length >= 2 ? "critical" : "warning";
  const sentences: string[] = [];
  if (signals.includes("issuance_rate")) {
    sentences.push(
      `Emitio ${recent.invoices} facturas en ` +
        `${weeksLabel(options.recentWeeks)} contra ` +
        `${formatNumber(recent.expectedInvoices, 2)} esperadas por su propio ` +
        `ritmo de ${formatNumber(baseline.ratePerWeek, 2)} por semana ` +
        `(${formatPValue(recent.ratePValue)}).`,
    );
  }
  if (signals.includes("amount_drift")) {
    sentences.push(
      `Su factura mas alta reciente es de ` +
        `${formatAmount(recent.maxAmount)} MXN, ` +
        `${formatNumber(recent.amountZScore, 1)} desviaciones robustas arriba ` +
        `de su mediana historica de ${formatAmount(baseline.medianAmount)} MXN.`,
    );
  }
  if (signals.includes("concentration")) {
    sentences.push(
      `Paso de ${formatNumber(baseline.share * 100, 1)} por ciento a ` +
        `${formatNumber(recent.share * 100, 1)} por ciento de lo facturado a ` +
        "la empresa en la ventana.",
    );
  }
  return {
    id: `supplier_behaviour:${supplier.rfc}:${createdAt}`,
    detector: "supplier_behaviour",
    severity,
    state: "requiere_verificacion",
    subject: { kind: "supplier", id: supplier.rfc },
    amountAtRisk: recent.amount,
    explanation:
      `${supplier.legalName} (${supplier.rfc}) cambio de patron contra sus ` +
      `propias ${formatNumber(baseline.exposureWeeks, 0)} semanas previas. ` +
      `${sentences.join(" ")} Historial evaluado: ${baseline.invoices} ` +
      "facturas. Revisar el soporte del servicio antes de liberar el pago.",
    evidence: {
      signals: signals.join(","),
      baselineStart: windows.baselineStart,
      baselineEnd: windows.baselineEnd,
      recentStart: windows.recentStart,
      recentEnd: windows.recentEnd,
      baselineInvoices: baseline.invoices,
      baselineExposureWeeks: baseline.exposureWeeks,
      baselineRatePerWeek: baseline.ratePerWeek,
      baselineMedianAmount: baseline.medianAmount,
      baselineLogSigma: baseline.logSigma,
      baselineAmount: baseline.amount,
      baselineShare: baseline.share,
      recentInvoices: recent.invoices,
      expectedInvoices: recent.expectedInvoices,
      ratePValue: recent.ratePValue,
      recentMaxAmount: recent.maxAmount,
      amountZScore: recent.amountZScore,
      recentAmount: recent.amount,
      recentShare: recent.share,
      minBaselineInvoices: options.minBaselineInvoices,
      rateAlpha: options.rateAlpha,
      amountZThreshold: options.amountZThreshold,
    },
    createdAt,
  };
}

/**
 * Weeks the supplier could have invoiced in, never more than the baseline and
 * never less than one. A supplier whose first invoice is inside the baseline is
 * measured from that invoice, which is what stops a legitimate ramp from looking
 * like a rate explosion.
 */
function exposureOf(
  baselineStart: number,
  baselineEnd: number,
  firstSeenAt: number | undefined,
): number {
  const start =
    firstSeenAt === undefined || firstSeenAt < baselineStart
      ? baselineStart
      : firstSeenAt;
  const weeks = (baselineEnd - start) / MS_PER_WEEK;
  return Math.max(weeks, MIN_EXPOSURE_WEEKS);
}

function shareOf(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

function emptyAccumulator(): Accumulator {
  return { count: 0, cents: 0, logs: [], maxCents: 0 };
}

function add(accumulator: Accumulator, cents: number): void {
  accumulator.count += 1;
  accumulator.cents += cents;
  if (cents > accumulator.maxCents) {
    accumulator.maxCents = cents;
  }
  if (cents > 0) {
    accumulator.logs.push(Math.log(fromCents(cents)));
  }
}

/** Median of a copy, so the caller's array keeps its order. */
function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function resolveOptions(
  options: SupplierBehaviourOptions | undefined,
): Required<SupplierBehaviourOptions> {
  const resolved: Required<SupplierBehaviourOptions> = {
    baselineWeeks:
      options?.baselineWeeks ?? SUPPLIER_BEHAVIOUR_DEFAULTS.baselineWeeks,
    recentWeeks:
      options?.recentWeeks ?? SUPPLIER_BEHAVIOUR_DEFAULTS.recentWeeks,
    minBaselineInvoices:
      options?.minBaselineInvoices ??
      SUPPLIER_BEHAVIOUR_DEFAULTS.minBaselineInvoices,
    rateAlpha: options?.rateAlpha ?? SUPPLIER_BEHAVIOUR_DEFAULTS.rateAlpha,
    amountZThreshold:
      options?.amountZThreshold ?? SUPPLIER_BEHAVIOUR_DEFAULTS.amountZThreshold,
    minLogSigma:
      options?.minLogSigma ?? SUPPLIER_BEHAVIOUR_DEFAULTS.minLogSigma,
    minConcentrationShare:
      options?.minConcentrationShare ??
      SUPPLIER_BEHAVIOUR_DEFAULTS.minConcentrationShare,
    minConcentrationJump:
      options?.minConcentrationJump ??
      SUPPLIER_BEHAVIOUR_DEFAULTS.minConcentrationJump,
  };
  requirePositive(resolved.baselineWeeks, "baselineWeeks");
  requirePositive(resolved.recentWeeks, "recentWeeks");
  requirePositive(resolved.minBaselineInvoices, "minBaselineInvoices");
  requirePositive(resolved.rateAlpha, "rateAlpha");
  requirePositive(resolved.minLogSigma, "minLogSigma");
  return resolved;
}

function requirePositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `${field} must be a positive number: ${String(value)}`,
    );
  }
}

function normaliseKey(value: string): string {
  return value.trim().toUpperCase();
}

/** @throws RangeError when the value is not a parsable instant. */
function parseInstant(value: string, field: string): number {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) {
    throw new RangeError(`${field} is not a parsable instant: ${value}`);
  }
  return at;
}

/** Undefined rather than a throw: a missing `firstInvoiceAt` is normal data. */
function parseOptionalInstant(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : undefined;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Keeps a p-value readable without flattening it to zero: 0.0000031 stays
 * 0.0000031 while 0.2642 becomes 0.264.
 */
function significant(value: number, digits: number): number {
  if (!Number.isFinite(value) || value === 0) {
    return 0;
  }
  return Number(value.toPrecision(digits));
}

/** Plain ASCII decimal, never a locale format. See formatAmount in money.ts. */
function formatNumber(value: number, digits: number): string {
  return value.toFixed(digits);
}

/** A p-value four decimals wide never reads as 0.0000 in the clerk's screen. */
function formatPValue(value: number): string {
  return value < 0.0001 ? "p < 0.0001" : `p = ${value.toFixed(4)}`;
}

function weeksLabel(weeks: number): string {
  return weeks === 1 ? "la ultima semana" : `las ultimas ${weeks} semanas`;
}

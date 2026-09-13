/**
 * The consortium signal as an input to the decision, and nothing else.
 *
 * `packages/consortium` is the plumbing: the warehouse, the hashes, the push and
 * the pull. This file is the rule, and it lives here because every rule in this
 * product lives in `@hackmty/core`. It is pure arithmetic over one
 * `NetworkSignal` and it holds no clock, no salt and no connection.
 *
 * What the network is allowed to do, stated as four claims a judge can check.
 *
 * 1. **It never decides.** It scales the expected loss of evidence the other
 *    five controls already produced, and it can raise a severity. A payment with
 *    no findings at all is released by `no_findings` exactly as before, whatever
 *    the network says: corroboration is not a reason to pay, it is a reason to
 *    stop holding.
 * 2. **A network nobody read changes nothing.** `not_consulted` returns a factor
 *    of exactly 1, so an instance with the flag off, an empty snapshot or an
 *    unreachable warehouse decides what this product decided before the
 *    consortium existed. That is the acceptance criterion of issue #164 and it
 *    is one `=== 1` away from being checkable.
 * 3. **It is monotone.** More tenants and a longer history lower the factor,
 *    never raise it, and the floor keeps the strongest corroboration in the
 *    world from discounting a real finding to nothing.
 * 4. **A single fraud report cancels all of it.** One tenant saying this pair
 *    took their money outweighs any number of tenants saying it took their
 *    money and delivered, so the factor returns to 1 and the beneficiary
 *    control raises the finding to `critical`.
 *
 * No model, no LLM, no learned weights. The two weights below are priors, they
 * are stated as priors, and a reviewer can move them in one line.
 */

import type { NetworkSignal } from "./domain";

/**
 * The signal an instance with no network returns.
 *
 * Exported because three callers need the same object: the API seam when
 * `ALLOW_CONSORTIUM` is off, the snapshot reader when nothing has been pulled,
 * and every test that asserts the unchanged decision.
 */
export const NOT_CONSULTED: NetworkSignal = {
  source: "not_consulted",
  tenants: 0,
  fraudReports: 0,
  otherAccounts: 0,
};

/**
 * How much one corroborating tenant is worth, and how much one month of
 * unbroken history is worth, as weights in the denominator below.
 *
 * A tenant counts for more than a month because tenants are independent
 * observers and months are one observer repeating itself. Both are priors, not
 * measurements: the network in this repository is synthetic, so calibrating
 * them against it would be calibrating against our own generator.
 *
 * TODO(garzario): replace both with numbers measured against real tenant
 * outcomes the first time this product has more than one tenant.
 */
export const TENANT_WEIGHT = 0.05;
export const MONTH_WEIGHT = 0.02;

/**
 * The most the network may ever discount an expected loss.
 *
 * A floor and not an asymptote, because a payment that six detectors flagged is
 * not clean just because two hundred other companies pay the same account: the
 * consortium can say this beneficiary is real, it cannot say this invoice is.
 * Four fifths is as far as it goes.
 */
export const NETWORK_FLOOR = 0.2;

/** Days in the average month, for turning two dates into months of history. */
const DAYS_PER_MONTH = 30.436_875;

/** What the network is saying, as one word the UI and the engine both branch on. */
export type NetworkVerdict =
  /** The network was not read. The decision is the pre-consortium one. */
  | "not_consulted"
  /** Read, and it has never seen this pair. */
  | "unseen"
  /** Read, and at least one tenant reported this pair as fraud. */
  | "fraud_reported"
  /** Read, and other tenants pay this supplier on other accounts only. */
  | "other_accounts_only"
  /** Read, and other tenants pay this exact pair without incident. */
  | "corroborated";

export interface NetworkAssessment {
  verdict: NetworkVerdict;
  /** Distinct tenants that paid this pair, clamped to a sane integer. */
  tenants: number;
  /** Whole months between the first and the last event the network holds. */
  months: number;
  /** Tenants that reported the pair, clamped to a sane integer. */
  fraudReports: number;
  /** Other accounts the network holds for this supplier, clamped. */
  otherAccounts: number;
  /** Multiplier on the expected loss, in (0, 1]. Exactly 1 when unread. */
  factor: number;
}

/**
 * Whole months of unbroken history the network holds for a pair.
 *
 * Both dates absent, unparsable or out of order gives zero rather than throwing:
 * the warehouse is a cold store fed by other tenants, and one malformed row must
 * not blank out a payment run. Zero is also the conservative answer, because it
 * is the one that discounts nothing.
 */
export function monthsOfHistory(signal: NetworkSignal): number {
  const first = Date.parse(`${signal.firstSeen ?? ""}T00:00:00Z`);
  const last = Date.parse(`${signal.lastSeen ?? ""}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) {
    return 0;
  }
  return Math.floor((last - first) / 86_400_000 / DAYS_PER_MONTH);
}

/** A count from a cold store, read as a non-negative integer or as zero. */
function count(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Reads one network signal into a verdict and a multiplier on the expected loss.
 *
 * Pure, total, and deliberately dull: the same signal always gives the same
 * factor, so a decision can be replayed from the event ledger a week later and
 * still come out the same.
 */
export function assessNetwork(signal: NetworkSignal): NetworkAssessment {
  const tenants = count(signal.tenants);
  const fraudReports = count(signal.fraudReports);
  const otherAccounts = count(signal.otherAccounts);
  const months = monthsOfHistory(signal);

  if (signal.source !== "snapshot") {
    return {
      verdict: "not_consulted",
      tenants: 0,
      months: 0,
      fraudReports: 0,
      otherAccounts: 0,
      factor: 1,
    };
  }
  const base = { tenants, months, fraudReports, otherAccounts };
  if (fraudReports > 0) {
    return { ...base, verdict: "fraud_reported", factor: 1 };
  }
  if (tenants === 0) {
    return {
      ...base,
      verdict: otherAccounts > 0 ? "other_accounts_only" : "unseen",
      factor: 1,
    };
  }
  return {
    ...base,
    verdict: "corroborated",
    factor: factorFor(tenants, months),
  };
}

/**
 * The multiplier itself: `1 / (1 + weighted corroboration)`, floored.
 *
 * The reciprocal shape is chosen over a subtraction because it cannot go
 * negative and cannot reach zero, so there is no input for which the network
 * makes a finding worth nothing. It is rounded to four places so two hosts
 * comparing a stored decision agree to the cent rather than to within a float.
 */
function factorFor(tenants: number, months: number): number {
  const corroboration = TENANT_WEIGHT * tenants + MONTH_WEIGHT * months;
  const raw = 1 / (1 + corroboration);
  return Math.max(NETWORK_FLOOR, Math.round(raw * 10_000) / 10_000);
}

/**
 * One sentence for the clerk, in the register of `Finding.explanation`: Spanish
 * without accents, no accusation, and never a claim the data does not carry.
 *
 * The network is named as what it is. It is a network of other SentryOne
 * tenants, the demo's is synthetic, and the sentence says "empresas" and not
 * "bancos" because no bank is in it.
 */
export function describeNetwork(signal: NetworkSignal): string {
  const read = assessNetwork(signal);
  switch (read.verdict) {
    case "not_consulted":
      return "La red SentryOne no se consulto para este pago, asi que la decision es la misma que sin red.";
    case "fraud_reported":
      return `La red SentryOne tiene ${plural(read.fraudReports, "reporte de fraude", "reportes de fraude")} sobre esta cuenta para este proveedor.`;
    case "other_accounts_only":
      return `La red SentryOne nunca ha visto esta cuenta para este proveedor, y si tiene ${plural(read.otherAccounts, "otra cuenta suya", "otras cuentas suyas")} que otras empresas ya pagan.`;
    case "unseen":
      return "La red SentryOne nunca ha visto esta cuenta ni otra de este proveedor.";
    case "corroborated":
      return read.months > 0
        ? `La red SentryOne dice que ${plural(read.tenants, "empresa paga", "empresas pagan")} esta cuenta desde hace ${plural(read.months, "mes", "meses")}, sin reportes.`
        : `La red SentryOne dice que ${plural(read.tenants, "empresa paga", "empresas pagan")} esta cuenta, sin reportes.`;
  }
}

function plural(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

/** Spanish months without accents, for the one date this copy ever prints. */
const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** "mar 2024" from an ISO day, or undefined when the day cannot be read. */
function monthYear(day?: string): string | undefined {
  const at = Date.parse(`${day ?? ""}T00:00:00Z`);
  if (!Number.isFinite(at)) {
    return undefined;
  }
  const date = new Date(at);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * The same facts as `describeNetwork`, short enough for one line on a screen.
 *
 * It lives here rather than in `apps/web` for the reason the label dictionary in
 * that app exists at all: two vocabularies for one signal is how a screen ends up
 * claiming something the engine did not. The UI prefixes it with its own eyebrow,
 * so the string starts after "Red SentryOne".
 */
export function networkLabel(signal: NetworkSignal): string {
  const read = assessNetwork(signal);
  switch (read.verdict) {
    case "not_consulted":
      return "no consultada";
    case "fraud_reported":
      return plural(
        read.fraudReports,
        "reporte de fraude",
        "reportes de fraude",
      );
    case "other_accounts_only":
      return `sin registro de esta cuenta, ${plural(read.otherAccounts, "otra cuenta del proveedor", "otras cuentas del proveedor")}`;
    case "unseen":
      return "sin registro de esta cuenta";
    case "corroborated": {
      const since = monthYear(signal.firstSeen);
      const payers = plural(read.tenants, "empresa", "empresas");
      return since === undefined
        ? `pagada por ${payers}`
        : `pagada por ${payers} desde ${since}`;
    }
  }
}

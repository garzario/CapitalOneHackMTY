/**
 * Duplicate invoice detection, control 3 of the six in ADR-0002.
 *
 * The clerk running the Thursday payment run is not defrauded here as often as
 * they are simply asked to pay the same document twice: the supplier resent the
 * XML, the accountant loaded the folder again, or the invoice was already
 * settled in the previous run and the complement proves it. A SPEI does not come
 * back, so the duplicate has to be caught before the payment leaves.
 *
 * Five rules, from provable to worth a look:
 *
 * | Rule                 | Fires when                                       | State |
 * |----------------------|--------------------------------------------------|-------|
 * | `uuid_collision`     | the same timbred UUID appears more than once     | comprobable |
 * | `folio_collision`    | one issuer reused a serie and folio              | comprobable when the totals match |
 * | `already_paid`       | complements already cover the total of the CFDI  | comprobable |
 * | `partially_paid`     | complements cover part of it                     | requiere_verificacion |
 * | `same_amount_window` | same issuer, same amount, inside the 7 day window| requiere_verificacion |
 *
 * Only the first three are provable from the documents alone, so only those are
 * `comprobable`. Two invoices of the same issuer for the same round amount in
 * one week is the shape of a duplicate and also the shape of a rent, a retainer
 * or a weekly delivery, which is why that rule never accuses and always links
 * the invoice it matched against.
 *
 * Pure, total and dependency free, like everything in this package: no clock, no
 * network, no mutation of the caller's arrays. A row with an unparsable date or
 * a non finite total is skipped rather than thrown on, because one bad row from
 * an upstream parser must not blank out the payment-run screen.
 */

import type { Cfdi, Finding, PaymentComplement, Severity } from "./domain";
import { formatAmount, fromCents, toCents } from "./money";

const MS_PER_DAY = 86_400_000;

/**
 * Anything above this is a parser artefact rather than an invoice: the largest
 * CFDI a Mexican SMB issues is orders of magnitude below a trillion pesos, and
 * `toCents` throws above the safe integer range anyway.
 */
const MAX_SAFE_AMOUNT = 1e12;

/** Which rule produced a finding. Rendered as a chip, so it is part of the contract. */
export type DuplicateRule =
  | "uuid_collision"
  | "folio_collision"
  | "already_paid"
  | "partially_paid"
  | "same_amount_window";

export interface DuplicateInvoiceOptions {
  /**
   * How far apart two invoices of the same issuer and the same amount may be and
   * still be read as the same payable. Default 7 days, the length of one payment
   * run, so a duplicate that crosses two runs is still caught.
   */
  amountWindowDays?: number;
}

export const DUPLICATE_INVOICE_DEFAULTS: Required<DuplicateInvoiceOptions> = {
  amountWindowDays: 7,
};

export interface DuplicateInvoiceInput {
  /** Every CFDI the company holds. Order does not matter, it is sorted here. */
  cfdis: readonly Cfdi[];
  /** Complements the suppliers issued. Absent means nothing is known to be paid. */
  complements?: readonly PaymentComplement[];
  /**
   * UUIDs of the CFDIs this payment run is about to settle. Findings are emitted
   * only for these. Absent means every CFDI is under review, which is the ledger
   * wide sweep used by the tests and by the nightly replay.
   *
   * Without this the settlement rules would flag every invoice the company has
   * ever paid, which is every invoice in a healthy ledger.
   */
  underReview?: readonly string[];
  /** The instant the run happens, ISO 8601. This package never reads a clock. */
  now: string;
  options?: DuplicateInvoiceOptions;
}

interface PreparedCfdi {
  cfdi: Cfdi;
  /** Parsed `issuedAt`, milliseconds since the epoch. */
  at: number;
  cents: number;
  /** Normalised UUID. A parser that lower cased it must not hide a collision. */
  uuidKey: string;
  issuerKey: string;
  /** `serie|folio`, normalised. Absent when the issuer left the folio empty. */
  folioKey?: string;
  underReview: boolean;
}

interface Settlement {
  cents: number;
  count: number;
  /** Most recent complement, the one the explanation names. */
  last: PaymentComplement;
}

/**
 * Every duplicate finding for the CFDIs under review, strongest rule first.
 *
 * @throws RangeError when `now` is not a parsable instant, or when
 *   `amountWindowDays` is not a positive finite number.
 */
export function detectDuplicateInvoice(
  input: DuplicateInvoiceInput,
): Finding[] {
  const windowDays =
    input.options?.amountWindowDays ??
    DUPLICATE_INVOICE_DEFAULTS.amountWindowDays;
  if (!Number.isFinite(windowDays) || windowDays <= 0) {
    throw new RangeError(
      `amountWindowDays must be a positive number: ${String(windowDays)}`,
    );
  }
  const createdAt = normaliseInstant(input.now, "now");
  const rows = prepareCfdis(input.cfdis, input.underReview);
  const findings: Finding[] = [];
  /** Rows already carrying a pair finding, so one pair is never reported twice. */
  const reported = new Set<PreparedCfdi>();

  for (const group of groupBy(rows, (row) => row.uuidKey)) {
    if (group.length < 2) {
      continue;
    }
    for (const row of group) {
      reported.add(row);
    }
    const finding = uuidCollisionFinding(group, createdAt);
    if (finding !== null) {
      findings.push(finding);
    }
  }

  for (const group of groupBy(rows, folioGroupKey)) {
    if (group.length < 2 || group.some((row) => reported.has(row))) {
      continue;
    }
    for (const row of group) {
      reported.add(row);
    }
    const finding = folioCollisionFinding(group, createdAt);
    if (finding !== null) {
      findings.push(finding);
    }
  }

  const windowMs = Math.round(windowDays * MS_PER_DAY);
  for (const group of groupBy(rows, (row) => `${row.issuerKey}|${row.cents}`)) {
    if (group.length < 2) {
      continue;
    }
    for (const finding of sameAmountFindings(
      group,
      reported,
      windowMs,
      windowDays,
      createdAt,
    )) {
      findings.push(finding);
    }
  }

  for (const finding of settlementFindings(
    rows,
    input.complements ?? [],
    createdAt,
  )) {
    findings.push(finding);
  }

  return sortFindings(findings);
}

/**
 * Valid rows only, oldest first, each parsed exactly once.
 *
 * Ties are broken by UUID so two runs over the same ledger, loaded in a
 * different order, produce byte identical findings.
 */
function prepareCfdis(
  cfdis: readonly Cfdi[],
  underReview: readonly string[] | undefined,
): PreparedCfdi[] {
  const scope =
    underReview === undefined
      ? undefined
      : new Set(underReview.map((uuid) => normaliseKey(uuid) ?? uuid));
  const rows: PreparedCfdi[] = [];
  for (const cfdi of cfdis) {
    const at = Date.parse(cfdi.issuedAt);
    if (!Number.isFinite(at)) {
      continue;
    }
    if (
      !Number.isFinite(cfdi.total) ||
      Math.abs(cfdi.total) > MAX_SAFE_AMOUNT
    ) {
      continue;
    }
    const folio = normaliseKey(cfdi.folio);
    const uuidKey = normaliseKey(cfdi.uuid) ?? cfdi.uuid;
    rows.push({
      cfdi,
      at,
      cents: toCents(cfdi.total),
      uuidKey,
      issuerKey: normaliseKey(cfdi.issuerRfc) ?? "",
      ...(folio === undefined
        ? {}
        : { folioKey: `${normaliseKey(cfdi.serie) ?? ""}|${folio}` }),
      underReview: scope === undefined || scope.has(uuidKey),
    });
  }
  rows.sort((left, right) => {
    if (left.at !== right.at) {
      return left.at - right.at;
    }
    return left.cfdi.uuid < right.cfdi.uuid
      ? -1
      : left.cfdi.uuid > right.cfdi.uuid
        ? 1
        : 0;
  });
  return rows;
}

/**
 * The same timbred UUID more than once. A UUID is assigned by the PAC at stamping
 * time and is unique by construction, so two rows carrying it are the same
 * fiscal document loaded twice. Nothing to interpret, hence `comprobable`.
 */
function uuidCollisionFinding(
  group: readonly PreparedCfdi[],
  createdAt: string,
): Finding | null {
  if (!group.some((row) => row.underReview)) {
    return null;
  }
  const original = group[0];
  const candidate = group[group.length - 1];
  const totalsMatch = group.every((row) => row.cents === original.cents);
  return {
    id: `duplicate_invoice:uuid_collision:${candidate.cfdi.uuid}`,
    detector: "duplicate_invoice",
    severity: "critical",
    state: "comprobable",
    subject: { kind: "cfdi", id: candidate.cfdi.uuid },
    amountAtRisk: fromCents(candidate.cents),
    explanation:
      `El UUID timbrado aparece ${group.length} veces en el ledger. ` +
      `Es el mismo CFDI de ${candidate.cfdi.issuerName} por ` +
      `${formatAmount(fromCents(candidate.cents))} MXN, cargado el ` +
      `${dayOf(original.cfdi.issuedAt)} y de nuevo el ` +
      `${dayOf(candidate.cfdi.issuedAt)}. Pagar los dos registros saca el ` +
      "monto dos veces.",
    evidence: {
      rule: "uuid_collision",
      issuerRfc: candidate.cfdi.issuerRfc,
      uuid: candidate.cfdi.uuid,
      originalUuid: original.cfdi.uuid,
      originalIssuedAt: original.cfdi.issuedAt,
      candidateIssuedAt: candidate.cfdi.issuedAt,
      copies: group.length,
      daysApart: daysBetween(original.at, candidate.at),
      total: fromCents(candidate.cents),
      totalsMatch,
    },
    createdAt,
  };
}

/**
 * One issuer reusing a serie and folio. The folio sequence belongs to the issuer
 * and is unique inside it, so a collision is provable from the two XMLs.
 *
 * The totals decide the state, not the collision: same folio and same total is
 * the same payable twice, same folio and a different total is the shape of an
 * invoice that was cancelled and reissued, which a person has to confirm.
 */
function folioCollisionFinding(
  group: readonly PreparedCfdi[],
  createdAt: string,
): Finding | null {
  if (!group.some((row) => row.underReview)) {
    return null;
  }
  const original = group[0];
  const candidate = group[group.length - 1];
  const totalsMatch = group.every((row) => row.cents === original.cents);
  const severity: Severity = totalsMatch ? "critical" : "warning";
  const serie = candidate.cfdi.serie;
  const folio = candidate.cfdi.folio ?? "";
  return {
    id:
      "duplicate_invoice:folio_collision:" +
      `${candidate.issuerKey}:${candidate.folioKey ?? ""}`,
    detector: "duplicate_invoice",
    severity,
    state: totalsMatch ? "comprobable" : "requiere_verificacion",
    subject: { kind: "cfdi", id: candidate.cfdi.uuid },
    amountAtRisk: fromCents(candidate.cents),
    explanation: totalsMatch
      ? `${candidate.cfdi.issuerName} emitio dos CFDI con el mismo folio ` +
        `${folio} y el mismo total de ` +
        `${formatAmount(fromCents(candidate.cents))} MXN, el ` +
        `${dayOf(original.cfdi.issuedAt)} y el ` +
        `${dayOf(candidate.cfdi.issuedAt)}. Un folio no se repite, es el ` +
        "mismo cobro."
      : `${candidate.cfdi.issuerName} reutilizo el folio ${folio} con ` +
        `totales distintos: ${formatAmount(fromCents(original.cents))} MXN ` +
        `el ${dayOf(original.cfdi.issuedAt)} y ` +
        `${formatAmount(fromCents(candidate.cents))} MXN el ` +
        `${dayOf(candidate.cfdi.issuedAt)}. Confirmar cual quedo vigente ` +
        "antes de pagar.",
    evidence: {
      rule: "folio_collision",
      issuerRfc: candidate.cfdi.issuerRfc,
      ...(serie === undefined ? {} : { serie }),
      folio,
      copies: group.length,
      originalUuid: original.cfdi.uuid,
      originalIssuedAt: original.cfdi.issuedAt,
      originalTotal: fromCents(original.cents),
      candidateIssuedAt: candidate.cfdi.issuedAt,
      candidateTotal: fromCents(candidate.cents),
      daysApart: daysBetween(original.at, candidate.at),
      totalsMatch,
    },
    createdAt,
  };
}

/**
 * Same issuer, same amount to the cent, inside the window.
 *
 * This is the weakest of the five and the only one that runs on amounts alone,
 * so it never claims a duplicate: it names the invoice it matched, the distance
 * in days, and leaves the decision to the clerk. A monthly rent is 30 days away
 * from its twin and never reaches this rule.
 */
function* sameAmountFindings(
  group: readonly PreparedCfdi[],
  reported: ReadonlySet<PreparedCfdi>,
  windowMs: number,
  windowDays: number,
  createdAt: string,
): Generator<Finding> {
  for (let index = 0; index < group.length; index += 1) {
    const candidate = group[index];
    if (!candidate.underReview || reported.has(candidate)) {
      continue;
    }
    const match = earliestNeighbour(group, index, windowMs, reported);
    if (match === undefined) {
      continue;
    }
    const daysApart = daysBetween(match.at, candidate.at);
    const folio = candidate.cfdi.folio;
    const originalFolio = match.cfdi.folio;
    yield {
      id: `duplicate_invoice:same_amount_window:${candidate.cfdi.uuid}`,
      detector: "duplicate_invoice",
      severity: "warning",
      state: "requiere_verificacion",
      subject: { kind: "cfdi", id: candidate.cfdi.uuid },
      amountAtRisk: fromCents(candidate.cents),
      explanation:
        `${candidate.cfdi.issuerName} tiene otra factura por exactamente ` +
        `${formatAmount(fromCents(candidate.cents))} MXN a ${daysApart} dias ` +
        `de esta: ${dayOf(match.cfdi.issuedAt)} y ` +
        `${dayOf(candidate.cfdi.issuedAt)}. Puede ser un servicio recurrente ` +
        "o el mismo cobro dos veces, hay que confirmarlo con el proveedor.",
      evidence: {
        rule: "same_amount_window",
        issuerRfc: candidate.cfdi.issuerRfc,
        uuid: candidate.cfdi.uuid,
        ...(folio === undefined ? {} : { folio }),
        originalUuid: match.cfdi.uuid,
        originalIssuedAt: match.cfdi.issuedAt,
        ...(originalFolio === undefined ? {} : { originalFolio }),
        candidateIssuedAt: candidate.cfdi.issuedAt,
        daysApart,
        windowDays,
        total: fromCents(candidate.cents),
      },
      createdAt,
    };
  }
}

/**
 * The earliest other invoice of the group inside the window around `index`.
 *
 * The group is sorted, so the neighbours are contiguous: walk right from the
 * oldest row and take the first one that still fits the window.
 *
 * Looking to the right only matches rows that are not themselves under review,
 * because a pair has to produce one finding and not two: when both invoices are
 * in the run the later one reports it, which is also the one the clerk is about
 * to pay. When the candidate is the oldest row of its window and the match is on
 * its right, the explanation prints both dates rather than claiming which one is
 * the copy.
 */
function earliestNeighbour(
  group: readonly PreparedCfdi[],
  index: number,
  windowMs: number,
  reported: ReadonlySet<PreparedCfdi>,
): PreparedCfdi | undefined {
  const candidate = group[index];
  for (let left = 0; left < index; left += 1) {
    const row = group[left];
    if (candidate.at - row.at <= windowMs && !reported.has(row)) {
      return row;
    }
  }
  for (let right = index + 1; right < group.length; right += 1) {
    const row = group[right];
    if (row.at - candidate.at > windowMs) {
      break;
    }
    if (!reported.has(row) && !row.underReview) {
      return row;
    }
  }
  return undefined;
}

/**
 * Invoices the supplier itself already acknowledged receiving money for.
 *
 * The complemento de recepcion de pagos is the supplier's own receipt, so full
 * coverage is provable from its XML. Partial coverage is the PPD case and it is
 * a question, not a verdict: paying the full total after a partial settlement
 * sends the covered part twice, and that covered part is the amount at risk.
 */
function* settlementFindings(
  rows: readonly PreparedCfdi[],
  complements: readonly PaymentComplement[],
  createdAt: string,
): Generator<Finding> {
  const byUuid = new Map<string, PreparedCfdi>();
  for (const row of rows) {
    if (row.underReview && !byUuid.has(row.uuidKey)) {
      byUuid.set(row.uuidKey, row);
    }
  }
  if (byUuid.size === 0) {
    return;
  }

  const paid = new Map<string, Settlement>();
  for (const complement of complements) {
    const key =
      normaliseKey(complement.relatedCfdiUuid) ?? complement.relatedCfdiUuid;
    if (!byUuid.has(key)) {
      continue;
    }
    if (
      !Number.isFinite(complement.paidAmount) ||
      complement.paidAmount <= 0 ||
      complement.paidAmount > MAX_SAFE_AMOUNT
    ) {
      continue;
    }
    const previous = paid.get(key);
    paid.set(key, {
      cents: (previous?.cents ?? 0) + toCents(complement.paidAmount),
      count: (previous?.count ?? 0) + 1,
      last:
        previous === undefined
          ? complement
          : mostRecent(previous.last, complement),
    });
  }

  for (const [key, settlement] of paid) {
    const row = byUuid.get(key);
    if (row === undefined || row.cents <= 0) {
      continue;
    }
    const uuid = row.cfdi.uuid;
    const full = settlement.cents >= row.cents;
    const account = settlement.last.beneficiaryAccount;
    yield {
      id: `duplicate_invoice:${full ? "already_paid" : "partially_paid"}:${uuid}`,
      detector: "duplicate_invoice",
      severity: full ? "critical" : "warning",
      state: full ? "comprobable" : "requiere_verificacion",
      subject: { kind: "cfdi", id: uuid },
      amountAtRisk: fromCents(full ? row.cents : settlement.cents),
      explanation: full
        ? `${row.cfdi.issuerName} ya emitio el complemento de pago de esta ` +
          `factura: ${formatAmount(fromCents(settlement.cents))} MXN ` +
          `recibidos el ${dayOf(settlement.last.paidAt)}. Volver a pagarla ` +
          "saca el monto completo una segunda vez."
        : `${row.cfdi.issuerName} ya acuso ` +
          `${formatAmount(fromCents(settlement.cents))} MXN de los ` +
          `${formatAmount(fromCents(row.cents))} MXN de esta factura el ` +
          `${dayOf(settlement.last.paidAt)}. Pagar el total completo ` +
          "duplicaria esa parte.",
      evidence: {
        rule: full ? "already_paid" : "partially_paid",
        issuerRfc: row.cfdi.issuerRfc,
        uuid,
        complementUuid: settlement.last.uuid,
        complements: settlement.count,
        paidAmount: fromCents(settlement.cents),
        lastPaidAt: settlement.last.paidAt,
        total: fromCents(row.cents),
        coverage: round(settlement.cents / row.cents, 4),
        ...(account === undefined ? {} : { beneficiaryAccount: account }),
      },
      createdAt,
    };
  }
}

/** Later `paidAt` wins. An unparsable date never displaces a parsable one. */
function mostRecent(
  left: PaymentComplement,
  right: PaymentComplement,
): PaymentComplement {
  const leftAt = Date.parse(left.paidAt);
  const rightAt = Date.parse(right.paidAt);
  if (!Number.isFinite(rightAt)) {
    return left;
  }
  if (!Number.isFinite(leftAt)) {
    return right;
  }
  return rightAt >= leftAt ? right : left;
}

/** Strength of a rule, used to order the alert rail. Higher is more provable. */
const RULE_STRENGTH: Record<DuplicateRule, number> = {
  uuid_collision: 50,
  already_paid: 40,
  folio_collision: 30,
  partially_paid: 20,
  same_amount_window: 10,
};

/**
 * Most provable first, then most money, then by id. Deterministic on purpose:
 * the payment-run screen renders this order and a demo cannot reshuffle.
 */
function sortFindings(findings: Finding[]): Finding[] {
  return findings.sort((left, right) => {
    const byRule = ruleStrength(right) - ruleStrength(left);
    if (byRule !== 0) {
      return byRule;
    }
    const byAmount = toCents(right.amountAtRisk) - toCents(left.amountAtRisk);
    if (byAmount !== 0) {
      return byAmount;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

function ruleStrength(finding: Finding): number {
  const rule = finding.evidence.rule;
  return typeof rule === "string" && rule in RULE_STRENGTH
    ? RULE_STRENGTH[rule as DuplicateRule]
    : 0;
}

function folioGroupKey(row: PreparedCfdi): string | undefined {
  return row.folioKey === undefined
    ? undefined
    : `${row.issuerKey}|${row.folioKey}`;
}

/** Groups rows by a key, keeping the input order inside each group. */
function groupBy(
  rows: readonly PreparedCfdi[],
  keyOf: (row: PreparedCfdi) => string | undefined,
): PreparedCfdi[][] {
  const groups = new Map<string, PreparedCfdi[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === undefined) {
      continue;
    }
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [row]);
    } else {
      group.push(row);
    }
  }
  return [...groups.values()];
}

/** Trimmed and upper cased, or undefined when there is nothing to key on. */
function normaliseKey(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim().toUpperCase();
  return trimmed.length === 0 ? undefined : trimmed;
}

function daysBetween(from: number, to: number): number {
  return round(Math.abs(to - from) / MS_PER_DAY, 2);
}

/** The calendar day of an ISO instant, for prose. Never a locale format. */
function dayOf(value: string): string {
  return value.slice(0, 10);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** @throws RangeError when the value is not a parsable instant. */
function normaliseInstant(value: string, field: string): string {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) {
    throw new RangeError(`${field} is not a parsable instant: ${value}`);
  }
  return new Date(at).toISOString();
}

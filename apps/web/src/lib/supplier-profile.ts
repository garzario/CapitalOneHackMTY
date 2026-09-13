/**
 * Everything the supplier profile reads, as pure functions over one
 * `SupplierDetail` and the findings that came with it.
 *
 * The screen draws; this file decides. It is separate for the reason
 * `lib/run-view.ts` is separate: a sentence a judge reads off a screen has to be
 * testable without a browser, and four of the things below are sentences that
 * would be wrong in a way nobody notices until somebody asks.
 *
 * Four rules hold it together, and each one is a claim this product is not
 * allowed to get wrong.
 *
 * 1. **The weekly series is cut from the invoices, because the aggregate is not
 *    on HTTP.** `supplier_weekly_outflow` exists in the database twice, as a
 *    plain view in `0007_supplier_outflow.sql` and as a Timescale continuous
 *    aggregate in `0008`, and `supplierWeeklyOutflow` in `packages/db` reads it;
 *    `docs/09-api.md` exposes no endpoint for it, so `GET /api/v1/suppliers/:rfc`
 *    answers `cfdis` and never `weeks`. `weeklySeries` therefore buckets the
 *    invoice file the endpoint did answer, on the same boundary the view cuts, and
 *    `SERIES_SOURCE` is the sentence the screen prints so nobody reads the chart
 *    as the warehouse talking.
 * 2. **A plaza is a name on three digits and nothing else.** The code is printed
 *    beside every name, `lookupPlaza` in `@hackmty/core` is the only table
 *    consulted, and a code it does not carry yields the bare digits. That rule is
 *    `packages/core/src/snapshot/README.md`, whose first paragraphs say the rows
 *    come from a SPEI participant and not from Banco de Mexico.
 * 3. **Both SAT lists always answer.** `satListRows` returns two rows whatever
 *    the findings say, the same way `ControlsPanel` always draws six bars: a list
 *    that found nothing has to be distinguishable from a list nobody read, and
 *    neither may be rendered as a clean bill of health.
 * 4. **Nothing here derives a level.** `confidenceOf` and `transactionStateOf` in
 *    `packages/core/src/levels.ts` are the only place either is computed
 *    (ADR-0009), they are about one payment and not about a supplier, and this
 *    file deliberately has no opinion of its own about a counterparty.
 */

import type { Cfdi, Finding, Plaza, SatListStatus } from "@hackmty/core";
import { lookupPlaza, parseClabeParts } from "@hackmty/core";
import type { SupplierDetail, VerifiedBeneficiary } from "./contract";
import { type NetworkEvidence, readEvidence } from "./evidence";

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/**
 * Where the weekly series comes from, in the words the screen prints.
 *
 * A constant and not a string in the markup, because the test below asserts the
 * sentence names the file that answered and the object that did not.
 */
export const SERIES_SOURCE =
  "La serie se agrupa en el navegador a partir de las facturas que responde " +
  "GET /api/v1/suppliers/:rfc. El agregado semanal supplier_weekly_outflow " +
  "vive en la base (0007 como vista y 0008 como agregado continuo) y no tiene " +
  "endpoint, asi que no es la base la que contesta esta grafica.";

/** Weeks of history the chart falls back to when no detector named a window. */
export const DEFAULT_SERIES_WEEKS = 18;

/** One bucket of the series, with the three columns the aggregate carries. */
export interface SupplierWeekPoint {
  /** Monday 00:00 UTC that opens the bucket, ISO 8601. */
  week: string;
  /** Invoices issued inside the bucket. Zero is a filled gap, see `weeklySeries`. */
  invoices: number;
  /** What they totalled, MXN. */
  outflow: number;
  /** The largest single invoice in the bucket, MXN. */
  maxInvoice: number;
  /** Inside the window the behaviour detector was reviewing. */
  recent: boolean;
}

/** The window and the numbers the `supplier_behaviour` detector reasoned over. */
export interface BehaviourReading {
  baselineStart: string;
  baselineEnd: string;
  recentStart: string;
  recentEnd: string;
  /** The supplier's own pace over the baseline, invoices per week. */
  ratePerWeek: number | null;
  /** Invoices the baseline window held. */
  baselineInvoices: number | null;
  /** Which of the three signals fired, as the detector joined them. */
  signals: string[];
  /** The finding this was read off, so the screen can link to its panel. */
  findingId: string;
}

/**
 * Monday 00:00 UTC that opens the bucket an instant falls in, or null when the
 * instant does not parse.
 *
 * The boundary is not a preference. `0007_supplier_outflow.sql` cuts with
 * `date_trunc('week', at at time zone 'UTC')`, which lands on a Monday, and
 * Timescale's `time_bucket('7 days', at)` in `0008` counts from its default
 * origin of 2000-01-03, itself a Monday, in UTC. Seven-day buckets from a Monday
 * open on a Monday forever, so the three definitions land on the same instant and
 * a bucket of this series can be compared against a row of either database path.
 */
export function weekStart(instant: string): string | null {
  const parsed = Date.parse(instant);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  const date = new Date(parsed);
  /* getUTCDay is 0 on Sunday, and the bucket opens on Monday. */
  const offset = (date.getUTCDay() + 6) % 7;
  const monday = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - offset,
  );

  return new Date(monday).toISOString();
}

/** Inclusive on both ends, the way a detector's window is stated. */
export interface SeriesWindow {
  from: string;
  to: string;
}

type Bucket = { invoices: number; outflow: number; maxInvoice: number };

/**
 * The weekly series of what this supplier invoiced the company.
 *
 * Two things it does that the database view does not, both of them presentation
 * and neither of them arithmetic.
 *
 * A week with no invoice is filled with a zero. The view has no row for it,
 * because there is nothing to aggregate, and a chart that simply omitted the
 * bucket would draw four quiet months as four adjacent bars. Silence is the
 * signal in half of these cases, so it gets a slot.
 *
 * The window is clipped. When the behaviour detector named one, that is the
 * window, verbatim, so the chart is the span the arithmetic ran over; otherwise
 * the most recent `DEFAULT_SERIES_WEEKS` of whatever the invoice file covers.
 */
export function weeklySeries(
  cfdis: readonly Cfdi[],
  options: { window?: SeriesWindow | null; recent?: SeriesWindow | null } = {},
): SupplierWeekPoint[] {
  const buckets = new Map<string, Bucket>();

  for (const cfdi of cfdis) {
    const week = weekStart(cfdi.issuedAt);

    if (week === null) {
      continue;
    }

    const bucket = buckets.get(week) ?? {
      invoices: 0,
      outflow: 0,
      maxInvoice: 0,
    };

    bucket.invoices += 1;
    /* Cents, then back, so a column of totals sums the way `::numeric(14,2)`
       sums inside the view rather than to within a float. */
    bucket.outflow = round2(bucket.outflow + cfdi.total);
    bucket.maxInvoice = Math.max(bucket.maxInvoice, cfdi.total);
    buckets.set(week, bucket);
  }

  if (buckets.size === 0) {
    return [];
  }

  const weeks = [...buckets.keys()].sort();
  const clip = clipWindow(options.window ?? null, weeks);
  const recent = normaliseWindow(options.recent ?? null);
  const points: SupplierWeekPoint[] = [];

  for (
    let at = Date.parse(clip.from);
    at <= Date.parse(clip.to);
    at += MS_PER_WEEK
  ) {
    const week = new Date(at).toISOString();
    const bucket = buckets.get(week);

    points.push({
      week,
      invoices: bucket?.invoices ?? 0,
      outflow: bucket?.outflow ?? 0,
      maxInvoice: bucket?.maxInvoice ?? 0,
      recent:
        recent !== null && at >= Date.parse(recent.from) && at < recent.toPlus,
    });
  }

  return points;
}

type Normalised = { from: string; toPlus: number };

/** A window snapped to the bucket boundary, so a comparison is bucket to bucket. */
function normaliseWindow(window: SeriesWindow | null): Normalised | null {
  if (window === null) {
    return null;
  }

  const from = weekStart(window.from);
  const to = weekStart(window.to);

  if (from === null || to === null) {
    return null;
  }

  /* Inclusive of the bucket the end falls in: a one week window that ends on the
     Thursday of its own bucket still covers that bucket. */
  return { from, toPlus: Date.parse(to) + 1 };
}

function clipWindow(
  window: SeriesWindow | null,
  weeks: readonly string[],
): SeriesWindow {
  const first = weeks[0] as string;
  const last = weeks[weeks.length - 1] as string;
  const snapped = window === null ? null : normaliseWindow(window);

  if (snapped !== null) {
    /* The window's own end, or the newest invoice if that is later. A window that
       ends after the last invoice keeps its empty buckets on purpose: the review
       window holding nothing is the "sin actividad reciente" case, and it has to
       be visible rather than trimmed off the right of the chart. */
    const end = Math.max(snapped.toPlus - 1, Date.parse(last));

    return { from: snapped.from, to: new Date(end).toISOString() };
  }

  const floor = Date.parse(last) - (DEFAULT_SERIES_WEEKS - 1) * MS_PER_WEEK;

  return {
    from: Date.parse(first) > floor ? first : new Date(floor).toISOString(),
    to: last,
  };
}

/**
 * The behaviour detector's own window and pace, off the finding it wrote.
 *
 * Null when no `supplier_behaviour` finding came with this supplier, which is a
 * result and not a gap: the detector gates itself on thin history and says so,
 * so the screen prints what the invoice file covers instead of inventing a
 * baseline the arithmetic never ran.
 */
export function behaviourReading(
  findings: readonly Finding[],
): BehaviourReading | null {
  const finding = findings.find(
    (item) => item.detector === "supplier_behaviour",
  );

  if (finding === undefined) {
    return null;
  }

  const baselineStart = text(finding, "baselineStart");
  const baselineEnd = text(finding, "baselineEnd");
  const recentStart = text(finding, "recentStart");
  const recentEnd = text(finding, "recentEnd");

  if (
    baselineStart === null ||
    baselineEnd === null ||
    recentStart === null ||
    recentEnd === null
  ) {
    return null;
  }

  return {
    baselineStart,
    baselineEnd,
    recentStart,
    recentEnd,
    ratePerWeek: number(finding, "baselineRatePerWeek"),
    baselineInvoices: number(finding, "baselineInvoices"),
    signals: (text(finding, "signals") ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
    findingId: finding.id,
  };
}

/** Where an account came from, in the order the screen explains it. */
export type AccountOrigin = "known" | "proposed";

/** One account of this supplier, with its plaza and what established it. */
export interface SupplierAccountRow {
  clabe: string;
  origin: AccountOrigin;
  /** `KnownAccount.establishedBy`, absent on an account nothing established. */
  establishedBy: string | null;
  establishedAt: string | null;
  timesPaid: number | null;
  /** Digits 4 to 6, always printed, named only when the snapshot carries them. */
  plazaCode: string;
  plaza: Plaza | null;
  /** The CEP in the verified-beneficiary registry for this account, if any. */
  verified: VerifiedBeneficiary | null;
  /** A finding in this payload names this account. */
  flagged: boolean;
}

/**
 * Every account this product associates with the supplier, known ones first.
 *
 * The registry and the findings are folded in rather than listed apart, because
 * the question a clerk asks is about one account at a time: where did it come
 * from, which plaza is it in, has a CEP ever proved who holds it, and is anything
 * standing against it this week. An account that only appears on a finding is
 * still a row, marked `proposed`, because the whole point of the screen is that
 * the new account sits next to the old one.
 */
export function accountRows(detail: SupplierDetail): SupplierAccountRow[] {
  const verified = new Map(
    detail.verifiedBeneficiaries.map((entry) => [entry.clabe, entry]),
  );
  const flagged = accountsNamedByFindings(detail.findings);
  const rows: SupplierAccountRow[] = detail.supplier.knownAccounts.map(
    (account) => ({
      clabe: account.clabe,
      origin: "known" as const,
      establishedBy: account.establishedBy,
      establishedAt: account.establishedAt,
      timesPaid: account.timesPaid,
      ...plazaOf(account.clabe),
      verified: verified.get(account.clabe) ?? null,
      flagged: flagged.has(account.clabe),
    }),
  );

  const known = new Set(rows.map((row) => row.clabe));

  for (const clabe of flagged) {
    if (known.has(clabe)) {
      continue;
    }

    known.add(clabe);
    rows.push({
      clabe,
      origin: "proposed",
      establishedBy: null,
      establishedAt: null,
      timesPaid: null,
      ...plazaOf(clabe),
      verified: verified.get(clabe) ?? null,
      flagged: true,
    });
  }

  /* Accounts the registry holds and nothing else mentions: a CEP proved who
     holds them, so leaving them off would hide the strongest evidence we have. */
  for (const entry of detail.verifiedBeneficiaries) {
    if (known.has(entry.clabe)) {
      continue;
    }

    known.add(entry.clabe);
    rows.push({
      clabe: entry.clabe,
      origin: "known",
      establishedBy: "cep",
      establishedAt: entry.verifiedAt,
      timesPaid: null,
      ...plazaOf(entry.clabe),
      verified: entry,
      flagged: false,
    });
  }

  return rows;
}

/** The three digits and, only if the committed snapshot carries them, the place. */
function plazaOf(clabe: string): { plazaCode: string; plaza: Plaza | null } {
  let code: string;

  try {
    code = parseClabeParts(clabe).plaza;
  } catch {
    /* An account that is not eighteen digits still belongs on the screen, and
       guessing a plaza out of it would be a claim about a place. */
    return { plazaCode: "", plaza: null };
  }

  return { plazaCode: code, plaza: lookupPlaza(code) ?? null };
}

/** Accounts any finding in this payload names, in the order they were named. */
function accountsNamedByFindings(findings: readonly Finding[]): Set<string> {
  const named = new Set<string>();

  for (const finding of findings) {
    for (const key of ["clabe", "proposedClabe", "clabe_propuesta"]) {
      const value = finding.evidence[key];

      if (typeof value === "string" && /^[0-9]{18}$/.test(value)) {
        named.add(value);
      }
    }
  }

  return named;
}

/** The plaza change control 2 found, when it found one. */
export interface PlazaChange {
  /** The account the instruction proposes. */
  clabe: string | null;
  /** Plazas the accounts we already pay sit in, as the detector listed them. */
  fromCodes: string[];
  /**
   * The same plazas with their names, as the detector wrote them, when it did.
   *
   * Preferred over naming the codes here: `previousPlazaPlaces` already carries
   * "580 (APODACA, NL)" out of the same `lookupPlaza` table, and reading the
   * detector's string rather than rebuilding it keeps one sentence about one
   * fact. Absent on a finding that named no previous plaza, and then the screen
   * labels the codes itself through the same table.
   */
  fromPlaces: string | null;
  /** The plaza the proposed account sits in. */
  toCode: string | null;
  /** The detector's own sentence about the comparison, when it wrote one. */
  comparison: string | null;
  /** `plaza_off_invoice` fired: the plaza and the CFDI point at two states. */
  offInvoice: boolean;
  /** `LugarExpedicion` of the invoice, and the state it maps to. */
  invoicePostalCode: string | null;
  invoiceState: string | null;
  findingId: string;
}

/**
 * The plaza change, read off the `clabe_forensics` finding that raised it.
 *
 * Only from a finding whose `signals` actually contain `plaza_changed`. The
 * detector writes `plazaComparison` on every account it inspects, including the
 * reassuring case ("Misma plaza que las cuentas ya pagadas"), so keying off the
 * presence of the sentence would put a change on the screen where there was
 * none.
 */
export function plazaChange(findings: readonly Finding[]): PlazaChange | null {
  for (const finding of findings) {
    if (finding.detector !== "clabe_forensics") {
      continue;
    }

    const signals = text(finding, "signals") ?? "";

    if (!signals.split(",").includes("plaza_changed")) {
      continue;
    }

    const previous = text(finding, "previousPlazaCodes") ?? "";

    return {
      clabe: text(finding, "clabe"),
      fromCodes: previous
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
      fromPlaces: text(finding, "previousPlazaPlaces"),
      toCode: text(finding, "plazaCode"),
      comparison: text(finding, "plazaComparison"),
      offInvoice: signals.split(",").includes("plaza_off_invoice"),
      invoicePostalCode: text(finding, "invoicePostalCode"),
      invoiceState: text(finding, "invoiceState"),
      findingId: finding.id,
    };
  }

  return null;
}

/** Which SAT list a row is about. The article, because the statutes differ. */
export type SatListId = "69b" | "49bis";

/**
 * One SAT list, answered for this supplier. `present: false` is an answer too.
 *
 * `status` only ever exists on the 69-B row: article 69-B publishes four
 * situations and corrects itself in both directions, and article 49 Bis fraccion
 * X publishes one outcome and provides for no published clearing at all, so
 * presence IS the state there and a status column would invite somebody to read
 * an absent row as a cleared one.
 */
export interface SatListRow {
  list: SatListId;
  present: boolean;
  status: SatListStatus | null;
  /** Whether the 69-B row is the effective situation today. */
  listedNow: boolean | null;
  publishedAt: string | null;
  listVersion: string | null;
  /** The resolution oficio, on a 49 Bis row. */
  oficio: string | null;
  /** Last day of the thirty natural days, on a 49 Bis row that stated one. */
  correctBy: string | null;
  findingId: string | null;
}

/**
 * Both lists, always, in the order the statutes are argued.
 *
 * The detector id is `sat_69b` for both, because ADR-0002 has six controls and
 * control 1 is the SAT lists cross-check, so the two are told apart by
 * `evidence.article`, which `@hackmty/engine` writes as `49 Bis` and
 * `packages/core/src/levels.ts` exports as `SAT_49BIS_ARTICLE`. A finding with no
 * `article` is a 69-B finding, which is what every row written before the second
 * list landed looks like.
 */
export function satListRows(findings: readonly Finding[]): SatListRow[] {
  const sat = findings.filter((finding) => finding.detector === "sat_69b");
  const art49 = sat.find((finding) => text(finding, "article") === "49 Bis");
  const art69 = sat.find((finding) => text(finding, "article") !== "49 Bis");

  return [
    {
      list: "69b",
      present: art69 !== undefined,
      status: art69 === undefined ? null : satStatusOf(art69),
      listedNow: art69 === undefined ? null : flag(art69, "listedNow"),
      publishedAt: art69 === undefined ? null : text(art69, "publishedAt"),
      listVersion: art69 === undefined ? null : text(art69, "listVersion"),
      oficio: null,
      correctBy: null,
      findingId: art69?.id ?? null,
    },
    {
      list: "49bis",
      present: art49 !== undefined,
      status: null,
      listedNow: null,
      publishedAt: art49 === undefined ? null : text(art49, "publishedAt"),
      listVersion: art49 === undefined ? null : text(art49, "listVersion"),
      oficio: art49 === undefined ? null : text(art49, "oficio"),
      correctBy: art49 === undefined ? null : text(art49, "correctBy"),
      findingId: art49?.id ?? null,
    },
  ];
}

const SAT_STATUSES: readonly SatListStatus[] = [
  "presunto",
  "desvirtuado",
  "definitivo",
  "sentencia_favorable",
];

function satStatusOf(finding: Finding): SatListStatus | null {
  const raw = text(finding, "status") ?? text(finding, "estado");

  return SAT_STATUSES.includes(raw as SatListStatus)
    ? (raw as SatListStatus)
    : null;
}

/** The consortium signal on this supplier, and the account it is about. */
export interface SupplierNetworkLine {
  network: NetworkEvidence;
  /** The account the network was asked about, when the finding named one. */
  clabe: string | null;
  findingId: string;
}

/**
 * The consortium signal, read off the finding that carries it.
 *
 * `packages/engine/src/beneficiary.ts` is the only producer and it attaches the
 * whole `NetworkSignal` as one evidence value, which is why this reads a finding
 * rather than calling `GET /api/v1/consortium/signal`: the signal a clerk is
 * looking at has to be the one the decision in front of her was made with, and a
 * second live read of the same pair would be a second source for one fact. It
 * also means the line renders under `?data=mock`, where nothing reaches the
 * network by design.
 *
 * Null when no finding carries one, and the screen says the network was not
 * consulted rather than drawing nothing: a missing line cannot be told apart from
 * a network that answered nothing, which is the distinction `NetworkSignal.source`
 * exists to keep.
 */
export function networkLine(
  findings: readonly Finding[],
): SupplierNetworkLine | null {
  for (const finding of findings) {
    const view = readEvidence(finding);

    if (view.network === null) {
      continue;
    }

    return {
      network: view.network,
      clabe: text(finding, "proposedClabe") ?? text(finding, "clabe"),
      findingId: finding.id,
    };
  }

  return null;
}

/** What the relationship looks like, in the numbers the documents already hold. */
export interface Relationship {
  firstInvoiceAt: string;
  /** Newest invoice in whatever the payload answered. Null on an empty file. */
  lastInvoiceAt: string | null;
  invoices: number;
  invoiced: number;
  /** Complements the supplier issued after being paid, and what they settle. */
  complements: number;
  paid: number;
  /** Whole months between the first invoice we hold and the newest one. */
  months: number;
}

export function relationship(detail: SupplierDetail): Relationship {
  const instants = detail.cfdis
    .map((cfdi) => Date.parse(cfdi.issuedAt))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const last = instants[instants.length - 1];
  const first = Date.parse(detail.supplier.firstInvoiceAt);
  const invoiced = round2(
    detail.cfdis.reduce((total, cfdi) => total + cfdi.total, 0),
  );
  const paid = round2(
    detail.complements.reduce(
      (total, complement) => total + complement.paidAmount,
      0,
    ),
  );

  return {
    firstInvoiceAt: detail.supplier.firstInvoiceAt,
    lastInvoiceAt: last === undefined ? null : new Date(last).toISOString(),
    invoices: detail.cfdis.length,
    invoiced,
    complements: detail.complements.length,
    paid,
    months:
      last === undefined || !Number.isFinite(first) || last <= first
        ? 0
        : Math.floor((last - first) / MS_PER_DAY / 30),
  };
}

/** Centavos are exact; a float sum of pesos is not. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function text(finding: Finding, key: string): string | null {
  const value = finding.evidence[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

function number(finding: Finding, key: string): number | null {
  const value = finding.evidence[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function flag(finding: Finding, key: string): boolean | null {
  const value = finding.evidence[key];

  return typeof value === "boolean" ? value : null;
}

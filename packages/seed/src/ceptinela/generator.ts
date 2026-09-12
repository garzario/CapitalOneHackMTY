/**
 * The Ceptinela generator: one synthetic company, 42 suppliers, eight months of CFDIs
 * and payment complements, and the current week's payment run.
 *
 * What is finished and what is not, so nobody has to guess:
 *
 * - **Finished.** The supplier projection, the CFDI stream, the complement stream, the
 *   payment run, and the event ledger the whole product replays. Determinism is
 *   asserted, the invariants are asserted, and the run size falls out of the catalogue
 *   cadence instead of being padded to a target.
 * - **Not finished, and marked.** Seasonality, PPD instalments, concentration drift,
 *   the Nessie mirror of outflows, and the four hard negatives. Each one has a named
 *   hook, a sketch of the method, and a `TODO(Apanawa)` against issue #43.
 *
 * Two rules that are not negotiable here.
 *
 * 1. **The labelled positives do not come from this file.** The holdout cases in
 *    `../holdout/` are written by somebody else and the detector author does not read
 *    them, which is what makes the precision and recall in `docs/01-rubric-mapping.md`
 *    blind rather than self-reported. A generator that also labels its own fraud is a
 *    generator that scores itself.
 * 2. **Everything carries `synthetic: true` and a `SYN` RFC.** The UI watermarks from
 *    the flag, never from a name, per ADR-0002.
 */

import type {
  Cfdi,
  LedgerEvent,
  PaymentComplement,
  PaymentInstruction,
  Supplier,
} from "@hackmty/core";
import { addDays, addMonths, dayOfWeek, formatDay, parseDay } from "../dates";
import type { Rng } from "../rng";
import { createRng } from "../rng";
import {
  CEPTINELA_DEFAULT_SEED,
  type CompanyProfile,
  DEMO_COMPANY,
  HISTORY_MONTHS,
  IVA_RATE,
  RUN_SIZE_MAX,
  RUN_SIZE_MIN,
} from "./company";
import type { CeptinelaSupplierSpec } from "./suppliers";
import { CEPTINELA_SUPPLIERS } from "./suppliers";

const CENTS = 100;
const MS_PER_MINUTE = 60_000;
/** Monterrey is UTC minus 6 all year, so there is no daylight-saving seam. */
const MONTERREY_OFFSET_MINUTES = -360;
const WORK_DAY_START_MINUTE = 8 * 60;
/**
 * 17:59 local and not 18:00. Monterrey is UTC minus 6, so 18:00 local is exactly
 * midnight UTC and an instant stamped there belongs to the NEXT day once it is read
 * back with `formatDay`. The terms arithmetic reads the day back, so one minute of
 * slack here is the difference between an invoice being due on Friday and being due on
 * Saturday, for one draw in six hundred, which is precisely the kind of bug that only
 * shows up in the run size on the morning of the demo.
 */
const WORK_DAY_END_MINUTE = 18 * 60 - 1;
/** The run is prepared first thing, before the bank's cut-off. */
const RUN_MINUTE = 9 * 60;
const AVERAGE_DAYS_PER_MONTH = 30.436875;
const DAYS_PER_WEEK = 7;

function round2(value: number): number {
  return Math.round(value * CENTS) / CENTS;
}

/**
 * A local day plus a minute offset, as an ISO instant. The generator works in
 * "YYYY-MM-DD" and only becomes a timestamp here, for the same reason ../dates.ts
 * exists: a generator that reads the machine's time zone produces different data on a
 * laptop in Monterrey and on a runner in the cloud.
 */
function instantAt(day: string, minuteOfDay: number): string {
  const at =
    parseDay(day) + (minuteOfDay - MONTERREY_OFFSET_MINUTES) * MS_PER_MINUTE;
  return new Date(at).toISOString();
}

/** Nearest working day at or after `day`. Invoices are not issued on a Sunday. */
function nextBusinessDay(day: string): string {
  let cursor = day;
  while (dayOfWeek(cursor) === 0 || dayOfWeek(cursor) === 6) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

/** The Monday of the week `day` falls in. */
export function mondayOf(day: string): string {
  const weekday = dayOfWeek(day);
  const back = weekday === 0 ? 6 : weekday - 1;
  return addDays(day, -back);
}

// --- Hard negatives ---------------------------------------------------------

/**
 * A hard negative is a case that looks exactly like fraud and is not. They matter more
 * than the positives: a sentinel that holds a legitimate payment twice is a sentinel
 * the clerk turns off, and the false-positive rate is the number in `Metrics` that
 * decides whether this product is usable at all.
 *
 * These are hooks, not implementations. The draft is mutable on purpose: an injector
 * edits the dataset in place, which is the only way to make one invoice a duplicate of
 * another one that already exists.
 */
export interface HardNegativeDraft {
  company: CompanyProfile;
  suppliers: Supplier[];
  cfdis: Cfdi[];
  complements: PaymentComplement[];
  instructions: PaymentInstruction[];
}

export interface HardNegativeOutcome {
  name: string;
  applied: boolean;
  /** What it did, or what is missing. Printed by `bun run seed`. */
  detail: string;
}

export interface HardNegativeInjector {
  name: string;
  /** One sentence a judge could read off the screen. */
  description: string;
  apply(draft: HardNegativeDraft, rng: Rng): HardNegativeOutcome;
}

/**
 * The four from issue #43. Every body is a stub that reports itself as not applied, so
 * `notes.hardNegatives` never claims something the dataset does not contain. The method
 * for each one is written out, because the hard part is not the code.
 */
export const HARD_NEGATIVE_INJECTORS: readonly HardNegativeInjector[] = [
  {
    name: "legitimate_bank_change",
    description:
      "A supplier really did change bank, and the new account is backed by the payment complement they issued for the previous invoice.",
    apply(draft, rng) {
      // Method: pick a mid-tail supplier with at least six months of history. Mint a
      // new CLABE at a DIFFERENT bank code with a valid check digit, emit a payment
      // complement on the most recent paid CFDI whose CtaBeneficiario is the new
      // account, push it onto the supplier's knownAccounts with
      // establishedBy "payment_complement", and point this week's instruction at it.
      // The detector must see a new account AND the document that establishes it, and
      // must not hold the payment.
      void draft;
      void rng;
      return {
        name: "legitimate_bank_change",
        applied: false,
        detail:
          "TODO(Apanawa), issue #43. Needs mintClabe at a different bank plus a complement that establishes it.",
      };
    },
  },
  {
    name: "ramping_new_supplier",
    description:
      "A supplier that did not exist four months ago is now 15 per cent of outflow, legitimately, because a new product line started.",
    apply(draft, rng) {
      // Method: append a 43rd supplier whose firstInvoiceAt is four months inside the
      // window, with a cadence that climbs month over month until its share of the
      // monthly total is near 0.15. The supplier_behaviour detector has to report this
      // as growth with a small-sample caveat, not as a concentration anomaly.
      void draft;
      void rng;
      return {
        name: "ramping_new_supplier",
        applied: false,
        detail:
          "TODO(Apanawa), issue #43. Needs a 43rd supplier with a climbing cadence and an explicit share target.",
      };
    },
  },
  {
    name: "round_number_invoice",
    description:
      "An invoice for exactly 100,000.00 MXN, because the quote was for exactly that. Round numbers are suspicious and are not evidence.",
    apply(draft, rng) {
      // Method: take one CFDI from a big-ticket supplier and rewrite subtotal so the
      // total lands on a round six figures, keeping total = subtotal + iva to the cent.
      // Whatever scores roundness has to be weak enough that this alone never holds a
      // payment.
      void draft;
      void rng;
      return {
        name: "round_number_invoice",
        applied: false,
        detail:
          "TODO(Apanawa), issue #43. Needs the rounding to preserve total = subtotal + iva exactly.",
      };
    },
  },
  {
    name: "seasonal_spike",
    description:
      "Volume doubles in one month because the plant had a shutdown and everything was bought at once. Not a behaviour change.",
    apply(draft, rng) {
      // Method: choose one month in the window, multiply the invoice count of the
      // consumable suppliers by about two, and leave the big-ticket ones alone, because
      // a real shutdown moves consumables and not tooling. The detector has to compare
      // against a seasonal baseline rather than against the trailing mean.
      void draft;
      void rng;
      return {
        name: "seasonal_spike",
        applied: false,
        detail:
          "TODO(Apanawa), issue #43. Needs the month chosen from the window rather than hard coded.",
      };
    },
  },
];

// --- Options and output -----------------------------------------------------

export interface CeptinelaOptions {
  seed?: number;
  /**
   * Any day inside the current payment-run week. The run is built for the Monday of
   * that week. Defaults to today in UTC, which keeps the demo's "this week" honest.
   */
  weekOf?: string;
  months?: number;
  injectors?: readonly HardNegativeInjector[];
}

export interface CeptinelaNotes {
  /**
   * The instruction the demo opens on. Undefined until the detectors exist: the hero
   * is whichever line carries the highest amountAtRisk, and that is the engine's
   * answer, not the generator's.
   *
   * TODO(Apanawa): once composeFindings lands, set this from the run rather than
   * leaving it for the demo script to guess.
   */
  heroInstructionId?: string;
  hardNegatives: HardNegativeOutcome[];
  /** Everything the generator knows it has not done yet, printed by `bun run seed`. */
  pending: readonly string[];
}

export interface CeptinelaDataset {
  seed: number;
  company: CompanyProfile;
  /** The CFDI history window, inclusive of `from`, exclusive of the run week. */
  window: { from: string; to: string };
  /** Monday of the current payment-run week. */
  weekOf: string;
  suppliers: Supplier[];
  cfdis: Cfdi[];
  complements: PaymentComplement[];
  instructions: PaymentInstruction[];
  /** Every object above, as the append-only event stream, in chronological order. */
  events: LedgerEvent[];
  notes: CeptinelaNotes;
}

// --- The generator ----------------------------------------------------------

/** Suppliers, as the domain sees them, with the account history we already trust. */
function buildSuppliers(
  specs: readonly CeptinelaSupplierSpec[],
  windowFrom: string,
): Supplier[] {
  return specs.map((spec) => {
    // Tenure is measured back from the start of the window, so firstInvoiceAt is a
    // different date for every supplier instead of the same date for all 42, which is
    // the tell of a generator nobody thought about.
    const firstInvoiceDay = addMonths(windowFrom, -spec.tenureMonths);
    const establishedDay = addMonths(firstInvoiceDay, 1);
    return {
      rfc: spec.rfc,
      legalName: spec.legalName,
      firstInvoiceAt: instantAt(nextBusinessDay(firstInvoiceDay), RUN_MINUTE),
      knownAccounts: [
        {
          clabe: spec.clabe,
          establishedBy: "payment_complement",
          establishedAt: instantAt(nextBusinessDay(establishedDay), RUN_MINUTE),
          // Roughly one payment per month of tenure, which is what makes a supplier
          // with eighty months of history read differently from one with twenty.
          timesPaid: Math.max(1, Math.round(spec.tenureMonths * 0.9)),
        },
      ],
      synthetic: true,
    };
  });
}

/**
 * How many invoices this supplier issues in a window of `days`, drawn around its
 * monthly cadence. Poisson would be the textbook answer; a normal draw truncated at
 * zero is within a rounding error of it at these rates and costs one call instead of
 * a loop, which matters when the generator runs 42 suppliers over eight months.
 *
 * TODO(Apanawa): seasonality goes here, not in a post-processing pass. A shutdown
 * month is a multiplier on this count for the consumable segments only.
 */
function drawInvoiceCount(
  rng: Rng,
  spec: CeptinelaSupplierSpec,
  days: number,
): number {
  const expected = (spec.invoicesPerMonth * days) / AVERAGE_DAYS_PER_MONTH;
  const drawn = rng.normal(expected, Math.sqrt(Math.max(expected, 1)));
  return Math.max(0, Math.round(drawn));
}

interface CfdiStream {
  cfdis: Cfdi[];
  /** Folio counter per issuer, so folios are sequential per supplier like real ones. */
  folios: Map<string, number>;
}

function generateCfdis(
  rng: Rng,
  specs: readonly CeptinelaSupplierSpec[],
  company: CompanyProfile,
  from: string,
  to: string,
): CfdiStream {
  const days = Math.max(
    1,
    Math.round((parseDay(to) - parseDay(from)) / 86_400_000),
  );
  const folios = new Map<string, number>();
  const cfdis: Cfdi[] = [];

  for (const spec of specs) {
    const count = drawInvoiceCount(rng, spec, days);
    for (let index = 0; index < count; index += 1) {
      const day = nextBusinessDay(addDays(from, rng.int(0, days - 1)));
      if (day >= to) {
        continue;
      }
      const folio = (folios.get(spec.rfc) ?? 0) + 1;
      folios.set(spec.rfc, folio);
      const subtotal = rng.amount(spec.ticket.min, spec.ticket.max);
      const iva = round2(subtotal * IVA_RATE);
      cfdis.push({
        uuid: rng.uuid(),
        serie: "A",
        folio: String(folio),
        issuedAt: instantAt(
          day,
          rng.int(WORK_DAY_START_MINUTE, WORK_DAY_END_MINUTE),
        ),
        issuerRfc: spec.rfc,
        issuerName: spec.legalName,
        receiverRfc: company.rfc,
        subtotal,
        iva,
        total: round2(subtotal + iva),
        // Terms longer than a fortnight are settled after the fact, which is what a
        // complement documents. Anything shorter is paid in one go.
        paymentMethod: spec.termsDays > 15 ? "PPD" : "PUE",
        // SAT c_FormaPago 03, transferencia electronica de fondos. Everything in this
        // company is paid by SPEI, which is the whole premise.
        paymentForm: "03",
        synthetic: true,
      });
    }
  }

  cfdis.sort((left, right) => left.issuedAt.localeCompare(right.issuedAt));
  return { cfdis, folios };
}

/** The day an invoice becomes payable, from the supplier's terms. */
function dueDay(cfdi: Cfdi, spec: CeptinelaSupplierSpec): string {
  return addDays(formatDay(Date.parse(cfdi.issuedAt)), spec.termsDays);
}

/**
 * What a Thursday run actually pays: everything that came due from the Friday before
 * up to and including the run day. A run that only covered Monday to Thursday would
 * leave Friday's dues for eleven days, which no supplier would accept, and it would
 * also make the run four sevenths of the size the demo screen was designed for.
 *
 * This is the window the run size falls out of, so it is exported: the test asserts
 * the band against the same arithmetic rather than against a magic number.
 */
export function runWindow(weekOf: string): { from: string; to: string } {
  const runDay = addDays(weekOf, DEMO_COMPANY.paymentRunWeekday - 1);
  return { from: addDays(runDay, -(DAYS_PER_WEEK - 1)), to: runDay };
}

/**
 * A complement for every invoice already settled before the current week. One
 * complement per invoice, paid in full.
 *
 * TODO(Apanawa): PPD instalments. A real PPD invoice can collect two or three partial
 * complements, each with its own paidAmount and its own CtaBeneficiario, and the
 * duplicate-invoice detector has to not read two complements on one CFDI as a double
 * payment. That case is worth a holdout row of its own.
 */
function generateComplements(
  rng: Rng,
  cfdis: readonly Cfdi[],
  specs: ReadonlyMap<string, CeptinelaSupplierSpec>,
  /** Everything that came due before this day has already been paid and documented. */
  settledBefore: string,
): PaymentComplement[] {
  const complements: PaymentComplement[] = [];
  for (const cfdi of cfdis) {
    const spec = specs.get(cfdi.issuerRfc);
    if (spec === undefined) {
      continue;
    }
    const due = dueDay(cfdi, spec);
    if (due >= settledBefore) {
      continue;
    }
    const paidDay = nextBusinessDay(due);
    complements.push({
      uuid: rng.uuid(),
      relatedCfdiUuid: cfdi.uuid,
      paidAt: instantAt(paidDay, RUN_MINUTE),
      paidAmount: cfdi.total,
      beneficiaryAccount: spec.clabe,
      synthetic: true,
    });
  }
  complements.sort((left, right) => left.paidAt.localeCompare(right.paidAt));
  return complements;
}

/** How a payment request reaches this company, weighted the way the persona describes it. */
const SOURCE_WEIGHTS: readonly {
  source: PaymentInstruction["source"];
  weight: number;
}[] = [
  { source: "email", weight: 52 },
  { source: "pdf", weight: 19 },
  { source: "whatsapp", weight: 17 },
  { source: "portal", weight: 8 },
  { source: "manual", weight: 4 },
];

function drawSource(rng: Rng): PaymentInstruction["source"] {
  const total = SOURCE_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);
  let ticket = rng.next() * total;
  for (const entry of SOURCE_WEIGHTS) {
    ticket -= entry.weight;
    if (ticket <= 0) {
      return entry.source;
    }
  }
  return "email";
}

/**
 * This week's payment run: one instruction per invoice that came due inside the run
 * window and has not been settled yet.
 *
 * The size is not padded. It falls out of the catalogue cadence in suppliers.ts: 439
 * invoices a month over a seven-day window is about 101 lines, and `RUN_SIZE_MIN` and
 * `RUN_SIZE_MAX` are asserted in the test so that editing the cadence without noticing
 * what it does to the demo screen fails in CI rather than at 03:00.
 */
function generateRun(
  rng: Rng,
  cfdis: readonly Cfdi[],
  complements: readonly PaymentComplement[],
  specs: ReadonlyMap<string, CeptinelaSupplierSpec>,
  weekOf: string,
): PaymentInstruction[] {
  const settled = new Set(complements.map((entry) => entry.relatedCfdiUuid));
  const window = runWindow(weekOf);
  const drafts: Omit<PaymentInstruction, "id">[] = [];

  for (const cfdi of cfdis) {
    const spec = specs.get(cfdi.issuerRfc);
    if (spec === undefined || settled.has(cfdi.uuid)) {
      continue;
    }
    const due = dueDay(cfdi, spec);
    if (due < window.from || due > window.to) {
      continue;
    }
    drafts.push({
      supplierRfc: spec.rfc,
      cfdiUuids: [cfdi.uuid],
      clabe: spec.clabe,
      amount: cfdi.total,
      source: drawSource(rng),
      receivedAt: instantAt(
        nextBusinessDay(addDays(weekOf, rng.int(0, 3))),
        rng.int(WORK_DAY_START_MINUTE, WORK_DAY_END_MINUTE),
      ),
      synthetic: true,
    });
  }

  // Numbered after sorting, so the ids run in the order the clerk sees the lines. A
  // run where line 3 is called INS-055 is a run somebody has to explain on stage.
  drafts.sort((left, right) => left.receivedAt.localeCompare(right.receivedAt));
  return drafts.map((draft, index) => ({
    id: `INS-${weekOf}-${String(index + 1).padStart(3, "0")}`,
    ...draft,
  }));
}

/**
 * The dataset as the append-only event stream, in chronological order. This is the
 * input the retroactive sweep folds over, so the order here is the order the replay
 * sees, and a generator that emits events out of order produces a sweep that is wrong
 * in a way no unit test on the sweep itself would catch.
 *
 * TODO(Apanawa): `payment_sent` events. Every complement implies a SPEI we sent, and
 * `bank_reconciliation` compares those against the Nessie mirror. The claveRastreo is
 * optional in the domain type, so the event can be emitted before the mirror exists.
 */
function toLedgerEvents(dataset: {
  cfdis: readonly Cfdi[];
  complements: readonly PaymentComplement[];
  instructions: readonly PaymentInstruction[];
}): LedgerEvent[] {
  const events: LedgerEvent[] = [
    ...dataset.cfdis.map(
      (cfdi): LedgerEvent => ({
        type: "cfdi_received",
        at: cfdi.issuedAt,
        cfdi,
      }),
    ),
    ...dataset.complements.map(
      (complement): LedgerEvent => ({
        type: "complement_received",
        at: complement.paidAt,
        complement,
      }),
    ),
    ...dataset.instructions.map(
      (instruction): LedgerEvent => ({
        type: "instruction_received",
        at: instruction.receivedAt,
        instruction,
      }),
    ),
  ];
  return events.sort((left, right) => left.at.localeCompare(right.at));
}

/**
 * Builds the whole company. Deterministic: the same options produce byte-identical
 * output on every machine, which is asserted in ceptinela.test.ts.
 */
export function generateCeptinela(
  options: CeptinelaOptions = {},
): CeptinelaDataset {
  const seed = options.seed ?? CEPTINELA_DEFAULT_SEED;
  const months = options.months ?? HISTORY_MONTHS;
  const rng = createRng(seed);

  const weekOf = mondayOf(
    options.weekOf ?? new Date().toISOString().slice(0, 10),
  );
  const windowTo = weekOf;
  const windowFrom = addMonths(windowTo, -months);

  const specs = new Map(
    CEPTINELA_SUPPLIERS.map((spec) => [spec.rfc, spec] as const),
  );
  const suppliers = buildSuppliers(CEPTINELA_SUPPLIERS, windowFrom);
  const { cfdis } = generateCfdis(
    rng,
    CEPTINELA_SUPPLIERS,
    DEMO_COMPANY,
    windowFrom,
    addDays(weekOf, DAYS_PER_WEEK),
  );
  const complements = generateComplements(
    rng,
    cfdis,
    specs,
    runWindow(weekOf).from,
  );
  const instructions = generateRun(rng, cfdis, complements, specs, weekOf);

  const draft: HardNegativeDraft = {
    company: DEMO_COMPANY,
    suppliers,
    cfdis,
    complements,
    instructions,
  };
  const injectors = options.injectors ?? HARD_NEGATIVE_INJECTORS;
  const hardNegatives = injectors.map((injector) => injector.apply(draft, rng));

  return {
    seed,
    company: DEMO_COMPANY,
    window: { from: windowFrom, to: windowTo },
    weekOf,
    suppliers: draft.suppliers,
    cfdis: draft.cfdis,
    complements: draft.complements,
    instructions: draft.instructions,
    events: toLedgerEvents(draft),
    notes: {
      hardNegatives,
      pending: [
        "TODO(Apanawa) #43: seasonality inside drawInvoiceCount",
        "TODO(Apanawa) #43: PPD instalments, several complements on one CFDI",
        "TODO(Apanawa) #43: payment_sent events and the Nessie mirror of outflows",
        "TODO(Apanawa) #43: the four hard negatives in HARD_NEGATIVE_INJECTORS",
        "TODO(Apanawa) #43: heroInstructionId, once composeFindings can rank the run",
      ],
    },
  };
}

export interface CeptinelaSummary {
  suppliers: number;
  cfdis: number;
  complements: number;
  runSize: number;
  /** Total pesos in this week's run. */
  runAmount: number;
  /** Monthly supplier spend implied by the generated history. */
  monthlySpend: number;
  events: number;
  runSizeInBand: boolean;
}

/** The figures `bun run seed` prints and the test asserts. */
export function summarizeCeptinela(
  dataset: CeptinelaDataset,
): CeptinelaSummary {
  const totalCents = dataset.cfdis.reduce(
    (sum, cfdi) => sum + Math.round(cfdi.total * CENTS),
    0,
  );
  const runCents = dataset.instructions.reduce(
    (sum, instruction) => sum + Math.round(instruction.amount * CENTS),
    0,
  );
  const windowDays = Math.max(
    1,
    Math.round(
      (parseDay(dataset.window.to) - parseDay(dataset.window.from)) /
        86_400_000,
    ),
  );
  const runSize = dataset.instructions.length;
  return {
    suppliers: dataset.suppliers.length,
    cfdis: dataset.cfdis.length,
    complements: dataset.complements.length,
    runSize,
    runAmount: runCents / CENTS,
    monthlySpend: round2(
      totalCents / CENTS / (windowDays / AVERAGE_DAYS_PER_MONTH),
    ),
    events: dataset.events.length,
    runSizeInBand: runSize >= RUN_SIZE_MIN && runSize <= RUN_SIZE_MAX,
  };
}

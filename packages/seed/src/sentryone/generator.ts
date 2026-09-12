/**
 * The SentryOne generator: one synthetic company, its suppliers, eight months of
 * CFDIs and payment complements, the current week's payment run, and the bank mirror
 * of everything that has already left the account.
 *
 * The order of the phases is the part worth reading.
 *
 * 1. **Plan.** The catalogue plus whatever the case injectors add, and a cadence map
 *    that says how many invoices each supplier issues in each month. Seasonality and
 *    a ramping supplier are decided here, before a single object exists, because they
 *    are properties of how the company buys and not patches applied afterwards.
 * 2. **Draw.** Invoices month by month, complements for everything already settled,
 *    and one run line per invoice that came due inside the run window.
 * 3. **Inject.** The four hard negatives and the four demo scenarios mutate the draft
 *    and then measure what landed.
 * 4. **Settle.** Complements are grouped into the SPEI transfers that paid them, and
 *    the mirror is built from those through the real Nessie normaliser.
 * 5. **Replay.** Everything becomes the append-only event stream the retroactive
 *    sweep folds over.
 *
 * Two rules that are not negotiable.
 *
 * 1. **The labelled positives do not come from this file.** The holdout cases in
 *    `../holdout/` are written by somebody else and the detector author does not read
 *    them, which is what makes the precision and recall in `docs/01-rubric-mapping.md`
 *    blind rather than self-reported. The demo scenarios in ./scenarios.ts are the
 *    demo path and are counted towards nothing.
 * 2. **Everything carries `synthetic: true` and a `SYN` RFC.** The UI watermarks from
 *    the flag, never from a name, per ADR-0002.
 */

import type {
  Cfdi,
  LedgerEvent,
  PaymentComplement,
  PaymentInstruction,
  Rfc,
} from "@hackmty/core";
import {
  addDays,
  addMonths,
  lastDayOfMonth,
  maxDay,
  minDay,
  monthsInWindow,
} from "../dates";
import type { Rng } from "../rng";
import { createRng } from "../rng";
import {
  buildSupplierRow,
  dueDayOf,
  makeCfdi,
  makeInstruction,
  nextFolio,
  settleCfdi,
} from "./build";
import {
  DEMO_COMPANY,
  HISTORY_MONTHS,
  RUN_SIZE_MAX,
  RUN_SIZE_MIN,
  SENTRYONE_DEFAULT_SEED,
} from "./company";
import {
  HARD_NEGATIVE_INJECTORS,
  RAMPING_SUPPLIER_RFC,
} from "./hard-negatives";
import { buildBankMirror, buildMerchants, buildTransfers } from "./mirror";
import { DEMO_SCENARIOS, LISTED_SUPPLIER_RFC } from "./scenarios";
import { SENTRYONE_SUPPLIERS, type SentryOneSupplierSpec } from "./suppliers";
import {
  AVERAGE_DAYS_PER_MONTH,
  businessDaysBetween,
  cents,
  dayCount,
  dayOf,
  fromCents,
  instantAt,
  mondayOf,
  nextBusinessDay,
  round2,
  runDayOf,
  runWindow,
  WORK_DAY_END_MINUTE,
  WORK_DAY_START_MINUTE,
} from "./timeline";
import type {
  CaseOutcome,
  GenerationPlan,
  SentryOneDataset,
  SentryOneDraft,
  SentryOneOptions,
  SentryOneSummary,
} from "./types";

/** How often a PPD invoice is settled in two partial payments rather than one. */
const INSTALMENT_PROBABILITY = 0.18;

/**
 * The longest a second instalment can trail the first, in calendar days. It is the
 * fourteen working days `settleCfdi` may draw, rounded up through two weekends, and
 * it is what decides whether an invoice is old enough to be settled in two.
 */
const INSTALMENT_SPAN_DAYS = 22;

/**
 * How far back an unpaid invoice can have come due and still be sitting on this
 * week's run, and how often one does. Together they are the reason a payment run
 * carries a tail of older lines rather than exactly one week of dues.
 */
const LATE_WINDOW_DAYS = 14;
const LATE_RATE = 0.06;

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
 * How many invoices a supplier issues in a stretch of `days`, drawn around the
 * monthly cadence the plan asks for.
 *
 * Poisson would be the textbook answer; a normal draw truncated at zero is within a
 * rounding error of it at these rates and costs one call instead of a loop, which
 * matters when the generator runs forty-odd suppliers over nine months.
 */
export function drawInvoiceCount(
  rng: Rng,
  expectedPerMonth: number,
  days: number,
): number {
  const expected = (expectedPerMonth * days) / AVERAGE_DAYS_PER_MONTH;
  if (expected <= 0) {
    return 0;
  }
  const drawn = rng.normal(expected, Math.sqrt(Math.max(expected, 1)));
  return Math.max(0, Math.round(drawn));
}

/**
 * The invoice stream, one calendar month at a time.
 *
 * Month by month rather than one draw over the whole window, because that is the only
 * structure a cadence multiplier can attach to: a shutdown month and a supplier that
 * did not exist in March are both statements about a month, and a generator that
 * scatters a single count over 240 days cannot express either.
 */
function generateCfdis(rng: Rng, plan: GenerationPlan): Cfdi[] {
  const folios = new Map<Rfc, number>();
  const cfdis: Cfdi[] = [];
  const lastIssuable = addDays(plan.issuedBefore, -1);

  for (const month of monthsInWindow(plan.window.from, lastIssuable)) {
    const monthStart = `${String(month.year).padStart(4, "0")}-${String(month.month).padStart(2, "0")}-01`;
    const monthEnd = addDays(
      monthStart,
      lastDayOfMonth(month.year, month.month) - 1,
    );
    const to = minDay(monthEnd, lastIssuable);

    for (const spec of plan.specs) {
      const from = maxDay(
        maxDay(monthStart, plan.window.from),
        spec.firstInvoiceDay ?? plan.window.from,
      );
      if (from > to) {
        continue;
      }
      const workdays = businessDaysBetween(from, to);
      if (workdays.length === 0) {
        continue;
      }
      const multiplier =
        plan.cadence.get(`${spec.rfc}|${monthStart.slice(0, 7)}`) ?? 1;
      const count = drawInvoiceCount(
        rng,
        spec.invoicesPerMonth * multiplier,
        dayCount(from, to) + 1,
      );

      for (let index = 0; index < count; index += 1) {
        // Drawn from the working days of the month rather than from the calendar
        // days rolled forward. Rolling piles every weekend onto the following
        // Monday, and a Monday carrying three times its share of the invoices puts
        // three times its share of the due dates in one payment run.
        const day = workdays[rng.int(0, workdays.length - 1)] ?? from;
        cfdis.push(
          makeCfdi(rng, spec, plan.company, day, nextFolio(folios, spec.rfc)),
        );
      }
    }
  }

  cfdis.sort((left, right) => left.issuedAt.localeCompare(right.issuedAt));
  return cfdis;
}

/**
 * A complement for every invoice that came due before the current run week, which is
 * to say everything the company has already paid.
 *
 * Roughly one PPD invoice in six is settled in two partial payments, each with its
 * own complement and its own share of the total. The duplicate detector has to read
 * those two rows as one payable rather than as a double payment, and the holdout has
 * a case for exactly that.
 */
function generateComplements(
  rng: Rng,
  cfdis: readonly Cfdi[],
  specs: ReadonlyMap<Rfc, SentryOneSupplierSpec>,
  /** Everything that came due before this day has already been paid and documented. */
  settledBefore: string,
): PaymentComplement[] {
  const complements: PaymentComplement[] = [];

  for (const cfdi of cfdis) {
    const spec = specs.get(cfdi.issuerRfc);
    if (spec === undefined) {
      continue;
    }
    const due = dueDayOf(dayOf(cfdi.issuedAt), spec);
    if (due >= settledBefore) {
      continue;
    }
    // A share of what came due in the fortnight before this week slipped and is
    // still unpaid, which is what a payment run is actually for. Without it the run
    // would only ever carry invoices that came due in the last seven days, and a
    // clerk who has never been behind is not a clerk.
    if (
      due >= addDays(settledBefore, -LATE_WINDOW_DAYS) &&
      rng.bool(LATE_RATE)
    ) {
      continue;
    }
    // Only when the second payment also lands in the past. A PPD invoice due five
    // days before the run cannot have had its balance settled a fortnight later, and
    // a complement dated next Friday is a future date in a ledger a judge scrolls.
    const roomForTwo = addDays(due, INSTALMENT_SPAN_DAYS) < settledBefore;
    const instalments =
      cfdi.paymentMethod === "PPD" &&
      roomForTwo &&
      rng.bool(INSTALMENT_PROBABILITY)
        ? 2
        : 1;
    complements.push(
      ...settleCfdi(rng, cfdi, {
        beneficiaryAccount: spec.clabe,
        paidDay: due,
        instalments,
      }),
    );
  }

  complements.sort((left, right) => left.paidAt.localeCompare(right.paidAt));
  return complements;
}

/**
 * This week's payment run.
 *
 * One line per supplier per due day, not one line per invoice. A company pays a
 * supplier once and the SPEI covers whatever came due, which is exactly why
 * `PaymentInstruction.cfdiUuids` is an array and why a payment complement carries a
 * `paymentTotal` separate from the share this invoice took. It is also the same
 * grouping the bank mirror uses for the eight months of history, and a run built one
 * way against a history settled another way would make the reconciliation detector
 * report differences that are an artefact of the generator.
 *
 * The size is not padded. It falls out of the catalogue cadence in suppliers.ts, and
 * `RUN_SIZE_MIN` and `RUN_SIZE_MAX` are asserted in the test so that editing the
 * cadence without noticing what it does to the demo screen fails in CI rather than at
 * 03:00 on the morning of the demo.
 */
function generateRun(
  rng: Rng,
  cfdis: readonly Cfdi[],
  complements: readonly PaymentComplement[],
  specs: ReadonlyMap<Rfc, SentryOneSupplierSpec>,
  weekOf: string,
): PaymentInstruction[] {
  const settled = new Set(complements.map((entry) => entry.relatedCfdiUuid));
  const window = runWindow(weekOf);
  const groups = new Map<string, Cfdi[]>();

  for (const cfdi of cfdis) {
    const spec = specs.get(cfdi.issuerRfc);
    if (spec === undefined || settled.has(cfdi.uuid)) {
      continue;
    }
    // Everything unpaid that has come due, not only what came due this week: the
    // stragglers generateComplements left unsettled are exactly what a run catches up
    // on, and leaving them out would make the run a week of dues rather than a
    // payables ledger.
    const due = dueDayOf(dayOf(cfdi.issuedAt), spec);
    if (due > window.to) {
      continue;
    }
    const key = `${cfdi.issuerRfc}|${due}`;
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [cfdi]);
      continue;
    }
    bucket.push(cfdi);
  }

  const instructions: PaymentInstruction[] = [];
  for (const [key, bucket] of [...groups.entries()].sort((left, right) =>
    left[0].localeCompare(right[0]),
  )) {
    const [rfc = ""] = key.split("|");
    const spec = specs.get(rfc);
    if (spec === undefined) {
      continue;
    }
    instructions.push(
      makeInstruction({
        supplierRfc: rfc,
        cfdiUuids: bucket.map((cfdi) => cfdi.uuid),
        clabe: spec.clabe,
        amount: fromCents(
          bucket.reduce((sum, cfdi) => sum + cents(cfdi.total), 0),
        ),
        source: drawSource(rng),
        receivedAt: instantAt(
          nextBusinessDay(addDays(weekOf, rng.int(0, 3))),
          rng.int(WORK_DAY_START_MINUTE, WORK_DAY_END_MINUTE),
        ),
      }),
    );
  }

  return instructions;
}

/**
 * Sorts the run and numbers it, so the ids run in the order the clerk sees the lines.
 * A run where line 3 is called INS-055 is a run somebody has to explain on stage.
 *
 * It happens after the injectors, which is why the ids in `notes` are read back from
 * the instruction objects rather than remembered: a case that appended a line changes
 * the numbering of every line after it.
 */
function numberRun(draft: SentryOneDraft): void {
  draft.instructions.sort((left, right) => {
    if (left.receivedAt !== right.receivedAt) {
      return left.receivedAt.localeCompare(right.receivedAt);
    }
    if (left.supplierRfc !== right.supplierRfc) {
      return left.supplierRfc.localeCompare(right.supplierRfc);
    }
    return (left.cfdiUuids[0] ?? "").localeCompare(right.cfdiUuids[0] ?? "");
  });
  for (const [index, instruction] of draft.instructions.entries()) {
    instruction.id = `INS-${draft.weekOf}-${String(index + 1).padStart(3, "0")}`;
  }
}

/**
 * The dataset as the append-only event stream, in chronological order. This is the
 * input the retroactive sweep folds over, so the order here is the order the replay
 * sees, and a generator that emits events out of order produces a sweep that is wrong
 * in a way no unit test on the sweep itself would catch.
 *
 * There is deliberately no `payment_sent` event. Nothing in this week's run has left
 * the bank yet, which is the premise of the whole product, and the eight months of
 * history arrived from the accounting system as invoices and complements rather than
 * as instructions this company never recorded. The bank mirror is what proves the
 * historical money moved, and `bank_reconciliation` reads it.
 */
function toLedgerEvents(draft: SentryOneDraft): LedgerEvent[] {
  const events: LedgerEvent[] = [
    ...draft.cfdis.map(
      (cfdi): LedgerEvent => ({
        type: "cfdi_received",
        at: cfdi.issuedAt,
        cfdi,
      }),
    ),
    ...draft.complements.map(
      (complement): LedgerEvent => ({
        type: "complement_received",
        at: complement.paidAt,
        complement,
      }),
    ),
    ...draft.instructions.map(
      (instruction): LedgerEvent => ({
        type: "instruction_received",
        at: instruction.receivedAt,
        instruction,
      }),
    ),
  ];

  for (const listVersion of [
    ...new Set(draft.satEntries.map((entry) => entry.listVersion)),
  ].sort()) {
    const entries = draft.satEntries.filter(
      (entry) => entry.listVersion === listVersion,
    );
    const publishedAt = `${listVersion}T12:00:00.000Z`;
    if (publishedAt > instantAt(draft.runDay, WORK_DAY_END_MINUTE)) {
      // A list version published after the run day would be a future date in the
      // ledger. It is dropped rather than back-dated, and notes.pending says so.
      continue;
    }
    events.push({
      type: "sat_list_published",
      at: publishedAt,
      listVersion,
      entries,
    });
  }

  return events.sort((left, right) => left.at.localeCompare(right.at));
}

function buildPlan(weekOf: string, months: number): GenerationPlan {
  const windowTo = weekOf;
  return {
    company: DEMO_COMPANY,
    weekOf,
    runDay: runDayOf(weekOf),
    window: { from: addMonths(windowTo, -months), to: windowTo },
    // Nothing exists after the moment the run is prepared. An invoice dated tomorrow
    // is a future date in a ledger a judge is about to scroll through, and the run is
    // built from invoices that came due, not from invoices that have not arrived.
    issuedBefore: addDays(runDayOf(weekOf), 1),
    specs: [...SENTRYONE_SUPPLIERS],
    cadence: new Map<string, number>(),
    reserved: new Set<Rfc>(),
  };
}

/**
 * Builds the whole company. Deterministic: the same options produce byte-identical
 * output on every machine, which is asserted in sentryone.test.ts.
 */
export function generateSentryOne(
  options: SentryOneOptions = {},
): SentryOneDataset {
  const seed = options.seed ?? SENTRYONE_DEFAULT_SEED;
  const months = options.months ?? HISTORY_MONTHS;
  const rng = createRng(seed);
  const weekOf = mondayOf(
    options.weekOf ?? new Date().toISOString().slice(0, 10),
  );

  const injectors = options.injectors ?? HARD_NEGATIVE_INJECTORS;
  const scenarios = options.scenarios ?? DEMO_SCENARIOS;

  // 1. Plan.
  const plan = buildPlan(weekOf, months);
  for (const injector of [...injectors, ...scenarios]) {
    injector.plan?.(plan, rng);
  }

  // 2. Draw.
  const specs = new Map(plan.specs.map((spec) => [spec.rfc, spec] as const));
  const cfdis = generateCfdis(rng, plan);
  const complements = generateComplements(
    rng,
    cfdis,
    specs,
    runWindow(weekOf).from,
  );
  const draft: SentryOneDraft = {
    company: DEMO_COMPANY,
    weekOf,
    runDay: plan.runDay,
    window: plan.window,
    specs,
    suppliers: plan.specs.map((spec) =>
      buildSupplierRow(spec, plan.window.from),
    ),
    cfdis,
    complements,
    instructions: generateRun(rng, cfdis, complements, specs, weekOf),
    satEntries: [],
    claimed: new Set<PaymentInstruction>(),
    claimedSuppliers: new Set<Rfc>(plan.reserved),
  };

  // 3. Inject. Hard negatives first: a demo scenario must not land on a line the
  // legitimate bank change already took, or the demo would show one case and the
  // notes would name another.
  const hardNegatives: CaseOutcome[] = [];
  const scenarioOutcomes: CaseOutcome[] = [];
  const pending: Array<{
    outcome: CaseOutcome;
    instruction?: PaymentInstruction;
  }> = [];

  for (const [list, sink] of [
    [injectors, hardNegatives],
    [scenarios, scenarioOutcomes],
  ] as const) {
    for (const injector of list) {
      const result = injector.apply(draft, rng);
      sink.push(result.outcome);
      pending.push(result);
      if (result.instruction !== undefined) {
        draft.claimed.add(result.instruction);
      }
      if (result.outcome.supplierRfc !== undefined) {
        draft.claimedSuppliers.add(result.outcome.supplierRfc);
      }
    }
  }

  // 4. Number the run, then read the ids back onto the outcomes.
  numberRun(draft);
  for (const result of pending) {
    if (result.instruction !== undefined) {
      result.outcome.instructionId = result.instruction.id;
    }
  }

  // 5. Settle and mirror.
  const cfdiByUuid = new Map(draft.cfdis.map((cfdi) => [cfdi.uuid, cfdi]));
  const transfers = buildTransfers(draft.complements, cfdiByUuid);
  const merchants = buildMerchants(plan.specs);
  const bankMirror = buildBankMirror(DEMO_COMPANY, transfers, merchants, specs);

  return {
    seed,
    company: DEMO_COMPANY,
    window: draft.window,
    weekOf,
    runDay: draft.runDay,
    runId: `run-${weekOf}`,
    suppliers: draft.suppliers,
    merchants,
    cfdis: draft.cfdis,
    complements: draft.complements,
    instructions: draft.instructions,
    transfers,
    bankMirror,
    satEntries: draft.satEntries,
    events: toLedgerEvents(draft),
    notes: {
      heroInstructionIds: scenarioOutcomes
        .map((outcome) => outcome.instructionId)
        .filter((id): id is string => id !== undefined),
      demoRfcs: {
        company: DEMO_COMPANY.rfc,
        listed: LISTED_SUPPLIER_RFC,
        bankChange:
          hardNegatives.find(
            (outcome) => outcome.name === "legitimate_bank_change",
          )?.supplierRfc ?? "",
        ramping: RAMPING_SUPPLIER_RFC,
      },
      scenarios: scenarioOutcomes,
      hardNegatives,
      pending: [
        "TODO(garzario) #43: verified beneficiaries and CEP evidence are not generated here, they come from packages/cep and from the real one-cent probe",
        "TODO(garzario) #43: the bank mirror carries no outflow without a document behind it, because that case is a labelled positive and those live in ../holdout",
      ],
    },
  };
}

/** The figures `bun run seed` prints and the test asserts. */
export function summarizeSentryOne(
  dataset: SentryOneDataset,
): SentryOneSummary {
  const invoicedCents = dataset.cfdis.reduce(
    (sum, cfdi) => sum + cents(cfdi.total),
    0,
  );
  const runCents = dataset.instructions.reduce(
    (sum, instruction) => sum + cents(instruction.amount),
    0,
  );
  const outflowCents = dataset.bankMirror.reduce(
    (sum, row) => sum + (row.direction === "debit" ? cents(row.amount) : 0),
    0,
  );
  const windowDays = Math.max(
    1,
    dayCount(dataset.window.from, dataset.window.to),
  );
  const runSize = dataset.instructions.length;

  return {
    suppliers: dataset.suppliers.length,
    cfdis: dataset.cfdis.length,
    complements: dataset.complements.length,
    transfers: dataset.transfers.length,
    bankMirrorRows: dataset.bankMirror.length,
    runSize,
    runAmount: fromCents(runCents),
    monthlySpend: round2(
      fromCents(invoicedCents) / (windowDays / AVERAGE_DAYS_PER_MONTH),
    ),
    outflow: fromCents(outflowCents),
    events: dataset.events.length,
    runSizeInBand: runSize >= RUN_SIZE_MIN && runSize <= RUN_SIZE_MAX,
    heroInstructionIds: [...dataset.notes.heroInstructionIds],
  };
}

/**
 * The four hard negatives from issue #43, applied rather than described.
 *
 * A hard negative is a case that looks exactly like fraud and is not. They matter
 * more than the positives: a sentinel that holds a legitimate payment twice is a
 * sentinel the clerk turns off, and the false-positive rate is the number in
 * `Metrics` that decides whether this product is usable at all.
 *
 * Every injector works in two phases, and which phase it uses is a statement about
 * what kind of case it is.
 *
 * - `plan` runs BEFORE anything is drawn and may change the cadence or add a
 *   supplier. Seasonality and a ramping supplier belong here: they are properties of
 *   how the company buys, not patches applied to a finished dataset. An injector that
 *   appended invoices to a month it had not planned would produce folios out of order
 *   and complements that settle invoices issued after them.
 * - `apply` runs AFTER, mutates the drawn data where it has to, and then MEASURES
 *   what actually landed. `applied` is set from the measurement and never from the
 *   intention, so `notes.hardNegatives` cannot claim a case the data does not
 *   contain. That is the honest half of this design, and the first judge who asks to
 *   see one of these will look.
 */

import type { Cfdi, PaymentComplement, Rfc } from "@hackmty/core";
import { addMonths, monthsInWindow } from "../dates";
import {
  bankCodeOf,
  MX_BANKS,
  mintRandomClabe,
  syntheticBankRfc,
} from "./clabe";
import { IVA_RATE } from "./company";
import {
  CONSUMABLE_SEGMENTS,
  medianTicket,
  type SentryOneSupplierSpec,
} from "./suppliers";
import { cents, dayOf, fromCents, round2 } from "./timeline";
import type { CaseInjector, CaseResult, SentryOneDraft } from "./types";

/** The share of outflow the new supplier is meant to reach. Issue #43 says 15%. */
export const RAMP_TARGET_SHARE = 0.15;

/**
 * The band the measured share has to land in for the case to count as applied.
 *
 * It is wide, and deliberately: the cadence is drawn with Poisson variance and the
 * tickets lognormal, so the share of any one month swings either side of the target.
 * What makes this a hard negative is a supplier that did not exist four months ago
 * carrying a material share of the outflow, not a number hit to one decimal, and the
 * outcome reports the share it actually drew rather than the one it aimed at.
 */
const RAMP_ACCEPTED = { min: 0.05, max: 0.28 };

/** How much a shutdown month multiplies a consumable supplier's cadence by. */
const SPIKE_MULTIPLIER = 2.1;

/** The measured spike has to be at least this many times the median month. */
const SPIKE_ACCEPTED_RATIO = 1.5;

/** The round total the round-number invoice aims at, in pesos. */
const ROUND_TOTAL = 100_000;

/**
 * What counts as round when no supplier in this run can carry a hundred thousand.
 * A ten-thousand multiple is still a quoted figure rather than a computed one, which
 * is the whole point of the case.
 */
const ROUND_STEP = 10_000;

/** The supplier that ramps. Invented, like everything else in this package. */
export const RAMPING_SUPPLIER_RFC = "SYN260401R43";

const RAMPING_SUPPLIER: SentryOneSupplierSpec = {
  rfc: RAMPING_SUPPLIER_RFC,
  legalName: "Recubrimientos Ceramicos de Pesqueria SA de CV",
  city: "Pesqueria",
  segment: "recubrimientos",
  // Set by the plan phase from the target share, so the ramp is arithmetic and not a
  // number somebody liked the look of. The ticket range is deliberately narrow and
  // the cadence high: a share measured off eight big invoices a month swings by half
  // its own value from one seed to the next, and a hard negative that is 24 per cent
  // of the outflow on some seeds and 11 on others is not the case it says it is.
  invoicesPerMonth: 29,
  ticket: { min: 12_000, max: 46_000 },
  termsDays: 30,
  tenureMonths: 0,
  clabe: "021180043000000432",
};

/** Where the ramp starts, counted from the beginning of the history window. */
const RAMP_START_MONTH = 4;
/** Month-by-month share of the full cadence once the supplier exists. */
const RAMP_CURVE = [0.25, 0.5, 0.75, 1] as const;

function monthKey(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function cadenceKey(rfc: Rfc, year: number, month: number): string {
  return `${rfc}|${monthKey(year, month)}`;
}

/**
 * The subtotal that puts the total on `targetCents`, to the cent. Solved rather than
 * guessed: IVA is rounded to the cent before it is added, so the nearest subtotal is
 * nudged one cent at a time until the sum is exact.
 */
function subtotalFor(targetCents: number): number {
  let subtotalCents = Math.round(targetCents / (1 + IVA_RATE));
  for (let step = 0; step < 200; step += 1) {
    const subtotal = subtotalCents / 100;
    const total = cents(subtotal + round2(subtotal * IVA_RATE));
    if (total === targetCents) {
      break;
    }
    subtotalCents += total < targetCents ? 1 : -1;
  }
  return subtotalCents / 100;
}

/**
 * The round total this supplier can plausibly invoice: a hundred thousand when its
 * ordinary ticket covers it, otherwise the largest ten-thousand multiple that fits.
 * Undefined when no round figure fits inside its range at all.
 */
function roundTotalFor(spec: SentryOneSupplierSpec): number | undefined {
  const fits = (total: number): boolean => {
    const subtotal = subtotalFor(cents(total));
    return subtotal >= spec.ticket.min && subtotal <= spec.ticket.max;
  };
  if (fits(ROUND_TOTAL)) {
    return ROUND_TOTAL;
  }
  const highest =
    Math.floor((spec.ticket.max * (1 + IVA_RATE)) / ROUND_STEP) * ROUND_STEP;
  for (let total = highest; total >= ROUND_STEP; total -= ROUND_STEP) {
    if (fits(total)) {
      return total;
    }
  }
  return undefined;
}

function notApplied(
  injector: Pick<CaseInjector, "name" | "kind" | "description">,
  detail: string,
): CaseResult {
  return {
    outcome: {
      name: injector.name,
      kind: injector.kind,
      description: injector.description,
      applied: false,
      detail,
    },
  };
}

/** Every invoice of one issuer, oldest first. */
function invoicesOf(draft: SentryOneDraft, rfc: Rfc): Cfdi[] {
  return draft.cfdis.filter((cfdi) => cfdi.issuerRfc === rfc);
}

function complementsFor(
  draft: SentryOneDraft,
  cfdis: readonly Cfdi[],
): PaymentComplement[] {
  const uuids = new Set(cfdis.map((cfdi) => cfdi.uuid));
  return draft.complements.filter((complement) =>
    uuids.has(complement.relatedCfdiUuid),
  );
}

/** Total invoiced, in pesos, for the calendar month a day belongs to. */
function monthlyTotals(draft: SentryOneDraft): Map<string, number> {
  const totals = new Map<string, number>();
  for (const cfdi of draft.cfdis) {
    const key = dayOf(cfdi.issuedAt).slice(0, 7);
    totals.set(key, (totals.get(key) ?? 0) + cents(cfdi.total));
  }
  return totals;
}

// --- 1. A supplier really did change bank -----------------------------------

const legitimateBankChange: CaseInjector = {
  name: "legitimate_bank_change",
  kind: "hard_negative",
  description:
    "A supplier really did change bank, and the new account is backed by the payment complement they issued for the invoice we paid on it.",
  apply(draft, rng): CaseResult {
    // A mid-tail supplier: long enough in the history that the change is visible
    // against a real baseline, small enough that it is not the company's biggest
    // exposure. The busiest suppliers are left alone so the demo scenarios can use
    // them without two cases landing on the same line.
    const candidates = draft.suppliers.filter((supplier) => {
      const spec = draft.specs.get(supplier.rfc);
      return (
        spec !== undefined &&
        spec.tenureMonths >= 24 &&
        spec.invoicesPerMonth >= 3 &&
        spec.invoicesPerMonth <= 9 &&
        draft.instructions.some(
          (instruction) => instruction.supplierRfc === supplier.rfc,
        )
      );
    });
    if (candidates.length === 0) {
      return notApplied(
        this,
        "no supplier with a mid-tail cadence had a line in this run",
      );
    }

    const supplier = rng.pick(candidates);
    const settled = complementsFor(draft, invoicesOf(draft, supplier.rfc)).sort(
      (left, right) => right.paidAt.localeCompare(left.paidAt),
    );
    const evidence = settled[0];
    if (evidence === undefined) {
      return notApplied(
        this,
        `${supplier.rfc} has no settled invoice to establish a new account with`,
      );
    }

    const oldClabe = supplier.knownAccounts[0]?.clabe ?? "";
    const oldBank = bankCodeOf(oldClabe);
    const newBank = rng.pick(MX_BANKS.filter((bank) => bank.code !== oldBank));
    const newClabe = mintRandomClabe(newBank.code, rng);

    // The document comes FIRST. The complement they issued for the payment we made
    // last fortnight already says CtaBeneficiario is the new account, which is the
    // legitimate way an account changes and the thing the detector has to find
    // before it decides anything about this week's instruction.
    evidence.beneficiaryAccount = newClabe;
    evidence.beneficiaryBankRfc = syntheticBankRfc(newBank.code);
    supplier.knownAccounts.unshift({
      clabe: newClabe,
      establishedBy: "payment_complement",
      establishedAt: evidence.paidAt,
      timesPaid: 1,
    });

    const repointed = draft.instructions.filter(
      (instruction) => instruction.supplierRfc === supplier.rfc,
    );
    for (const instruction of repointed) {
      instruction.clabe = newClabe;
    }

    return {
      outcome: {
        name: this.name,
        kind: this.kind,
        description: this.description,
        applied: repointed.length > 0,
        detail: `${supplier.rfc} moved from ${oldClabe} to ${newClabe} at ${newBank.name}, established by complement ${evidence.uuid} on ${dayOf(evidence.paidAt)}; ${repointed.length} line(s) in this run pay the new account`,
        supplierRfc: supplier.rfc,
      },
      ...(repointed[0] === undefined ? {} : { instruction: repointed[0] }),
    };
  },
};

// --- 2. A new supplier ramping to a sixth of the outflow --------------------

const rampingNewSupplier: CaseInjector = {
  name: "ramping_new_supplier",
  kind: "hard_negative",
  description:
    "A supplier that did not exist four months ago now carries a material share of the outflow, legitimately, because a new product line started. The cadence is sized for 15 per cent and the share it actually reached is measured.",
  plan(plan): void {
    // Size the cadence from what the rest of the catalogue invoices, so the share is
    // arithmetic rather than a number somebody liked. If the new supplier is to be
    // `share` of the total, it has to be share/(1-share) of everybody else.
    const baseMonthly = plan.specs.reduce(
      (sum, spec) => sum + spec.invoicesPerMonth * medianTicket(spec),
      0,
    );
    const targetMonthly =
      (baseMonthly * RAMP_TARGET_SHARE) / (1 - RAMP_TARGET_SHARE);
    const perInvoice = medianTicket(RAMPING_SUPPLIER);
    const invoicesPerMonth = Math.max(
      1,
      Math.round(targetMonthly / perInvoice),
    );

    const startDay = addMonths(plan.window.from, RAMP_START_MONTH);
    const spec: SentryOneSupplierSpec = {
      ...RAMPING_SUPPLIER,
      invoicesPerMonth,
      firstInvoiceDay: startDay,
    };
    plan.specs.push(spec);
    plan.reserved.add(spec.rfc);

    // Nothing before the start month, then a quarter, a half, three quarters and the
    // full cadence. The behaviour detector has to read this as growth with a
    // small-sample caveat, not as a concentration anomaly.
    const months = monthsInWindow(plan.window.from, plan.issuedBefore);
    for (const [index, month] of months.entries()) {
      const rampIndex = index - RAMP_START_MONTH;
      const factor = rampIndex < 0 ? 0 : (RAMP_CURVE[rampIndex] ?? 1);
      plan.cadence.set(cadenceKey(spec.rfc, month.year, month.month), factor);
    }
  },
  apply(draft, _rng): CaseResult {
    const spec = draft.specs.get(RAMPING_SUPPLIER_RFC);
    const invoices = invoicesOf(draft, RAMPING_SUPPLIER_RFC);
    if (spec === undefined || invoices.length === 0) {
      return notApplied(this, "the ramping supplier issued no invoices");
    }

    const totals = monthlyTotals(draft);
    // The last whole month of history, which is the month the share is quoted for.
    // The run week itself is four days long and quoting a share off it would be a
    // number nobody could defend.
    const previousMonth = addMonths(draft.window.to, -1).slice(0, 7);
    const theirs = invoices
      .filter((cfdi) => dayOf(cfdi.issuedAt).slice(0, 7) === previousMonth)
      .reduce((sum, cfdi) => sum + cents(cfdi.total), 0);
    const everyone = totals.get(previousMonth) ?? 0;
    const share = everyone === 0 ? 0 : theirs / everyone;
    const firstInvoice = invoices[0];

    return {
      outcome: {
        name: this.name,
        kind: this.kind,
        description: this.description,
        applied:
          share >= RAMP_ACCEPTED.min &&
          share <= RAMP_ACCEPTED.max &&
          firstInvoice !== undefined,
        detail: `${RAMPING_SUPPLIER_RFC} first invoiced on ${firstInvoice === undefined ? "never" : dayOf(firstInvoice.issuedAt)} and reached ${(share * 100).toFixed(1)} per cent of the ${previousMonth} outflow across ${invoices.length} invoices`,
        supplierRfc: RAMPING_SUPPLIER_RFC,
      },
    };
  },
};

// --- 3. An invoice for exactly one hundred thousand pesos -------------------

const roundNumberInvoice: CaseInjector = {
  name: "round_number_invoice",
  kind: "hard_negative",
  description:
    "An invoice whose total is a round figure to the cent, a hundred thousand pesos where a supplier can carry it, because the quote was for exactly that. A round number is suspicious and is not evidence.",
  apply(draft, rng): CaseResult {
    // A supplier whose ordinary ticket already covers a round figure. Rewriting a
    // 2,000-peso invoice to 100,000 would be an amount anomaly we invented, and then
    // the case would stop being a hard negative and start being a positive.
    const options = new Map<string, number>();
    for (const instruction of draft.instructions) {
      const spec = draft.specs.get(instruction.supplierRfc);
      if (
        spec === undefined ||
        draft.claimedSuppliers.has(instruction.supplierRfc)
      ) {
        continue;
      }
      const target = roundTotalFor(spec);
      if (target !== undefined) {
        options.set(instruction.supplierRfc, target);
      }
    }
    // A hundred thousand if anybody in this run can carry it, another round figure
    // otherwise, so the case lands on every seed instead of most of them.
    const preferred = [...options.values()].includes(ROUND_TOTAL)
      ? ROUND_TOTAL
      : undefined;
    const candidates = draft.instructions.filter((instruction) => {
      const target = options.get(instruction.supplierRfc);
      return (
        target !== undefined &&
        (preferred === undefined || target === preferred)
      );
    });
    if (candidates.length === 0) {
      return notApplied(
        this,
        "no run line came from a supplier whose ticket range spans a round figure",
      );
    }

    const instruction = rng.pick(candidates);
    const target = cents(options.get(instruction.supplierRfc) ?? ROUND_TOTAL);
    const subtotal = subtotalFor(target);
    const uuid = instruction.cfdiUuids[0] ?? "";
    const cfdi = draft.cfdis.find((row) => row.uuid === uuid);
    if (cfdi === undefined) {
      return notApplied(this, `run line points at a missing invoice ${uuid}`);
    }

    cfdi.subtotal = subtotal;
    cfdi.iva = round2(subtotal * IVA_RATE);
    cfdi.total = round2(cfdi.subtotal + cfdi.iva);
    // A run line can settle several invoices, so the line is re-added rather than
    // set to the invoice total. Setting it would silently drop the others.
    instruction.amount = fromCents(
      instruction.cfdiUuids.reduce((sum, id) => {
        const row = draft.cfdis.find((entry) => entry.uuid === id);
        return sum + cents(row?.total ?? 0);
      }, 0),
    );

    return {
      outcome: {
        name: this.name,
        kind: this.kind,
        description: this.description,
        applied:
          cents(cfdi.total) === target &&
          cents(cfdi.total) % cents(ROUND_STEP) === 0,
        detail: `invoice ${cfdi.serie ?? ""}${cfdi.folio ?? ""} of ${cfdi.issuerRfc} totals exactly ${cfdi.total.toFixed(2)} MXN (${cfdi.subtotal.toFixed(2)} plus ${cfdi.iva.toFixed(2)} IVA)`,
        supplierRfc: cfdi.issuerRfc,
      },
      instruction,
    };
  },
};

// --- 4. A shutdown month -----------------------------------------------------

const seasonalSpike: CaseInjector = {
  name: "seasonal_spike",
  kind: "hard_negative",
  description:
    "Volume doubles in one month because the plant had a shutdown and everything was bought at once. Consumables move, tooling does not, and none of it is a behaviour change.",
  plan(plan, rng): void {
    const months = monthsInWindow(plan.window.from, plan.issuedBefore);
    // Never near either edge of the window. A spike in the first months cannot be
    // told from the window boundary, and a spike in the last three would land on the
    // months the ramping supplier's share is measured over: doubling that
    // denominator would halve a share that has nothing to do with the shutdown, and
    // the two cases would quietly break each other.
    const index = rng.int(2, Math.max(2, months.length - 5));
    const month = months[index];
    if (month === undefined) {
      return;
    }
    for (const spec of plan.specs) {
      if (!CONSUMABLE_SEGMENTS.includes(spec.segment)) {
        continue;
      }
      plan.cadence.set(
        cadenceKey(spec.rfc, month.year, month.month),
        SPIKE_MULTIPLIER,
      );
    }
  },
  apply(draft, _rng): CaseResult {
    // Measured, not remembered: the month the plan picked is the month whose
    // consumable volume stands out, and if it does not stand out the case did not
    // land whatever the plan intended.
    const perMonth = new Map<string, number>();
    for (const cfdi of draft.cfdis) {
      const spec = draft.specs.get(cfdi.issuerRfc);
      if (spec === undefined || !CONSUMABLE_SEGMENTS.includes(spec.segment)) {
        continue;
      }
      const key = dayOf(cfdi.issuedAt).slice(0, 7);
      perMonth.set(key, (perMonth.get(key) ?? 0) + 1);
    }

    // The first and last buckets are partial months, so they are dropped before the
    // median is taken rather than dragging it down.
    const keys = [...perMonth.keys()].sort();
    const inner = keys.slice(1, -1);
    const counts = inner
      .map((key) => perMonth.get(key) ?? 0)
      .sort((left, right) => left - right);
    const median = counts[Math.floor(counts.length / 2)] ?? 0;
    let peakKey = "";
    let peak = 0;
    for (const key of inner) {
      const count = perMonth.get(key) ?? 0;
      if (count > peak) {
        peak = count;
        peakKey = key;
      }
    }
    const ratio = median === 0 ? 0 : peak / median;

    return {
      outcome: {
        name: this.name,
        kind: this.kind,
        description: this.description,
        applied: ratio >= SPIKE_ACCEPTED_RATIO,
        detail: `${peakKey} carried ${peak} consumable invoices against a median month of ${median}, ${ratio.toFixed(2)} times the baseline, while the tooling and casting suppliers stayed flat`,
      },
    };
  },
};

export const HARD_NEGATIVE_INJECTORS: readonly CaseInjector[] = [
  legitimateBankChange,
  rampingNewSupplier,
  roundNumberInvoice,
  seasonalSpike,
];

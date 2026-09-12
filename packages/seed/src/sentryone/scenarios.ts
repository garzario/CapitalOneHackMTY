/**
 * The four positives the demo is built on, each one landing on a named run line.
 *
 * Read this next to ./hard-negatives.ts and to ../holdout/, because the three are
 * different things and a judge will ask which is which.
 *
 * - These four are the DEMO path. They exist so `docs/10-demo-script.md` can name a
 *   line and open it on stage, and the generator says out loud which line carries
 *   which case. They are not evidence of anything: a detector that finds a case the
 *   same author planted has proved nothing.
 * - The four in ./hard-negatives.ts are the cases that look like these and are not.
 * - The LABELLED positives, the ones precision and recall are computed from, live in
 *   ../holdout/ and are written by somebody who does not write the detectors. That
 *   separation is the only reason the numbers in docs/01-rubric-mapping.md mean
 *   anything, and nothing in this file may be counted towards them.
 *
 * What this file does not do is decide which of the four matters most. Ranking by
 * pesos at risk is the engine's answer.
 */

import type { Cfdi, PaymentInstruction, SatListEntry } from "@hackmty/core";
import { SYNTHETIC_SNAPSHOT_ENTRIES } from "@hackmty/sat";
import { addDays } from "../dates";
import type { Rng } from "../rng";
import { makeInstruction } from "./build";
import { bankCodeOf, mintBrokenClabe, mintNearMissClabe } from "./clabe";
import type { SentryOneSupplierSpec } from "./suppliers";
import {
  cents,
  dayOf,
  instantAt,
  nextBusinessDay,
  WORK_DAY_END_MINUTE,
  WORK_DAY_START_MINUTE,
} from "./timeline";
import type { CaseInjector, CaseResult, SentryOneDraft } from "./types";

/** Below this the case is true and boring. The demo needs a number worth stopping. */
const HERO_MIN_AMOUNT = 25_000;

/** Confidence the OCR reports on the photographed PDF. Low enough to be honest. */
const OCR_CONFIDENCE = 0.82;

/**
 * The supplier on the simulated Article 69-B publication.
 *
 * The RFC and the legal name are taken verbatim from the synthetic snapshot in
 * @hackmty/sat rather than written again here, so the row the lookup returns and the
 * supplier the company pays can never drift apart. That package's rule is followed
 * exactly: a row on a fiscal blacklist is an accusation, so an invented one has to be
 * unmistakably invented even in a screenshot with the watermark cropped off, which is
 * why the name carries SINTETICOS and the RFC carries SYN.
 */
export const LISTED_SUPPLIER_RFC = "SYN080910HI8";

function listedEntry(): SatListEntry {
  const entry = SYNTHETIC_SNAPSHOT_ENTRIES.find(
    (row) => row.rfc === LISTED_SUPPLIER_RFC,
  );
  if (entry === undefined) {
    throw new Error(
      `${LISTED_SUPPLIER_RFC} is no longer in the synthetic 69-B snapshot in @hackmty/sat, so the demo would publish a list that does not list the supplier it names`,
    );
  }
  return entry;
}

function listedSupplierSpec(): SentryOneSupplierSpec {
  return {
    rfc: LISTED_SUPPLIER_RFC,
    legalName: listedEntry().name,
    city: "Apodaca",
    segment: "insumos",
    invoicesPerMonth: 5,
    ticket: { min: 14_000, max: 72_000 },
    termsDays: 30,
    tenureMonths: 26,
    clabe: "044180080910000083",
  };
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

/**
 * Run lines a case may still land on: not already claimed, worth stopping, and paying
 * a supplier with a year of history and exactly one account in it, so "the account we
 * have always used" is a thing that exists and the case is unambiguous.
 */
function freeLines(draft: SentryOneDraft): PaymentInstruction[] {
  return draft.instructions.filter((instruction) => {
    if (
      draft.claimed.has(instruction) ||
      draft.claimedSuppliers.has(instruction.supplierRfc)
    ) {
      return false;
    }
    const supplier = draft.suppliers.find(
      (row) => row.rfc === instruction.supplierRfc,
    );
    const spec = draft.specs.get(instruction.supplierRfc);
    return (
      supplier !== undefined &&
      spec !== undefined &&
      // A year of history, or "the account we have always used" means nothing and
      // the case stops being the case.
      spec.tenureMonths >= 12 &&
      supplier.knownAccounts.length === 1 &&
      instruction.amount >= HERO_MIN_AMOUNT
    );
  });
}

function knownClabeOf(
  draft: SentryOneDraft,
  instruction: PaymentInstruction,
): string | undefined {
  return draft.suppliers.find((row) => row.rfc === instruction.supplierRfc)
    ?.knownAccounts[0]?.clabe;
}

/** A working-hours instant inside the run week. */
function receivedInRunWeek(draft: SentryOneDraft, rng: Rng): string {
  const day = nextBusinessDay(addDays(draft.weekOf, rng.int(0, 2)));
  return instantAt(day, rng.int(WORK_DAY_START_MINUTE, WORK_DAY_END_MINUTE));
}

// --- 1. Two digits off ------------------------------------------------------

const clabeTwoDigitsOff: CaseInjector = {
  name: "clabe_two_digits_off",
  kind: "demo_positive",
  description:
    "A WhatsApp message asks for the same supplier to be paid on a CLABE that differs from the one we have always used in exactly two digits, and the check digit is correct.",
  apply(draft, rng): CaseResult {
    const candidates = freeLines(draft);
    if (candidates.length === 0) {
      return notApplied(this, "no free run line was large enough to use");
    }
    const instruction = rng.pick(candidates);
    const known = knownClabeOf(draft, instruction);
    if (known === undefined) {
      return notApplied(
        this,
        `${instruction.supplierRfc} has no known account`,
      );
    }

    const impostor = mintNearMissClabe(known, rng);
    instruction.clabe = impostor;
    instruction.source = "whatsapp";
    instruction.text =
      "Buenas tardes, cambiamos de cuenta por temas administrativos. Le paso la CLABE nueva para el pago de esta semana, gracias.";
    draft.claimed.add(instruction);

    const differing = [...impostor].filter(
      (digit, index) => digit !== known[index],
    ).length;

    return {
      outcome: {
        name: this.name,
        kind: this.kind,
        description: this.description,
        applied: differing === 2,
        detail: `${instruction.supplierRfc} is asked to be paid on ${impostor} instead of ${known}, ${differing} digits apart, check digit valid, ${instruction.amount.toFixed(2)} MXN at risk`,
        supplierRfc: instruction.supplierRfc,
      },
      instruction,
    };
  },
};

// --- 2. An account that fails the arithmetic --------------------------------

const invalidCheckDigit: CaseInjector = {
  name: "invalid_check_digit",
  kind: "demo_positive",
  description:
    "A CLABE read off a photographed PDF fails the 3-7-1 check digit, so it is not an account at any bank and the transfer would bounce or land somewhere nobody chose.",
  apply(draft, rng): CaseResult {
    const candidates = freeLines(draft);
    if (candidates.length === 0) {
      return notApplied(this, "no free run line was large enough to use");
    }
    const instruction = rng.pick(candidates);
    const known = knownClabeOf(draft, instruction);
    if (known === undefined) {
      return notApplied(
        this,
        `${instruction.supplierRfc} has no known account`,
      );
    }

    // Same bank and plaza as the account we know, so the only thing wrong with it is
    // the arithmetic. A clerk reading eighteen digits off a photograph cannot see it.
    instruction.clabe = mintBrokenClabe(bankCodeOf(known), rng);
    instruction.source = "pdf";
    instruction.imageRef = `intake/${dayOf(instruction.receivedAt)}-${instruction.supplierRfc}.jpg`;
    instruction.ocrConfidence = OCR_CONFIDENCE;
    draft.claimed.add(instruction);

    return {
      outcome: {
        name: this.name,
        kind: this.kind,
        description: this.description,
        applied: true,
        detail: `${instruction.supplierRfc} arrived as a photographed PDF with CLABE ${instruction.clabe}, whose check digit is wrong, at OCR confidence ${OCR_CONFIDENCE}`,
        supplierRfc: instruction.supplierRfc,
      },
      instruction,
    };
  },
};

// --- 3. An invoice that was already paid ------------------------------------

const duplicateInvoice: CaseInjector = {
  name: "duplicate_invoice",
  kind: "demo_positive",
  description:
    "A supplier resends an invoice the company already settled last month, and the complement they issued for it is the proof. Provable, not a suspicion.",
  apply(draft, rng): CaseResult {
    const settledUuids = new Map<string, number>();
    for (const complement of draft.complements) {
      settledUuids.set(
        complement.relatedCfdiUuid,
        (settledUuids.get(complement.relatedCfdiUuid) ?? 0) +
          cents(complement.paidAmount),
      );
    }

    // Paid in full, recently enough that resending it is a plausible mistake, and
    // big enough to be worth a stop.
    const horizon = addDays(draft.weekOf, -60);
    const candidates = draft.cfdis.filter((cfdi: Cfdi) => {
      const paid = settledUuids.get(cfdi.uuid);
      return (
        !draft.claimedSuppliers.has(cfdi.issuerRfc) &&
        paid !== undefined &&
        paid === cents(cfdi.total) &&
        cfdi.total >= HERO_MIN_AMOUNT &&
        dayOf(cfdi.issuedAt) >= horizon
      );
    });
    if (candidates.length === 0) {
      return notApplied(
        this,
        "no invoice was settled in full inside the last sixty days",
      );
    }

    const cfdi = rng.pick(candidates);
    const supplier = draft.suppliers.find((row) => row.rfc === cfdi.issuerRfc);
    const clabe = supplier?.knownAccounts[0]?.clabe;
    if (clabe === undefined) {
      return notApplied(this, `${cfdi.issuerRfc} has no known account`);
    }

    const instruction = makeInstruction({
      supplierRfc: cfdi.issuerRfc,
      cfdiUuids: [cfdi.uuid],
      clabe,
      amount: cfdi.total,
      source: "email",
      receivedAt: receivedInRunWeek(draft, rng),
      text: `Buen dia, le reenvio la factura ${cfdi.serie ?? ""}-${cfdi.folio ?? ""} que aparece pendiente en nuestro sistema. Quedo atento al pago.`,
    });
    draft.instructions.push(instruction);
    draft.claimed.add(instruction);

    const complement = draft.complements.find(
      (row) => row.relatedCfdiUuid === cfdi.uuid,
    );

    return {
      outcome: {
        name: this.name,
        kind: this.kind,
        description: this.description,
        applied: complement !== undefined,
        detail: `invoice ${cfdi.uuid} of ${cfdi.issuerRfc} for ${cfdi.total.toFixed(2)} MXN was settled on ${complement === undefined ? "never" : dayOf(complement.paidAt)} by complement ${complement?.uuid ?? "none"} and is on this run again`,
        supplierRfc: cfdi.issuerRfc,
      },
      instruction,
    };
  },
};

// --- 4. A supplier the list is about to name --------------------------------

const listedSupplier: CaseInjector = {
  name: "listed_supplier_69b",
  kind: "demo_positive",
  description:
    "A supplier the company has been buying from for two years appears on the Article 69-B list, which voids the deductions already taken on everything paid to it.",
  plan(plan): void {
    plan.specs.push(listedSupplierSpec());
    plan.reserved.add(LISTED_SUPPLIER_RFC);
  },
  apply(draft, rng): CaseResult {
    const entry = listedEntry();
    const spec = draft.specs.get(LISTED_SUPPLIER_RFC);
    if (spec === undefined) {
      return notApplied(
        this,
        `${LISTED_SUPPLIER_RFC} was never added to the supplier list`,
      );
    }
    draft.satEntries.push({ ...entry });

    const settled = new Set(
      draft.complements.map((complement) => complement.relatedCfdiUuid),
    );
    const theirs = draft.cfdis.filter(
      (cfdi) => cfdi.issuerRfc === LISTED_SUPPLIER_RFC,
    );
    const deductedBase = theirs
      .filter((cfdi) => settled.has(cfdi.uuid))
      .reduce((sum, cfdi) => sum + cents(cfdi.subtotal), 0);

    let instruction = draft.instructions.find(
      (row) =>
        row.supplierRfc === LISTED_SUPPLIER_RFC && !draft.claimed.has(row),
    );
    if (instruction === undefined) {
      // The cadence did not happen to put a line of theirs in this week's run, so
      // one is built from their most recent unsettled invoice. The demo needs the
      // supplier on the screen the sweep is launched from.
      const newest = [...theirs].sort((left, right) =>
        right.issuedAt.localeCompare(left.issuedAt),
      );
      let cfdi = newest.find((row) => !settled.has(row.uuid));
      if (cfdi === undefined) {
        // Everything of theirs happens to have been settled already. The newest
        // invoice is put back on the payables instead, complements and all: an
        // invoice nobody has paid yet is a normal state, and a demo whose 69-B
        // supplier has no line on the run screen has nothing to open.
        cfdi = newest[0];
        if (cfdi === undefined) {
          return notApplied(
            this,
            `${LISTED_SUPPLIER_RFC} issued no invoice to build a run line from`,
          );
        }
        const payable = cfdi;
        draft.complements = draft.complements.filter(
          (row) => row.relatedCfdiUuid !== payable.uuid,
        );
      }
      instruction = makeInstruction({
        supplierRfc: LISTED_SUPPLIER_RFC,
        cfdiUuids: [cfdi.uuid],
        clabe: spec.clabe,
        amount: cfdi.total,
        source: "portal",
        receivedAt: receivedInRunWeek(draft, rng),
      });
      draft.instructions.push(instruction);
    }
    draft.claimed.add(instruction);

    return {
      outcome: {
        name: this.name,
        kind: this.kind,
        description: this.description,
        applied: true,
        detail: `${entry.rfc} ${entry.name} is ${entry.status} on list version ${entry.listVersion} published ${entry.publishedAt}; ${(deductedBase / 100).toFixed(2)} MXN of base was already deducted across ${theirs.length} invoices`,
        supplierRfc: LISTED_SUPPLIER_RFC,
      },
      instruction,
    };
  },
};

/** The demo order: the two the clerk sees first, then the two that need a document. */
export const DEMO_SCENARIOS: readonly CaseInjector[] = [
  clabeTwoDigitsOff,
  invalidCheckDigit,
  duplicateInvoice,
  listedSupplier,
];

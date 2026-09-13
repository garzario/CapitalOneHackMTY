/**
 * The object builders every phase of the SentryOne generator shares.
 *
 * The generator draws the baseline with them, and the injectors in
 * ./hard-negatives.ts and the scenarios in ./scenarios.ts build their extra invoices
 * and complements with the same functions, so an injected object is indistinguishable
 * from a drawn one. That is the whole point: a hard negative assembled by hand out of
 * slightly different parts is a hard negative the detector can cheat on.
 */

import type {
  Cfdi,
  Clabe,
  PaymentComplement,
  PaymentInstruction,
  Rfc,
  Supplier,
} from "@hackmty/core";
import { addDays, addMonths } from "../dates";
import type { Rng } from "../rng";
import { bankCodeOf, ISSUE_POSTAL_CODE, syntheticBankRfc } from "./clabe";
import { type CompanyProfile, IVA_RATE } from "./company";
import { delayCostPerDayOf } from "./delay-cost";
import type { SentryOneSupplierSpec } from "./suppliers";
import {
  addBusinessDays,
  cents,
  fromCents,
  instantAt,
  nextBusinessDay,
  RUN_MINUTE,
  round2,
  SPEI_MINUTE,
  WORK_DAY_END_MINUTE,
  WORK_DAY_START_MINUTE,
} from "./timeline";

/**
 * Supplier row, with the account history we already trust and what a day of delay
 * costs us with them.
 *
 * `delayCostPerDay` is the second half of the expected-loss trade-off and it is priced
 * in ./delay-cost.ts from the catalogue row rather than left unset. A supplier record
 * with no price reads through `supplierModelOf` as a delay that costs nothing, and a
 * company where nothing costs anything to delay holds every payment that carries any
 * finding at all.
 */
export function buildSupplierRow(
  spec: SentryOneSupplierSpec,
  windowFrom: string,
): Supplier {
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
    delayCostPerDay: delayCostPerDayOf(spec),
    synthetic: true,
  };
}

/** The next folio for an issuer, so folios stay sequential the way real ones are. */
export function nextFolio(index: Map<Rfc, number>, rfc: Rfc): number {
  const folio = (index.get(rfc) ?? 0) + 1;
  index.set(rfc, folio);
  return folio;
}

export interface MakeCfdiOptions {
  /** Overrides the lognormal draw, for the round-number injector. */
  subtotal?: number;
  /** Overrides the minute of day, otherwise drawn inside working hours. */
  minuteOfDay?: number;
}

/**
 * One CFDI 4.0 de ingreso.
 *
 * Terms longer than a fortnight are settled after the fact, which is what a
 * complement documents, so those are PPD and anything shorter is PUE. `paymentForm`
 * is SAT c_FormaPago 03, transferencia electronica de fondos: everything in this
 * company is paid by SPEI, which is the whole premise.
 *
 * `issuePlace` is `LugarExpedicion`, the postal code the invoice was issued from,
 * and it is the invoice half of the plaza comparison in control 2: an account whose
 * plaza sits in another state than the state the supplier invoices from is a
 * question worth asking. Every supplier here invoices from Nuevo Leon, so the value
 * is one constant and `./clabe.ts` says why.
 */
export function makeCfdi(
  rng: Rng,
  spec: SentryOneSupplierSpec,
  company: CompanyProfile,
  day: string,
  folio: number,
  options: MakeCfdiOptions = {},
): Cfdi {
  const subtotal =
    options.subtotal ?? rng.amount(spec.ticket.min, spec.ticket.max);
  const iva = round2(subtotal * IVA_RATE);
  const minuteOfDay =
    options.minuteOfDay ?? rng.int(WORK_DAY_START_MINUTE, WORK_DAY_END_MINUTE);
  return {
    uuid: rng.uuid(),
    serie: "A",
    folio: String(folio),
    issuedAt: instantAt(day, minuteOfDay),
    issuerRfc: spec.rfc,
    issuerName: spec.legalName,
    receiverRfc: company.rfc,
    subtotal: round2(subtotal),
    iva,
    total: round2(subtotal + iva),
    paymentMethod: spec.termsDays > 15 ? "PPD" : "PUE",
    paymentForm: "03",
    issuePlace: ISSUE_POSTAL_CODE,
    synthetic: true,
  };
}

export interface SettleOptions {
  /** The account the money actually went to. */
  beneficiaryAccount: Clabe;
  /** The day the first payment left. Moved to the next working day if needed. */
  paidDay: string;
  /**
   * How many partial payments settle this invoice. A PPD invoice is routinely
   * settled in two, each with its own complement and its own CtaBeneficiario, and
   * the duplicate detector has to read two complements on one CFDI as one payable
   * rather than as a double payment.
   */
  instalments?: 1 | 2;
}

/**
 * The complements that settle one invoice, in the order they were issued.
 *
 * `paymentTotal` and `operationNumber` are deliberately left unset here: they belong
 * to the SPEI, not to the invoice, and one SPEI routinely settles several invoices.
 * The transfer pass in ./mirror.ts groups the complements into transfers and stamps
 * both fields, which is also what guarantees that the clave de rastreo on a
 * complement names a row that exists in the bank mirror.
 */
export function settleCfdi(
  rng: Rng,
  cfdi: Cfdi,
  options: SettleOptions,
): PaymentComplement[] {
  const bankRfc = syntheticBankRfc(bankCodeOf(options.beneficiaryAccount));
  const firstDay = nextBusinessDay(options.paidDay);
  const totalCents = cents(cfdi.total);

  if ((options.instalments ?? 1) === 1) {
    return [
      {
        uuid: rng.uuid(),
        relatedCfdiUuid: cfdi.uuid,
        paidAt: instantAt(firstDay, SPEI_MINUTE),
        paidAmount: cfdi.total,
        beneficiaryAccount: options.beneficiaryAccount,
        beneficiaryBankRfc: bankRfc,
        synthetic: true,
      },
    ];
  }

  // A first payment between a third and two thirds, the rest a fortnight later. The
  // split is exact in cents, so the two shares add back to the invoice total and the
  // reconciliation has nothing to round away.
  const firstCents = Math.round(totalCents * (0.35 + rng.next() * 0.3));
  const secondDay = addBusinessDays(firstDay, rng.int(8, 14));
  return [
    {
      uuid: rng.uuid(),
      relatedCfdiUuid: cfdi.uuid,
      paidAt: instantAt(firstDay, SPEI_MINUTE),
      paidAmount: fromCents(firstCents),
      beneficiaryAccount: options.beneficiaryAccount,
      beneficiaryBankRfc: bankRfc,
      synthetic: true,
    },
    {
      uuid: rng.uuid(),
      relatedCfdiUuid: cfdi.uuid,
      paidAt: instantAt(secondDay, SPEI_MINUTE),
      paidAmount: fromCents(totalCents - firstCents),
      beneficiaryAccount: options.beneficiaryAccount,
      beneficiaryBankRfc: bankRfc,
      synthetic: true,
    },
  ];
}

export interface MakeInstructionOptions {
  supplierRfc: Rfc;
  cfdiUuids: string[];
  clabe: Clabe;
  amount: number;
  source: PaymentInstruction["source"];
  receivedAt: string;
  text?: string;
  imageRef?: string;
  ocrConfidence?: number;
}

/**
 * One line of the payment run. The id is provisional: ./generator.ts sorts the run
 * and numbers it at the end, so the ids run in the order the clerk sees the lines.
 * A run where line 3 is called INS-055 is a run somebody has to explain on stage.
 */
export function makeInstruction(
  options: MakeInstructionOptions,
): PaymentInstruction {
  return {
    id: "INS-unnumbered",
    supplierRfc: options.supplierRfc,
    cfdiUuids: options.cfdiUuids,
    clabe: options.clabe,
    amount: options.amount,
    source: options.source,
    receivedAt: options.receivedAt,
    ...(options.text === undefined ? {} : { text: options.text }),
    ...(options.imageRef === undefined ? {} : { imageRef: options.imageRef }),
    ...(options.ocrConfidence === undefined
      ? {}
      : { ocrConfidence: options.ocrConfidence }),
    synthetic: true,
  };
}

/**
 * The day an invoice becomes payable, from the supplier's terms. Calendar days, not
 * working days, because that is how "30 dias fecha factura" is actually written on
 * the invoice; the run that settles it is the one that lands after it.
 */
export function dueDayOf(
  issuedDay: string,
  spec: SentryOneSupplierSpec,
): string {
  return addDays(issuedDay, spec.termsDays);
}

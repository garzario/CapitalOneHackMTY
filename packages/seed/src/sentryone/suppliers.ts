/**
 * The supplier catalogue of the demo company: 42 metalmecanica suppliers in the
 * Monterrey metropolitan area.
 *
 * Everything here is invented. Every RFC carries the `SYN` prefix and every object
 * the generator builds from these rows carries `synthetic: true`, which is what the
 * UI watermarks from, per ADR-0002. The municipalities are real places; the companies
 * are not, and the names are composed from a trade word plus a place so that nothing
 * in the list is a copy of a real firm's name.
 *
 * The rows are literals rather than drawn from the RNG on purpose. A catalogue that is
 * generated changes the moment anyone touches the draw order, and the demo script
 * names specific suppliers out loud. These forty-two are stable, greppable and
 * diffable, and the RNG is used for everything that happens to them instead.
 *
 * Each row is a generator knob, not decoration:
 *
 * - `invoicesPerMonth` and `ticket` set the cadence and the size, which is what the
 *   `supplier_behaviour` detector measures drift against. A supplier that issues one
 *   invoice a month has no baseline worth computing, and the detector has to say so
 *   rather than reporting a 300 per cent jump off a sample of three.
 * - `termsDays` decides when the invoice turns into a line on a payment run.
 * - `invoicesPerMonth`, `ticket` and `termsDays` together also price what a day of
 *   delay costs us with this supplier, in ./delay-cost.ts, because the balance we owe
 *   them and the payment about to leave are both read off the cadence. Editing a row
 *   moves that figure, and on one line of the reference run that figure is what
 *   decides whether the payment is released.
 * - `tenureMonths` is how long they have been a supplier before the generated window
 *   starts. It is deliberately longer than the window for most of them, so
 *   `firstInvoiceAt` is not the same date for everybody, which is the tell of a
 *   generator nobody thought about.
 * - `clabe` is the account we have historically paid: a real eighteen-digit CLABE with
 *   a correct 3-7-1 check digit, because the forensics detector must be exercised by
 *   accounts that pass the arithmetic and fail on something more interesting.
 *
 * The arithmetic the catalogue has to satisfy, asserted in sentryone.test.ts:
 *
 * - `invoicesPerMonth` sums to 439, so a weekly payment run carries about 101 lines,
 *   which is inside the 70 to 110 the brief asks for. The run is not padded to hit a
 *   number: the number falls out of the cadence.
 * - At the median of each ticket range that is about 3.9 million MXN of supplier
 *   spend a month. For a 28-person shop that is the right order of magnitude, and it
 *   is the figure to quote when a judge asks whether the data is sized like a real
 *   company instead of like a demo.
 * - The shape is a long tail: five suppliers carry a third of the spend across ten
 *   invoices a month, and twenty-eight carry a third across nearly four hundred. A
 *   generator that gives every supplier the same cadence makes concentration drift
 *   undetectable, which is exactly what one of the six detectors is looking for.
 */

import type { Clabe, Rfc } from "@hackmty/core";
import { AMOUNT_MEDIAN_POSITION } from "../rng";

/** What the supplier sells us. Drives cadence, ticket size and seasonality. */
export type SupplierSegment =
  | "acero"
  | "empaque"
  | "epp"
  | "fundicion"
  | "herramentales"
  | "insumos"
  | "laminados"
  | "mantenimiento"
  | "maquinados"
  | "perfiles"
  | "plasticos"
  | "recubrimientos"
  | "servicios"
  | "soldadura"
  | "tornilleria"
  | "transporte"
  | "troquelados";

export interface SentryOneSupplierSpec {
  rfc: Rfc;
  legalName: string;
  /** A municipality of the Monterrey metropolitan area. Real place, invented company. */
  city: string;
  segment: SupplierSegment;
  /** Average invoices per month. The draw is Poisson-ish around this. */
  invoicesPerMonth: number;
  /** Ticket range in MXN. Amounts are drawn lognormal inside it, never uniform. */
  ticket: { min: number; max: number };
  /** Days from invoice date to the payment run that settles it. */
  termsDays: number;
  /** Months of history before the generated window starts. */
  tenureMonths: number;
  /** The account we have historically paid. Valid check digit. */
  clabe: Clabe;
  /**
   * Overrides the date the relationship started, for a supplier that did not exist
   * when the window opened. No row of the catalogue sets it; the ramping-supplier
   * hard negative does, because "they were not here four months ago" is the whole
   * point of that case and it cannot be expressed as tenure before the window.
   */
  firstInvoiceDay?: string;
}

/**
 * What a plant buys more of during a shutdown: consumables, fasteners, protective
 * equipment, freight. Tooling and castings are ordered months ahead and do not move,
 * which is exactly why a seasonal spike is not a behaviour change: it moves one half
 * of the catalogue and leaves the other half flat.
 */
export const CONSUMABLE_SEGMENTS: readonly SupplierSegment[] = [
  "empaque",
  "epp",
  "insumos",
  "mantenimiento",
  "soldadura",
  "tornilleria",
  "transporte",
];

/**
 * Forty-two suppliers. The count is the brief's, and it is also roughly what a
 * 28-person metalworking shop actually carries: enough that a clerk cannot hold every
 * account number in their head, which is the entire reason the product exists.
 */
export const SENTRYONE_SUPPLIERS: readonly SentryOneSupplierSpec[] = [
  {
    rfc: "SYN980101S01",
    legalName: "Aceros y Laminas del Norte SA de CV",
    city: "Santa Catarina",
    segment: "acero",
    invoicesPerMonth: 3,
    ticket: { min: 90000, max: 320000 },
    termsDays: 30,
    tenureMonths: 64,
    clabe: "072580100000000005",
  },
  {
    rfc: "SYN990202S02",
    legalName: "Maquinados Industriales Regios SA de CV",
    city: "Apodaca",
    segment: "maquinados",
    invoicesPerMonth: 7,
    ticket: { min: 9000, max: 52000 },
    termsDays: 30,
    tenureMonths: 58,
    clabe: "012580100091764611",
  },
  {
    rfc: "SYN000303S03",
    legalName: "Troquelados de Pesqueria SA de CV",
    city: "Pesqueria",
    segment: "troquelados",
    invoicesPerMonth: 9,
    ticket: { min: 2800, max: 14000 },
    termsDays: 45,
    tenureMonths: 41,
    clabe: "058598100183529228",
  },
  {
    rfc: "SYN010404S04",
    legalName: "Fundiciones Guadalupe S de RL de CV",
    city: "Guadalupe",
    segment: "fundicion",
    invoicesPerMonth: 2,
    ticket: { min: 55000, max: 190000 },
    termsDays: 45,
    tenureMonths: 72,
    clabe: "072580100275293838",
  },
  {
    rfc: "SYN020505S05",
    legalName: "Soldaduras y Montajes Escobedo SA de CV",
    city: "Escobedo",
    segment: "soldadura",
    invoicesPerMonth: 14,
    ticket: { min: 1800, max: 9500 },
    termsDays: 15,
    tenureMonths: 36,
    clabe: "014580100367058444",
  },
  {
    rfc: "SYN030606S06",
    legalName: "Recubrimientos Electroliticos del Poniente SA de CV",
    city: "Garcia",
    segment: "recubrimientos",
    invoicesPerMonth: 11,
    ticket: { min: 1400, max: 7200 },
    termsDays: 30,
    tenureMonths: 29,
    clabe: "002580100458823053",
  },
  {
    rfc: "SYN040707S07",
    legalName: "Tornilleria y Sujetadores Apodaca SA de CV",
    city: "Apodaca",
    segment: "tornilleria",
    invoicesPerMonth: 26,
    ticket: { min: 480, max: 3200 },
    termsDays: 15,
    tenureMonths: 81,
    clabe: "012580100550587669",
  },
  {
    rfc: "SYN050808S08",
    legalName: "Perfiles Estructurales Monterrey SA de CV",
    city: "Monterrey",
    segment: "perfiles",
    invoicesPerMonth: 4,
    ticket: { min: 15000, max: 78000 },
    termsDays: 30,
    tenureMonths: 67,
    clabe: "072580100642352276",
  },
  {
    rfc: "SYN060909S09",
    legalName: "Herramentales de Precision San Nicolas SA de CV",
    city: "San Nicolas de los Garza",
    segment: "herramentales",
    invoicesPerMonth: 4,
    ticket: { min: 9000, max: 48000 },
    termsDays: 60,
    tenureMonths: 52,
    clabe: "058580100734116881",
  },
  {
    rfc: "SYN071010S10",
    legalName: "Laminados en Frio del Noreste SA de CV",
    city: "Santa Catarina",
    segment: "laminados",
    invoicesPerMonth: 5,
    ticket: { min: 11000, max: 56000 },
    termsDays: 30,
    tenureMonths: 47,
    clabe: "014580100825881496",
  },
  {
    rfc: "SYN081111S11",
    legalName: "Transportes Industriales Juarez S de RL de CV",
    city: "Juarez",
    segment: "transporte",
    invoicesPerMonth: 30,
    ticket: { min: 950, max: 5200 },
    termsDays: 15,
    tenureMonths: 55,
    clabe: "127580100917646106",
  },
  {
    rfc: "SYN091212S12",
    legalName: "Empaques y Tarimas del Noreste SA de CV",
    city: "Apodaca",
    segment: "empaque",
    invoicesPerMonth: 21,
    ticket: { min: 620, max: 3400 },
    termsDays: 15,
    tenureMonths: 44,
    clabe: "002580101009410717",
  },
  {
    rfc: "SYN100113S13",
    legalName: "Mantenimiento Electromecanico Regio SA de CV",
    city: "Monterrey",
    segment: "mantenimiento",
    invoicesPerMonth: 12,
    ticket: { min: 2100, max: 11000 },
    termsDays: 30,
    tenureMonths: 38,
    clabe: "012580101101175322",
  },
  {
    rfc: "SYN110214S14",
    legalName: "Equipo de Proteccion Industrial del Norte SA de CV",
    city: "Guadalupe",
    segment: "epp",
    invoicesPerMonth: 12,
    ticket: { min: 740, max: 4100 },
    termsDays: 30,
    tenureMonths: 33,
    clabe: "044580101192939930",
  },
  {
    rfc: "SYN120315S15",
    legalName: "Gases Industriales Santa Catarina SA de CV",
    city: "Santa Catarina",
    segment: "insumos",
    invoicesPerMonth: 24,
    ticket: { min: 1100, max: 5800 },
    termsDays: 15,
    tenureMonths: 76,
    clabe: "072580101284704540",
  },
  {
    rfc: "SYN130416S16",
    legalName: "Rectificaciones y Baleros Escobedo S de RL de CV",
    city: "Escobedo",
    segment: "maquinados",
    invoicesPerMonth: 10,
    ticket: { min: 2400, max: 12500 },
    termsDays: 30,
    tenureMonths: 26,
    clabe: "058580101376469157",
  },
  {
    rfc: "SYN140517S17",
    legalName: "Corte por Laser Apodaca SA de CV",
    city: "Apodaca",
    segment: "maquinados",
    invoicesPerMonth: 7,
    ticket: { min: 5000, max: 31000 },
    termsDays: 30,
    tenureMonths: 31,
    clabe: "012580101468233761",
  },
  {
    rfc: "SYN150618S18",
    legalName: "Aceros Inoxidables del Poniente SA de CV",
    city: "Garcia",
    segment: "acero",
    invoicesPerMonth: 2,
    ticket: { min: 70000, max: 240000 },
    termsDays: 45,
    tenureMonths: 49,
    clabe: "014580101559998379",
  },
  {
    rfc: "SYN160719S19",
    legalName: "Galvanizados Pesqueria SA de CV",
    city: "Pesqueria",
    segment: "recubrimientos",
    invoicesPerMonth: 7,
    ticket: { min: 3600, max: 18000 },
    termsDays: 45,
    tenureMonths: 22,
    clabe: "002598101651762986",
  },
  {
    rfc: "SYN170820S20",
    legalName: "Inyeccion de Plasticos Tecnicos Regios SA de CV",
    city: "Apodaca",
    segment: "plasticos",
    invoicesPerMonth: 9,
    ticket: { min: 2900, max: 15000 },
    termsDays: 30,
    tenureMonths: 40,
    clabe: "072580101743527598",
  },
  {
    rfc: "SYN180921S21",
    legalName: "Bandas y Transmisiones del Noreste SA de CV",
    city: "Monterrey",
    segment: "insumos",
    invoicesPerMonth: 19,
    ticket: { min: 860, max: 4700 },
    termsDays: 15,
    tenureMonths: 61,
    clabe: "012580101835292209",
  },
  {
    rfc: "SYN191022S22",
    legalName: "Estructuras Metalicas Santa Catarina SA de CV",
    city: "Santa Catarina",
    segment: "perfiles",
    invoicesPerMonth: 2,
    ticket: { min: 80000, max: 300000 },
    termsDays: 60,
    tenureMonths: 57,
    clabe: "058580101927056812",
  },
  {
    rfc: "SYN201123S23",
    legalName: "Tratamientos Termicos del Norte S de RL de CV",
    city: "San Nicolas de los Garza",
    segment: "recubrimientos",
    invoicesPerMonth: 8,
    ticket: { min: 2200, max: 11500 },
    termsDays: 30,
    tenureMonths: 35,
    clabe: "014580102018821423",
  },
  {
    rfc: "SYN211224S24",
    legalName: "Suministros Hidraulicos Juarez SA de CV",
    city: "Juarez",
    segment: "insumos",
    invoicesPerMonth: 16,
    ticket: { min: 1150, max: 6200 },
    termsDays: 15,
    tenureMonths: 28,
    clabe: "044580102110586034",
  },
  {
    rfc: "SYN220125S25",
    legalName: "Moldes y Dados Monterrey SA de CV",
    city: "Monterrey",
    segment: "herramentales",
    invoicesPerMonth: 1,
    ticket: { min: 75000, max: 260000 },
    termsDays: 60,
    tenureMonths: 69,
    clabe: "072580102202350645",
  },
  {
    rfc: "SYN980226S26",
    legalName: "Pailerias y Tanques Garcia SA de CV",
    city: "Garcia",
    segment: "soldadura",
    invoicesPerMonth: 2,
    ticket: { min: 32000, max: 130000 },
    termsDays: 45,
    tenureMonths: 24,
    clabe: "012580102294115256",
  },
  {
    rfc: "SYN990327S27",
    legalName: "Alambres y Mallas del Noreste SA de CV",
    city: "Escobedo",
    segment: "acero",
    invoicesPerMonth: 11,
    ticket: { min: 1700, max: 9000 },
    termsDays: 30,
    tenureMonths: 50,
    clabe: "002580102385879864",
  },
  {
    rfc: "SYN000428S28",
    legalName: "Servicios de Pintura Industrial Regia SA de CV",
    city: "Apodaca",
    segment: "recubrimientos",
    invoicesPerMonth: 8,
    ticket: { min: 1600, max: 8400 },
    termsDays: 30,
    tenureMonths: 19,
    clabe: "127580102477644471",
  },
  {
    rfc: "SYN010501S29",
    legalName: "Rodamientos y Retenes San Nicolas SA de CV",
    city: "San Nicolas de los Garza",
    segment: "insumos",
    invoicesPerMonth: 22,
    ticket: { min: 530, max: 2900 },
    termsDays: 15,
    tenureMonths: 63,
    clabe: "058580102569409088",
  },
  {
    rfc: "SYN020602S30",
    legalName: "Calibracion y Metrologia del Norte S de RL de CV",
    city: "Monterrey",
    segment: "servicios",
    invoicesPerMonth: 3,
    ticket: { min: 4800, max: 24000 },
    termsDays: 30,
    tenureMonths: 43,
    clabe: "014580102661173696",
  },
  {
    rfc: "SYN030703S31",
    legalName: "Chatarra y Reciclado Metalico Regio SA de CV",
    city: "Juarez",
    segment: "acero",
    invoicesPerMonth: 8,
    ticket: { min: 2600, max: 13500 },
    termsDays: 15,
    tenureMonths: 37,
    clabe: "072580102752938300",
  },
  {
    rfc: "SYN040804S32",
    legalName: "Motores y Reductores del Poniente SA de CV",
    city: "Garcia",
    segment: "insumos",
    invoicesPerMonth: 10,
    ticket: { min: 2300, max: 12000 },
    termsDays: 30,
    tenureMonths: 32,
    clabe: "012580102844702912",
  },
  {
    rfc: "SYN050905S33",
    legalName: "Cortes de Placa Pesqueria S de RL de CV",
    city: "Pesqueria",
    segment: "maquinados",
    invoicesPerMonth: 9,
    ticket: { min: 3100, max: 16000 },
    termsDays: 30,
    tenureMonths: 21,
    clabe: "002598102936467523",
  },
  {
    rfc: "SYN061006S34",
    legalName: "Extrusiones de Aluminio del Noreste SA de CV",
    city: "Santa Catarina",
    segment: "laminados",
    invoicesPerMonth: 3,
    ticket: { min: 13000, max: 62000 },
    termsDays: 45,
    tenureMonths: 54,
    clabe: "044580103028232136",
  },
  {
    rfc: "SYN071107S35",
    legalName: "Herreria y Forja Guadalupe SA de CV",
    city: "Guadalupe",
    segment: "soldadura",
    invoicesPerMonth: 11,
    ticket: { min: 1300, max: 6800 },
    termsDays: 15,
    tenureMonths: 46,
    clabe: "058580103119996746",
  },
  {
    rfc: "SYN081208S36",
    legalName: "Consumibles de Soldadura Apodaca SA de CV",
    city: "Apodaca",
    segment: "insumos",
    invoicesPerMonth: 28,
    ticket: { min: 410, max: 2600 },
    termsDays: 15,
    tenureMonths: 70,
    clabe: "012580103211761352",
  },
  {
    rfc: "SYN090109S37",
    legalName: "Logistica y Maniobras del Norte SA de CV",
    city: "Escobedo",
    segment: "transporte",
    invoicesPerMonth: 20,
    ticket: { min: 780, max: 4300 },
    termsDays: 15,
    tenureMonths: 27,
    clabe: "127580103303525964",
  },
  {
    rfc: "SYN100210S38",
    legalName: "Resortes Industriales Monterrey S de RL de CV",
    city: "Monterrey",
    segment: "troquelados",
    invoicesPerMonth: 9,
    ticket: { min: 1900, max: 9800 },
    termsDays: 30,
    tenureMonths: 59,
    clabe: "072580103395290572",
  },
  {
    rfc: "SYN110311S39",
    legalName: "Automatizacion y Control Regio SA de CV",
    city: "San Nicolas de los Garza",
    segment: "servicios",
    invoicesPerMonth: 2,
    ticket: { min: 20000, max: 95000 },
    termsDays: 45,
    tenureMonths: 30,
    clabe: "014580103487055188",
  },
  {
    rfc: "SYN120412S40",
    legalName: "Fundicion de Aluminio Garcia SA de CV",
    city: "Garcia",
    segment: "fundicion",
    invoicesPerMonth: 2,
    ticket: { min: 24000, max: 110000 },
    termsDays: 45,
    tenureMonths: 23,
    clabe: "002580103578819795",
  },
  {
    rfc: "SYN130513S41",
    legalName: "Maquilas Metalicas del Noreste SA de CV",
    city: "Apodaca",
    segment: "maquinados",
    invoicesPerMonth: 8,
    ticket: { min: 5500, max: 33000 },
    termsDays: 30,
    tenureMonths: 42,
    clabe: "058580103670584406",
  },
  {
    rfc: "SYN140614S42",
    legalName: "Refacciones Neumaticas Juarez SA de CV",
    city: "Juarez",
    segment: "insumos",
    invoicesPerMonth: 18,
    ticket: { min: 670, max: 3700 },
    termsDays: 15,
    tenureMonths: 34,
    clabe: "012580103762349016",
  },
];

/**
 * The median ticket of a supplier, in pesos of subtotal.
 *
 * The middle of the lognormal `rng.amount` draws inside the range, which is why the
 * position comes from ../rng.ts rather than from a half here. Three callers need it
 * and none of them may draw: the ramp sizes its cadence off it before a single
 * invoice exists, the delay cost prices the relationship off it, and the catalogue
 * arithmetic in the header is quoted at it. Two copies of this half would be two
 * different medians.
 */
export function medianTicket(spec: SentryOneSupplierSpec): number {
  return (
    spec.ticket.min +
    (spec.ticket.max - spec.ticket.min) * AMOUNT_MEDIAN_POSITION
  );
}

/** Every synthetic RFC in the catalogue, for the invariants test and for the seeder. */
export const SENTRYONE_SUPPLIER_RFCS: readonly string[] =
  SENTRYONE_SUPPLIERS.map((supplier) => supplier.rfc);

export function findSupplierSpec(
  rfc: string,
): SentryOneSupplierSpec | undefined {
  return SENTRYONE_SUPPLIERS.find((supplier) => supplier.rfc === rfc);
}

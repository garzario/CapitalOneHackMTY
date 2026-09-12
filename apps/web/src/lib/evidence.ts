/**
 * Reading a finding's evidence, whoever wrote it.
 *
 * There are three evidence vocabularies in this repository and the screens
 * understood exactly one of them:
 *
 * 1. `apps/web/src/lib/mock.ts`, the offline synthetic run, writes Spanish
 *    snake_case: `clabe_propuesta`, `estado`, `uuid_original`.
 * 2. The detectors in `packages/core` and `packages/engine` write English
 *    camelCase: `nearestKnownAccount`, `status`, `originalUuid`.
 * 3. The in-memory repository behind the API in `apps/api/src/synthetic.ts`
 *    writes a third set again: `knownClabe`, `otherUuid`, `previousBankCode`.
 *
 * The finding panel was built against the first, which is the one it never
 * meets in front of a judge. Pointed at the running API it drew no account
 * comparison at all, and every chip read as an English variable name in a
 * Spanish interface. That is the exact failure the judging brief warns about:
 * a demo that looks finished offline and comes apart on its own backend.
 *
 * So this module is the one place that knows all three, and the components
 * read a view model instead of reaching into `finding.evidence`.
 *
 * The right fix is one vocabulary. Until the three agree, this module is the
 * seam, and the test below fails the build when a producer grows a key nobody
 * translated, so the gap is loud instead of silent.
 */

import type {
  Finding,
  NetworkSignal,
  NetworkVerdict,
  SatListStatus,
} from "@hackmty/core";
import { assessNetwork, networkLabel } from "@hackmty/core";
import { diffPositions, formatDecimal } from "./format";
import { bankNameFromCode } from "./mock";

/** Concepts that get their own rendering instead of becoming a chip. */
const ALIASES = {
  knownClabe: ["clabe_conocida", "nearestKnownAccount", "knownClabe"],
  proposedClabe: ["clabe_propuesta", "proposedClabe"],
  differingPositions: ["posiciones", "differingPositions"],
  bankTo: ["institutionName", "bankCode"],
  bankFrom: ["previousInstitutionNames", "previousBankCode"],
  satStatus: ["estado", "status"],
  satPublishedAt: ["publicado_en_dof", "publishedAt"],
  satListVersion: ["version_lista", "listVersion"],
  duplicateUuid: ["uuid_original", "originalUuid", "otherUuid"],
  duplicateFolio: ["folio_original", "originalFolio", "otherFolio"],
  /** The consortium signal. One object, rendered as its own line. */
  network: ["network"],
} as const satisfies Record<string, readonly string[]>;

/** A bank reported as a three-digit code is named; anything else is passed on. */
function bankLabel(value: string): string {
  return /^[0-9]{3}$/.test(value) ? bankNameFromCode(value) : value;
}

/**
 * Spanish for every key the detectors emit. The interface is read by a clerk
 * in Monterrey, so a chip that says `previousInstitutionNames` is not evidence,
 * it is a leak of our variable names.
 */
const LABELS: Record<string, string> = {
  // Article 69-B
  rfc: "RFC",
  statusLabel: "estado en la lista",
  listedNow: "en la lista hoy",
  rowsHeld: "filas en la lista",
  paidCfdis: "facturas ya deducidas",
  deductedBase: "base deducida",
  retroactiveExposure: "exposicion retroactiva",
  cfdis_ya_deducidos: "facturas ya deducidas",
  base_deducida: "base deducida",

  // CLABE forensics
  signals: "senales",
  institutionCode: "codigo de banco",
  plazaCode: "plaza",
  previousPlazaCodes: "plazas previas",
  previousInstitutionCodes: "codigos de banco previos",
  checkDigit: "digito de control",
  expectedCheckDigit: "digito de control esperado",
  knownAccounts: "cuentas conocidas",
  timesPaid: "veces pagada",
  establishedBy: "origen de la cuenta",
  nearestTimesPaid: "veces pagada la mas parecida",
  editOperations: "digitos que cambian",
  ocrSubstitutions: "confusiones tipicas de OCR",
  institutionCatalogue: "catalogo de Banxico",
  ocrChannel: "canal de la imagen",
  ocrConfidence: "confianza del OCR",
  problem: "problema",
  digits: "digitos",
  digitos_distintos: "digitos que cambian",
  mismo_banco: "mismo banco",
  digito_control_valido: "digito de control valido",
  pagos_previos_a_esta_cuenta: "pagos previos a esta cuenta",
  canal: "canal",

  // Duplicates
  rule: "regla",
  issuerRfc: "RFC emisor",
  uuid: "UUID",
  serie: "serie",
  folio: "folio",
  copies: "copias",
  daysApart: "dias de diferencia",
  windowDays: "ventana en dias",
  total: "importe",
  totalsMatch: "importes iguales",
  originalIssuedAt: "fecha de la original",
  originalTotal: "importe de la original",
  candidateIssuedAt: "fecha de esta",
  candidateTotal: "importe de esta",
  complementUuid: "UUID del complemento",
  complements: "complementos de pago",
  paidAmount: "ya pagado",
  lastPaidAt: "ultimo pago",
  coverage: "cobertura",
  beneficiaryAccount: "cuenta beneficiaria",
  diferencia_dias: "dias de diferencia",
  importe: "importe",
  conceptos_identicos: "conceptos identicos",

  // Supplier behaviour
  baselineStart: "inicio del historial",
  baselineEnd: "fin del historial",
  recentStart: "inicio del periodo reciente",
  recentEnd: "fin del periodo reciente",
  baselineInvoices: "facturas en el historial",
  baselineExposureWeeks: "semanas de historial",
  baselineRatePerWeek: "facturas por semana",
  baselineMedianAmount: "importe mediano",
  baselineLogSigma: "dispersion logaritmica",
  baselineAmount: "importe del historial",
  baselineShare: "concentracion previa",
  recentInvoices: "facturas recientes",
  expectedInvoices: "facturas esperadas",
  ratePValue: "valor p de la tasa",
  recentMaxAmount: "importe reciente mayor",
  amountZScore: "z del importe",
  recentAmount: "importe reciente",
  meses_de_historia: "meses de historia",

  // The API's in-memory repository writes its own names for the same facts
  accountDigitsChanged: "digitos que cambian",
  checkDigitValid: "digito de control valido",
  timesPaidToKnownAccount: "veces pagada la cuenta conocida",
  channel: "canal",
  gatedBySampleSize: "limitado por el tamano de la muestra",
  ratioToMedian: "veces la mediana",
  sampleSize: "tamano de la muestra",
  instructionsThisRun: "instrucciones en esta corrida",
  nameMatch: "coincidencia del nombre",
  signatureValid: "firma valida",
  claveRastreo: "clave de rastreo",
  verifiedAt: "verificado el",
  matchedDocuments: "documentos que empatan",
  outflowAmount: "importe de la salida",
  outflowDate: "fecha de la salida",

  // The SentryOne consortium. `network` itself is rendered on its own line.
  networkVerdict: "red SentryOne",
  networkAdjustment: "ajuste por la red",
  networkTenants: "empresas que la pagan",
  networkMonths: "meses en la red",
  networkFraudReports: "reportes de fraude",
  networkOtherAccounts: "otras cuentas del proveedor",

  // Bank reconciliation
  case: "caso",
  ledgerTxId: "movimiento del banco",
  accountId: "cuenta",
  day: "dia",
  amount: "importe",
  source: "origen",
  documentsConsidered: "documentos revisados",
  toleranceMxn: "tolerancia",
  documentKind: "tipo de documento",
  documentId: "documento",
  cfdiUuid: "UUID del CFDI",
  supplierRfc: "RFC del proveedor",
  expectedAmount: "importe esperado",
  expectedDay: "dia esperado",
  matchedOutflowId: "salida asociada",
  matchedOutflowDay: "dia de la salida",
  instructionId: "instruccion",
  sentAt: "enviado",
  sentDay: "dia de envio",
  outflowsNearby: "salidas cercanas",
  outflows: "salidas",
};

export interface ClabeComparison {
  proposed: string;
  known: string;
  /** Zero-based positions that differ, as the detector reported them. */
  differing: number[];
}

export interface BankChange {
  from: string;
  to: string;
}

export interface SatStatusEvidence {
  status: SatListStatus;
  publishedAt: string | null;
  listVersion: string | null;
}

export interface DuplicateOrigin {
  uuid: string | null;
  folio: string | null;
}

export interface EvidenceChip {
  key: string;
  label: string;
  value: string;
}

/**
 * The consortium signal, ready to render as one line.
 *
 * `label` comes from `networkLabel` in `@hackmty/core` rather than from this file,
 * so the screen and the finding's own explanation say the same thing about the
 * same signal. `verdict` is here because the line is painted by what the network
 * said, not by the finding's severity: a fraud report has to look different from
 * corroboration even on a finding that is critical for another reason.
 */
export interface NetworkEvidence {
  label: string;
  verdict: NetworkVerdict;
  /** Absent when the network was never consulted on this instance. */
  pulledAt: string | null;
}

export interface EvidenceView {
  clabe: ClabeComparison | null;
  bankChange: BankChange | null;
  satStatus: SatStatusEvidence | null;
  duplicateOf: DuplicateOrigin | null;
  network: NetworkEvidence | null;
  chips: EvidenceChip[];
}

const SAT_STATUSES: readonly SatListStatus[] = [
  "presunto",
  "desvirtuado",
  "definitivo",
  "sentencia_favorable",
];

function firstString(
  evidence: Finding["evidence"],
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = evidence[key];
    if (typeof value === "string" && value.length > 0) return value;
  }

  return null;
}

/** `"7, 16"` and `"7,16"` are both written by detectors that exist today. */
function parsePositions(raw: string): number[] {
  return raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 0);
}

/** A key nobody has translated yet, spaced so it is at least readable. */
function fallbackLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

function renderValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "si" : "no";
  if (typeof value === "number") return formatDecimal(value);

  return value;
}

/** True for the one compound evidence value the domain has. */
function isNetworkSignal(value: unknown): value is NetworkSignal {
  if (value === null || typeof value !== "object") return false;
  const signal = value as Partial<NetworkSignal>;

  return (
    (signal.source === "snapshot" || signal.source === "not_consulted") &&
    typeof signal.tenants === "number" &&
    typeof signal.fraudReports === "number" &&
    typeof signal.otherAccounts === "number"
  );
}

/**
 * The network signal a detector attached, as one line.
 *
 * `null` when the finding carries none at all, which is every finding written
 * before the consortium landed and every finding from a detector that has nothing
 * to do with a beneficiary. One that carries a `not_consulted` signal is NOT null: it
 * renders as "no consultada", because a clerk has to be able to tell a network
 * that said nothing from a network nobody asked.
 */
function readNetwork(evidence: Finding["evidence"]): NetworkEvidence | null {
  const value = evidence.network;
  if (!isNetworkSignal(value)) return null;

  return {
    label: networkLabel(value),
    verdict: assessNetwork(value).verdict,
    pulledAt: value.pulledAt ?? null,
  };
}

/**
 * Turns a finding's evidence into something a component can render, in a
 * stable order, with the four facts issue #47 names pulled out of the chip
 * list so they can be shown as what they are.
 *
 * `proposedClabe` comes from the payment instruction. The detectors do not put
 * it in the evidence record because it is already on the instruction, so a
 * caller that has one passes it and a caller that does not gets no comparison
 * rather than a wrong one.
 */
export function readEvidence(
  finding: Finding,
  proposedClabe?: string,
): EvidenceView {
  const { evidence } = finding;
  const consumed = new Set<string>();

  const take = (keys: readonly string[]): string | null => {
    const value = firstString(evidence, keys);
    for (const key of keys) {
      if (key in evidence) consumed.add(key);
    }

    return value;
  };

  const known = take(ALIASES.knownClabe);
  const proposed = take(ALIASES.proposedClabe) ?? proposedClabe ?? null;
  const reported = take(ALIASES.differingPositions);

  const clabe: ClabeComparison | null =
    known !== null && proposed !== null
      ? {
          proposed,
          known,
          /* The detector already did this arithmetic and it knows about OCR
             substitutions, so its answer wins. Recomputing is the fallback for
             the offline run, not the primary path. */
          differing:
            reported !== null
              ? parsePositions(reported)
              : diffPositions(proposed, known),
        }
      : null;

  const bankTo = take(ALIASES.bankTo);
  const bankFrom = take(ALIASES.bankFrom);
  const bankChange: BankChange | null =
    bankFrom !== null && bankTo !== null && bankFrom !== bankTo
      ? { from: bankLabel(bankFrom), to: bankLabel(bankTo) }
      : null;

  const rawStatus = take(ALIASES.satStatus);
  const publishedAt = take(ALIASES.satPublishedAt);
  const listVersion = take(ALIASES.satListVersion);
  const satStatus: SatStatusEvidence | null = SAT_STATUSES.includes(
    rawStatus as SatListStatus,
  )
    ? { status: rawStatus as SatListStatus, publishedAt, listVersion }
    : null;

  const duplicateUuid = take(ALIASES.duplicateUuid);
  const duplicateFolio = take(ALIASES.duplicateFolio);
  const duplicateOf: DuplicateOrigin | null =
    duplicateUuid !== null || duplicateFolio !== null
      ? { uuid: duplicateUuid, folio: duplicateFolio }
      : null;

  const network = readNetwork(evidence);
  for (const key of ALIASES.network) {
    if (key in evidence) consumed.add(key);
  }

  const chips: EvidenceChip[] = Object.entries(evidence)
    .filter(([key]) => !consumed.has(key))
    /* A compound value has its own rendering or it has none: printing an object
       as a chip is how a panel ends up saying "[object Object]" at a clerk. */
    .filter(([, value]) => typeof value !== "object")
    .map(([key, value]) => ({
      key,
      label: LABELS[key] ?? fallbackLabel(key),
      value: renderValue(value as string | number | boolean),
    }));

  return { clabe, bankChange, satStatus, duplicateOf, network, chips };
}

/** Exported for the test that keeps the dictionary honest. */
export const EVIDENCE_LABELS = LABELS;
export const EVIDENCE_ALIASES = ALIASES;

/**
 * The two constancias.
 *
 * A constancia is the retention artifact: the accountant files it, and eighteen
 * months later, when the SAT asks why a deduction was taken or why a payment
 * was held, it is the piece of paper that answers. That is what shapes every
 * decision in this file.
 *
 * - It states what was checked, not only what was found. "Twelve suppliers were
 *   matched against version 2025-12-31 of the list and one of them was on it"
 *   is an answer; "one supplier was on the list" is a claim with no denominator.
 * - It names its own sources: the list version and its DOF publication date,
 *   the day the snapshot was retrieved, the ledger range and its digest. A
 *   number with no provenance on a fiscal document is worth nothing.
 * - It accuses nobody. The wording is the same register as `Finding.explanation`
 *   in ADR-0002: the list says this, the documents say that, a person decided.
 * - Every synthetic figure is watermarked on the page itself. A demo document
 *   that could be mistaken for a real one is the single worst thing this
 *   repository could print.
 *
 * The copy is Spanish because it is read by a Mexican accountant. The code and
 * the comments are English, like everywhere else in this repository.
 */

import type {
  Action,
  Decision,
  Finding,
  LedgerEvent,
  PaymentInstruction,
  Supplier,
  SweepResult,
} from "@hackmty/core";
import { formatAmount, sumAmounts } from "@hackmty/core";
import { fingerprintLedger, groupDigest, type LedgerRange } from "./hash";
import { type Column, Sheet } from "./layout";
import { PdfDocument } from "./pdf";

/** Who the constancia is about. The company, never the supplier. */
export interface CompanyIdentity {
  rfc: string;
  legalName: string;
}

export interface ConstanciaCommon {
  company: CompanyIdentity;
  /** Instant the document is issued. Passed in, so two runs produce one file. */
  issuedAt: string;
  /** The ledger the digest is taken over. */
  ledger: readonly LedgerEvent[];
  /** Which slice of it this document covers. */
  range?: LedgerRange;
  /**
   * True when the figures come from the generator rather than from a real
   * company. Rendered as a band across the top of every page.
   */
  synthetic: boolean;
}

export interface SweepConstanciaInput extends ConstanciaCommon {
  sweep: SweepResult;
  /** DOF publication date of the version, `YYYY-MM-DD`. */
  publishedAt: string;
  /** Where the list came from, printed so a judge can fetch it themselves. */
  source: string;
  /** How many supplier RFCs were matched against the version. */
  suppliersChecked: number;
}

export interface RunConstanciaItem {
  instruction: PaymentInstruction;
  supplier?: Supplier;
  decision?: Decision;
  findings: readonly Finding[];
}

export interface RunConstanciaInput extends ConstanciaCommon {
  runId: string;
  /** Monday of the payment run, `YYYY-MM-DD`. */
  weekOf: string;
  items: readonly RunConstanciaItem[];
}

const ACTION_LABEL: Readonly<Record<Action, string>> = {
  hold: "Detenido",
  verify: "Por verificar",
  release: "Liberado",
};

const STATUS_LABEL: Readonly<Record<string, string>> = {
  presunto: "Presunto",
  desvirtuado: "Desvirtuado",
  definitivo: "Definitivo",
  sentencia_favorable: "Sentencia favorable",
};

const SYNTHETIC_BAND =
  "DATOS SINTETICOS. Documento de demostracion, sin validez fiscal.";

/**
 * Monterrey is UTC minus 6 all year, because Mexico dropped daylight saving
 * nationally in 2022. A constancia is read by a person in that timezone, so it
 * prints their clock and says which one it is, rather than an ISO instant with
 * a Z on the end that nobody reconciles against their own records.
 */
const MONTERREY_OFFSET_MINUTES = -360;

function localStamp(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return iso;
  }
  const shifted = new Date(at.getTime() + MONTERREY_OFFSET_MINUTES * 60_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ` +
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())} hrs (Monterrey, UTC-6)`
  );
}

const NOT_A_SIGNATURE =
  "La huella es un resumen SHA-256 del contenido del rango de eventos citado, no una firma electronica. " +
  "Sirve para comprobar que dos impresiones del mismo rango describen los mismos hechos. No acredita quien emitio el documento.";

/** Draws the header every constancia shares, and returns the sheet to continue on. */
function open(
  doc: PdfDocument,
  input: ConstanciaCommon,
  title: string,
  subtitle: string,
): Sheet {
  const sheet = new Sheet(doc);

  if (input.synthetic) {
    sheet.paragraph(SYNTHETIC_BAND, { grey: 0.35 });
    sheet.gap(6);
  }

  sheet.title(title, subtitle);
  sheet.field("Empresa", input.company.legalName);
  sheet.field("RFC", input.company.rfc);
  sheet.field("Emitida", localStamp(input.issuedAt));
  sheet.gap(10);

  return sheet;
}

/** The digest block, identical on both documents so it reads the same way. */
function closeWithFingerprint(sheet: Sheet, input: ConstanciaCommon): void {
  const fingerprint = fingerprintLedger(input.ledger, input.range ?? {});

  sheet.gap(8);
  sheet.heading("Huella del rango de eventos");
  sheet.field("Algoritmo", fingerprint.algorithm);
  sheet.field("Eventos", String(fingerprint.events));
  sheet.field(
    "Desde",
    fingerprint.from === undefined
      ? "sin eventos en el rango"
      : localStamp(fingerprint.from),
  );
  sheet.field(
    "Hasta",
    fingerprint.to === undefined
      ? "sin eventos en el rango"
      : localStamp(fingerprint.to),
  );
  sheet.gap(4);
  sheet.field("Huella", groupDigest(fingerprint.digest));
  sheet.gap(10);
  sheet.note(NOT_A_SIGNATURE);
}

/**
 * The constancia of a retroactive sweep: what a 69-B publication did to
 * deductions the company had already taken.
 */
export function sweepConstancia(input: SweepConstanciaInput): Uint8Array {
  const doc = new PdfDocument({
    title: `Constancia de revision 69-B ${input.sweep.listVersion}`,
    createdAt: input.issuedAt,
  });

  const sheet = open(
    doc,
    input,
    "Constancia de revision, articulo 69-B",
    "Cruce de proveedores contra una version publicada de la lista del SAT",
  );

  sheet.heading("Version revisada");
  sheet.field("Version de la lista", input.sweep.listVersion);
  sheet.field("Publicacion en el DOF", input.publishedAt);
  sheet.field("Origen", input.source);
  sheet.field("Proveedores cotejados", String(input.suppliersChecked));
  sheet.field(
    "Proveedores en la lista",
    String(input.sweep.newlyListed.length),
  );
  sheet.gap(12);

  sheet.heading("Exposicion sobre lo ya deducido");

  if (input.sweep.newlyListed.length === 0) {
    sheet.paragraph(
      "Ninguno de los proveedores cotejados aparece en esta version de la lista. " +
        "No hay deducciones expuestas por esta publicacion.",
    );
  } else {
    const columns: Column[] = [
      { header: "RFC", share: 0.16 },
      { header: "Proveedor", share: 0.3 },
      { header: "Situacion", share: 0.12 },
      { header: "CFDI", share: 0.08, align: "right" },
      { header: "Base deducida", share: 0.17, align: "right" },
      { header: "ISR + IVA", share: 0.17, align: "right" },
    ];

    sheet.tableHead(columns);
    for (const row of input.sweep.newlyListed) {
      sheet.row(columns, [
        row.supplier.rfc,
        row.supplier.legalName,
        STATUS_LABEL[row.status] ?? row.status,
        String(row.paidCfdis.length),
        formatAmount(row.deductedBase),
        formatAmount(sumAmounts([row.isrExposure, row.ivaExposure])),
      ]);
    }

    sheet.gap(6);
    sheet.field(
      "Exposicion total (MXN)",
      formatAmount(input.sweep.totalExposure),
    );
    sheet.gap(8);
    sheet.paragraph(
      "La exposicion es el efecto fiscal de los comprobantes ya pagados y ya deducidos de los " +
        "proveedores listados. No es una imputacion sobre el proveedor ni sobre la operacion: " +
        "es el monto que la empresa tendria que corregir si la situacion queda en definitiva.",
    );
  }

  closeWithFingerprint(sheet, input);
  return doc.toBytes();
}

/** The constancia of one weekly payment run: what was checked and what was decided. */
export function runConstancia(input: RunConstanciaInput): Uint8Array {
  const doc = new PdfDocument({
    title: `Constancia de corrida de pagos ${input.runId}`,
    createdAt: input.issuedAt,
  });

  const sheet = open(
    doc,
    input,
    "Constancia de corrida de pagos",
    "Revision de las instrucciones de pago de la semana y su resolucion",
  );

  const counts: Record<Action, number> = { hold: 0, verify: 0, release: 0 };
  for (const item of input.items) {
    if (item.decision !== undefined) {
      counts[item.decision.action] += 1;
    }
  }

  sheet.heading("Resumen");
  sheet.field("Corrida", input.runId);
  sheet.field("Semana del", input.weekOf);
  sheet.field("Instrucciones revisadas", String(input.items.length));
  sheet.field(
    "Importe revisado (MXN)",
    formatAmount(
      sumAmounts(input.items.map((item) => item.instruction.amount)),
    ),
  );
  sheet.field(
    "Resolucion",
    `${counts.hold} detenidas, ${counts.verify} por verificar, ${counts.release} liberadas`,
  );
  sheet.gap(12);

  sheet.heading("Instrucciones");

  if (input.items.length === 0) {
    sheet.paragraph("La corrida no contiene instrucciones de pago.");
  } else {
    const columns: Column[] = [
      { header: "Proveedor", share: 0.29 },
      { header: "RFC", share: 0.17 },
      { header: "Importe", share: 0.16, align: "right" },
      { header: "Resolucion", share: 0.14 },
      { header: "Hallazgos", share: 0.24 },
    ];

    sheet.tableHead(columns);
    for (const item of input.items) {
      const action = item.decision?.action;
      sheet.row(columns, [
        item.supplier?.legalName ?? item.instruction.supplierRfc,
        item.instruction.supplierRfc,
        formatAmount(item.instruction.amount),
        action === undefined ? "Sin resolver" : ACTION_LABEL[action],
        describeFindings(item.findings),
      ]);
    }
  }

  sheet.gap(12);
  sheet.heading("Hallazgos con detalle");
  writeFindings(sheet, input.items);

  closeWithFingerprint(sheet, input);
  return doc.toBytes();
}

/** `sat_69b, clabe_forensics` or a dash. The detail is in the section below. */
function describeFindings(findings: readonly Finding[]): string {
  if (findings.length === 0) {
    return "sin hallazgos";
  }
  return [...new Set(findings.map((finding) => finding.detector))].join(", ");
}

function writeFindings(
  sheet: Sheet,
  items: readonly RunConstanciaItem[],
): void {
  const withFindings = items.filter((item) => item.findings.length > 0);

  if (withFindings.length === 0) {
    sheet.paragraph(
      "Ninguna instruccion de esta corrida genero hallazgos. Los seis controles se " +
        "ejecutaron y ninguno encontro algo que reportar.",
    );
    return;
  }

  for (const item of withFindings) {
    sheet.gap(4);
    sheet.paragraph(
      `${item.supplier?.legalName ?? item.instruction.supplierRfc} (${item.instruction.supplierRfc}), ` +
        `${formatAmount(item.instruction.amount)} MXN`,
    );
    for (const finding of item.findings) {
      sheet.paragraph(
        `${finding.detector}, ${finding.severity}, ${state(finding)}: ${finding.explanation}`,
        { grey: 0.3 },
      );
    }
  }
}

function state(finding: Finding): string {
  return finding.state === "comprobable"
    ? "comprobable"
    : "requiere verificacion";
}

/** Suggested filename, so a browser saves something a person can find again. */
export function constanciaFilename(kind: "sweep" | "run", id: string): string {
  const safe = id.replace(/[^A-Za-z0-9._-]+/g, "-");
  return `constancia-${kind}-${safe}.pdf`;
}

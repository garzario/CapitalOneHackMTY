/**
 * The receipt of one payment, as the page an accountant files.
 *
 * It is the third document of this package and it deliberately reuses everything the
 * two constancias already established: the same header, the same synthetic band, the
 * same ledger digest with the same sentence that it is not an electronic signature.
 * A receipt that looked like a different product would be a document somebody has to
 * learn to read twice.
 *
 * What it states, and what it refuses to state.
 *
 * - **The seal is a state and never a boolean.** `sealState` comes straight off the
 *   `PaymentReceipt`, and the page prints "firma no verificada" for `not_checked`,
 *   which is what a receipt on a rail that produces no CEP at all reads as. A document
 *   that claimed a seal nobody checked would be the one lie that costs the most.
 * - **Four digits of the account, never eighteen.** A document that leaves the
 *   building does not need the rest, which is the same rule the `cent_sent` ledger
 *   event and the verification call already follow.
 * - **It names who executed the run.** The actor is on the page because nothing in
 *   this product executes without a person, and a receipt with no name against it is
 *   a payment nobody can answer for.
 * - **It is not a CFDI and it is not a fiscal receipt.** The note at the bottom says
 *   so: the supplier issues the CFDI, this page records what left the bank and under
 *   which clave de rastreo, and confusing the two is a mistake an accountant would
 *   spot in a second and a judge would spot in two.
 *
 * Pure like the rest of the package. The instant is passed in, so two printings of one
 * payment are byte identical and the digest is worth checking.
 */

import type { PaymentReceipt, SealState } from "@hackmty/core";
import { formatAmount } from "@hackmty/core";
import {
  type ConstanciaCommon,
  closeWithFingerprint,
  localStamp,
  open,
} from "./document";
import { PdfDocument } from "./pdf";

/** What the page says about the Banxico seal, per `SealState`. */
const SEAL_LABEL: Readonly<Record<SealState, string>> = {
  valid: "Verificada contra el certificado de Banxico",
  not_checked: "Firma no verificada",
  invalid: "Invalida: el documento tiene un defecto",
};

/** Why the seal reads as it does, so the state is never read as an accusation. */
const SEAL_NOTE: Readonly<Record<SealState, string>> = {
  valid:
    "El sello del CEP se valido contra el certificado de Banxico configurado en este servidor.",
  not_checked:
    "No se pudo comprobar el sello de Banxico. Eso no quiere decir que sea invalido: puede ser que este servidor no tenga el certificado, o que el riel de este pago no produzca CEP.",
  invalid:
    "El documento tiene un defecto propio, asi que el sello no puede darse por bueno.",
};

const NOT_A_CFDI =
  "Este comprobante no es un CFDI ni un comprobante fiscal. Registra que salio el dinero del banco de la empresa, " +
  "por cuanto, a que cuenta y con que clave de rastreo. El comprobante fiscal lo emite el proveedor.";

export interface PaymentReceiptInput extends ConstanciaCommon {
  receipt: PaymentReceipt;
}

/** The receipt of one payment. */
export function paymentReceipt(input: PaymentReceiptInput): Uint8Array {
  const { receipt } = input;
  const doc = new PdfDocument({
    title: `Comprobante de pago ${receipt.claveRastreo}`,
    createdAt: input.issuedAt,
  });

  const sheet = open(
    doc,
    input,
    "Comprobante de pago",
    "Una transferencia SPEI de la corrida de pagos de la semana",
  );

  sheet.heading("El pago");
  sheet.field("Importe (MXN)", formatAmount(receipt.amount));
  sheet.field("Clave de rastreo", receipt.claveRastreo);
  sheet.field("Enviado", localStamp(receipt.sentAt));
  sheet.field(
    "Acuse del riel",
    receipt.settledAt === undefined
      ? "Pendiente: el riel todavia no confirma el movimiento"
      : localStamp(receipt.settledAt),
  );
  sheet.field("Riel", receipt.rail);
  sheet.field("Corrida", receipt.runId === "" ? "sin corrida" : receipt.runId);
  sheet.gap(12);

  sheet.heading("El beneficiario");
  sheet.field("Proveedor", receipt.beneficiaryName);
  sheet.field("RFC", receipt.supplierRfc);
  sheet.field("Banco", receipt.beneficiaryBank);
  // Four digits, never eighteen. The full CLABE stays in the ledger.
  sheet.field(
    "Cuenta",
    `terminacion ${receipt.beneficiaryAccountLast4} (no se imprime la CLABE completa)`,
  );
  sheet.field(
    "CFDI que liquida",
    receipt.cfdiUuids.length === 0
      ? "sin CFDI relacionado"
      : receipt.cfdiUuids.join(", "),
  );
  sheet.gap(12);

  sheet.heading("Quien lo ejecuto");
  sheet.field("Persona", receipt.executedBy.name);
  sheet.field(
    "Rol",
    receipt.executedBy.role === "owner" ? "Dueno" : "Responsable de pagos",
  );
  sheet.gap(12);

  sheet.heading("Sello del CEP");
  sheet.field("Estado", SEAL_LABEL[receipt.sealState]);
  sheet.field(
    "CEP leido",
    receipt.cepAt === undefined
      ? "sin CEP para esta clave de rastreo"
      : localStamp(receipt.cepAt),
  );
  sheet.gap(4);
  sheet.paragraph(SEAL_NOTE[receipt.sealState], { grey: 0.3 });
  sheet.gap(10);
  sheet.note(NOT_A_CFDI);

  closeWithFingerprint(sheet, input);
  return doc.toBytes();
}

/** Suggested filename, so a browser saves something a person can find again. */
export function receiptFilename(receiptId: string): string {
  return `comprobante-${receiptId.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
}

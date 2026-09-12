/**
 * Control 5 of ADR-0002, beneficiary verification with the CEP, adapted to
 * `ComposeInput`.
 *
 * The evidence is a document Banxico signed for a SPEI that a person, not this
 * software, actually sent: a one-cent probe from the company's own bank. Two
 * questions are asked of it and they are asked separately, because they fail
 * separately.
 *
 * 1. Does the account holder Banxico reports match the legal name on the CFDI?
 *    `nameMatch` in `@hackmty/cep` answers, and it knows what "SA de CV" and a
 *    truncated corporate name mean in Mexico, which a string comparison does
 *    not.
 * 2. Did the seal validate? `Cep.signatureValid` carries the answer and
 *    `Cep.signatureReason` carries why. The distinction the domain type insists
 *    on is binding here: a false with `unconfirmed_scheme` reads as "no
 *    verificada", never as "invalida". They are different claims and only one of
 *    them is ours to make.
 *
 * A CEP for another account proves nothing about this payment and is reported as
 * a skip rather than quietly read as evidence.
 */

import type { NameMatch } from "@hackmty/cep";
import { nameMatch } from "@hackmty/cep";
import type {
  Cep,
  DetectorAdapter,
  Finding,
  PaymentInstruction,
  Supplier,
} from "@hackmty/core";
import { detectorRan, detectorSkipped } from "@hackmty/core";

/** `unconfirmed_scheme` is "we could not check", not "the seal is bad". */
const UNCONFIRMED_SCHEME = "unconfirmed_scheme";

/** Digits only, so a CLABE typed with spaces still compares. */
function accountKey(value: string): string {
  return value.replace(/\D+/g, "");
}

type SealState = "valid" | "unconfirmed" | "invalid";

function sealStateOf(cep: Cep): SealState {
  if (cep.signatureValid) {
    return "valid";
  }
  return cep.signatureReason === UNCONFIRMED_SCHEME ? "unconfirmed" : "invalid";
}

/**
 * Beneficiary verification with the CEP, control 5.
 *
 * Skipped, with a reason, when there is no CEP for this account or no supplier
 * to compare the holder against. Both are ordinary: most accounts have never
 * been probed, and the control being unarmed on this instruction is exactly what
 * the clerk needs told, rather than an empty panel that reads as "verificado".
 */
export const beneficiaryCepAdapter: DetectorAdapter = {
  detector: "beneficiary_cep",
  run: (input) => {
    const { cep, supplier, instruction } = input;
    if (cep === undefined) {
      return detectorSkipped(
        "no_cep",
        `No hay CEP verificado para la cuenta ${instruction.clabe}. El control se arma enviando el SPEI de un centavo desde el banco de la empresa.`,
      );
    }
    if (accountKey(cep.beneficiaryAccount) !== accountKey(instruction.clabe)) {
      return detectorSkipped(
        "cep_other_account",
        `El CEP que tenemos es de la cuenta ${cep.beneficiaryAccount} y esta instruccion paga a ${instruction.clabe}. Un CEP de otra cuenta no prueba nada sobre este pago.`,
      );
    }
    if (supplier === undefined) {
      return detectorSkipped(
        "no_supplier",
        `No tenemos la razon social de ${instruction.supplierRfc}, asi que no hay contra que comparar al titular de la cuenta.`,
      );
    }
    return detectorRan([buildFinding(cep, supplier, instruction, input.now)]);
  },
};

function buildFinding(
  cep: Cep,
  supplier: Supplier,
  instruction: PaymentInstruction,
  now: string,
): Finding {
  const match = nameMatch(cep.beneficiaryName, supplier.legalName);
  const seal = sealStateOf(cep);
  const severity = severityOf(match, seal);
  const atRisk = severity === "info" ? 0 : instruction.amount;

  const evidence: Finding["evidence"] = {
    claveRastreo: cep.claveRastreo,
    beneficiaryAccount: cep.beneficiaryAccount,
    beneficiaryName: cep.beneficiaryName,
    legalName: supplier.legalName,
    nameMatch: match,
    beneficiaryBank: cep.beneficiaryBank,
    transferredAt: cep.transferredAt,
    signatureValid: cep.signatureValid,
    signatureState: seal,
  };
  if (cep.signatureReason !== undefined) {
    evidence.signatureReason = cep.signatureReason;
  }
  if (cep.numeroCertificado !== undefined) {
    evidence.numeroCertificado = cep.numeroCertificado;
  }

  return {
    id: `cep:${cep.claveRastreo}:${supplier.rfc}`,
    detector: "beneficiary_cep",
    severity,
    // Never `comprobable` while the seal is only claimed: a signature nobody
    // validated is not proof, and saying otherwise would be the single most
    // expensive lie in this repository.
    state:
      seal === "valid" && match === "match"
        ? "comprobable"
        : "requiere_verificacion",
    subject: { kind: "instruction", id: instruction.id },
    amountAtRisk: atRisk,
    explanation: explain(cep, supplier, match, seal),
    evidence,
    createdAt: now,
  };
}

/**
 * A name that does not match at all is the impersonation case and it is
 * critical whatever the seal says. A partial match is a warning: Mexican legal
 * names are abbreviated by banks often enough that "comparten una palabra" is a
 * question, not an accusation. A full match on a validated seal is the good
 * news, and good news is `info`, so it never moves an action by itself.
 */
function severityOf(match: NameMatch, seal: SealState): Finding["severity"] {
  if (match === "mismatch") {
    return "critical";
  }
  if (seal === "invalid") {
    // The holder name lines up, and the document that says so did not validate.
    return "critical";
  }
  if (match === "partial") {
    return "warning";
  }
  return "info";
}

function explain(
  cep: Cep,
  supplier: Supplier,
  match: NameMatch,
  seal: SealState,
): string {
  const sealSentence =
    seal === "valid"
      ? "El sello de Banxico esta validado."
      : seal === "unconfirmed"
        ? "El sello de Banxico no se ha podido verificar todavia, lo cual no quiere decir que sea invalido."
        : "El sello de Banxico no valido contra el certificado.";

  if (match === "mismatch") {
    return `El CEP ${cep.claveRastreo} dice que la cuenta ${cep.beneficiaryAccount} esta a nombre de ${cep.beneficiaryName} y la factura la emite ${supplier.legalName}. ${sealSentence}`;
  }
  if (match === "partial") {
    return `El titular de la cuenta ${cep.beneficiaryAccount} en el CEP ${cep.claveRastreo} es ${cep.beneficiaryName} y solo coincide en parte con ${supplier.legalName}. ${sealSentence}`;
  }
  return `El CEP ${cep.claveRastreo} confirma que la cuenta ${cep.beneficiaryAccount} esta a nombre de ${cep.beneficiaryName}, que es la razon social de la factura. ${sealSentence}`;
}

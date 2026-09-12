/**
 * Control 5 of ADR-0002, beneficiary verification with the CEP, adapted to
 * `ComposeInput`.
 *
 * Since issue #164 the control has a second, weaker source of beneficiary
 * evidence next to the CEP: the SentryOne consortium, read from the LOCAL
 * snapshot in `ComposeInput.network`. The two are not interchangeable and the
 * code keeps them apart on purpose. A CEP is a document Banxico signed about
 * THIS account; the network is other companies saying they pay it. One is proof
 * and the other is corroboration, so a network signal never makes a finding
 * `comprobable`, and `assessNetwork` in `@hackmty/core` owns every number it
 * contributes. Three consequences, and they are the whole of the change:
 *
 * - a CEP finding carries the network in its evidence and says, in Spanish,
 *   whether the network was consulted at all. A network nobody read changes
 *   nothing else about the finding or the decision.
 * - a fraud report in the network makes the finding `critical` whatever the
 *   holder name and the seal say. One tenant reporting this pair outweighs any
 *   amount of corroboration.
 * - with no CEP, the control used to be silent. It now reports what the network
 *   knows when the network knows something, because "forty companies pay this
 *   supplier and none of them pays it here" is exactly the case a first payment
 *   to a new account has no other evidence for.
 *
 * The evidence a CEP carries is a document Banxico signed for a SPEI that a
 * person, not this software, actually sent: a one-cent probe from the company's
 * own bank. Two questions are asked of it and they are asked separately, because
 * they fail separately.
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
  NetworkAssessment,
  NetworkSignal,
  PaymentInstruction,
  SealState,
  SkipReason,
  Supplier,
} from "@hackmty/core";
import {
  assessNetwork,
  describeNetwork,
  detectorRan,
  detectorSkipped,
  NOT_CONSULTED,
} from "@hackmty/core";

/**
 * The reasons that mean "we could not check the seal", as opposed to "the seal
 * is bad". Reading any of these as invalid would put an accusation on a document
 * whose only problem is on our side of the wire.
 *
 * - `not_checked` is what `parseCep` sets: the document was read and no
 *   verification was attempted. A CEP a clerk has just pasted arrives this way,
 *   so this is the common case and not an edge one.
 * - `unconfirmed_scheme` is the candidate matrix having run with Banxico
 *   publishing no specification of which one is right.
 * - `invalid_certificate` is this server holding no usable Banxico certificate,
 *   which is a fact about our configuration and says nothing about the seal.
 *
 * Everything else `verifySignature` can answer is a defect in the document
 * itself (no sello, a sello that is not base64 or not RSA-2048, no cadenaCDA, a
 * malformed root) or an outright `signature_mismatch`, and those are invalid.
 */
export const UNPROVEN_SEAL_REASONS: readonly string[] = [
  "not_checked",
  "unconfirmed_scheme",
  "invalid_certificate",
];

/** Digits only, so a CLABE typed with spaces still compares. */
function accountKey(value: string): string {
  return value.replace(/\D+/g, "");
}

/**
 * The three words of `SealState`, read off one CEP.
 *
 * Exported because `apps/api` reports the same verdict on
 * `GET /api/v1/instructions/:id/verification`, and two copies of this mapping is
 * how one of them eventually calls an unchecked seal valid.
 */
export function sealStateOf(cep: Cep): SealState {
  if (cep.signatureValid) {
    return "valid";
  }
  return cep.signatureReason !== undefined &&
    UNPROVEN_SEAL_REASONS.includes(cep.signatureReason)
    ? "not_checked"
    : "invalid";
}

/**
 * Beneficiary verification with the CEP, control 5.
 *
 * Three things can leave the CEP half of this control unarmed: no CEP for this
 * account, a CEP for a different one, or no supplier to compare the holder
 * against. All three are ordinary, and the clerk is told which one it is rather
 * than shown an empty panel that reads as "verificado".
 *
 * When the network has something to say, the control reports THAT instead of
 * staying silent, and the sentence names the reason the CEP could not answer, so
 * the finding never implies a document nobody holds. When the network has nothing
 * to say, or was not consulted at all, the control skips exactly as it did before
 * the consortium existed and the skip detail still says what the network did.
 */
export const beneficiaryCepAdapter: DetectorAdapter = {
  detector: "beneficiary_cep",
  run: (input) => {
    const { cep, supplier, instruction } = input;
    const network = input.network ?? NOT_CONSULTED;
    const read = assessNetwork(network);
    const unarmed = (reason: SkipReason, detail: string) =>
      networkOnly(instruction, network, read, input.now, detail) ??
      detectorSkipped(reason, `${detail} ${describeNetwork(network)}`);

    if (cep === undefined) {
      return unarmed(
        "no_cep",
        `No hay CEP verificado para la cuenta ${instruction.clabe}. El control se arma enviando el SPEI de un centavo desde el banco de la empresa.`,
      );
    }
    if (accountKey(cep.beneficiaryAccount) !== accountKey(instruction.clabe)) {
      return unarmed(
        "cep_other_account",
        `El CEP que tenemos es de la cuenta ${cep.beneficiaryAccount} y esta instruccion paga a ${instruction.clabe}. Un CEP de otra cuenta no prueba nada sobre este pago.`,
      );
    }
    if (supplier === undefined) {
      return unarmed(
        "no_supplier",
        `No tenemos la razon social de ${instruction.supplierRfc}, asi que no hay contra que comparar al titular de la cuenta.`,
      );
    }
    return detectorRan([
      buildFinding(cep, supplier, instruction, input.now, network, read),
    ]);
  },
};

/**
 * The network's own contribution to the evidence of a finding.
 *
 * `network` carries the whole signal as one value, because `source` is what
 * separates "the network has never seen this account" from "the network was not
 * read" and the two must never collapse into the same chip. `networkAdjustment`
 * is the factor the expected loss was multiplied by, so the screen can state the
 * adjustment rather than leave a smaller number unexplained.
 */
function networkEvidence(
  signal: NetworkSignal,
  read: NetworkAssessment,
): Finding["evidence"] {
  return {
    network: signal,
    networkVerdict: read.verdict,
    networkAdjustment: read.factor,
  };
}

/**
 * The finding the network alone justifies, when the CEP could not answer.
 *
 * Returns undefined when the network has nothing to say, and then the caller
 * skips exactly as it did before the consortium existed. That is what keeps an
 * instance with the flag off, an empty snapshot or an unreachable warehouse
 * deciding what this product decided yesterday.
 *
 * `lead` is the sentence that says why the CEP half is unarmed, passed in by the
 * caller rather than written here: there are three reasons and only the caller
 * knows which one applies, and a finding that said "no hay CEP" about an
 * instruction whose CEP is simply for another account would be a false statement
 * on the clerk's screen.
 *
 * A corroborated pair still produces a finding and it is deliberately `info` with
 * nothing at risk: good news is not an alert, and the reason it is here at all is
 * that the clerk has to be able to see what the network said on a payment that
 * was released. `sortFindings` puts it at the bottom of the rail.
 */
function networkOnly(
  instruction: PaymentInstruction,
  signal: NetworkSignal,
  read: NetworkAssessment,
  now: string,
  lead: string,
) {
  if (read.verdict === "not_consulted" || read.verdict === "unseen") {
    return undefined;
  }
  const severity: Finding["severity"] =
    read.verdict === "fraud_reported"
      ? "critical"
      : read.verdict === "other_accounts_only"
        ? "warning"
        : "info";

  return detectorRan([
    {
      id: `network:${instruction.id}`,
      detector: "beneficiary_cep" as const,
      severity,
      /* Never `comprobable`: the network is other companies' experience and not a
         document this company holds, so a person still checks it. */
      state: "requiere_verificacion" as const,
      subject: { kind: "instruction" as const, id: instruction.id },
      amountAtRisk: severity === "info" ? 0 : instruction.amount,
      explanation: `${lead} ${describeNetwork(signal)}`,
      evidence: {
        ...networkEvidence(signal, read),
        proposedClabe: instruction.clabe,
        networkTenants: read.tenants,
        networkMonths: read.months,
        networkFraudReports: read.fraudReports,
        networkOtherAccounts: read.otherAccounts,
      },
      createdAt: now,
    },
  ]);
}

function buildFinding(
  cep: Cep,
  supplier: Supplier,
  instruction: PaymentInstruction,
  now: string,
  signal: NetworkSignal,
  read: NetworkAssessment,
): Finding {
  const match = nameMatch(cep.beneficiaryName, supplier.legalName);
  const seal = sealStateOf(cep);
  const severity = severityOf(match, seal, read);
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
    ...networkEvidence(signal, read),
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
    // expensive lie in this repository. A fraud report in the network is not a
    // document either, so it cannot make this comprobable and it does not.
    state:
      seal === "valid" && match === "match" && read.verdict !== "fraud_reported"
        ? "comprobable"
        : "requiere_verificacion",
    subject: { kind: "instruction", id: instruction.id },
    amountAtRisk: atRisk,
    explanation: `${explain(cep, supplier, match, seal)} ${describeNetwork(signal)}`,
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
 *
 * A fraud report in the consortium is critical too, and it is checked first for
 * the reason it exists: the CEP proves who holds the account and it cannot prove
 * what they did with the last company's money. A tenant who lost money to this
 * exact pair knows something the document does not carry.
 */
function severityOf(
  match: NameMatch,
  seal: SealState,
  network: NetworkAssessment,
): Finding["severity"] {
  if (network.verdict === "fraud_reported") {
    return "critical";
  }
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
      : seal === "not_checked"
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

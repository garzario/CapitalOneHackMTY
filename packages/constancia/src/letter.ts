/**
 * The one-page evidence letter of one payment instruction.
 *
 * The third document of this package and the only one written for somebody
 * outside the company. A constancia is what the accountant files; this is what
 * the clerk attaches to an email when the supplier calls to ask why the transfer
 * has not arrived. That single difference decides everything about it.
 *
 * - **One page, and the page is the budget.** It carries the signals, the level,
 *   the state and the name that signed, and nothing else. The run constancia is
 *   where the whole week goes, and `evidenceLetter` that needed two pages would
 *   be a constancia with a worse title. The page-count test is the contract.
 * - **Every signal says whether it could answer at all.** A CEP nobody asked for
 *   reads "no se envio el centavo de verificacion", never a blank. An Article 49
 *   Bis listing with no machine-readable publication says so with the reason. A
 *   letter that left a control blank would read as a control that passed, which
 *   is the failure `CompositionReport` exists to prevent inside the engine.
 * - **No number about the payment's risk, ever.** The level is one of three words
 *   with the rule that produced it, and the page says in its own copy that the
 *   level is a statement about the evidence and not a guarantee. ADR-0009 forbids
 *   a probability, a percentage or a score on any document of this product, and
 *   the word "seguro" is not in this file in any form.
 * - **It accuses nobody.** Same register as `Finding.explanation` under ADR-0002:
 *   the list says this, the documents say that, a person decided and signed.
 *
 * The copy is Spanish because a Mexican supplier and a Mexican accountant read
 * it. The code and the comments are English, like everywhere else here.
 *
 * Pure, like the rest of the package. The instant is passed in, so the same
 * instruction renders byte-identical twice and the huella is worth printing.
 */

import type {
  Confidence,
  ConfidenceRule,
  Decision,
  Finding,
  NameMatch,
  PaymentInstruction,
  SatListEntry,
  SealState,
  Severity,
  Supplier,
  TransactionState,
  VerificationOutcome,
  VerificationStateName,
} from "@hackmty/core";
import { formatAmount } from "@hackmty/core";
import {
  type ConstanciaCommon,
  localStamp,
  openSheet,
  STATUS_LABEL,
} from "./document";
import { fingerprintLedger, groupDigest } from "./hash";
import type { Sheet } from "./layout";
import { PdfDocument } from "./pdf";

/**
 * What the Article 49 Bis arm of control 1 could say.
 *
 * `answered: false` is the ordinary case in this build and it is not a silence:
 * the SAT publishes the 49 Bis resolutions one oficio at a time in the DOF and
 * ships no downloadable listing, so the letter prints the reason instead of the
 * sentence "no esta listado", which nobody checked.
 */
export interface Sat49BisAnswer {
  answered: boolean;
  /** What was found, or why nothing could be. One sentence, in Spanish. */
  detail: string;
}

/** The account the instruction pays, as a document outside the building may name it. */
export interface AccountSignal {
  /** Participant that holds it, from the dated Banxico table in `@hackmty/core`. */
  bank: string;
  /** Digits 4 to 6 of the CLABE, the plaza the branch belongs to. */
  plazaCode: string;
  /** Last four digits. Never the other fourteen. */
  last4: string;
  /** Accounts we have paid this supplier on before today. */
  knownAccounts: number;
  /** True when this account is one of them. */
  known: boolean;
}

/** Where the one-cent verification of this payment stands. */
export interface VerificationSignal {
  state: VerificationStateName;
  /** What can be proven about the Banxico seal. Never a boolean. */
  sealState: SealState | null;
  /** Account holder the CEP names. */
  holderName: string | null;
  nameMatch: NameMatch | null;
  cepAt: string | null;
}

/** The verification call to the supplier, when one was placed. */
export interface CallSignal {
  outcome: VerificationOutcome;
  at: string;
  /** The four digits that were read out loud. The call never says eighteen. */
  clabeLast4: string;
  /** The sentence the outcome was read from, quoted from the transcript. */
  evidence?: string;
  /** True when a person placed the call by hand and typed the outcome in. */
  manual: boolean;
}

/**
 * What the clerk uploaded, as a fact about the intake and never as content.
 *
 * No transcription confidence on the page. It is a number about how well a model
 * read an image, and a figure on a document this product signs invites the
 * reading that it is a figure about the payment. ADR-0009 is why.
 */
export interface DocumentSignal {
  image: boolean;
  audio: boolean;
  /** A sentence the clerk or a voice note left on the instruction. */
  text: boolean;
}

export interface EvidenceLetterInput extends ConstanciaCommon {
  instruction: PaymentInstruction;
  supplier?: Supplier;
  /** Absent while nothing has decided this payment. */
  decision?: Decision;
  findings: readonly Finding[];
  /** From `assessLine` in `@hackmty/core`. Three words, never a number. */
  confidence: { level: Confidence; rule: ConfidenceRule };
  state: TransactionState;
  /** The 69-B rows this instance holds for the supplier, newest publication first. */
  sat69b: readonly SatListEntry[];
  sat49Bis: Sat49BisAnswer;
  account: AccountSignal;
  verification?: VerificationSignal;
  call?: CallSignal;
  documents: DocumentSignal;
}

const CONFIDENCE_LABEL: Readonly<Record<Confidence, string>> = {
  confiable: "Confiable",
  precaucion: "Precaucion",
  alerta: "Alerta",
};

/**
 * Why the level is the level, in the words of the ADR-0009 table.
 *
 * Printed next to the level because a level with no reason under it is a colour,
 * and a colour is not evidence a supplier can answer.
 */
const CONFIDENCE_RULE_LABEL: Readonly<Record<ConfidenceRule, string>> = {
  sat_definitive: "el proveedor esta en una lista definitiva del SAT",
  critical_finding:
    "un hallazgo critico ya prueba un problema en los documentos",
  new_account_without_history: "la cuenta no tiene historial de pagos detras",
  pending_verification: "falta una verificacion y nadie la ha hecho todavia",
  warning_finding: "hay un hallazgo de advertencia sobre este pago",
  no_open_signal: "los documentos que tenemos coinciden y no hay nada abierto",
};

const STATE_LABEL: Readonly<Record<TransactionState, string>> = {
  rojo: "Rojo. Detenido y frente a una persona",
  cancelado: "Cancelado. No sale con esta evidencia",
  enviado: "Enviado. El dinero ya salio",
  pendiente: "Pendiente. Nadie lo ha resuelto",
  liberado: "Liberado. Nada lo detiene y todavia no se envia",
};

const ACTION_SENTENCE: Readonly<Record<Decision["action"], string>> = {
  hold: "Detener el pago",
  verify: "Verificar antes de pagar",
  release: "Liberar el pago",
};

const SEVERITY_LABEL: Readonly<Record<Severity, string>> = {
  info: "Contexto",
  warning: "Advertencia",
  critical: "Critico",
};

const OUTCOME_LABEL: Readonly<Record<VerificationOutcome, string>> = {
  confirmed: "el proveedor confirmo la cuenta",
  denied: "el proveedor nego el cambio de cuenta",
  no_answer: "nadie contesto",
  unclear: "la llamada no resolvio la pregunta",
};

const SEAL_LABEL: Readonly<Record<SealState, string>> = {
  valid: "sello verificado contra el certificado de Banxico",
  not_checked: "firma no verificada en esta instancia",
  invalid: "el sello no corresponde al documento",
};

const NAME_MATCH_LABEL: Readonly<Record<NameMatch, string>> = {
  match: "el nombre del titular coincide con el del CFDI",
  partial: "el nombre del titular coincide parcialmente con el del CFDI",
  mismatch: "el titular de la cuenta no es el proveedor del CFDI",
};

const VERIFICATION_STATE_LABEL: Readonly<
  Record<VerificationStateName, string>
> = {
  not_started: "no se ha enviado el centavo de verificacion",
  cent_sent: "el centavo ya salio",
  awaiting_cep: "el centavo ya salio y el CEP todavia no se publica",
  cep_signed: "el CEP llego y se leyo",
  released: "el CEP llego y nada detiene el pago",
  blocked: "el CEP contradice los documentos",
};

/**
 * What the level is and what it is not, printed on the page itself.
 *
 * The second sentence is the one that matters and it is binding under ADR-0002
 * and ADR-0009: a SPEI cannot be recalled, so no level on any document of this
 * product is a guarantee about one.
 */
const LEVEL_NOTE =
  "El nivel describe la evidencia que esta empresa tiene sobre este pago, con los hallazgos que lo " +
  "producen. No es una probabilidad ni una calificacion, y no es una garantia: una transferencia SPEI " +
  "no se puede devolver.";

/** The huella, compact, because the page is the budget. See the file comment. */
const LETTER_FINGERPRINT_NOTE =
  "La huella resume el rango de eventos citado, no es una firma electronica y no acredita quien emitio el documento.";

/**
 * The one-page evidence letter of one instruction.
 *
 * `GET /api/v1/instructions/:id/carta` answers exactly these bytes. The caller
 * gathers the signals and passes the level and the state that `assessLine`
 * derived, so this file composes and decides nothing: a document that computed
 * its own level would be the fifth implementation ADR-0009 exists to remove.
 */
export function evidenceLetter(input: EvidenceLetterInput): Uint8Array {
  const doc = new PdfDocument({
    title: `Carta de evidencia ${input.instruction.id}`,
    createdAt: input.issuedAt,
  });

  const sheet = openSheet(
    doc,
    input,
    "Carta de evidencia de un pago",
    "Senales revisadas, nivel, estado y quien resolvio",
  );

  writeSubject(sheet, input);
  writeLevel(sheet, input);
  writeSignals(sheet, input);
  writeResolution(sheet, input);
  writeFindings(sheet, input.findings);
  writeFingerprint(sheet, input);

  return doc.toBytes();
}

/**
 * The digest of the ledger range, through the same two functions both constancias
 * print it with, and in two fields instead of six.
 *
 * `fingerprintLedger` and `groupDigest` are the single implementation, so the
 * number on this page is the number on the constancia for the same range. What is
 * compressed is the layout and not the claim: the page is one page by contract,
 * and the five-field block in `closeWithFingerprint` is a third of it.
 */
function writeFingerprint(sheet: Sheet, input: EvidenceLetterInput): void {
  const fingerprint = fingerprintLedger(input.ledger, input.range ?? {});

  sheet.gap(6);
  sheet.field(
    "Rango de eventos",
    fingerprint.from === undefined || fingerprint.to === undefined
      ? "sin eventos en el rango"
      : `${plural(fingerprint.events, "evento", "eventos")}, del ${day(fingerprint.from)} al ${day(fingerprint.to)} (Monterrey, UTC-6)`,
  );
  /* The algorithm is in the label and not in the value, because the grouped digest
     already fills the value column and a second line for one word would cost the
     page. Same digest, same formatter, both constancias print it. */
  sheet.field(
    `Huella (${fingerprint.algorithm})`,
    groupDigest(fingerprint.digest),
  );
  sheet.gap(4);
  sheet.note(LETTER_FINGERPRINT_NOTE);
}

/** Which instruction this is, with no heading: it is the subject of the page. */
function writeSubject(sheet: Sheet, input: EvidenceLetterInput): void {
  const { instruction, supplier } = input;

  sheet.field("Instruccion", instruction.id);
  sheet.field(
    "Proveedor",
    supplier === undefined
      ? instruction.supplierRfc
      : `${supplier.legalName} (${instruction.supplierRfc})`,
  );
  sheet.field("Importe (MXN)", formatAmount(instruction.amount));
  sheet.field(
    "Comprobantes",
    instruction.cfdiUuids.length === 0
      ? "la instruccion no cita ningun CFDI"
      : instruction.cfdiUuids.join(", "),
  );
  sheet.field(
    "Recibida",
    `${localStamp(instruction.receivedAt)}, por ${instruction.source}`,
  );
  sheet.gap(10);
}

function writeLevel(sheet: Sheet, input: EvidenceLetterInput): void {
  sheet.heading("Nivel y estado");
  sheet.field(
    "Nivel",
    `${CONFIDENCE_LABEL[input.confidence.level]}, porque ${CONFIDENCE_RULE_LABEL[input.confidence.rule]}`,
  );
  sheet.field("Estado", STATE_LABEL[input.state]);
  sheet.gap(2);
  sheet.paragraph(LEVEL_NOTE, { grey: 0.3 });
  sheet.gap(8);
}

/**
 * The seven signals, each one a sentence that says what was read or why nothing
 * could be.
 *
 * They are the six controls of ADR-0002 as a supplier reads them, plus the
 * intake. Nothing here is blank: a signal with no answer prints the reason.
 */
function writeSignals(sheet: Sheet, input: EvidenceLetterInput): void {
  sheet.heading("Senales revisadas");
  sheet.field("Lista 69-B del SAT", sat69bSentence(input.sat69b));
  sheet.field(
    `Lista 49 Bis del SAT`,
    input.sat49Bis.answered
      ? input.sat49Bis.detail
      : `No se pudo cotejar. ${input.sat49Bis.detail}`,
  );
  sheet.field("Cuenta y plaza", accountSentence(input.account));
  sheet.field("Historial de pagos", historySentence(input.account));
  sheet.field("CEP de Banxico", verificationSentence(input.verification));
  sheet.field("Llamada al proveedor", callSentence(input.call));
  sheet.field("Documentos recibidos", documentsSentence(input.documents));
  sheet.gap(8);
}

function writeResolution(sheet: Sheet, input: EvidenceLetterInput): void {
  sheet.heading("Resolucion");

  const { decision } = input;
  if (decision === undefined) {
    sheet.paragraph(
      "Nadie ha resuelto este pago todavia. La instruccion esta en la corrida y ninguna persona " +
        "ha firmado una accion sobre ella.",
    );
    sheet.gap(8);
    return;
  }

  sheet.field("Accion", ACTION_SENTENCE[decision.action]);
  sheet.field(
    "Quien",
    decision.decidedBy === undefined
      ? "propuesta del motor, sin firma de una persona todavia"
      : decision.decidedBy,
  );
  sheet.field("Cuando", localStamp(decision.decidedAt));
  sheet.field(
    "Motivo",
    decision.reason ??
      "sin motivo escrito, porque la accion es la que propuso el motor",
  );
  sheet.gap(8);
}

function writeFindings(sheet: Sheet, findings: readonly Finding[]): void {
  sheet.heading("Hallazgos de los controles");

  if (findings.length === 0) {
    sheet.paragraph(
      "Los seis controles se ejecutaron sobre este pago y ninguno encontro algo que reportar.",
    );
    return;
  }

  for (const finding of findings) {
    sheet.paragraph(
      `${SEVERITY_LABEL[finding.severity]}, ${findingState(finding)}: ${finding.explanation}`,
      { grey: 0.25 },
    );
  }
}

function findingState(finding: Finding): string {
  return finding.state === "comprobable"
    ? "comprobable con los documentos"
    : "requiere verificacion de una persona";
}

/**
 * What the 69-B rows say, newest publication first.
 *
 * "Not listed" is an answer and it is written as one, with the rows that are held
 * so a supplier who cleared their name sees that the history is on the page and
 * that it stops nothing.
 */
function sat69bSentence(entries: readonly SatListEntry[]): string {
  if (entries.length === 0) {
    return "el RFC no aparece en las versiones de la lista que tiene esta instancia";
  }

  const newest = entries[0] as SatListEntry;
  const label = STATUS_LABEL[newest.status] ?? newest.status;
  const rows = plural(entries.length, "publicacion", "publicaciones");
  return `${label} desde el ${newest.publishedAt}, version ${newest.listVersion}, ${rows}`;
}

/**
 * The account, as a document that leaves the building may name it.
 *
 * Four digits and never the other fourteen, which is the same rule the
 * `cent_sent` ledger event and the verification call already follow. The rule is
 * in this comment rather than on the page: a letter that explained its own
 * redaction would be spending a line of the page on itself.
 */
function accountSentence(account: AccountSignal): string {
  return `${account.bank}, plaza ${account.plazaCode}, cuenta terminada en ${account.last4}`;
}

function historySentence(account: AccountSignal): string {
  const known = plural(
    account.knownAccounts,
    "cuenta conocida",
    "cuentas conocidas",
  );

  return account.known
    ? `cuenta ya usada antes con este proveedor, ${known}`
    : `primera vez en esta cuenta, ${known} del proveedor`;
}

function verificationSentence(signal: VerificationSignal | undefined): string {
  if (signal === undefined || signal.state === "not_started") {
    return "no se envio el centavo de verificacion, asi que no hay CEP que leer";
  }

  const parts = [VERIFICATION_STATE_LABEL[signal.state]];
  if (signal.holderName !== null) {
    parts.push(`titular ${signal.holderName}`);
  }
  if (signal.nameMatch !== null) {
    parts.push(NAME_MATCH_LABEL[signal.nameMatch]);
  }
  if (signal.sealState !== null) {
    parts.push(SEAL_LABEL[signal.sealState]);
  }
  if (signal.cepAt !== null) {
    parts.push(`leido el ${day(signal.cepAt)}`);
  }
  return parts.join(", ");
}

function callSentence(call: CallSignal | undefined): string {
  if (call === undefined) {
    return "no se registro ninguna llamada sobre este pago";
  }

  const how = call.manual ? "llamada marcada a mano" : "llamada del agente";
  const quote =
    call.evidence === undefined ? "" : `. Lo dicho: ${call.evidence}`;
  return (
    `${how} el ${day(call.at)} sobre la cuenta terminada en ${call.clabeLast4}: ` +
    `${OUTCOME_LABEL[call.outcome]}${quote}`
  );
}

function documentsSentence(documents: DocumentSignal): string {
  const held: string[] = [];
  if (documents.image) {
    held.push("una imagen");
  }
  if (documents.audio) {
    held.push("una nota de voz");
  }
  if (documents.text) {
    held.push("un texto de la persona que paga");
  }

  return held.length === 0
    ? "la instruccion llego como datos, sin archivo adjunto"
    : `${held.join(", ")} en el expediente de la instruccion`;
}

/**
 * A Monterrey day and minute with no timezone tail.
 *
 * `localStamp` repeats "(Monterrey, UTC-6)" on every value it writes, which is
 * right on a constancia where the fields are far apart and wrong on a one-line
 * range where it would be printed twice. The range field says the timezone once.
 */
function day(iso: string): string {
  return localStamp(iso).replace(" hrs (Monterrey, UTC-6)", "");
}

/** A count with the noun agreeing with it. One evento, two eventos. */
function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

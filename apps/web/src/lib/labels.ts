/**
 * Every word the clerk reads, in one dictionary.
 *
 * The interface is in Spanish because the person using it is a payments clerk
 * in a Mexican company; the code around it is in English because the repo is.
 * Copy lives here and not inside components so that the same concept is never
 * called two different things on two screens, and so the whole vocabulary can
 * be reviewed in one file.
 *
 * Tone rules from ADR-0002: the product never accuses anyone. A finding is
 * either provable from documents or it needs a human check, and the words say
 * exactly that.
 */

import type {
  Action,
  AssistantTool,
  Confidence,
  ConfidenceRule,
  Detector,
  FindingState,
  InstructionSource,
  ProposalKind,
  SatListStatus,
  Severity,
  TransactionState,
} from "@hackmty/core";
import type {
  CepSealState,
  NameMatch,
  PaymentLineState,
  VerificationRail,
  VerificationStateName,
} from "./contract";

export const ACTION_LABEL: Record<Action, string> = {
  hold: "Retener",
  verify: "Verificar",
  release: "Liberar",
};

export const ACTION_HELP: Record<Action, string> = {
  hold: "No sale el pago hasta que se resuelva el hallazgo.",
  verify: "Sale despues de confirmar por un canal que ya conociamos.",
  release: "Sale en la corrida de esta semana.",
};

/** The badge class each action paints with. Colour is never the only signal. */
export const ACTION_BADGE: Record<Action, string> = {
  hold: "badge badge-hold",
  verify: "badge badge-verify",
  release: "badge badge-release",
};

export const ACTION_BUTTON: Record<Action, string> = {
  hold: "btn btn-hold",
  verify: "btn btn-verify",
  release: "btn btn-release",
};

export const DETECTOR_LABEL: Record<Detector, string> = {
  sat_69b: "Lista 69-B del SAT",
  clabe_forensics: "Forense de CLABE",
  duplicate_invoice: "Factura duplicada",
  supplier_behaviour: "Cambio de comportamiento",
  beneficiary_cep: "Beneficiario verificado con CEP",
  bank_reconciliation: "Conciliacion bancaria",
};

/**
 * The screen that proves a finding, per detector, and the words on the link.
 *
 * Two detectors are missing on purpose rather than by omission. A duplicate
 * invoice already carries its own origin inside the panel, and a bank
 * reconciliation already carries the bank row it failed against: the proof is
 * the block the reader is looking at, and there is no screen in the app that
 * shows more of it than that. A link to nowhere new is furniture.
 */
export const EVIDENCE_ACTION: Partial<
  Record<Detector, { label: string; kind: "sat" | "cep" | "call" }>
> = {
  sat_69b: { label: "Consultar en la lista 69-B", kind: "sat" },
  beneficiary_cep: { label: "Verificar con el CEP", kind: "cep" },
  clabe_forensics: { label: "Llamar al proveedor", kind: "call" },
  supplier_behaviour: { label: "Llamar al proveedor", kind: "call" },
};

export const DETECTOR_ORDER: Detector[] = [
  "sat_69b",
  "clabe_forensics",
  "duplicate_invoice",
  "supplier_behaviour",
  "beneficiary_cep",
  "bank_reconciliation",
];

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Informativo",
  warning: "Atencion",
  critical: "Critico",
};

/** Severity reuses the decision palette so one colour means one thing. */
export const SEVERITY_BADGE: Record<Severity, string> = {
  info: "badge badge-neutral",
  warning: "badge badge-verify",
  critical: "badge badge-hold",
};

export const SEVERITY_CHIP: Record<Severity, string> = {
  info: "chip chip-info",
  warning: "chip chip-warning",
  critical: "chip chip-critical",
};

export const FINDING_STATE_LABEL: Record<FindingState, string> = {
  comprobable: "Comprobable",
  requiere_verificacion: "Requiere verificacion",
};

export const FINDING_STATE_HELP: Record<FindingState, string> = {
  comprobable:
    "Se sostiene con los documentos que ya tenemos, sin llamar a nadie.",
  requiere_verificacion:
    "Falta una confirmacion humana. No es una acusacion, es una revision.",
};

export const SOURCE_LABEL: Record<InstructionSource, string> = {
  email: "Correo",
  whatsapp: "WhatsApp",
  pdf: "PDF",
  portal: "Portal",
  manual: "Captura manual",
};

/** Which Rune glyph draws a channel. The drawings are in `Icons.tsx`. */
export type SourceGlyph = "mail" | "message" | "file-text" | "globe" | "pencil";

/**
 * The channel an instruction arrived by, as a shape.
 *
 * It sits next to `SOURCE_LABEL` because it is the same fact in the other
 * channel, and a run row shows both: the tile says where it came from at a
 * glance and the word under it says the same thing for anyone who cannot use
 * the shape. A key rather than a component, so this file stays a dictionary of
 * words with no view in it.
 */
export const SOURCE_ICON: Record<InstructionSource, SourceGlyph> = {
  email: "mail",
  whatsapp: "message",
  pdf: "file-text",
  portal: "globe",
  manual: "pencil",
};

export const SAT_STATUS_LABEL: Record<SatListStatus, string> = {
  presunto: "Presunto",
  desvirtuado: "Desvirtuado",
  definitivo: "Definitivo",
  sentencia_favorable: "Sentencia favorable",
};

/**
 * Only `definitivo` and `presunto` carry risk. `desvirtuado` and
 * `sentencia_favorable` mean the taxpayer answered and won, so painting them
 * red would be both wrong and unfair.
 */
export const SAT_STATUS_BADGE: Record<SatListStatus, string> = {
  presunto: "badge badge-verify",
  desvirtuado: "badge badge-release",
  definitivo: "badge badge-hold",
  sentencia_favorable: "badge badge-release",
};

export const NAME_MATCH_LABEL: Record<NameMatch, string> = {
  match: "Coincide",
  partial: "Coincide parcialmente",
  mismatch: "No coincide",
};

export const NAME_MATCH_BADGE: Record<NameMatch, string> = {
  match: "badge badge-release",
  partial: "badge badge-verify",
  mismatch: "badge badge-hold",
};

/**
 * The one-cent verification, state by state.
 *
 * Every label is what happened and not what it means, because the meaning is
 * the decision underneath and that is a separate line on screen. "Pago
 * liberado" and "pago bloqueado" name the large payment, never the cent: the
 * cent always goes out, and confusing the two is how a clerk reads "liberado"
 * as "the centavo left".
 */
export const VERIFICATION_LABEL: Record<VerificationStateName, string> = {
  not_started: "Sin verificar",
  cent_sent: "Centavo enviado",
  awaiting_cep: "Esperando el CEP",
  cep_signed: "CEP firmado por Banxico",
  released: "Pago liberado",
  blocked: "Pago bloqueado",
};

export const VERIFICATION_BADGE: Record<VerificationStateName, string> = {
  not_started: "badge badge-neutral",
  cent_sent: "badge badge-verify",
  awaiting_cep: "badge badge-verify",
  cep_signed: "badge badge-neutral",
  released: "badge badge-release",
  blocked: "badge badge-hold",
};

export const VERIFICATION_HELP: Record<VerificationStateName, string> = {
  not_started:
    "Nadie ha probado esta cuenta todavia. La verificacion manda un SPEI de un centavo dentro de la misma corrida.",
  cent_sent:
    "El centavo salio de la cuenta de la empresa y el banco devolvio la clave de rastreo. Nadie la escribio.",
  awaiting_cep:
    "Banxico publica el CEP cuando la transferencia liquida. En cuanto llega, el control se arma solo.",
  cep_signed:
    "El CEP ya esta y trae el titular de la cuenta. Se compara con la razon social del CFDI y se revisa el sello.",
  released:
    "El pago grande salio porque el titular coincide y la evidencia se sostiene.",
  blocked:
    "El pago grande no sale. La evidencia del CEP no sostiene que la cuenta sea del proveedor.",
};

/**
 * The cent is ours and the CEP is Banxico's, so the rail is named out loud.
 * In the demo the outflow is recorded on the company's Nessie mirror; STP is
 * the production path and says so rather than pretending to be live.
 */
export const RAIL_LABEL: Record<VerificationRail, string> = {
  nessie: "espejo Nessie",
  stp: "STP",
};

/**
 * The seal, in the only three words this screen may use. `not_checked` is
 * "no verificado" and never "valido": see `sealVerdictOf` in ./verification.ts,
 * which is the only place that maps it.
 */
export const SEAL_STATE_LABEL: Record<CepSealState, string> = {
  valid: "sello valido",
  not_checked: "sello no verificado",
  invalid: "sello invalido",
};

export const SEAL_STATE_BADGE: Record<CepSealState, string> = {
  valid: "badge badge-release",
  not_checked: "badge badge-verify",
  invalid: "badge badge-hold",
};

/**
 * The three levels, in the only three words this product uses for them.
 *
 * `confiable` is a statement about the evidence we hold and nothing more. It is
 * not "seguro": a SPEI cannot be recalled, so nobody can promise one is safe, and
 * ADR-0009 forbids the word as a verdict in any language along with every
 * probability, percentage and score. The level always arrives on screen with the
 * findings that produced it, which is why `CONFIDENCE_RULE_LABEL` exists: the rule
 * that fired is shown next to the level rather than left in a function.
 */
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  confiable: "Confiable",
  precaucion: "Precaucion",
  alerta: "Alerta",
};

/**
 * Worst first, which is the order a clerk scans a column in and the order the
 * token sheet lists them in.
 */
export const CONFIDENCE_ORDER: Confidence[] = [
  "alerta",
  "precaucion",
  "confiable",
];

/**
 * The chip reads the level palette in `design/tokens.css`, which aliases the
 * three decision triplets: the level and the action are two readings of one body
 * of evidence, so one colour still means one thing.
 */
export const CONFIDENCE_BADGE: Record<Confidence, string> = {
  confiable: "level level-confiable",
  precaucion: "level level-precaucion",
  alerta: "level level-alerta",
};

/**
 * How many of the three bars the meter fills beside the word.
 *
 * An ordinal over the same three values the word already carries, which is why
 * it is allowed: it adds a channel and not a digit, and red against amber is the
 * pair roughly one man in twelve cannot separate. It is not a score and must
 * never become one. See the note on `.level` in `design/primitives.css`.
 */
export const CONFIDENCE_BARS: Record<Confidence, number> = {
  alerta: 3,
  precaucion: 2,
  confiable: 1,
};

export const CONFIDENCE_HELP: Record<Confidence, string> = {
  confiable:
    "Los documentos que tenemos coinciden y no hay nada abierto en esta linea.",
  precaucion: "Falta una comprobacion humana o la cuenta no tiene historial.",
  alerta: "Los documentos ya prueban un problema en esta linea.",
};

/** Which rule gave the level, in the words of the table in ADR-0009. */
export const CONFIDENCE_RULE_LABEL: Record<ConfidenceRule, string> = {
  sat_definitive: "el proveedor esta listado en definitiva por el SAT",
  critical_finding: "hay un hallazgo critico",
  new_account_without_history: "la cuenta no tiene historial de pago detras",
  pending_verification: "falta una verificacion",
  warning_finding: "hay un hallazgo de atencion",
  no_open_signal: "no hay ninguna senal abierta",
};

/**
 * The state of one line, and the three public ones are not the whole set.
 *
 * `pendiente` and `liberado` are the two the run has always counted internally,
 * and they are labelled here rather than folded into the other three because a
 * line nobody has looked at is not green and a release on Wednesday is not
 * `enviado` until the money leaves on Thursday. ADR-0009 argues both.
 */
export const STATE_LABEL: Record<TransactionState, string> = {
  rojo: "En rojo",
  cancelado: "Cancelado",
  enviado: "Enviado",
  pendiente: "Pendiente",
  liberado: "Liberado",
};

/** In the order money moves through them, for the sheet and for a legend. */
export const STATE_ORDER: TransactionState[] = [
  "pendiente",
  "liberado",
  "rojo",
  "cancelado",
  "enviado",
];

/**
 * The chip reads the state palette, which is deliberately not the decision one
 * repeated, because a state is a fact about money and not a verdict about risk.
 *
 * `cancelado` is neutral on purpose: a line that did not go out is the product
 * working, not an alarm. `rojo` is the one that carries the hold palette.
 * `enviado` is the informational tone and not green, because money that left is
 * a fact and a green chip would say the payment was fine, which nobody can say
 * about a transfer that cannot be recalled and that a list published on Friday
 * can still poison. `pendiente` is dashed and fills with the surface it sits on,
 * because nothing has decided that line yet. ADR-0009 and `docs/design.md`.
 */
export const STATE_BADGE: Record<TransactionState, string> = {
  rojo: "state state-rojo",
  cancelado: "state state-cancelado",
  enviado: "state state-enviado",
  pendiente: "state state-pendiente",
  liberado: "state state-liberado",
};

/**
 * What each state means, for the one question the words alone do not answer:
 * whether anybody still has to do something about this line.
 */
export const STATE_HELP: Record<TransactionState, string> = {
  pendiente: "Nadie ha decidido esta linea todavia.",
  rojo: "Esta detenida y enfrente de una persona.",
  cancelado: "No sale en esta corrida, y el motivo va junto al estado.",
  liberado: "Nada la detiene y todavia no sale. Entra en la corrida.",
  enviado: "El dinero salio. Es lo unico aqui que no se puede deshacer.",
};

/**
 * What the rail did with one line, and the five states are never four.
 *
 * This is a different question from `STATE_LABEL` and that is why it is a second
 * dictionary rather than a merge: the state is where the payment stands for the
 * company, and this is what the rail said about it. `sent` and `settled` keep
 * different words and different colours because they are two different claims,
 * the first that we asked and the second that the rail says it happened, and
 * ADR-0008 calls collapsing them the one thing the demo must not do, since the CEP
 * exists to prove exactly that difference.
 */
export const PAYMENT_LINE_LABEL: Record<PaymentLineState, string> = {
  queued: "En cola",
  sent: "Enviado",
  settled: "Liquidado",
  failed: "Rechazado",
  cancelled: "Cancelado",
};

export const PAYMENT_LINE_BADGE: Record<PaymentLineState, string> = {
  queued: "badge badge-info",
  sent: "badge badge-verify",
  settled: "badge badge-release",
  failed: "badge badge-hold",
  cancelled: "badge badge-neutral",
};

export const PAYMENT_LINE_HELP: Record<PaymentLineState, string> = {
  queued: "El riel la acepto y todavia no sale.",
  sent: "Salio. El riel aun no la reconoce, y eso es otra afirmacion.",
  settled:
    "El riel reconocio la transferencia. Hasta aqui el recibo esta completo.",
  failed: "El riel la rechazo. El motivo va en la misma linea.",
  cancelled:
    "Se quedo fuera antes de enviar nada. El motivo va en la misma linea.",
};

/**
 * The nine reads the assistant may perform, named for the clerk.
 *
 * Every one of them is a read of something this product already computed, and the
 * list is closed: `AssistantTool` in the domain has no member that writes, which
 * is ADR-0007 enforced in the type rather than in a sentence. It grew from seven
 * to nine when the assistant panel landed, and the two that arrived are a supplier
 * drawer and the blind evaluation, so the sentence above still holds.
 */
export const ASSISTANT_TOOL_LABEL: Record<AssistantTool, string> = {
  get_run: "Leer la corrida",
  get_instruction: "Leer la instruccion y sus hallazgos",
  get_supplier: "Leer el historial del proveedor",
  get_verification: "Leer la verificacion de la cuenta",
  get_execution: "Leer lo que hizo la corrida en el riel",
  get_receipt: "Leer el comprobante del pago",
  sat_lookup: "Consultar las listas del SAT",
  consortium_signal: "Consultar la red SentryOne",
  get_metrics: "Leer la evaluacion a ciegas de los controles",
};

/** The five things the panel can offer, and there is no sixth. */
export const PROPOSAL_KIND_LABEL: Record<ProposalKind, string> = {
  verify_account: "Verificar la cuenta con un centavo",
  verify_call: "Llamar al proveedor para verificar",
  decide: "Registrar una decision",
  execute_run: "Enviar la corrida de pagos",
  intake: "Dar de alta la instruccion",
};

/** The button each proposal puts in front of a person, in their words. */
export const PROPOSAL_CONFIRM_LABEL: Record<ProposalKind, string> = {
  verify_account: "Enviar el centavo",
  verify_call: "Hacer la llamada",
  decide: "Firmar la decision",
  execute_run: "Abrir la corrida para enviarla",
  intake: "Dar de alta el pago",
};

export const ESTABLISHED_BY_LABEL: Record<string, string> = {
  payment_complement: "Complemento de pago",
  instruction: "Instruccion previa",
  cep: "CEP verificado",
};

/** The watermark text ADR-0002 requires on anything generated. */
export const SYNTHETIC_LABEL = "Datos sinteticos";

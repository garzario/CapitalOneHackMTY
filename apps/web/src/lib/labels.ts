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
  Detector,
  FindingState,
  InstructionSource,
  SatListStatus,
  Severity,
} from "@hackmty/core";
import type {
  CepSealState,
  Confidence,
  NameMatch,
  PaymentLineState,
  TransactionState,
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
 * The level, in the only three words this product has for it.
 *
 * ADR-0009 fixes them and forbids everything around them: no probability, no
 * percentage, no score, and never the word that would read as a guarantee about a
 * transfer nobody can recall. `confiable` is a statement about the evidence we
 * hold and the findings are rendered next to it, which is the only way it is ever
 * shown.
 */
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  confiable: "Confiable",
  precaucion: "Precaucion",
  alerta: "Alerta",
};

export const CONFIDENCE_BADGE: Record<Confidence, string> = {
  confiable: "badge badge-release",
  precaucion: "badge badge-verify",
  alerta: "badge badge-hold",
};

export const CONFIDENCE_HELP: Record<Confidence, string> = {
  confiable:
    "Los documentos que tenemos coinciden y no hay nada abierto. No es una garantia: un SPEI no regresa.",
  precaucion:
    "Falta una comprobacion o la cuenta no tiene historial de pagos detras.",
  alerta: "Los documentos ya muestran un problema que cuesta dinero.",
};

/**
 * The state of a payment, in the three words a screen says plus the two the run
 * counts internally.
 *
 * `rojo` and `cancelado` share a colour and that is deliberate rather than lazy:
 * for a clerk both mean the same thing about the money, which is that it is not
 * leaving, and the word and the sentence next to it are what tell her whether
 * somebody still has to act. Painting them apart would invent a distinction the
 * palette does not have.
 */
export const TRANSACTION_STATE_LABEL: Record<TransactionState, string> = {
  pendiente: "Pendiente",
  rojo: "Rojo",
  cancelado: "Cancelado",
  liberado: "Liberado",
  enviado: "Enviado",
};

export const TRANSACTION_STATE_BADGE: Record<TransactionState, string> = {
  pendiente: "badge badge-neutral",
  rojo: "badge badge-hold",
  cancelado: "badge badge-hold",
  liberado: "badge badge-info",
  enviado: "badge badge-release",
};

export const TRANSACTION_STATE_HELP: Record<TransactionState, string> = {
  pendiente: "Nadie ha decidido esta linea todavia.",
  rojo: "Esta detenida y enfrente de una persona.",
  cancelado: "No sale en esta corrida, y el motivo va junto al estado.",
  liberado: "Nada la detiene y todavia no sale. Entra en la corrida.",
  enviado: "El dinero salio. Es lo unico aqui que no se puede deshacer.",
};

/**
 * What the rail did with one line, and the five states are never four.
 *
 * `sent` and `settled` keep different words and different colours because they
 * are two different claims: the first is that we asked, the second is that the
 * rail says it happened. ADR-0008 calls collapsing them the one thing the demo
 * must not do, since the CEP exists to prove exactly that difference.
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

export const ESTABLISHED_BY_LABEL: Record<string, string> = {
  payment_complement: "Complemento de pago",
  instruction: "Instruccion previa",
  cep: "CEP verificado",
};

/** The watermark text ADR-0002 requires on anything generated. */
export const SYNTHETIC_LABEL = "datos sinteticos";

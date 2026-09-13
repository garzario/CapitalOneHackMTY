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
  NameMatch,
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

export const ESTABLISHED_BY_LABEL: Record<string, string> = {
  payment_complement: "Complemento de pago",
  instruction: "Instruccion previa",
  cep: "CEP verificado",
};

/** The watermark text ADR-0002 requires on anything generated. */
export const SYNTHETIC_LABEL = "Datos sinteticos";

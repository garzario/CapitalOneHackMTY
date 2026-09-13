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
import type { NameMatch } from "./contract";

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

export const ESTABLISHED_BY_LABEL: Record<string, string> = {
  payment_complement: "Complemento de pago",
  instruction: "Instruccion previa",
  cep: "CEP verificado",
};

/** The watermark text ADR-0002 requires on anything generated. */
export const SYNTHETIC_LABEL = "Datos sinteticos";

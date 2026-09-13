/**
 * What the entry screen says about the person acting and about this build, and
 * how it works out what that person may do.
 *
 * Two rules shape the whole file and neither is a preference.
 *
 * **The gate is asked of `packages/core`, never answered here.** What a decision
 * requires of whoever makes it is `decideRequirement` in
 * `packages/core/src/actor.ts`, the same function `apps/api` enforces and the
 * assistant panel shows before anybody presses anything. So each row of the
 * capability list carries the `DecideRequest` it is about and the screen asks
 * core, which is why the offer on screen and the refusal from the API cannot
 * disagree: a fourth implementation of "can Lupita release this" is how a screen
 * offers a button that answers `403`.
 *
 * **Every number on the settings panel is read out of the constant it lives in,
 * and the screen prints where that is.** The thresholds are not retyped here:
 * they are interpolated from `@hackmty/core`, so the screen cannot drift from the
 * engine, and `entry.test.ts` fails when a row names a file or a constant the
 * repository does not have. That is the repository's rule about numbers applied
 * to a screen rather than to a document.
 *
 * Nothing here is editable, and the screen says so in those words. A threshold a
 * person can move from the UI is a threshold that no longer matches the tests,
 * the documents or the run a judge is looking at; it moves in a pull request.
 */

import type {
  Actor,
  ActorRole,
  DecideRequest,
  DecideRule,
} from "@hackmty/core";
import {
  CLABE_CRITICAL_MAX_OPERATIONS,
  CLABE_NEAR_MISS_MAX_OPERATIONS,
  DEFAULT_RECONCILIATION_TOLERANCE,
  DEFAULT_RECONCILIATION_WINDOW_DAYS,
  DUPLICATE_INVOICE_DEFAULTS,
  decideRequirement,
  HOLD_WINDOW_DAYS,
  roleSatisfies,
  SUPPLIER_BEHAVIOUR_DEFAULTS,
} from "@hackmty/core";
import { formatDecimal, formatMoney, formatPlural } from "./format";

/** Who each of the two people is in this company, in one sentence. */
export const ROLE_DETAIL: Readonly<Record<ActorRole, string>> = {
  clerk:
    "Arma la corrida de los jueves y resuelve cada linea. Casi todo en este producto es su trabajo, el envio de la corrida incluido.",
  owner:
    "Aparece para aprobar una excepcion y para nada mas: esta empresa no tiene una cadena de firmas, y una que no existe es un control que se brinca por fuera del producto.",
};

/**
 * One shape of a decision, and the request core is asked about it.
 *
 * The request is the evidence of the claim: `capabilityVerdict` runs it through
 * `decideRequirement`, and the test asserts that each one really produces the
 * rule its row names. A list of three sentences about roles would be prose that
 * can rot; this is the rule itself, rendered.
 */
export type EntryCapability = {
  id: DecideRule;
  title: string;
  detail: string;
  request: DecideRequest;
};

export const CAPABILITIES: readonly EntryCapability[] = [
  {
    id: "ordinary",
    title: "Retener, verificar o liberar una linea sin nada en contra",
    detail:
      "La corrida de todos los jueves. Ninguna de las tres decisiones ordinarias pide una segunda firma.",
    request: { action: "hold" },
  },
  {
    id: "override_release",
    title: "Liberar una linea que algo esta deteniendo",
    detail:
      "Pasar por encima de la evidencia: la linea no es confiable o la decision anterior la retenia. Pide el motivo por escrito y queda con el nombre en el ledger.",
    request: { action: "release", standing: { action: "hold" } },
  },
  {
    id: "reopen_cancelled",
    title: "Reabrir una linea que la corrida ya cancelo",
    detail:
      "Una linea cancelada esta cerrada: el dinero no salio y el registro lo dice. Volver a ponerla enfrente de la corrida es una segunda decision sobre los mismos pesos.",
    request: { action: "hold", cancelled: true },
  },
];

export type CapabilityVerdict = {
  rule: DecideRule;
  requiresRole: ActorRole;
  requiresReason: boolean;
  /** Whether the person selected on this screen may do it. */
  allowed: boolean;
};

/** What this shape asks for, and whether this person satisfies it. */
export function capabilityVerdict(
  capability: EntryCapability,
  actor: Actor,
): CapabilityVerdict {
  const requirement = decideRequirement(capability.request);

  return {
    rule: requirement.rule,
    requiresRole: requirement.requiresRole,
    requiresReason: requirement.requiresReason,
    allowed: roleSatisfies(actor.role, requirement.requiresRole),
  };
}

/**
 * One threshold of the engine, read off the constant and shown with its address.
 *
 * `file` is relative to the repository root and `constants` are the exported
 * names in it, so the claim on screen is checkable without leaving the table.
 */
export type Threshold = {
  /** What the number decides, in the words a clerk would use. */
  question: string;
  /** The number itself, interpolated from the constant. */
  value: string;
  file: string;
  constants: readonly string[];
};

/**
 * The six the screens and the findings actually depend on.
 *
 * Two are deliberately absent. The per-severity loss priors of
 * `LOSS_PROBABILITY_BY_SEVERITY` are not shown, because ADR-0009 forbids a
 * probability on a screen of this product and their own comment says they are
 * priors rather than a measured calibration. Nor is the concentration share,
 * for the first half of that same sentence: it would put a percentage on screen
 * to explain a threshold, and the blind evaluation in `#/metrics` is where this
 * product reports how well the controls do.
 */
export const THRESHOLDS: readonly Threshold[] = [
  {
    question: "Cuando una cuenta se parece a una que ya le pagamos",
    value: `Hasta ${formatPlural(CLABE_NEAR_MISS_MAX_OPERATIONS, "cambio")} la lee como la misma cuenta mal escrita. Con ${CLABE_CRITICAL_MAX_OPERATIONS} o menos, el hallazgo es critico y la corrida se detiene.`,
    file: "packages/core/src/clabe.ts",
    constants: [
      "CLABE_NEAR_MISS_MAX_OPERATIONS",
      "CLABE_CRITICAL_MAX_OPERATIONS",
    ],
  },
  {
    question:
      "Cuando dos facturas del mismo monto se leen como un solo pagadero",
    value: `Dentro de ${formatPlural(DUPLICATE_INVOICE_DEFAULTS.amountWindowDays, "dia")}, el largo de una corrida, para que un duplicado que cruza dos semanas siga saliendo.`,
    file: "packages/core/src/duplicates.ts",
    constants: ["DUPLICATE_INVOICE_DEFAULTS"],
  },
  {
    question: "Cuanta historia necesita un proveedor para poder medirlo",
    value: `${formatPlural(SUPPLIER_BEHAVIOUR_DEFAULTS.minBaselineInvoices, "factura")} en las ultimas ${formatPlural(SUPPLIER_BEHAVIOUR_DEFAULTS.baselineWeeks, "semana")}, contra la ${formatPlural(SUPPLIER_BEHAVIOUR_DEFAULTS.recentWeeks, "semana")} en revision. Por debajo de eso el detector se calla en lugar de bajar la vara.`,
    file: "packages/core/src/behaviour.ts",
    constants: ["SUPPLIER_BEHAVIOUR_DEFAULTS"],
  },
  {
    question: "Cuando el monto de un proveedor cuenta como un salto",
    value: `Una z robusta de ${formatDecimal(SUPPLIER_BEHAVIOUR_DEFAULTS.amountZThreshold)} sobre su propia historia en escala logaritmica. Cada proveedor se compara consigo mismo y nunca con los demas.`,
    file: "packages/core/src/behaviour.ts",
    constants: ["SUPPLIER_BEHAVIOUR_DEFAULTS"],
  },
  {
    question:
      "Con cuanta holgura se amarra un pago con el movimiento del banco",
    value: `${formatMoney(DEFAULT_RECONCILIATION_TOLERANCE)} y ${formatPlural(DEFAULT_RECONCILIATION_WINDOW_DAYS, "dia")} de cada lado, porque el espejo redondea los centavos y una instruccion del viernes cae el lunes.`,
    file: "packages/core/src/reconciliation.ts",
    constants: [
      "DEFAULT_RECONCILIATION_TOLERANCE",
      "DEFAULT_RECONCILIATION_WINDOW_DAYS",
    ],
  },
  {
    question: "Cuanto tiempo detiene el dinero cada decision",
    value: `Retener, ${formatPlural(HOLD_WINDOW_DAYS.hold, "dia")}. Verificar, ${formatPlural(HOLD_WINDOW_DAYS.verify, "dia")}. Al cerrarse la ventana el pago vuelve enfrente de una persona: nada se libera solo.`,
    file: "packages/core/src/hold.ts",
    constants: ["HOLD_WINDOW_DAYS"],
  },
];

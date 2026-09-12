/**
 * The one-cent verification, as data. No React in this file on purpose.
 *
 * The screen that renders this beat has one job it cannot get wrong: saying
 * what the API actually reported. Three of the four functions here exist
 * because a component is the wrong place to decide any of them.
 *
 * 1. `sealVerdictOf` is the only place a seal state becomes Spanish. A seal
 *    reads as valid when, and only when, the server said `valid`. Everything
 *    else, including a value this build has never heard of, reads as "no
 *    verificado", because the alternative is a screen that promotes a document
 *    nobody verified into evidence. That is the single most expensive lie this
 *    product could tell, so it is one function with a test around it.
 * 2. `eventNamesInstruction` decides whether a ledger event over SSE is about
 *    the instruction on screen. It reads the event structurally rather than
 *    switching on `type`, because the two kinds this screen exists for,
 *    `cent_sent` and `cep_awaited`, are added to the union in a different
 *    workstream (issue 166): a switch would compile, drop both, and leave the
 *    screen frozen on "centavo enviado" with no way to tell.
 * 3. `verificationFailure` turns the documented refusals into sentences a
 *    clerk can act on. A 409 and a 503 are not errors in the same sense: one
 *    says the payment is already decided, the other says this deployment has no
 *    rail, and only the second one is something to go and fix.
 *
 * `advanceMockVerification` is the offline demo, and it only ever moves the
 * first two beats. Nothing here invents a CEP or a holder name: a signed
 * document is evidence and a fabricated one would be a fabricated claim.
 */

import type { ApiFailure } from "./api";
import type {
  CepSealState,
  VerificationState,
  VerificationStateName,
} from "./contract";
import { SEAL_STATE_BADGE, SEAL_STATE_LABEL } from "./labels";

export interface SealVerdict {
  /** What this build decided the reported value means. */
  state: CepSealState;
  label: string;
  badge: string;
  /** One sentence under the badge, in the register the rest of the app uses. */
  detail: string;
}

const SEAL_DETAIL: Record<CepSealState, string> = {
  valid:
    "El sello del CEP valido contra el certificado de Banxico. Es la evidencia mas fuerte que tiene este producto.",
  not_checked:
    "El CEP se leyo completo y el sello no se verifico, porque este servidor no tiene el certificado de Banxico. No verificado no quiere decir invalido: son dos afirmaciones distintas y solo una es nuestra.",
  invalid:
    "El sello no valido contra el certificado. Conviene descargar el CEP otra vez del portal de Banxico antes de concluir nada.",
};

/**
 * The seal the API reported, in the only three words this screen may use.
 *
 * The parameter is a plain string and not the union on purpose. The value
 * arrives over HTTP, so a server one version ahead can answer something this
 * build has never seen, and the safe reading of an unknown seal is "we did not
 * verify it". A union parameter would have made that case a type error at build
 * time and a `valido` badge at run time.
 */
export function sealVerdictOf(sealState: string): SealVerdict {
  const state: CepSealState =
    sealState === "valid"
      ? "valid"
      : sealState === "invalid"
        ? "invalid"
        : "not_checked";

  return {
    state,
    label: SEAL_STATE_LABEL[state],
    badge: SEAL_STATE_BADGE[state],
    detail: SEAL_DETAIL[state],
  };
}

/** The states in which the large payment is already resolved. */
const SETTLED: readonly VerificationStateName[] = ["released", "blocked"];

/** The states the pipeline is still moving through, so the screen keeps looking. */
const IN_FLIGHT: readonly VerificationStateName[] = [
  "cent_sent",
  "awaiting_cep",
];

export function isSettled(state: VerificationStateName): boolean {
  return SETTLED.includes(state);
}

export function isInFlight(state: VerificationStateName): boolean {
  return IN_FLIGHT.includes(state);
}

/**
 * What the screen shows for an instruction nobody has verified.
 *
 * The API answers this shape itself, and the offline run needs the same one, so
 * it is built in one place rather than typed twice with two different notions of
 * what "nothing happened yet" looks like.
 */
export function notStartedVerification(
  instructionId: string,
  updatedAt: string,
): VerificationState {
  return {
    instructionId,
    state: "not_started",
    rail: null,
    claveRastreo: null,
    centSentAt: null,
    cepAt: null,
    sealState: null,
    holderName: null,
    legalName: null,
    nameMatch: null,
    decision: null,
    updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function idOf(value: unknown, key: string): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const found = value[key];

  return typeof found === "string" ? found : null;
}

export interface EventSubject {
  instructionId: string;
  /** Matches `cep_verified`, which names a clave de rastreo and no instruction. */
  claveRastreo?: string | null;
}

/**
 * Whether this ledger event is about the instruction on screen.
 *
 * Read structurally, on the four places an identifier lives in the union:
 * `instructionId` on the flat events, `instruction.id` on intake,
 * `decision.instructionId` on a decision, and `cep.claveRastreo` on a verified
 * CEP, which is the one event that names the transfer rather than the payment.
 */
export function eventNamesInstruction(
  event: unknown,
  subject: EventSubject,
): boolean {
  if (!isRecord(event) || subject.instructionId === "") {
    return false;
  }

  if (idOf(event, "instructionId") === subject.instructionId) {
    return true;
  }

  if (idOf(event.instruction, "id") === subject.instructionId) {
    return true;
  }

  if (idOf(event.decision, "instructionId") === subject.instructionId) {
    return true;
  }

  const clave = subject.claveRastreo;

  return (
    typeof clave === "string" &&
    clave !== "" &&
    idOf(event.cep, "claveRastreo") === clave
  );
}

export interface VerificationFailure {
  title: string;
  message: string;
}

/**
 * The documented refusals of `POST /api/v1/instructions/:id/verify-account`, as
 * sentences.
 *
 * The 503 keeps the API's own message next to ours, because that is the one
 * that names which configuration is missing, and whoever is reading the screen
 * during a demo is also the person who can fix it. It names variables and never
 * values: the sentence comes from the server, and the server does not print
 * secrets.
 */
export function verificationFailure(failure: ApiFailure): VerificationFailure {
  switch (failure.status) {
    case 404:
      return {
        title: "No existe esa verificacion",
        /* The API's own sentence stays, because a 404 has two readings and only
           it can tell them apart: a folio this instance does not hold, or a
           server that does not expose the route yet. */
        message: `Esta API no contesto por ese folio. Revisalo contra la corrida de pagos y confirma que este servidor ya expone la ruta de verificacion. ${failure.message}`,
      };
    case 409:
      return {
        title: "Este pago ya se resolvio",
        message:
          "La instruccion ya esta liberada o bloqueada. La verificacion no se repite sobre una decision que ya se tomo, y el centavo no se manda dos veces.",
      };
    case 503:
      return {
        title: "No hay riel configurado",
        message: `Este servidor no puede mandar el centavo: falta la configuracion del riel (RAIL, o las variables STP_ de produccion). Sin riel no sale nada y no se inventa una clave de rastreo. ${failure.message}`,
      };
    default:
      return {
        title: "No se pudo verificar la cuenta",
        message: failure.message,
      };
  }
}

/**
 * A clave de rastreo for the offline run, derived from the instruction.
 *
 * Deterministic so the same synthetic row always shows the same key, and
 * prefixed `SYN` so nobody mistakes it for something a bank answered. In front
 * of the API this function is never called: the key comes from the rail.
 */
export function syntheticClaveRastreo(
  instructionId: string,
  at: string,
): string {
  const day = at.slice(0, 10).replace(/-/g, "");
  const tail = instructionId
    .replace(/[^0-9a-zA-Z]/g, "")
    .toUpperCase()
    .slice(-6);

  return `SYN${day}${tail}`;
}

/**
 * The offline beat, one step at a time.
 *
 * It moves `not_started` to `cent_sent` and `cent_sent` to `awaiting_cep`, and
 * it stops there. Everything past that point needs a document Banxico signed,
 * and a browser with no API has none: a mock that walked itself to "CEP firmado
 * por Banxico" would be inventing the evidence the whole control rests on. The
 * states after the CEP are in the synthetic run already, on the instructions
 * that carry them, so `?data=mock` still renders all six.
 */
export function advanceMockVerification(
  current: VerificationState,
  at: string,
): VerificationState {
  if (current.state === "not_started") {
    return {
      ...current,
      state: "cent_sent",
      rail: "nessie",
      claveRastreo: syntheticClaveRastreo(current.instructionId, at),
      centSentAt: at,
      updatedAt: at,
    };
  }

  if (current.state === "cent_sent") {
    return { ...current, state: "awaiting_cep", updatedAt: at };
  }

  return current;
}

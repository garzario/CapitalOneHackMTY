/**
 * The call of the last stop of the recorrido, as rules instead of as a component.
 *
 * The visitor types ten digits and hears the call the owner of the company would
 * hear about a payment that is being held. Everything in this file is the part of
 * that which can be decided without a screen: what a telephone number has to look
 * like before anything is sent, which ledger event belongs to which call, what each
 * of the four answers means, and what to say when the API refuses.
 *
 * Three things are deliberately here rather than in `TourCall.tsx`.
 *
 * **The number never leaves as anything but a body.** `toE164` builds the one
 * string the endpoint takes, the prefix is fixed in the interface so a visitor
 * cannot send a number from another country by accident, and nothing in this file
 * logs, stores or puts a telephone number in a URL. The API keeps a salted hash and
 * not the number, and the copy says so where a person reads it rather than only
 * here.
 *
 * **The outcome is not a verdict.** Four answers come back and two of them are the
 * telephone rather than the owner: nobody answered, and the answer did not parse.
 * Neither of those releases anything, and the sentence each one prints says what
 * happened to the line instead of rounding it to one of the other two.
 *
 * **A call never releases a payment by itself.** `hold` and `release` both land as
 * an ordinary decision with the owner's name on it, through the same endpoint the
 * instruction screen uses. What this file does is read the ledger back.
 */

import type { LedgerEvent, TransactionState } from "@hackmty/core";
import type { ApiFailure } from "./api";
import type {
  TourCallScript,
  TourCallState,
  TourCallStatus,
  TourHero,
  TourOwnerOutcome,
  TourVerificationCallFields,
} from "./contract";
import { formatMoney } from "./format";

/* ----------------------------------------------------------- the number */

/** Fixed in the interface, so the field holds ten digits and nothing else. */
export const PHONE_PREFIX = "+52";

/** A Mexican mobile in E.164 is the prefix plus ten digits. Nothing else. */
export const PHONE_DIGITS = 10;

/**
 * The digits of whatever was typed or pasted.
 *
 * A pasted number arrives in every shape a telephone is ever written in:
 * `81 1234 5678`, `(81) 1234-5678`, `+52 81 1234 5678`. The country code is
 * dropped when it is there, because the prefix is already on the field and a
 * visitor who pasted a complete number would otherwise be two digits over the
 * limit and see the last two of their own number disappear.
 */
export function keepDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const national =
    digits.length > PHONE_DIGITS && digits.startsWith("52")
      ? digits.slice(2)
      : digits;

  return national.slice(0, PHONE_DIGITS);
}

/** `8112345678` reads as `81 1234 5678`, which is how it is said out loud. */
export function formatPhone(digits: string): string {
  const kept = keepDigits(digits);
  const parts = [kept.slice(0, 2), kept.slice(2, 6), kept.slice(6, 10)];

  return parts.filter((part) => part !== "").join(" ");
}

export function isPhoneComplete(digits: string): boolean {
  return keepDigits(digits).length === PHONE_DIGITS;
}

/**
 * What is wrong with the number, in one sentence, or null when nothing is.
 *
 * It counts what is missing rather than saying "numero invalido": a person who is
 * one digit short should be told that they are one digit short.
 */
export function phoneProblem(digits: string): string | null {
  const kept = keepDigits(digits);

  if (kept.length === 0) {
    return "Escribe los 10 digitos de un celular, despues del +52.";
  }

  if (kept.length < PHONE_DIGITS) {
    const missing = PHONE_DIGITS - kept.length;

    return missing === 1
      ? "Falta 1 digito: son 10 despues del +52."
      : `Faltan ${missing} digitos: son 10 despues del +52.`;
  }

  return null;
}

/** The one string the endpoint takes. Built here, sent in the body, never logged. */
export function toE164(digits: string): string {
  return `${PHONE_PREFIX}${keepDigits(digits)}`;
}

/**
 * The rule the API applies, applied here first.
 *
 * The same regular expression as the endpoint, so the page can refuse before the
 * request instead of rendering a 400 the visitor cannot act on.
 */
export function isMexicanMobile(value: string): boolean {
  return /^\+52\d{10}$/.test(value);
}

/* ----------------------------------------------------------- what it says */

/** The exact sentence a person ticks. It is the consent, so it is not paraphrased. */
export const CONSENT_TEXT =
  "Acepto que SentryOne me llame una vez a este numero. No se guarda: solo un hash con sal.";

export const CALL_NOTE =
  "Vas a recibir la llamada que recibiria el dueno de la empresa cuando hay un pago en riesgo. Contesta con tu voz: retenerlo o liberarlo.";

export const CALL_BUTTON = "Llamame como dueno";

export const CALL_BUSY = "Marcando";

/** The four steps of the strip, in the provider's own vocabulary. */
export const TOUR_CALL_STATUS_LABEL: Record<TourCallStatus, string> = {
  initiated: "Marcando",
  "in-progress": "En llamada",
  processing: "Procesando",
  done: "Termino",
  failed: "No se pudo completar",
};

/** In the order they happen, so the strip can draw what is behind and ahead. */
export const TOUR_CALL_STATUS_ORDER: TourCallStatus[] = [
  "initiated",
  "in-progress",
  "processing",
  "done",
];

/**
 * What each answer did to the line.
 *
 * `no_answer` and `unclear` say that the line is still held, which is the true
 * answer and the conservative one: nothing about a telephone that did not answer
 * changes a payment this product is holding.
 */
export const OUTCOME_SENTENCE: Record<TourOwnerOutcome, string> = {
  hold: "El dueno la retuvo por telefono.",
  release: "El dueno la libero bajo su nombre.",
  no_answer: "Nadie contesto, asi que la linea sigue retenida.",
  unclear: "La respuesta no quedo clara, asi que la linea sigue retenida.",
};

/**
 * Where the line stands after the call, in the vocabulary of ADR-0009.
 *
 * `release` is the only one of the four that moves it, and the two that are the
 * telephone rather than the owner leave it exactly where it was.
 */
export function outcomeState(outcome: TourOwnerOutcome): TransactionState {
  return outcome === "release" ? "liberado" : "rojo";
}

/** Whether the line is still being held after this answer. */
export function stillHeld(outcome: TourOwnerOutcome): boolean {
  return outcome !== "release";
}

/**
 * How long the tour's own decision stands, as a sentence, computed from the number
 * the API sent rather than written out in words.
 *
 * A tour that says ten minutes over a server configured for two is a tour that
 * lies about the one promise it makes, and `TOUR_REVERT_MS` is configurable. Zero
 * disables the revert, and then the sentence says that instead of counting down to
 * nothing.
 */
export function revertSentence(ms: number): string {
  if (ms <= 0) {
    return "Esta instancia no la revierte sola: queda como la dejaste.";
  }

  /* Under a minute is said in seconds, and the comparison is on the milliseconds
     rather than on the rounded minutes: half a minute rounds up to one, so a
     server configured for thirty seconds would have promised sixty. */
  if (ms < 60_000) {
    const seconds = Math.max(1, Math.round(ms / 1000));

    return `Se revierte sola en ${seconds} segundos.`;
  }

  const minutes = Math.round(ms / 60_000);

  return minutes === 1
    ? "Se revierte sola en 1 minuto."
    : `Se revierte sola en ${minutes} minutos.`;
}

/* --------------------------------------------------------- the ledger back */

function isOutcome(value: unknown): value is TourOwnerOutcome {
  return (
    value === "hold" ||
    value === "release" ||
    value === "no_answer" ||
    value === "unclear"
  );
}

/**
 * The tour's own fields of a `verification_call` event, when this event is the one
 * this page is waiting for.
 *
 * Three things have to be true at once and all three are checked: the event is a
 * verification call, its line is the owner rather than the supplier, and the
 * conversation is the one this page started. The stream carries every event of the
 * whole company, so a call somebody else started in another tab must not move this
 * card, and a supplier call on the same instruction must not either.
 *
 * The fields are read off the event defensively rather than cast, because the
 * domain type does not carry them: they are the optional extras
 * `contract.ts` documents, and a server that has not shipped them yet answers an
 * ordinary verification call that this correctly ignores.
 */
export function tourCallFields(
  event: LedgerEvent,
  conversationId: string,
): TourVerificationCallFields | null {
  if (event.type !== "verification_call") {
    return null;
  }

  const extra = event as unknown as Record<string, unknown>;

  if (extra.line !== "owner") {
    return null;
  }

  if (
    typeof extra.conversationId !== "string" ||
    extra.conversationId !== conversationId
  ) {
    return null;
  }

  if (!isOutcome(extra.ownerOutcome)) {
    return null;
  }

  return {
    line: "owner",
    conversationId: extra.conversationId,
    phoneHash: typeof extra.phoneHash === "string" ? extra.phoneHash : "",
    ownerOutcome: extra.ownerOutcome,
    question: typeof extra.question === "string" ? extra.question : "",
  };
}

/**
 * The state the card shows once the event has arrived.
 *
 * An event on the stream means the call is over, so the status is `done` and the
 * `GET` that would have said the same thing is never needed. The evidence is the
 * sentence the outcome was read from, quoted on the card, and it is absent on an
 * event that carried none rather than invented.
 */
export function stateFromEvent(
  event: LedgerEvent,
  conversationId: string,
): TourCallState | null {
  const fields = tourCallFields(event, conversationId);

  if (fields === null) {
    return null;
  }

  const extra = event as unknown as Record<string, unknown>;
  const evidence = typeof extra.evidence === "string" ? extra.evidence : "";

  return {
    conversationId,
    status: "done",
    ownerOutcome: fields.ownerOutcome,
    ...(evidence === "" ? {} : { evidence }),
  };
}

/** Whether a status is one the page still has to keep asking about. */
export function isSettled(status: TourCallStatus): boolean {
  return status === "done" || status === "failed";
}

/* ------------------------------------------------------------- a refusal */

/** How long to wait, in the words a person waits in. */
export function retryAfter(seconds: number | undefined): string {
  if (seconds === undefined || seconds <= 0) {
    return "Intenta de nuevo en un rato.";
  }

  if (seconds < 60) {
    return `Intenta de nuevo en ${Math.ceil(seconds)} segundos.`;
  }

  const minutes = Math.ceil(seconds / 60);

  return minutes === 1
    ? "Intenta de nuevo en 1 minuto."
    : `Intenta de nuevo en ${minutes} minutos.`;
}

/**
 * What to say about a refusal, by status and never by the message alone.
 *
 * Each of the four is a different thing to tell a visitor, and three of them are
 * not failures: the tour without telephony still has a script to read, the
 * rate limiter is the product protecting a stranger's telephone, and a 400 is the
 * number. The API's own sentence is appended where it adds something, because the
 * envelope is the contract and paraphrasing it loses the reason.
 */
export function callProblem(failure: ApiFailure): string {
  if (failure.status === 403) {
    return "Este servidor tiene las llamadas del recorrido apagadas. El guion de abajo es lo que diria el agente.";
  }

  if (failure.status === 422) {
    return "Este servidor no tiene la voz configurada, asi que no puede marcar. El guion de abajo es lo que diria el agente, palabra por palabra.";
  }

  if (failure.status === 429) {
    return `Ya hubo una llamada a este numero hace poco. ${retryAfter(failure.retryAfterSeconds)}`;
  }

  if (failure.status === 400) {
    return `El numero o el consentimiento no pasaron la validacion. ${failure.message}`;
  }

  return failure.message;
}

/**
 * The body of the request, built in one place.
 *
 * `consent` is the literal `true` the contract asks for, so a caller cannot reach
 * the endpoint without a person having ticked the box, and the phone is the E.164
 * string and not whatever was typed.
 */
export function callBody(digits: string): { phone: string; consent: true } {
  return { phone: toE164(digits), consent: true };
}

/* --------------------------------------------------------------- the words */

/**
 * The script, built in the browser, for a page that cannot ask a server for it.
 *
 * It is the stand-in and never the authority: the moment the API answers, with a
 * 202 or with its 422, the script it sent replaces this one. It exists because the
 * offline mode promises that no request leaves the browser, and the stop whose
 * whole point is what the owner hears cannot be empty there.
 *
 * Two rules it obeys, and both are the verification call's: the account is four
 * digits and never the eighteen, and nothing in it promises a payment. It says
 * which line it is about and asks one question.
 */
export function localScript(hero: TourHero): TourCallScript {
  const plaza =
    hero.plazaNew !== "" && hero.plazaUsual !== ""
      ? `La cuenta nueva se abrio en la plaza ${hero.plazaNew}, y la de siempre esta en ${hero.plazaUsual}.`
      : "La cuenta no es la que esta empresa le ha pagado antes.";

  return {
    firstMessage:
      "Hola, le llamo de SentryOne, el sistema de pagos de su empresa. Hay un pago detenido de la corrida de esta semana y necesito su decision. Le tomo un minuto.",
    question: "Digame si la retenemos, o si usted la libera.",
    spoken: [
      `El pago es para ${hero.supplierName}, por ${formatMoney(hero.amount)}.`,
      `La cuenta que llego termina en ${hero.accountLast4}. ${plaza}`,
      "No le voy a leer la cuenta completa, ni un digito de la cuenta de siempre.",
      "Si prefiere revisarlo, la dejamos retenida y no sale nada.",
    ],
  };
}

/**
 * What a simulated answer quotes, marked as simulated wherever it is shown.
 *
 * A sentence is needed because the card quotes the words an outcome was read from,
 * and an empty quotation next to a badge reads as a call that said nothing. The
 * two that a person can answer are written here, once, so a component cannot
 * invent a third; the two the telephone produces quote nothing, because nobody
 * said anything.
 */
export const SIMULATED_EVIDENCE: Record<TourOwnerOutcome, string> = {
  hold: "No, ese cambio de cuenta no lo autorice yo. Detenla.",
  release: "Si, ese cambio lo hicimos nosotros. Liberala.",
  no_answer: "",
  unclear: "",
};

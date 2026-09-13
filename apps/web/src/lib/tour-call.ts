/**
 * The call of the last stop of the recorrido, as rules instead of as a component.
 *
 * The visitor types a telephone number and hears the call the owner of the company
 * would hear about a payment that is being held. Everything in this file is the
 * part of that which can be decided without a screen: how whatever was typed
 * becomes one E.164 number, which ledger event belongs to which call, what each of
 * the four answers means, and what to say when the API refuses.
 *
 * Three things are deliberately here rather than in `TourCall.tsx`.
 *
 * **The number never leaves as anything but a body.** `toE164` builds the one
 * string the endpoint takes out of whatever shape a person wrote it in, and
 * nothing in this file logs, stores or puts a telephone number in a URL. The API
 * keeps a salted hash and not the number.
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

/**
 * The fewest digits this field refuses to work with, and the only thing it
 * refuses.
 *
 * Eight is the shortest number the endpoint itself accepts, so anything under it
 * is somebody who is still typing rather than somebody with a number. Above it
 * the field takes what it was given: a form that argues with a visitor about the
 * shape of their own telephone is a form that never places a call, and a number
 * this file guessed wrong about is a refusal the API can explain and this one
 * cannot.
 */
export const MIN_PHONE_DIGITS = 8;

/** The digits of whatever was typed. Spaces, dashes and brackets are noise. */
export function digitsOf(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * The one string the endpoint takes, out of every shape a telephone is written
 * in.
 *
 * The rules, in the order they are applied, and each one is a thing somebody
 * actually types at a stand:
 *
 * - a leading `+` is kept, whatever country follows it, because a person who
 *   wrote their country code knows it better than this file does;
 * - `00` is the same `+` written the way most of the world dials it;
 * - ten bare digits is the Mexican mobile of the company this demo is about,
 *   so it gets `+52`;
 * - eleven starting in `1` already carries the United States and Canada code;
 * - twelve or thirteen starting in `52` is a Mexican number that carries its
 *   country code and lost the plus, `52 1 81 ...` included;
 * - anything else is sent exactly as it was written, because guessing a country
 *   for it would be dialling a number nobody typed.
 *
 * Nothing here caps, trims or rewrites a digit. The version this replaced kept
 * ten digits and dropped the rest, so `+52 1 81 1234 5678` became a different
 * telephone number and a pasted foreign number lost its last digits on screen.
 */
export function toE164(raw: string): string {
  const digits = digitsOf(raw);

  if (digits === "") {
    return "";
  }

  if (raw.trim().startsWith("+")) {
    return `+${digits}`;
  }

  if (digits.startsWith("00")) {
    return `+${digits.slice(2)}`;
  }

  if (digits.length === 10) {
    return `+52${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith("52")
  ) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

/**
 * The normalised number, grouped the way it is said out loud.
 *
 * Only the two shapes this demo can read aloud are grouped; everything else is
 * printed as the E.164 string it is, because inventing groups for a country
 * whose numbering plan this file does not know would be a screen making up a
 * telephone number.
 */
export function groupE164(phone: string): string {
  if (/^\+52\d{10}$/.test(phone)) {
    return `+52 ${phone.slice(3, 5)} ${phone.slice(5, 9)} ${phone.slice(9)}`;
  }

  if (/^\+521\d{10}$/.test(phone)) {
    return `+52 1 ${phone.slice(4, 6)} ${phone.slice(6, 10)} ${phone.slice(10)}`;
  }

  if (/^\+1\d{10}$/.test(phone)) {
    return `+1 ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
  }

  return phone;
}

/**
 * What the field says under itself before anybody presses anything.
 *
 * The number that is about to be dialled, in full. It is the whole answer to the
 * question the old fixed `+52` chip was pretending to answer: a visitor sees
 * which telephone this is going to ring while they can still correct it.
 */
export function dialNote(raw: string): string {
  const phone = toE164(raw);

  return phone === "" ? "" : `Marcaremos a ${groupE164(phone)}`;
}

/** Whether there is enough here to dial. Eight digits, and nothing else. */
export function isPhoneComplete(raw: string): boolean {
  return digitsOf(raw).length >= MIN_PHONE_DIGITS;
}

/**
 * What is wrong with the number, in one sentence, or null when nothing is.
 *
 * It counts what is missing rather than saying "numero invalido": a person who is
 * one digit short should be told that they are one digit short.
 */
export function phoneProblem(raw: string): string | null {
  const digits = digitsOf(raw);

  if (digits.length === 0) {
    return "Escribe tu numero, como lo marcarias desde tu telefono.";
  }

  if (digits.length < MIN_PHONE_DIGITS) {
    const missing = MIN_PHONE_DIGITS - digits.length;

    return missing === 1 ? "Falta 1 digito." : `Faltan ${missing} digitos.`;
  }

  return null;
}

/* ----------------------------------------------------------- what it says */

/**
 * The exact sentence a person ticks. It is the consent, so it is not paraphrased.
 *
 * One line, because it sits beside the button and a paragraph next to a control
 * is a paragraph nobody reads before pressing it. What happens to the number is
 * the API's rule and `docs/06-regulatory-privacy.md` is where it is argued: it is
 * hashed with a salt and the number itself is never stored.
 */
export const CONSENT_TEXT =
  "Acepto que SentryOne me llame una vez a este numero.";

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

/**
 * What to say about a refusal, by status and never by the message alone.
 *
 * Every failure gets words on the screen, which is the rule this function
 * exists for: a press that produced nothing at all is the one outcome a visitor
 * cannot act on. Two of the three named statuses are not failures, because the
 * tour without telephony still has a script to read, and the API's own sentence
 * is carried where it adds something, because the envelope is the contract and
 * paraphrasing it loses the reason. Anything this does not know about is
 * reported exactly as it arrived rather than rounded to "algo salio mal".
 */
export function callProblem(failure: ApiFailure): string {
  if (failure.status === 403) {
    return "Este servidor tiene las llamadas del recorrido apagadas. El guion de abajo es lo que diria el agente.";
  }

  if (failure.status === 422) {
    return "Este servidor no tiene la voz configurada, asi que no puede marcar. El guion de abajo es lo que diria el agente, palabra por palabra.";
  }

  if (failure.status === 400) {
    return `El servidor no acepto el numero: ${failure.message}`;
  }

  return failure.message;
}

/**
 * The body of the request, built in one place.
 *
 * `consent` is the literal `true` the contract asks for, so a caller cannot reach
 * the endpoint without a person having ticked the box, and the phone is the E.164
 * string `toE164` built and not whatever was typed.
 */
export function callBody(raw: string): { phone: string; consent: true } {
  return { phone: toE164(raw), consent: true };
}

/* --------------------------------------------------------------- the plazas */

/**
 * The two plazas as one sentence, in the three cases there are and not in two.
 *
 * `plazasFor` in `packages/voice/src/owner-script.ts` is the authority and this
 * is the same reading of the same two fields: both known and different, both
 * known and the same, and no history to compare against. The middle one is the
 * case the seeded run actually produces, because the hero's finding is a check
 * digit that does not add up and not an account that moved city, and a rendering
 * that branched only on emptiness said "se abrio en la plaza APODACA, y la de
 * siempre esta en APODACA": one city read out twice as though it were two
 * places, next to a telephone call that says it once.
 *
 * Empty is an answer rather than a gap: `GET /api/v1/tour` sends a plain place
 * name when the catalogue carries the code and nothing when it does not, and a
 * supplier with no previous account has moved nothing at all.
 */
function plazaSentence(hero: TourHero): string {
  if (hero.plazaNew === "" || hero.plazaUsual === "") {
    return "La cuenta no es la que esta empresa le ha pagado antes.";
  }

  return hero.plazaNew === hero.plazaUsual
    ? `La cuenta nueva se abrio en ${hero.plazaNew}, y las que ya le pagamos estan en esa misma plaza.`
    : `La cuenta nueva se abrio en la plaza ${hero.plazaNew}, y la de siempre esta en ${hero.plazaUsual}.`;
}

/* --------------------------------------------------------------- the words */

/**
 * What the card says above the stand-in script, and only above that one.
 *
 * The words underneath are built in the browser out of the same line, and they
 * are close to what the agent says without being it: the stored prompt lives in
 * `packages/voice` and the rendered call comes back from the API. Printing an
 * approximation under a label that says these are the owner's words would be
 * this screen claiming something it cannot check, so the label is qualified
 * here and the qualification disappears the moment the API sends its script.
 */
export const LOCAL_SCRIPT_NOTE =
  "Aproximacion armada en el navegador con esta misma linea. El guion exacto lo escribe el servidor y llega al marcar, o cuando contesta que no tiene la voz configurada.";

/**
 * The script, built in the browser, for a page that cannot ask a server for it.
 *
 * It is the stand-in and never the authority: the moment the API answers, with a
 * 202 or with its 422, the script it sent replaces this one. It exists because the
 * offline mode promises that no request leaves the browser, and the stop whose
 * whole point is what the owner hears cannot be empty there.
 *
 * Three rules it obeys. Two are the verification call's: the account is four
 * digits and never the eighteen, and nothing in it promises a payment. The third
 * is rule 1 of `packages/voice`, `REQUIRED_DISCLOSURE`: the line says it is an
 * automated line in its first sentence, before anything is asked. A stand-in that
 * dropped the disclosure would be printing, under the words the owner hears, the
 * one opening the real agent is forbidden to use.
 */
export function localScript(hero: TourHero): TourCallScript {
  return {
    firstMessage:
      "Buen dia. Le habla la linea automatica de pagos de su empresa. El control de pagos retuvo una instruccion de la corrida de esta semana y necesito su indicacion. Le tomo un minuto.",
    question: "Digame si la retenemos, o si usted la libera.",
    spoken: [
      `El pago es para ${hero.supplierName}, por ${formatMoney(hero.amount)}.`,
      `La cuenta que llego termina en ${hero.accountLast4}. ${plazaSentence(hero)}`,
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

/**
 * Owner calls the parser is tested against.
 *
 * Every one of them is invented, like the supplier transcripts in `fixtures.ts`:
 * there is no recording of a real owner, no real telephone number and no real
 * account in this repository or in its tests, which is what SECURITY.md requires
 * and what lets these be read out loud at a stand.
 *
 * They are written the way a speech to text engine returns Mexican Spanish:
 * accented, punctuated where the engine hears a pause, with a person changing
 * their mind mid sentence and answering with one word when they are busy. Feeding
 * the parser the clean sentences it was written against would prove nothing.
 */

import type { VerificationTurn } from "@hackmty/core";

/**
 * The greeting, with the disclosure in it. Every transcript starts here, because
 * every call does: the line says what it is before it asks anything.
 */
const AGENT_OPENING: VerificationTurn = {
  role: "agent",
  text: "Buen día, Gerardo. Le habla la línea automática de pagos de Metálicos del Norte. Le marco porque el control de pagos retuvo una instrucción y necesito su indicación.",
  atSecond: 1,
};

/**
 * The situation and the question, in one agent turn.
 *
 * Two short sentences and one question, which is the whole call. It reads four
 * digits of the account and no more, it says the amount in words because a
 * figure with grouping commas was read out as a tenth of itself on a live call,
 * and it names both plazas, which is the signal that held the payment in the
 * first place.
 */
const AGENT_QUESTION: VerificationTurn = {
  role: "agent",
  text: "Son noventa y dos mil cuatrocientos ochenta pesos con cincuenta centavos a Distribuidora Sintetica del Poniente, S.A. de C.V. La cuenta es nueva, termina en 7 8 9 9 y no es la que le hemos pagado antes. Esa cuenta se abrió en DISTRITO FEDERAL y las cuentas que ya le hemos pagado están en APODACA. ¿La retenemos hasta verificarla, o la libera bajo su nombre?",
  atSecond: 11,
};

/** The owner retains it, which is the answer the control is hoping for. */
export const OWNER_TRANSCRIPT_HOLD: VerificationTurn[] = [
  AGENT_OPENING,
  { role: "supplier", text: "Sí, dígame.", atSecond: 7 },
  AGENT_QUESTION,
  {
    role: "supplier",
    text: "No, reténla hasta que confirmemos con ellos.",
    atSecond: 24,
  },
];

/** The plainest hold there is, and it carries its own negation. */
export const OWNER_TRANSCRIPT_HOLD_PLAIN: VerificationTurn[] = [
  AGENT_OPENING,
  AGENT_QUESTION,
  { role: "supplier", text: "Que no salga, por favor.", atSecond: 22 },
];

/** The usted form, which is how half of this call is actually answered. */
export const OWNER_TRANSCRIPT_HOLD_USTED: VerificationTurn[] = [
  AGENT_OPENING,
  AGENT_QUESTION,
  { role: "supplier", text: "Reténgala, por favor.", atSecond: 21 },
];

/** The owner releases it, and says the thing the question asked for. */
export const OWNER_TRANSCRIPT_RELEASE: VerificationTurn[] = [
  AGENT_OPENING,
  { role: "supplier", text: "Sí, con él habla.", atSecond: 7 },
  AGENT_QUESTION,
  { role: "supplier", text: "Libérala, yo la autorizo.", atSecond: 23 },
];

/** The same answer in the words the question offers: under their own name. */
export const OWNER_TRANSCRIPT_RELEASE_UNDER_NAME: VerificationTurn[] = [
  AGENT_OPENING,
  AGENT_QUESTION,
  { role: "supplier", text: "Adelante, bajo mi nombre.", atSecond: 20 },
];

/**
 * The comma case, in the direction that costs money.
 *
 * "No, mándala" is a refusal of the question followed by an instruction, and the
 * comma is the only thing that separates it from "no la mandes" below. A parser
 * that read the "no" as part of the verb would hold a payment the owner released,
 * and one that ignored commas would release one they held.
 */
export const OWNER_TRANSCRIPT_COMMA_RELEASE: VerificationTurn[] = [
  AGENT_OPENING,
  AGENT_QUESTION,
  { role: "supplier", text: "No, mándala.", atSecond: 19 },
];

/** The same words without the comma, which is the opposite instruction. */
export const OWNER_TRANSCRIPT_COMMA_HOLD: VerificationTurn[] = [
  AGENT_OPENING,
  AGENT_QUESTION,
  { role: "supplier", text: "No la mandes.", atSecond: 19 },
];

/** A negated release is a hold. This is the expensive direction of the rule. */
export const OWNER_TRANSCRIPT_NEGATED_RELEASE: VerificationTurn[] = [
  AGENT_OPENING,
  AGENT_QUESTION,
  { role: "supplier", text: "No la liberes todavía.", atSecond: 21 },
];

/** A negated hold is a release, with a pronoun hiding the negation. */
export const OWNER_TRANSCRIPT_NEGATED_HOLD: VerificationTurn[] = [
  AGENT_OPENING,
  AGENT_QUESTION,
  {
    role: "supplier",
    text: "No me la retengas, ya hablé con ellos.",
    atSecond: 25,
  },
];

/**
 * The trap: the owner starts to release it and changes their mind.
 *
 * A parser that took the first instruction would send the payment. A hold
 * anywhere outranks a release everywhere, which is the cost asymmetry of this
 * whole product written as one test.
 */
export const OWNER_TRANSCRIPT_RELEASE_THEN_HOLD: VerificationTurn[] = [
  AGENT_OPENING,
  AGENT_QUESTION,
  {
    role: "supplier",
    text: "Pues libérala... No, espérate, mejor reténla.",
    atSecond: 27,
  },
];

/** A person answered, said they are there, and never answered the question. */
export const OWNER_TRANSCRIPT_BARE_SI: VerificationTurn[] = [
  AGENT_OPENING,
  { role: "supplier", text: "Sí.", atSecond: 6 },
  AGENT_QUESTION,
  { role: "supplier", text: "Ok.", atSecond: 18 },
];

/** They are not at their desk. Nothing is applied and nothing is claimed. */
export const OWNER_TRANSCRIPT_UNSURE: VerificationTurn[] = [
  AGENT_OPENING,
  AGENT_QUESTION,
  { role: "supplier", text: "Déjame ver, luego te digo.", atSecond: 22 },
];

/** They are driving. Same answer, and the line does not insist. */
export const OWNER_TRANSCRIPT_BUSY: VerificationTurn[] = [
  AGENT_OPENING,
  AGENT_QUESTION,
  { role: "supplier", text: "Ando manejando, luego le digo.", atSecond: 20 },
];

/** Whoever picked up is not the person the line called. */
export const OWNER_TRANSCRIPT_WRONG_PERSON: VerificationTurn[] = [
  AGENT_OPENING,
  { role: "supplier", text: "¿Quién habla?", atSecond: 6 },
];

/** Nobody picked up and the line talked to a machine. */
export const OWNER_TRANSCRIPT_VOICEMAIL: VerificationTurn[] = [
  AGENT_OPENING,
  {
    role: "supplier",
    text: "El número que usted marcó no está disponible. Deje su mensaje después del tono.",
    atSecond: 4,
  },
];

/** The line opened and nobody said anything at all. */
export const OWNER_TRANSCRIPT_SILENT: VerificationTurn[] = [
  AGENT_OPENING,
  AGENT_QUESTION,
];

/**
 * A conversation payload shaped like the one the provider returns for an owner
 * call, used by `apps/api` to drive the tour end to end with no network.
 *
 * Only the fields this repository reads are present; the API sends many more and
 * the client ignores them on purpose.
 */
export const OWNER_CONVERSATION_PAYLOAD = {
  conversation_id: "conv_synthetic_owner_0001",
  agent_id: "agent_synthetic_owner_0001",
  status: "done",
  has_audio: true,
  transcript: [
    { role: "agent", message: AGENT_OPENING.text, time_in_call_secs: 1 },
    { role: "user", message: "Sí, dígame.", time_in_call_secs: 7 },
    { role: "agent", message: AGENT_QUESTION.text, time_in_call_secs: 11 },
    /* A silence marker. The provider sends these with a null message and the
       client drops them, because an empty clause is not something anyone said. */
    { role: "user", message: null, time_in_call_secs: 20 },
    {
      role: "user",
      message: "No, reténla hasta que confirmemos con ellos.",
      time_in_call_secs: 24,
    },
  ],
  analysis: { call_successful: "success", transcript_summary: "" },
  metadata: { start_time_unix_secs: 1_789_000_000, call_duration_secs: 31 },
};

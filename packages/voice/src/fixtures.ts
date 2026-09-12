/**
 * Transcripts the parser is tested against, and one provider payload.
 *
 * Every one of them is invented. There is no recording of a real supplier, no
 * real company name, no real telephone number and no real account in this repo
 * or in its tests, which is what SECURITY.md requires and what lets these
 * fixtures be read out loud in a demo.
 *
 * They are written the way a speech to text engine actually returns Spanish:
 * accented, unpunctuated in places, with fillers and interruptions. Feeding the
 * parser clean sentences it was written against would prove nothing.
 */

import type { VerificationTurn } from "@hackmty/core";

const AGENT_OPENING: VerificationTurn = {
  role: "agent",
  text: "Hola, buen dia. Le llamo de parte de SentryOne, por un tema de pagos a proveedores. Hablo con Distribuidora Sintetica del Poniente?",
  atSecond: 1,
};

const AGENT_QUESTION: VerificationTurn = {
  role: "agent",
  text: "Recibimos una instruccion para depositarle $184,300.00 pesos a una cuenta que termina en 7899. Solo necesito que me confirme si esa cuenta es de ustedes. Si o no?",
  atSecond: 9,
};

/** The supplier says the account is theirs, in the plainest way. */
export const TRANSCRIPT_CONFIRMED: VerificationTurn[] = [
  AGENT_OPENING,
  { role: "supplier", text: "Sí, con él habla.", atSecond: 6 },
  AGENT_QUESTION,
  {
    role: "supplier",
    text: "Sí, es correcta, esa cuenta la abrimos en marzo.",
    atSecond: 17,
  },
];

/** The supplier denies it. This is the case the whole control exists for. */
export const TRANSCRIPT_DENIED: VerificationTurn[] = [
  AGENT_OPENING,
  { role: "supplier", text: "Sí, dígame.", atSecond: 6 },
  AGENT_QUESTION,
  {
    role: "supplier",
    text: "No, esa cuenta no es nuestra. Nosotros seguimos con la misma cuenta de siempre.",
    atSecond: 18,
  },
];

/**
 * The trap: the supplier confirms who they are and then denies the account.
 *
 * A parser that counts the first "sí" as agreement reports a confirmation and a
 * clerk releases the payment. This fixture exists so that regression is caught
 * by a test and not by a customer.
 */
export const TRANSCRIPT_SI_THEN_DENIED: VerificationTurn[] = [
  AGENT_OPENING,
  { role: "supplier", text: "Sí.", atSecond: 5 },
  AGENT_QUESTION,
  {
    role: "supplier",
    text: "A ver, no, nosotros no enviamos ningún cambio de cuenta.",
    atSecond: 16,
  },
];

/** A person answered, said only that they are the supplier, and nothing else. */
export const TRANSCRIPT_BARE_SI: VerificationTurn[] = [
  AGENT_OPENING,
  { role: "supplier", text: "Sí.", atSecond: 5 },
  AGENT_QUESTION,
  { role: "supplier", text: "Ajá.", atSecond: 15 },
];

/** Whoever answered is not the person who would know. */
export const TRANSCRIPT_UNSURE: VerificationTurn[] = [
  AGENT_OPENING,
  { role: "supplier", text: "Sí, bueno, sí.", atSecond: 5 },
  AGENT_QUESTION,
  {
    role: "supplier",
    text: "Uy, no estoy seguro, eso lo ve administración. Déjeme revisar y le marco.",
    atSecond: 16,
  },
];

/** Nobody picked up and the agent talked to a machine. */
export const TRANSCRIPT_VOICEMAIL: VerificationTurn[] = [
  AGENT_OPENING,
  {
    role: "supplier",
    text: "El número que usted marcó no está disponible. Deje su mensaje después del tono.",
    atSecond: 3,
  },
];

/** The line opened and nobody said anything at all. */
export const TRANSCRIPT_SILENT: VerificationTurn[] = [
  AGENT_OPENING,
  AGENT_QUESTION,
];

/**
 * A conversation payload shaped like the one the provider returns, used to test
 * the mapping without touching the network. Only the fields this repo reads are
 * present; the API sends many more and the client ignores them on purpose.
 */
export const CONVERSATION_PAYLOAD = {
  conversation_id: "conv_synthetic_0001",
  agent_id: "agent_synthetic_0001",
  status: "done",
  has_audio: true,
  transcript: [
    {
      role: "agent",
      message: AGENT_OPENING.text,
      time_in_call_secs: 1,
    },
    { role: "user", message: "Sí, con él habla.", time_in_call_secs: 6 },
    { role: "agent", message: AGENT_QUESTION.text, time_in_call_secs: 9 },
    /* A silence marker. The provider sends these with a null message and the
       client drops them, because an empty clause is not something anyone said. */
    { role: "user", message: null, time_in_call_secs: 14 },
    {
      role: "user",
      message: "Sí, es correcta, esa cuenta la abrimos en marzo.",
      time_in_call_secs: 17,
    },
  ],
  analysis: { call_successful: "success", transcript_summary: "" },
  metadata: { start_time_unix_secs: 1_789_000_000, call_duration_secs: 24 },
};

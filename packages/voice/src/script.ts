/**
 * The verification script, and the four rules it may not break.
 *
 * This is the only file that writes what the agent says. It is a pure function
 * of the payment instruction, so the same sentences reach the telephone, the
 * browser widget and the clerk who ends up dialling by hand, and nobody has to
 * remember to keep three copies in agreement.
 *
 * The four rules, which are product decisions and not style:
 *
 * 1. **Only the last four digits of the account are ever spoken.** Reading a
 *    CLABE out loud to whoever answered a phone hands the account to them. Four
 *    digits are enough for the real supplier to recognise their own account and
 *    useless to anyone else.
 * 2. **Nothing is promised.** The call never says the payment will be made, or
 *    when, or that it already went out. A supplier acting on a promise made by
 *    an automated call is a liability we would have created ourselves.
 * 3. **Nobody is accused.** The call asks whether an account belongs to them. It
 *    does not mention fraud, impersonation or a suspicion, per ADR-0002: states
 *    are `comprobable` or `requiere_verificacion` and a person decides.
 * 4. **No data is requested.** The agent asks for one yes or no. It never asks
 *    for an account, a code, a password or anything personal, because a call
 *    that asks for those is indistinguishable from the fraud it exists to catch.
 *
 * Spanish here is ASCII, with no accents and no inverted question marks, which
 * is the convention every user-facing string in this repo already follows. The
 * words affected (numero, esta, confirmacion) are pronounced the same by a
 * Spanish text to speech model with or without the accent.
 * TODO(garzario): if a rehearsal hears a mispronunciation, the fix is accents in
 * this file only, not a second copy of the script.
 */

import type { PaymentInstruction, Supplier } from "@hackmty/core";

/** What the company calls itself on the call. Overridable per deployment. */
export const DEFAULT_COMPANY_NAME = "Ceptinela";

export interface ScriptInput {
  /** The supplier as its CFDI names it. Never a name this package invented. */
  supplierLegalName: string;
  /** The account the instruction wants to pay. Only its last four are spoken. */
  clabe: string;
  amount: number;
  companyName?: string;
}

export interface VerificationScript {
  /** System prompt for the agent, carrying the script and the four rules. */
  systemPrompt: string;
  /** The first thing the agent says, before the supplier has said anything. */
  firstMessage: string;
  /** The question the outcome is read from, quoted for the clerk. */
  question: string;
  /** Last four digits of the account. The only part of it ever spoken. */
  clabeLast4: string;
  /** The whole script as plain lines, for the clerk who dials by hand. */
  spoken: string[];
}

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Money as the agent should say it. `Intl` gives "$184,300.00", and the model
 * reads that correctly in Spanish; the currency is named in the sentence so
 * "pesos" is never ambiguous with another currency.
 */
export function spokenAmount(amount: number): string {
  return `${MXN.format(amount)} pesos`;
}

/**
 * The last four digits of an account.
 *
 * Non-digits are dropped first, so an account that arrived with spaces or dashes
 * in it still yields the right four. An account shorter than four digits is
 * returned as it is rather than padded, because inventing a digit here would put
 * a wrong number in the supplier's ear.
 */
export function last4(clabe: string): string {
  const digits = clabe.replace(/\D/g, "");

  return digits.slice(-4);
}

/**
 * Adds a full stop only when the text has none.
 *
 * A razon social very often ends in one: "S.A. de C.V.". Appending another
 * gives "C.V..", which a text to speech model reads as a pause in the wrong
 * place, right where the supplier is listening for their own name. A question
 * mark after that stop is fine and stays, because "C.V.?" is how it is written.
 */
function endSentence(text: string): string {
  const trimmed = text.trimEnd();

  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

/**
 * Builds the script for one instruction.
 *
 * Everything in it comes from the arguments. There is no default supplier name,
 * no example amount and no placeholder account: an empty legal name produces a
 * script that says so, rather than a plausible sentence about a company nobody
 * named. That is the ADR-0002 rule about invented data, applied to speech.
 */
export function buildVerificationScript(
  input: ScriptInput,
): VerificationScript {
  const company = input.companyName ?? DEFAULT_COMPANY_NAME;
  const supplier = input.supplierLegalName.trim();
  const tail = last4(input.clabe);
  const amount = spokenAmount(input.amount);

  const firstMessage = `Hola, buen dia. Le llamo de parte de ${company}, por un tema de pagos a proveedores. Hablo con ${supplier}?`;
  const question = `Recibimos una instruccion para depositarle ${amount} a una cuenta que termina en ${tail}. Solo necesito que me confirme si esa cuenta es de ustedes. Si o no?`;

  const systemPrompt = [
    `Eres el asistente de verificacion de pagos de ${company}. Hablas espanol de Mexico, tratas de usted, con frases cortas y tono cordial y neutro. Nunca hablas de otro tema.`,
    "",
    `Tu unico objetivo es confirmar con ${supplier} si la cuenta bancaria que recibimos para pagarle es suya.`,
    "",
    "Guion:",
    `1. Saluda y di que llamas de parte de ${company} por un tema de pagos.`,
    `2. Pregunta si hablas con alguien de ${endSentence(supplier)}`,
    `3. Di, con estas palabras: "${question}"`,
    "4. Si contesta que si, agradece, di que una persona de la empresa da seguimiento, y termina.",
    "5. Si contesta que no, agradece, di que lo vamos a revisar internamente, y termina. No pidas mas datos.",
    "6. Si no entiendes la respuesta, repite la pregunta una sola vez y luego termina.",
    "",
    "Reglas que no puedes romper:",
    `- Nunca digas la cuenta completa. Solo los cuatro digitos finales, que son ${tail}.`,
    "- Nunca pidas datos bancarios, contrasenas, codigos de verificacion ni datos personales. No pidas que te dicten una cuenta.",
    "- Nunca prometas que el pago se va a hacer, ni cuando, ni que ya se hizo. Si te preguntan, di que el pago sigue en revision y que una persona se comunica despues.",
    "- Nunca hables de fraude, sospecha ni suplantacion. No acuses a nadie.",
    "- Si quien contesta no sabe o no es quien decide, agradece y termina. No insistas y no pidas que te comuniquen con alguien mas de dos veces.",
    "- Si te piden que llames despues, agradece y termina.",
    "- La llamada dura menos de dos minutos.",
  ].join("\n");

  return {
    systemPrompt,
    firstMessage,
    question,
    clabeLast4: tail,
    spoken: [firstMessage, question],
  };
}

/**
 * The script for a payment instruction as the repository holds it.
 *
 * The legal name comes from the supplier record, which is the CFDI's razon
 * social. When there is no supplier record the RFC is used, because an RFC is a
 * fact on the instruction and a company name would not be.
 */
export function scriptForInstruction(
  instruction: Pick<PaymentInstruction, "clabe" | "amount" | "supplierRfc">,
  supplier: Pick<Supplier, "legalName"> | undefined,
  companyName?: string,
): VerificationScript {
  const input: ScriptInput = {
    supplierLegalName: supplier?.legalName ?? instruction.supplierRfc,
    clabe: instruction.clabe,
    amount: instruction.amount,
  };
  if (companyName !== undefined) {
    input.companyName = companyName;
  }

  return buildVerificationScript(input);
}

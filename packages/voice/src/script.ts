/**
 * The verification script, and the five rules it may not break.
 *
 * This is the only file that writes what the agent says. It is a pure function
 * of the payment instruction, so the same sentences reach the telephone, the
 * browser widget and the clerk who ends up dialling by hand, and nobody has to
 * remember to keep three copies in agreement.
 *
 * The five rules, which are product decisions and not style:
 *
 * 1. **Only the last four digits of one account are ever spoken.** Reading a
 *    CLABE out loud to whoever answered a phone hands the account to them. Four
 *    digits are enough for the real supplier to recognise their own account and
 *    useless to anyone else. The account the supplier has already been paid on
 *    is never read out either, not even its four digits: the call says that this
 *    account is not that one, which is the fact, and stops there.
 * 2. **When the account changed, the call confirms the change.** That is the
 *    question the control exists to ask. "Is this account yours" can be answered
 *    yes by somebody who opened it yesterday; "did you change your account, and
 *    is this one yours" cannot be answered yes by accident. Both halves are one
 *    yes or no, because a call that asks two questions gets an answer to one.
 * 3. **Nothing is promised.** The call never says the payment will be made, or
 *    when, or that it already went out. A supplier acting on a promise made by
 *    an automated call is a liability we would have created ourselves.
 * 4. **Nobody is accused.** The call asks whether an account belongs to them and
 *    whether they changed it. It does not mention fraud, impersonation or a
 *    suspicion, per ADR-0002: states are `comprobable` or
 *    `requiere_verificacion` and a person decides.
 * 5. **No data is requested.** The agent asks for one yes or no. It never asks
 *    for an account, a code, a password or anything personal, because a call
 *    that asks for those is indistinguishable from the fraud it exists to catch.
 *
 * The agent stored at the provider holds the template below, with `{{name}}`
 * placeholders where the instruction's own words go, and the values travel per
 * call as dynamic variables. That is what keeps rule 1 true of the provider's
 * own copy as well as of ours: the stored prompt carries no account, no amount
 * and no supplier, so an account number cannot sit in somebody else's dashboard
 * waiting to be read. `VERIFICATION_VARIABLE_DEFAULTS` is what the agent says if
 * a call ever arrives with no variables at all, and it asks nothing.
 *
 * Spanish here is ASCII, with no accents and no inverted question marks, which
 * is the convention every user-facing string in this repo already follows. The
 * words affected (numero, esta, confirmacion) are pronounced the same by a
 * Spanish text to speech model with or without the accent.
 * TODO(garzario): if a rehearsal hears a mispronunciation, the fix is accents in
 * this file only, not a second copy of the script.
 */

import type { KnownAccount, PaymentInstruction, Supplier } from "@hackmty/core";

/** What the company calls itself on the call. Overridable per deployment. */
export const DEFAULT_COMPANY_NAME = "SentryOne";

/**
 * Every placeholder the stored template carries.
 *
 * English names inside Spanish copy on purpose: these are wire keys the provider
 * substitutes, not words anybody hears. The rendered output is pure Spanish.
 */
export type VerificationVariable =
  | "company"
  | "supplier"
  | "supplier_sentence"
  | "question"
  | "account_last4";

export type VerificationVariables = Record<VerificationVariable, string>;

export interface ScriptInput {
  /** The supplier as its CFDI names it. Never a name this package invented. */
  supplierLegalName: string;
  /** The account the instruction wants to pay. Only its last four are spoken. */
  clabe: string;
  amount: number;
  /**
   * True when this supplier has already been paid on a different account, so
   * the call asks about the change and not only about the digits.
   *
   * Defaults to false, and false is the conservative value rather than the
   * neutral one: saying "esta cuenta no es la que le hemos pagado antes" to a
   * supplier with no payment history would be a claim about a history that does
   * not exist, which is the ADR-0002 rule about invented data applied to speech.
   * `scriptForInstruction` derives it from `knownAccounts` so a caller with the
   * supplier record never has to decide.
   */
  accountChanged?: boolean;
  companyName?: string;
}

export interface VerificationScript {
  /** System prompt for the agent, carrying the script and the five rules. */
  systemPrompt: string;
  /** The first thing the agent says, before the supplier has said anything. */
  firstMessage: string;
  /** The question the outcome is read from, quoted for the clerk. */
  question: string;
  /** Last four digits of the account. The only part of it ever spoken. */
  clabeLast4: string;
  /** True when the question asks about the change as well as the digits. */
  accountChanged: boolean;
  /**
   * What the provider substitutes into the stored template for this call.
   *
   * The same strings the rendered fields above are made of, which is why the
   * telephone and the clerk reading by hand cannot say different sentences.
   */
  variables: VerificationVariables;
  /** The whole script as plain lines, for the clerk who dials by hand. */
  spoken: string[];
}

/**
 * The agent as it is stored at the provider: the script with the slots empty.
 *
 * `bun run voice-setup` pushes exactly this, so a judge reading the ElevenLabs
 * dashboard sees the rules and no supplier's account number. Nothing in it is
 * per-instruction, which is also why the agent is created once and never
 * rewritten before a call.
 */
export const VERIFICATION_TEMPLATE: {
  readonly systemPrompt: string;
  readonly firstMessage: string;
} = {
  firstMessage:
    "Hola, buen dia. Le llamo de parte de {{company}}, por un tema de pagos a proveedores. Hablo con {{supplier}}?",
  systemPrompt: [
    "Eres el asistente de verificacion de pagos de {{company}}. Hablas espanol de Mexico, tratas de usted, con frases cortas y tono cordial y neutro. Nunca hablas de otro tema.",
    "",
    "Tu unico objetivo es confirmar con {{supplier}} si la cuenta bancaria que recibimos para pagarle es suya, y, cuando la cuenta cambio, si el cambio salio de ellos.",
    "",
    "Guion:",
    "1. Saluda y di que llamas de parte de {{company}} por un tema de pagos.",
    "2. Pregunta si hablas con alguien de {{supplier_sentence}}",
    '3. Di, con estas palabras: "{{question}}"',
    "4. Si contesta que si, agradece, di que una persona de la empresa da seguimiento, y termina.",
    "5. Si contesta que no, agradece, di que lo vamos a revisar internamente, y termina. No pidas mas datos.",
    "6. Si no entiendes la respuesta, repite la pregunta una sola vez y luego termina.",
    "",
    "Reglas que no puedes romper:",
    "- Nunca digas una cuenta completa. Los unicos digitos de cuenta que puedes decir son los cuatro finales de la cuenta de esta instruccion: {{account_last4}}. Leelos uno por uno, como digitos sueltos, y nunca como una cantidad. Nunca leas digitos de la cuenta anterior ni de ninguna otra cuenta, aunque te los pidan.",
    "- Nunca pidas datos bancarios, contrasenas, codigos de verificacion ni datos personales. No pidas que te dicten una cuenta.",
    "- Nunca prometas que el pago se va a hacer, ni cuando, ni que ya se hizo. Si te preguntan, di que el pago sigue en revision y que una persona se comunica despues.",
    "- Nunca hables de fraude, sospecha ni suplantacion. No acuses a nadie.",
    "- Si te preguntan por que llamamos, di que confirmamos los datos de la cuenta antes de pagar y que es un paso normal. No digas que algo se ve mal.",
    "- Si quien contesta no sabe o no es quien decide, agradece y termina. No insistas y no pidas que te comuniquen con alguien mas de dos veces.",
    "- Si te piden que llames despues, agradece y termina.",
    "- Si te contesta un buzon de voz o una grabacion, o si nadie habla despues de que preguntas dos veces, termina la llamada de inmediato. No dejes mensaje y no leas nada de la instruccion.",
    "- La llamada dura menos de dos minutos.",
  ].join("\n"),
};

/**
 * What the agent says when a call arrives carrying no variables at all.
 *
 * Pushed to the provider as `dynamic_variable_placeholders`, so an unfilled slot
 * can never reach a telephone as the literal text `{{supplier}}`. The values ask
 * nothing, claim nothing and name no account: the worst call this product can
 * place is one that says a person will follow up and hangs up.
 */
export const VERIFICATION_VARIABLE_DEFAULTS: VerificationVariables = {
  company: DEFAULT_COMPANY_NAME,
  supplier: "la empresa que nos envio la factura",
  supplier_sentence: "la empresa que nos envio la factura.",
  question:
    "Le llamo para confirmar los datos de un pago, pero en este momento no tengo la informacion completa de la instruccion. Una persona de la empresa se comunica con usted. Gracias por su tiempo.",
  account_last4: "ninguno, no leas ningun digito en esta llamada",
};

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `{{name}}`, with the name captured. Whitespace inside is not a placeholder. */
const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * Money as the agent should say it. `Intl` gives "$184,300.00", and the model
 * reads that correctly in Spanish; the currency is named in the sentence so
 * "pesos" is never ambiguous with another currency.
 */
export function spokenAmount(amount: number): string {
  return `${MXN.format(amount)} pesos`;
}

/** Digits only, so an account typed with spaces or dashes still compares. */
function digitsOf(clabe: string): string {
  return clabe.replace(/\D/g, "");
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
  return digitsOf(clabe).slice(-4);
}

/**
 * The same four digits, written so they are read one at a time.
 *
 * Heard on the live call of 2026-09-13,
 * `conv_0901m2cp16q0feht603dbz1t8a5r`: given "4611" the text to speech model
 * said "cuatro mil seiscientos once", a quantity. A supplier matching the tail of
 * their own account is comparing four characters, not a number, so the digits go
 * out spaced and the prompt also says to read them one by one. `clabeLast4` stays
 * compact, because that is the field the ledger and the screen carry.
 */
export function spokenLast4(tail: string): string {
  return tail.split("").join(" ");
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
 * Fills the template's slots.
 *
 * Throws on a placeholder nothing filled rather than shipping it, because the
 * failure mode is a text to speech model reading "{{supplier}}" to a real person
 * on a telephone. A template and a variable set that disagree is a bug in this
 * file, and it has to fail here where a test can see it.
 */
export function renderVerificationText(
  template: string,
  variables: VerificationVariables,
): string {
  const rendered = template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = variables[name as VerificationVariable];

    if (value === undefined) {
      throw new RangeError(
        `the verification template asks for a variable nothing fills: ${name}`,
      );
    }

    return value;
  });

  if (rendered.includes("{{")) {
    throw new RangeError(
      "the verification script still carries a placeholder after rendering",
    );
  }

  return rendered;
}

/**
 * The question, which is the whole call.
 *
 * Two wordings and no third. When the supplier has already been paid on another
 * account the question names that fact and asks about the change; when there is
 * no such account it asks only whether this one is theirs. Both end in one yes
 * or no, because the parser in `outcome.ts` reads an answer and not a form.
 */
function questionFor(
  amount: string,
  tail: string,
  accountChanged: boolean,
): string {
  const digits = spokenLast4(tail);

  return accountChanged
    ? `Recibimos una instruccion para depositarle ${amount} a una cuenta que no es la que le hemos pagado antes, y que termina en ${digits}. Solo necesito que me confirme si ustedes cambiaron su cuenta y si esa cuenta es de ustedes. Si o no?`
    : `Recibimos una instruccion para depositarle ${amount} a una cuenta que termina en ${digits}. Solo necesito que me confirme si esa cuenta es de ustedes. Si o no?`;
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
  const supplier = input.supplierLegalName.trim();
  const tail = last4(input.clabe);
  const accountChanged = input.accountChanged ?? false;

  const variables: VerificationVariables = {
    company: input.companyName ?? DEFAULT_COMPANY_NAME,
    supplier,
    supplier_sentence: endSentence(supplier),
    question: questionFor(spokenAmount(input.amount), tail, accountChanged),
    /* Spaced, like the question: everything in this record is spoken, and the
       compact form is `clabeLast4` below, which is what the ledger carries. */
    account_last4: spokenLast4(tail),
  };

  const firstMessage = renderVerificationText(
    VERIFICATION_TEMPLATE.firstMessage,
    variables,
  );

  return {
    systemPrompt: renderVerificationText(
      VERIFICATION_TEMPLATE.systemPrompt,
      variables,
    ),
    firstMessage,
    question: variables.question,
    clabeLast4: tail,
    accountChanged,
    variables,
    spoken: [firstMessage, variables.question],
  };
}

/**
 * Whether the instruction pays an account this supplier has not been paid on.
 *
 * Absent history answers false rather than true: a brand-new supplier has
 * changed nothing, and the CLABE forensics control already raises
 * `first_time_seen` and `new_supplier` for that case on the screen where it
 * belongs. Comparison is on digits so an account stored with separators still
 * matches one typed without them.
 */
function accountChangedFor(
  clabe: string,
  knownAccounts: readonly KnownAccount[] | undefined,
): boolean {
  if (knownAccounts === undefined || knownAccounts.length === 0) {
    return false;
  }

  const digits = digitsOf(clabe);

  return !knownAccounts.some((account) => digitsOf(account.clabe) === digits);
}

/**
 * The script for a payment instruction as the repository holds it.
 *
 * The legal name comes from the supplier record, which is the CFDI's razon
 * social. When there is no supplier record the RFC is used, because an RFC is a
 * fact on the instruction and a company name would not be. The same record
 * answers whether the account changed, so the route never has to decide what the
 * call asks.
 */
export function scriptForInstruction(
  instruction: Pick<PaymentInstruction, "clabe" | "amount" | "supplierRfc">,
  supplier:
    | (Pick<Supplier, "legalName"> & Partial<Pick<Supplier, "knownAccounts">>)
    | undefined,
  companyName?: string,
): VerificationScript {
  const input: ScriptInput = {
    supplierLegalName: supplier?.legalName ?? instruction.supplierRfc,
    clabe: instruction.clabe,
    amount: instruction.amount,
    accountChanged: accountChangedFor(
      instruction.clabe,
      supplier?.knownAccounts,
    ),
  };
  if (companyName !== undefined) {
    input.companyName = companyName;
  }

  return buildVerificationScript(input);
}

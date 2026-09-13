/**
 * The verification script, and the rules it may not break.
 *
 * This is the only file that writes what the agent says. It is a pure function
 * of the payment instruction, so the same sentences reach the telephone, the
 * browser widget and the clerk who ends up dialling by hand, and nobody has to
 * remember to keep three copies in agreement.
 *
 * The rules, which are product decisions and not style:
 *
 * 1. **The call says what it is, in the greeting.** It is "la linea automatica
 *    de pagos a proveedores" of the company, said before anything is asked. This
 *    one is not only ethics. The provider refused every call of the first version
 *    with `call_initialization_error 3000` and the word unsafe, because that
 *    prompt claimed to be a person and then asked for account confirmations, and
 *    the calls dropped at zero seconds. A line that discloses itself is the only
 *    version of this control that rings at all.
 * 2. **Only the last four digits of one account are ever spoken.** Reading a
 *    CLABE out loud to whoever answered a phone hands the account to them. Four
 *    digits are enough for the real supplier to recognise their own account and
 *    useless to anyone else. The account the supplier has already been paid on
 *    is never read out either, not even its four digits: the call says that this
 *    account is not that one, which is the fact, and stops there.
 * 3. **When the account changed, the call confirms the change.** That is the
 *    question the control exists to ask. "Is this account yours" can be answered
 *    yes by somebody who opened it yesterday; "did you change your account, and
 *    is this one yours" cannot be answered yes by accident.
 * 4. **The answer is asked for in words, never as a choice between two.** The
 *    earlier version ended its question with a two word either-or and the model
 *    then repeated it on every re-ask, which is what a recording sounds like. It
 *    also gave the parser a bare monosyllable to read, and `outcome.ts`
 *    deliberately refuses to count one as agreement. So the question asks to be
 *    confirmed, and the guion asks once more for the supplier's own words when a
 *    single word is all that came back.
 * 5. **Nothing is promised.** The call never says the payment will be made, or
 *    when, or that it already went out. A supplier acting on a promise made by
 *    an automated call is a liability we would have created ourselves.
 * 6. **Nobody is accused.** The call asks whether an account belongs to them and
 *    whether they changed it. It does not mention fraud, impersonation or a
 *    suspicion, per ADR-0002: states are `comprobable` or
 *    `requiere_verificacion` and a person decides.
 * 7. **No data is requested.** The agent asks for one confirmation. It never asks
 *    for an account, a code, a password or anything personal, because a call
 *    that asks for those is indistinguishable from the fraud it exists to catch.
 * 8. **The agent hangs up, and it hangs up on its own line.** Closing is a fixed
 *    sequence: what was recorded, `VERIFICATION_CLOSING_LINE` word for word, and
 *    then the `end_call` tool. A call that waits for a supplier to hang up runs
 *    to the duration cap with both sides silent.
 *
 * The agent stored at the provider holds the template below, with `{{name}}`
 * placeholders where the instruction's own words go, and the values travel per
 * call as dynamic variables. That is what keeps rule 2 true of the provider's
 * own copy as well as of ours: the stored prompt carries no account, no amount
 * and no supplier, so an account number cannot sit in somebody else's dashboard
 * waiting to be read. `VERIFICATION_VARIABLE_DEFAULTS` is what the agent says if
 * a call ever arrives with no variables at all, and it asks nothing.
 *
 * The Spanish here is accented, with inverted question marks, which is the one
 * place in this repository that breaks the ASCII convention and does it on
 * purpose. These strings are not read by a person on a screen, they are read by
 * a text to speech model out loud: `dia` and `dia` are the same word to a reader
 * and "DI-a" against "di-A" to the model, and the company name without its
 * accent is stressed on the wrong syllable by the ordinary Spanish rule. The
 * compact `clabeLast4` and everything the ledger stores stay as they were.
 */

import type { KnownAccount, PaymentInstruction, Supplier } from "@hackmty/core";
import { amountInWords } from "./numbers";

/**
 * The company the call is placed for, as it is said out loud.
 *
 * The company that owes the supplier money, never this product: a supplier who
 * has invoiced the same metalworking shop for years has never heard of
 * SentryOne, and a stranger telephoning about their bank account is the exact
 * shape of the fraud this control exists to catch. The seeded company of
 * `docs/02-persona.md` is the default because `apps/api` passes no name; a
 * deployment overrides it through `scripts/voice-agent.json`.
 *
 * Accented, unlike every other copy of this name in the repository, because this
 * one is spoken. "Metalicos" ends in s, so the ordinary Spanish rule stresses it
 * on the second last syllable and the model says "me-ta-LI-cos".
 */
export const DEFAULT_COMPANY_NAME = "Metálicos del Norte";

/**
 * The name the line gives itself when it answers "who is speaking".
 *
 * A first name and nothing else, and it is the name of the line rather than a
 * claim to be a person: the same sentence that says the name says that this is
 * the automated payments line, and rule 1 holds everywhere the name appears.
 */
export const DEFAULT_CALLER_NAME = "Alejandro";

/**
 * The last thing the agent says, word for word, before it calls `end_call`.
 *
 * Exported because three places have to agree on it and a copy in each would
 * drift: the stored prompt is built from this constant, `docs/10-demo-script.md`
 * quotes it for the stand, and a test reads it back off the prompt. It is warm
 * and it thanks the supplier, because the last sentence of a call about their
 * bank account is the one they remember.
 */
export const VERIFICATION_CLOSING_LINE =
  "Eso sería todo por hoy. Le agradezco mucho su tiempo y que tenga excelente día.";

/**
 * What this call never says, in any turn.
 *
 * Folded with `fold` from `outcome.ts` before comparing, so an accent or a
 * capital cannot smuggle one past. Each one is here because it was heard or
 * because it was the thing that broke:
 *
 * - the two word either-or, rule 4, which the model repeated on every re-ask,
 * - "asistente virtual", "sistema" and "inteligencia artificial", which are what
 *   a supplier hangs up on. The call is the payments line of a company they
 *   invoice, and rule 1 is satisfied by saying so, not by naming a technology.
 *
 * What is required rather than banned is the disclosure itself: "línea
 * automática" has to be in the greeting, and a test asserts that too.
 */
export const BANNED_PHRASES: readonly string[] = [
  "si o no",
  "asistente virtual",
  "sistema",
  "inteligencia artificial",
];

/** The disclosure. It is in the first message and in the prompt, both. */
export const REQUIRED_DISCLOSURE = "línea automática";

/**
 * Every placeholder the stored template carries.
 *
 * English names inside Spanish copy on purpose: these are wire keys the provider
 * substitutes, not words anybody hears. The rendered output is pure Spanish.
 */
export type VerificationVariable =
  | "caller"
  | "company"
  | "supplier"
  | "supplier_sentence"
  | "purpose"
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
   * neutral one: saying "una cuenta distinta de la que le hemos pagado antes" to
   * a supplier with no payment history would be a claim about a history that does
   * not exist, which is the ADR-0002 rule about invented data applied to speech.
   * `scriptForInstruction` derives it from `knownAccounts` so a caller with the
   * supplier record never has to decide.
   */
  accountChanged?: boolean;
  companyName?: string;
  callerName?: string;
}

export interface VerificationScript {
  /** System prompt for the agent, carrying the script and the rules. */
  systemPrompt: string;
  /** The first thing the agent says, before the supplier has said anything. */
  firstMessage: string;
  /** Why the call is happening, said once, after the supplier has answered. */
  purpose: string;
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
 *
 * Read it as four blocks, because that is the order the failures arrived in.
 * How it talks is the naturalness work: an acknowledgement before it moves on,
 * at most one pause word, and never a sentence it has already said, which is the
 * difference between a person doing their job and a recording. The guion is the
 * control. How it closes is rule 8, and it is written as a sequence because an
 * agent that was merely told to hang up said the goodbye and then waited. The
 * cases are the six things a supplier actually does, each with one answer, so
 * the model never improvises one.
 */
export const VERIFICATION_TEMPLATE: {
  readonly systemPrompt: string;
  readonly firstMessage: string;
} = {
  firstMessage:
    "Buen día. Le habla {{caller}}, de la línea automática de pagos a proveedores de {{company}}. ¿Hablo con {{supplier}}?",
  systemPrompt: [
    "Eres {{caller}}, la línea automática de pagos a proveedores de {{company}}, en Monterrey. Llamas a los proveedores para confirmar un cambio de cuenta antes de que salga un pago. Eres una línea automática y no una persona, lo dices con naturalidad cuando te presentas, y una persona del área revisa el resultado de cada llamada.",
    "",
    "Cómo hablas:",
    "- Español de México, siempre de usted. Tono sobrio, formal y seguro, como alguien que hace esto todos los días.",
    "- Frases cortas. Uno o dos enunciados por turno y una sola pregunta.",
    "- Antes de seguir, reconoce en dos palabras lo que acaban de decirte: Perfecto, gracias. Entendido. Muy bien. Una sola vez por turno.",
    "- Si necesitas una pausa, una sola palabra y de esta lista: claro, perfecto, entendido, bien. Nada de eh, este, mmm, ándale, va.",
    "- Nunca repitas un enunciado que ya dijiste en esta llamada. La pregunta va con sus palabras exactas la primera vez; si tienes que volver a preguntar, es más corta y con otras palabras.",
    "- Preguntas, te callas y esperas. Si se quedan callados, esperas. No llenes el silencio con preguntas nuevas.",
    "- Si te interrumpen, te callas, los dejas terminar y retomas en una frase: con gusto, le repito.",
    "- Nunca les des dos palabras para que escojan una. Les pides que te lo confirmen con sus palabras.",
    "- No leas números de pasos ni títulos de estas instrucciones.",
    "",
    "Guion:",
    "1. Saluda, di tu nombre y que eres la línea automática de pagos de {{company}}, y pregunta si hablas con {{supplier_sentence}}",
    '2. Cuando confirmen, agradece en dos palabras y di para qué llamas: "{{purpose}}"',
    '3. Luego pregunta, con estas palabras: "{{question}}"',
    "4. Si te contestan con una sola palabra, agradece y pide una sola vez que te lo digan con sus palabras: ¿el cambio de cuenta salió de ustedes? No vuelvas a leer los dígitos. Si vuelven a contestar cortado, lo tomas y cierras.",
    "5. Cuando ya te lo dijeron con sus palabras, repíteles en un enunciado lo que entendiste, con las palabras que ellos usaron, y di que aquí queda asentado y que una persona del área le da seguimiento. Luego cierra.",
    "6. Si te dicen que esa cuenta no es de ellos o que ellos no cambiaron nada, di que queda asentado con sus palabras y que una persona del área le da seguimiento. Luego cierra. No pidas más datos.",
    "7. Si no entendiste, pregunta una sola vez más, más simple y con otras palabras, y cierra.",
    "",
    "Cómo cierras. Cerrar es siempre esta secuencia, en este orden, y cuelgas tú:",
    "1. Un enunciado con lo que quedó asentado, en las palabras del proveedor y sin volver a leer dígitos, y que una persona del área le da seguimiento. Si no hubo nada que confirmar, una disculpa por la molestia en una frase.",
    `2. Esta línea, tal cual: "${VERIFICATION_CLOSING_LINE}"`,
    "3. La herramienta end_call. No esperes a que cuelguen ellos y no agregues nada después de esa línea.",
    "Si ya dijiste la línea de despedida y la llamada sigue abierta, no vuelvas a resumir ni a despedirte: solo end_call.",
    "",
    "Cierres especiales:",
    "- Si el cambio no salió de ellos: el enunciado es que queda asentado, con lo que ellos dijeron, que ese cambio no salió de ustedes y que aquí se revisa. Luego la línea de despedida y end_call.",
    "- Buzón de voz, grabación, o nadie habla en toda la llamada después de preguntar dos veces: end_call de inmediato, sin dejar mensaje y sin la línea de despedida.",
    "",
    "Casos:",
    "- Quién habla o de parte de quién: repite tu nombre, que eres la línea automática de pagos de {{company}}, y sigue donde te quedaste.",
    "- De dónde sacaron mi número: es el teléfono que ustedes nos dieron en sus datos de facturación.",
    "- Te piden que lo repitas: repites únicamente la pregunta, más corta, y no vuelves a leer el monto. Los cuatro dígitos sí los puedes repetir, uno por uno.",
    "- Te preguntan si eres una persona o una grabación: contesta sin rodeos que eres la línea automática de pagos de {{company}} y que una persona del área revisa el resultado. Luego retoma tu pregunta.",
    "- Número equivocado: pregunta una sola vez si es el teléfono de {{supplier}}; si no, discúlpate por la molestia en una frase y cierra, sin preguntar por la cuenta.",
    "- Te piden un momento: dices claro y esperas en silencio. Ese silencio no es una llamada sin contestar, así que no cuelgas, no repites nada y no preguntas de nuevo hasta que vuelvan.",
    "- Está ocupado o va manejando: no insistas, pregunta si prefiere que le marquemos más tarde, y cierra.",
    "- Te sacan del tema: regresa en una frase, que llamas únicamente por la confirmación de la cuenta. Si insisten, cierra.",
    "- Quien contesta no sabe o no decide: agradece y cierra.",
    "",
    "Reglas que no puedes romper:",
    "- Nunca digas una cuenta completa. Los únicos dígitos que puedes decir son los cuatro finales de esta instrucción: {{account_last4}}. Dilos una sola vez, uno por uno.",
    "- Nunca digas la cuenta en la que ya se le había pagado antes, ni sus dígitos finales. De esa cuenta solo puedes decir que la de ahora no es la misma.",
    "- Nunca pidas datos bancarios, contraseñas, códigos ni datos personales. No pidas que te dicten una cuenta.",
    "- Nunca prometas que el pago se va a hacer, ni cuándo. Si preguntan, di que el pago sigue en revisión y que una persona se comunica después.",
    "- Nunca hables de fraude ni acuses a nadie. Si preguntan por qué llamas, di que confirmar la cuenta antes de pagar es un paso estándar.",
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
  caller: DEFAULT_CALLER_NAME,
  company: DEFAULT_COMPANY_NAME,
  supplier: "la empresa que nos envió la factura",
  supplier_sentence: "la empresa que nos envió la factura.",
  purpose:
    "Le llamo del área de pagos, únicamente para confirmar unos datos antes de pagarle.",
  question:
    "En este momento no tengo completa la información de la instrucción, así que le pido una disculpa. Una persona del área se comunica con usted. Gracias por su tiempo.",
  account_last4: "ninguno, no leas ningún dígito en esta llamada",
};

/** `{{name}}`, with the name captured. Whitespace inside is not a placeholder. */
const PLACEHOLDER = /\{\{(\w+)\}\}/g;

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
 * Why the call is happening, in one sentence, said before the question.
 *
 * It carries the amount and, when there is one, the fact that the account is not
 * the one we have paid before. Those two belong together and in front of the
 * question: a supplier who hears their own invoice amount knows this is their
 * payment, and issue #247 heard the earlier version read an amount with no
 * account attached to it. "Recibimos una instrucción" is a fact about a document
 * we hold, which is why it is not the promise rule 5 forbids.
 *
 * The amount arrives already in words, from `amountInWords`. A figure written
 * "$537,960.97" was read out on a live call as a tenth of itself, for the reason
 * that file carries: the grouping comma is a convention the text to speech model
 * does not have to honour, and a supplier hearing the wrong amount is hearing a
 * payment that is not theirs.
 */
function purposeFor(amount: string, accountChanged: boolean): string {
  return accountChanged
    ? `Recibimos una instrucción para depositarle ${amount} a una cuenta distinta de la que le hemos pagado antes, y antes de que salga el pago necesito confirmarla con ustedes.`
    : `Recibimos una instrucción para depositarle ${amount}, y antes de que salga el pago necesito confirmar con ustedes los datos de la cuenta.`;
}

/**
 * The question, which is the whole call.
 *
 * Two wordings and no third. When the supplier has already been paid on another
 * account the question asks about the change as well as the digits; when there is
 * no such account it asks only whether this one is theirs. Neither offers a
 * two word either-or, per rule 4: the supplier is asked to confirm, in words,
 * and `outcome.ts` reads a clause rather than a monosyllable.
 */
function questionFor(tail: string, accountChanged: boolean): string {
  const digits = spokenLast4(tail);

  return accountChanged
    ? `¿Me confirma que ustedes cambiaron su cuenta y que la que termina en ${digits} es de ustedes?`
    : `¿Me confirma que la cuenta que termina en ${digits} es de ustedes?`;
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
    caller: input.callerName ?? DEFAULT_CALLER_NAME,
    company: input.companyName ?? DEFAULT_COMPANY_NAME,
    supplier,
    supplier_sentence: endSentence(supplier),
    purpose: purposeFor(amountInWords(input.amount), accountChanged),
    question: questionFor(tail, accountChanged),
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
    purpose: variables.purpose,
    question: variables.question,
    clabeLast4: tail,
    accountChanged,
    variables,
    spoken: [firstMessage, variables.purpose, variables.question],
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

/**
 * The OWNER call: the second script this package writes, and the only one that
 * ends in a decision.
 *
 * `script.ts` phones the supplier and asks whether an account is theirs. This
 * one phones the person who owns the company and asks what to do with a payment
 * the control already stopped. The two are deliberately separate files with
 * separate agents at the provider, because they say different things to
 * different people and a single prompt that tried to do both would ask a
 * supplier to authorise a payment.
 *
 * It exists for the guided tour of the product: a visitor types their own
 * number, the line calls them as if they were the owner of the seeded company,
 * and whatever they answer is applied to the run in front of them and reverted
 * ten minutes later. `apps/api/src/routes/tour.ts` is the caller and
 * `docs/06-regulatory-privacy.md` carries what happens to the number.
 *
 * The rules of `script.ts` hold here too, and three of them are worth restating
 * because this call is the one that can release money:
 *
 * 1. **The call says what it is, in the greeting.** `REQUIRED_DISCLOSURE`, the
 *    same words, in the first sentence. A line that claims to be a person and
 *    then asks about a payment is the shape of the fraud this product exists to
 *    catch, and the provider refuses that prompt outright with
 *    `call_initialization_error 3000`.
 * 2. **Only four digits of one account are ever spoken.** The stored prompt
 *    carries `{{account_last4}}` and the rule that those are the only digits it
 *    may read. No CLABE reaches the provider's dashboard or a telephone.
 * 3. **Nothing is promised and nobody is accused.** The call says a control held
 *    a payment and asks for an instruction. It never says fraud, never names a
 *    culprit and never says the payment will go out: what the owner says becomes
 *    a `decision_made` a person signed, and the SPEI still leaves from the
 *    company's own banking portal.
 *
 * Two rules are this file's own.
 *
 * 4. **One question, and it is the whole call.** `OWNER_QUESTION` offers the two
 *    actions a person can take on a held line, retain or release, and asks for
 *    one of them in the owner's own words. It is not the two word either-or
 *    `BANNED_PHRASES` forbids: that one asked for yes or no about an account and
 *    gave the parser a monosyllable to read, and `owner-outcome.ts` refuses a
 *    bare one for exactly that reason.
 * 5. **It confirms what it understood before it hangs up.** One sentence, in the
 *    words of the decision that is about to be recorded, because the owner has to
 *    hear the thing they authorised before the line closes.
 *
 * The Spanish is accented and carries its inverted question marks, for the
 * reason `script.ts` gives in full: these strings are read out loud by a text to
 * speech model and not by a person on a screen.
 */

import {
  BANNED_PHRASES,
  DEFAULT_COMPANY_NAME,
  last4,
  spokenAmount,
  spokenLast4,
} from "./script";

/**
 * The name the line uses for the person it is calling.
 *
 * A first name, because that is how the payments line of a small company talks
 * to the person who owns it. It is the default of a slot and not a claim about
 * anybody: the seeded company of `docs/02-persona.md` has an owner and the tour
 * calls a visitor in that role, so the name travels per call.
 */
export const DEFAULT_OWNER_NAME = "Gerardo";

/**
 * The last thing the agent says before it calls `end_call`.
 *
 * Same shape as `VERIFICATION_CLOSING_LINE` next door and the same reason for
 * being a constant: the stored prompt is built from it, the tour screen quotes
 * it, and a test reads it back off the prompt. It is shorter because this call
 * is shorter, and it thanks the owner, because the last sentence of a call about
 * their own money is the one they remember.
 */
export const OWNER_CLOSING_LINE =
  "Eso sería todo. Le agradezco mucho su tiempo y que tenga excelente día.";

/**
 * The one question this call asks, word for word.
 *
 * The two actions a person may take on a line the control stopped, named as
 * actions rather than as a yes and a no, so the answer is a verb the parser can
 * read and a monosyllable is never enough. "Bajo su nombre" is in it because a
 * release over a finding is recorded as the owner's exception, with their name
 * and their words against it, and the person on the telephone has to know that
 * before they say it.
 */
export const OWNER_QUESTION =
  "¿La retenemos hasta verificarla, o la libera bajo su nombre?";

/**
 * What this call never SAYS, in any turn. Folded before comparing.
 *
 * The four of `BANNED_PHRASES` carry over unchanged: the two word either-or, and
 * the three ways of naming a technology instead of naming the company. The rest
 * are this call's own, and each one is a claim it has no standing to make. It may
 * not say fraud or name a suspicion, per ADR-0002, because a control that stopped
 * a payment has found a document that does not add up and not a criminal. It may
 * not promise that the payment will go out or when, because the owner's answer
 * becomes a decision and the transfer still leaves from the bank. And it may not
 * say a payment or an account is "seguro": ADR-0009 forbids that word as a
 * verdict in any language, here as much as on a screen, because a SPEI cannot be
 * recalled.
 *
 * The list is asserted over what is SPOKEN and not over the stored prompt, and
 * the difference is the point: the rules block has to name "fraude" in order to
 * forbid it, and a prohibition the model reads is the opposite of the sentence it
 * bans. The four inherited phrases appear in neither, and the test holds the
 * prompt to those.
 */
export const OWNER_BANNED_PHRASES: readonly string[] = [
  ...BANNED_PHRASES,
  "fraude",
  "estafa",
  "sospecha",
  "sospechoso",
  "robo",
  "garantiza",
  "le prometo",
  "seguro",
  "segura",
];

/**
 * Every placeholder the stored owner template carries.
 *
 * English keys inside Spanish copy, like the verification template: these are
 * wire names the provider substitutes and nobody hears them.
 */
export type OwnerVariable =
  | "owner"
  | "company"
  | "supplier"
  | "amount"
  | "account_last4"
  | "plaza_new"
  | "plaza_usual";

export type OwnerVariables = Record<OwnerVariable, string>;

export interface OwnerScriptInput {
  /** The supplier as its CFDI names it. Never a name this package invented. */
  supplierLegalName: string;
  /** The account the instruction wants to pay. Only its last four are spoken. */
  clabe: string;
  amount: number;
  /**
   * Where the account on this instruction was opened, as a person says it.
   *
   * A place and not a code: `plazaLabel` in `@hackmty/core` writes
   * "180 (DISTRITO FEDERAL, DF)" for a screen, which is right there and wrong
   * out loud, so the caller passes the city and this file reads it as given. An
   * empty string becomes a sentence that says the plaza is not known rather than
   * a place nobody can check.
   */
  plazaNew: string;
  /**
   * Where the accounts this supplier has already been paid on were opened.
   *
   * When it is the same place as `plazaNew` the rendered sentence says so
   * instead of naming it twice, because a call that reads one city out twice as
   * though it were two is a call the owner stops trusting. When there is no
   * history at all it says that, which is the ADR-0002 rule about invented data
   * applied to speech: a supplier with no previous account has moved nothing.
   */
  plazaUsual: string;
  ownerName?: string;
  companyName?: string;
}

export interface OwnerScript {
  /** System prompt for the agent, carrying the script and the rules. */
  systemPrompt: string;
  /** The first thing the agent says, before the owner has said anything. */
  firstMessage: string;
  /** The question the outcome is read from, quoted for the screen. */
  question: string;
  /** Last four digits of the account. The only part of it ever spoken. */
  clabeLast4: string;
  /** The whole call as plain lines, for the screen and for the clerk. */
  spoken: string[];
  /**
   * What the provider substitutes into the stored template for this call.
   *
   * The same strings the rendered fields above are made of, which is why the
   * telephone and the screen cannot say two different things.
   */
  dynamicVariables: OwnerVariables;
}

/**
 * The owner agent as it is stored at the provider: the script with the slots
 * empty.
 *
 * `bun run voice-setup --owner` pushes exactly this, so a judge reading the
 * ElevenLabs dashboard sees the rules and no account number, no amount and no
 * supplier. Four blocks, in the order the failures of `script.ts` arrived in:
 * how it talks, the guion, how it closes, and the rules it may not break.
 */
export const OWNER_TEMPLATE: {
  readonly systemPrompt: string;
  readonly firstMessage: string;
} = {
  firstMessage:
    "Buen día, {{owner}}. Le habla la línea automática de pagos de {{company}}. Le marco porque el control de pagos retuvo una instrucción y necesito su indicación.",
  systemPrompt: [
    "Eres la línea automática de pagos de {{company}}, en Monterrey. Llamas a {{owner}}, que es quien autoriza los pagos de la empresa, porque el control retuvo una instrucción y hace falta su indicación. Eres una línea automática y no una persona, lo dices con naturalidad cuando te presentas, y lo que {{owner}} te indique queda asentado a su nombre.",
    "",
    "Cómo hablas:",
    "- Español de México, siempre de usted. Tono sobrio y formal, como quien hace esto todos los días.",
    "- Frases cortas. Uno o dos enunciados por turno y una sola pregunta.",
    "- Antes de seguir, reconoce en dos palabras lo que acaban de decirte: Entendido. Muy bien. Claro. Una sola vez por turno.",
    "- Si necesitas una pausa, una sola palabra y de esta lista: claro, perfecto, entendido, bien. Nada de eh, este, mmm.",
    "- Nunca repitas un enunciado que ya dijiste en esta llamada.",
    "- Preguntas, te callas y esperas. Si se queda callado, esperas.",
    "- No leas números de pasos ni títulos de estas instrucciones.",
    "",
    "Guion:",
    "1. Saluda a {{owner}} por su nombre, di que eres la línea automática de pagos de {{company}} y que el control retuvo una instrucción.",
    "2. Dile la situación en dos enunciados cortos, sin adornos: son {{amount}} a {{supplier}}; la cuenta es nueva, termina en {{account_last4}} y no es la que le hemos pagado antes.",
    "3. Agrega la plaza en un enunciado: esa cuenta se abrió en {{plaza_new}} y las cuentas que ya le hemos pagado están en {{plaza_usual}}.",
    `4. Luego pregunta, con estas palabras: "${OWNER_QUESTION}"`,
    "5. Si te contesta que la retengan, confirma en un enunciado: Entendido, la retenemos. Luego cierra.",
    "6. Si te contesta que la libere, confirma en un enunciado: Entendido, queda liberada bajo su nombre. Luego cierra.",
    "7. Si te contesta con una sola palabra o no entendiste, pregunta una sola vez más, más corta y con otras palabras: ¿la retenemos, o la libera usted? Si vuelve a contestar cortado, lo tomas como que sigue retenida y cierras.",
    "8. Si te pide un dato que no tienes, dile que en la pantalla del pago está el detalle completo y retoma tu pregunta. No inventes ningún dato.",
    "",
    "Cómo cierras. Cerrar es siempre esta secuencia, en este orden, y cuelgas tú:",
    "1. Un enunciado con lo que quedó asentado, en las palabras que él usó.",
    `2. Esta línea, tal cual: "${OWNER_CLOSING_LINE}"`,
    "3. La herramienta end_call. No esperes a que cuelgue él y no agregues nada después de esa línea.",
    "Si ya dijiste la línea de despedida y la llamada sigue abierta, no vuelvas a resumir ni a despedirte: solo end_call.",
    "",
    "Casos:",
    "- Te preguntan si eres una persona o una grabación: contesta sin rodeos que eres la línea automática de pagos de {{company}} y que lo que indique queda asentado a su nombre. Luego retoma tu pregunta.",
    "- Te piden que repitas: repites únicamente la pregunta, más corta. Los cuatro dígitos sí los puedes repetir, uno por uno.",
    "- Te preguntan por qué se retuvo: porque la cuenta de esta instrucción no es la que le hemos pagado antes, y confirmarla antes de pagar es un paso estándar.",
    "- Buzón de voz, grabación, o nadie habla en toda la llamada después de preguntar dos veces: end_call de inmediato, sin dejar mensaje y sin la línea de despedida.",
    "- Está ocupado o va manejando: no insistas, dile que la instrucción sigue retenida y cierra.",
    "- Te sacan del tema: regresa en una frase, que llamas únicamente por esta instrucción. Si insisten, cierra.",
    "",
    "Reglas que no puedes romper:",
    "- Nunca digas una cuenta completa. Los únicos dígitos que puedes decir son los cuatro finales de esta instrucción: {{account_last4}}. Dilos una sola vez, uno por uno.",
    "- Nunca digas la cuenta en la que ya se le había pagado antes, ni sus dígitos finales.",
    "- Nunca pidas datos bancarios, contraseñas, códigos ni datos personales.",
    "- Nunca prometas que el pago se va a hacer, ni cuándo. Lo que indique queda asentado y una persona lo ejecuta después desde el banco.",
    "- Nunca hables de fraude ni acuses a nadie. El control encontró que la cuenta no coincide con el historial, y eso es todo lo que sabes.",
    "- Una sola aclaración como máximo. La llamada dura menos de noventa segundos.",
  ].join("\n"),
};

/**
 * What the agent says when a call arrives carrying no variables at all.
 *
 * Pushed as `dynamic_variable_placeholders`, so an unfilled slot can never reach
 * a telephone as the literal text `{{supplier}}`. Every value here asks nothing,
 * claims nothing and names no account: the worst call this line can place is one
 * that says a person will follow up and hangs up.
 */
export const OWNER_VARIABLE_DEFAULTS: OwnerVariables = {
  owner: DEFAULT_OWNER_NAME,
  company: DEFAULT_COMPANY_NAME,
  supplier: "el proveedor que nos envió la factura",
  amount: "el monto que trae la instrucción",
  account_last4: "ninguno, no leas ningún dígito en esta llamada",
  plaza_new: "una plaza que no tenemos en el detalle de esta llamada",
  plaza_usual: "una plaza que no tenemos en el detalle de esta llamada",
};

/** `{{name}}`, with the name captured. Whitespace inside is not a placeholder. */
const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/** What the sentence says when the catalogue could not name the plaza. */
const PLAZA_UNKNOWN = "una plaza que no podemos nombrar";

/** What it says when the supplier has no previous account to compare against. */
const PLAZA_NO_HISTORY = "ninguna plaza que tengamos registrada";

/** What it says when the new account was opened where the old ones were. */
const PLAZA_SAME = "esa misma plaza";

/**
 * Fills the template's slots.
 *
 * Throws on a placeholder nothing filled rather than shipping it, for the reason
 * `renderVerificationText` gives: the failure mode is a text to speech model
 * reading "{{supplier}}" to a real person on a telephone, and a template and a
 * variable set that disagree is a bug that has to fail where a test can see it.
 */
export function renderOwnerText(
  template: string,
  variables: OwnerVariables,
): string {
  const rendered = template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = variables[name as OwnerVariable];

    if (value === undefined) {
      throw new RangeError(
        `the owner template asks for a variable nothing fills: ${name}`,
      );
    }

    return value;
  });

  if (rendered.includes("{{")) {
    throw new RangeError(
      "the owner script still carries a placeholder after rendering",
    );
  }

  return rendered;
}

/**
 * The two plazas as the call says them.
 *
 * Three cases and no fourth. Both known and different: both are named, which is
 * the whole point of the plaza signal. Both known and the same: the second one
 * becomes "esa misma plaza", so the call states the fact without reading one city
 * out twice as if it were two places. No history: the second one says there is
 * none, because a supplier with no previous account has changed nothing and
 * claiming otherwise would be this file inventing a history.
 */
function plazasFor(
  plazaNew: string,
  plazaUsual: string,
): { plaza_new: string; plaza_usual: string } {
  const fresh = plazaNew.trim();
  const usual = plazaUsual.trim();

  if (usual === "") {
    return {
      plaza_new: fresh === "" ? PLAZA_UNKNOWN : fresh,
      plaza_usual: PLAZA_NO_HISTORY,
    };
  }

  return {
    plaza_new: fresh === "" ? PLAZA_UNKNOWN : fresh,
    plaza_usual: fresh === usual ? PLAZA_SAME : usual,
  };
}

/**
 * The situation, in the two short sentences the guion asks for.
 *
 * Rendered here as well as inside the prompt so the screen and the clerk reading
 * by hand see the same words the agent was given, which is the property
 * `spoken` exists for in `script.ts`.
 */
function situationFor(variables: OwnerVariables): string[] {
  return [
    `Son ${variables.amount} a ${variables.supplier}. La cuenta es nueva, termina en ${variables.account_last4} y no es la que le hemos pagado antes.`,
    `Esa cuenta se abrió en ${variables.plaza_new} y las cuentas que ya le hemos pagado están en ${variables.plaza_usual}.`,
  ];
}

/**
 * Builds the owner call for one instruction.
 *
 * Everything said about the money comes from the arguments. There is no default
 * supplier, no example amount and no placeholder account, and the only values
 * this file supplies itself are the owner's name, the company's and the three
 * sentences the plaza comparison needs when there is nothing to compare. That is
 * the ADR-0002 rule about invented data applied to speech: a call may say it does
 * not know where an account was opened, and may not name a place instead.
 */
export function buildOwnerScript(input: OwnerScriptInput): OwnerScript {
  const tail = last4(input.clabe);
  const variables: OwnerVariables = {
    owner: input.ownerName?.trim() || DEFAULT_OWNER_NAME,
    company: input.companyName?.trim() || DEFAULT_COMPANY_NAME,
    supplier: input.supplierLegalName.trim(),
    amount: spokenAmount(input.amount),
    /* Spaced, so the model reads four characters one at a time instead of
       "nueve mil ochocientos ocho", which is what a live call answered when the
       digits went out compact. `clabeLast4` below stays compact, because that is
       the field the ledger and the screen carry. */
    account_last4: spokenLast4(tail),
    ...plazasFor(input.plazaNew, input.plazaUsual),
  };

  const firstMessage = renderOwnerText(OWNER_TEMPLATE.firstMessage, variables);

  return {
    systemPrompt: renderOwnerText(OWNER_TEMPLATE.systemPrompt, variables),
    firstMessage,
    question: OWNER_QUESTION,
    clabeLast4: tail,
    spoken: [firstMessage, ...situationFor(variables), OWNER_QUESTION],
    dynamicVariables: variables,
  };
}

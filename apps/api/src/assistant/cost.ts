/**
 * What one assistant turn costs, in pesos, from three constants that each name
 * their source and their date.
 *
 * This file exists because "cost per transaction" is one of the four things the
 * rubric says a third-party model has to be answered about, and the only answer
 * worth giving is arithmetic somebody can check. So nothing here is an estimate:
 * the two token prices are read off the provider's pricing page for the model
 * `GEMINI_MODEL` actually configures, the exchange rate is the Banxico FIX of a
 * named day, and `costOf` is eight lines of multiplication with a unit test
 * against a worked example.
 *
 * Two rules attached to it.
 *
 * **Never quote a model price from memory.** docs/06 section 6.3 says it and it is
 * repeated here because this is the file somebody edits when the model changes.
 * Open the pricing page, copy the number, stamp the date, and move the date.
 *
 * **The rate is a constant and not a live lookup.** A cost written onto an
 * append-only ledger row has to be reproducible five years later, and a figure
 * computed from whatever the FIX was at request time is not: the same turn would
 * read differently depending on when the ledger was folded. So the rate is pinned,
 * stamped, and changed deliberately, which also keeps the API off a Banxico
 * dependency on the hot path of a conversation.
 */

/**
 * USD per million input tokens for `gemini-3.6-flash`, paid tier.
 *
 * Source: https://ai.google.dev/gemini-api/docs/pricing, read 2026-09-12. The
 * page prices Gemini 3.6 Flash at USD 0.75 per 1M input tokens and USD 3.75 per
 * 1M output tokens through 31 December 2026, and at double that from 1 January
 * 2027. The pre-2027 figure is the one used, and the doubling is the sensitivity
 * test docs/06 section 6.4 runs rather than a surprise.
 */
export const USD_PER_MILLION_INPUT_TOKENS = 0.75;

/** USD per million output tokens, same model, same page, same date. */
export const USD_PER_MILLION_OUTPUT_TOKENS = 3.75;

/**
 * Pesos per US dollar: the Banco de Mexico FIX published for 11 September 2026,
 * read from https://www.banxico.org.mx/tipcamb/tipCamMIAction.do?idioma=sp on
 * 2026-09-12. It is the newest published FIX on the day this was written.
 *
 * The FIX and not a bank's counter rate, for the reason every other number in
 * this repository cites a primary source: it is the rate the Diario Oficial
 * publishes for settling obligations denominated in dollars inside Mexico, so it
 * is the one a reader can reproduce.
 */
export const MXN_PER_USD = 16.9707;

/** The date the rate above was published, for the line the eval prints. */
export const MXN_PER_USD_AT = "2026-09-11";

const TOKENS_PER_MILLION = 1_000_000;

/** Pesos are quoted to the centavo everywhere in this product. */
const CENTAVOS = 100;

/**
 * Tokens are reported with more precision than a centavo, so the cost of one turn
 * is kept to six decimal places rather than rounded to the centavo. A turn costs
 * fractions of a centavo and rounding each one to 0.00 would make the ledger sum
 * to zero over a month, which is the one arithmetic error that would make the
 * cost claim in docs/06 look invented.
 */
const COST_DECIMALS = 6;

export interface TokenCount {
  promptTokens: number;
  outputTokens: number;
  /** What the provider billed in total, which is not assumed to be the sum. */
  totalTokens: number;
}

/** Rounds to a fixed number of decimals without the float tail of toFixed. */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Pesos for one turn, at the stamped prices and the stamped FIX.
 *
 * Input and output are priced separately because they differ by a factor of five,
 * which is also why a turn that reads four tools costs more than a long answer:
 * the evidence comes back as prompt tokens on the next round trip.
 */
export function costMxnOf(tokens: TokenCount): number {
  const inputUsd =
    (tokens.promptTokens / TOKENS_PER_MILLION) * USD_PER_MILLION_INPUT_TOKENS;
  const outputUsd =
    (tokens.outputTokens / TOKENS_PER_MILLION) * USD_PER_MILLION_OUTPUT_TOKENS;
  return round((inputUsd + outputUsd) * MXN_PER_USD, COST_DECIMALS);
}

/** The same figure as a string in centavos, for a line a person reads. */
export function formatMxn(amount: number): string {
  return `MXN ${(Math.round(amount * CENTAVOS) / CENTAVOS).toFixed(2)}`;
}

/**
 * A pesos figure with enough decimals to be non-zero for one turn.
 *
 * `formatMxn` is for a total somebody pays. This one is for a per-turn figure the
 * eval prints, where two decimals would print `MXN 0.00` and teach the reader the
 * wrong thing about the cost of the panel.
 */
export function formatMxnPrecise(amount: number): string {
  return `MXN ${amount.toFixed(COST_DECIMALS)}`;
}

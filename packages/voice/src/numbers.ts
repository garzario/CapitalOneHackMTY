/**
 * The amount, written in Spanish words, because the call is heard and not read.
 *
 * This file exists because of one live call. The owner line was handed
 * `$537,960.97 pesos`, which is exactly right on a screen, and the text to
 * speech model read it out as "cincuenta y tres mil setecientos noventa y seis
 * pesos con noventa y siete centavos": a digit gone and the figure off by an
 * order of magnitude, said to the one person this product lets release a
 * payment. The model is reading glyphs and guessing at a grouping, and a comma
 * every three digits is a convention it does not have to honour. Nothing about
 * that is fixable in a prompt.
 *
 * So nothing spoken carries digits any more. `spokenLast4` next door already
 * learned the same lesson from the other end, where "4611" came back as "cuatro
 * mil seiscientos once" and four characters a supplier was meant to compare
 * became a quantity. Four digits of an account go out spaced so they are read
 * one at a time, and an amount goes out as words so there is nothing left to
 * group. What a screen shows stays in digits: `formatMoney` in `apps/web` is
 * read with the eyes and a comma helps there.
 *
 * The Spanish carries its accents, like the rest of this package and for the
 * same reason it gives in `script.ts`: "millón" without its accent is stressed
 * on the wrong syllable by the ordinary Spanish rule, and these strings are read
 * out loud rather than printed.
 *
 * Three points of grammar are decisions rather than style, and each one is a
 * test:
 *
 * 1. **Apocope.** Before a masculine noun the one is "un" and never "uno":
 *    "un peso", "veintiún pesos", "ciento un pesos", "treinta y un pesos". Every
 *    number this file writes ends up in front of "peso", "centavo", "mil" or
 *    "millones", so the apocopated form is the only one it ever needs.
 * 2. **"Mil" carries no one.** A thousand pesos is "mil pesos" and never "un mil
 *    pesos", which is also how a person says it out loud.
 * 3. **"De" after a round million.** "Un millón de pesos", because millón is a
 *    noun, and "dos millones quinientos mil pesos" without it, because the noun
 *    is no longer the last word before the amount.
 */

/**
 * The largest amount this file will say out loud.
 *
 * Nine digits of pesos, which is a thousand times the largest line the seeded
 * company pays and past anything a PyME disperses in one run. Beyond it the
 * words would need "mil millones", where Mexican Spanish and the rest of the
 * Spanish-speaking world do not agree on what a billion is, and an ambiguous
 * figure in the owner's ear is the bug this file was written to remove. A larger
 * amount throws rather than being spoken wrong.
 */
const MAX_PESOS = 999_999_999;

/**
 * Zero to twenty-nine, which Spanish writes as single words, already apocopated.
 *
 * Index one is "un" and index twenty-one is "veintiún" on purpose: see rule 1 in
 * the file comment. Nothing here is ever said on its own, it is always in front
 * of a masculine noun.
 */
const UNDER_THIRTY: readonly string[] = [
  "cero",
  "un",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
  "veintiún",
  "veintidós",
  "veintitrés",
  "veinticuatro",
  "veinticinco",
  "veintiséis",
  "veintisiete",
  "veintiocho",
  "veintinueve",
];

/** Thirty to ninety. The first two slots are unreachable, `UNDER_THIRTY` has them. */
const TENS: readonly string[] = [
  "",
  "",
  "veinte",
  "treinta",
  "cuarenta",
  "cincuenta",
  "sesenta",
  "setenta",
  "ochenta",
  "noventa",
];

/**
 * One hundred to nine hundred.
 *
 * "Ciento" and not "cien", because the only time a hundred is said "cien" is
 * when nothing follows it, and `underThousand` answers that case before it reads
 * this table. The rest agree in the masculine, which is what "peso" and
 * "centavo" are.
 */
const HUNDREDS: readonly string[] = [
  "",
  "ciento",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos",
];

/** Zero to ninety-nine. "Treinta y un", with the y, from thirty upward. */
function underHundred(value: number): string {
  if (value < 30) {
    return UNDER_THIRTY[value];
  }

  const unit = value % 10;
  const tens = TENS[Math.floor(value / 10)];

  return unit === 0 ? tens : `${tens} y ${UNDER_THIRTY[unit]}`;
}

/** Zero to nine hundred and ninety-nine. A bare hundred is "cien". */
function underThousand(value: number): string {
  if (value === 100) {
    return "cien";
  }

  const hundreds = Math.floor(value / 100);
  const rest = value % 100;

  if (hundreds === 0) {
    return underHundred(rest);
  }

  const head = HUNDREDS[hundreds];

  return rest === 0 ? head : `${head} ${underHundred(rest)}`;
}

/** Zero to 999,999. One thousand is "mil", with no one in front of it. */
function underMillion(value: number): string {
  const thousands = Math.floor(value / 1000);
  const rest = value % 1000;

  if (thousands === 0) {
    return underThousand(rest);
  }

  const head = thousands === 1 ? "mil" : `${underThousand(thousands)} mil`;

  return rest === 0 ? head : `${head} ${underThousand(rest)}`;
}

/**
 * Any whole number up to `MAX_PESOS`, in words.
 *
 * Millions are a separate word and not a third group of thousands, which is why
 * they are read here and not inside `underMillion`: "dos millones quinientos mil"
 * is two nouns, and a model handed "2,500,000" was inventing one of them.
 */
function cardinal(value: number): string {
  const millions = Math.floor(value / 1_000_000);
  const rest = value % 1_000_000;

  if (millions === 0) {
    return underMillion(rest);
  }

  const head =
    millions === 1 ? "un millón" : `${underMillion(millions)} millones`;

  return rest === 0 ? head : `${head} ${underMillion(rest)}`;
}

/**
 * The amount as the agent says it: words, the currency named, the centavos last.
 *
 * The currency is in the sentence rather than left to a symbol, so "pesos" is
 * never ambiguous with another currency on a telephone. The centavos are a
 * clause of their own and only when there are any, because "quinientos pesos con
 * cero centavos" is not how anybody says a round figure, and a clause nobody
 * needs is a clause the model can garble.
 *
 * An amount under a peso is said as centavos alone, which is what the one-cent
 * verification probe of `packages/rail` is: "un centavo", never "cero pesos con
 * un centavo".
 *
 * Throws on anything it cannot say exactly. A negative amount is not a payment,
 * an infinity is a bug upstream, and an amount past `MAX_PESOS` would need a
 * word whose meaning is not agreed. In all three the failure belongs here, where
 * a test sees it, and not in the owner's ear.
 */
export function amountInWords(amount: number): string {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`the call cannot say this amount out loud: ${amount}`);
  }

  /* Centavos first, and rounded once. The ledger holds exact centavos and a
     float that reached this far has already been rounded by whoever read it, so
     rounding twice is the only way to move a figure here. */
  const centavos = Math.round(amount * 100);

  if (centavos < 0) {
    throw new RangeError(
      `the call cannot say a negative amount out loud: ${amount}`,
    );
  }

  const pesos = Math.floor(centavos / 100);
  const cents = centavos - pesos * 100;

  if (pesos > MAX_PESOS) {
    throw new RangeError(
      `the call cannot say an amount above ${MAX_PESOS} pesos: ${amount}`,
    );
  }

  const centClause =
    cents === 0
      ? ""
      : `${cardinal(cents)} ${cents === 1 ? "centavo" : "centavos"}`;

  if (pesos === 0 && cents > 0) {
    return centClause;
  }

  const roundMillions = pesos >= 1_000_000 && pesos % 1_000_000 === 0;
  const pesoClause = `${cardinal(pesos)}${roundMillions ? " de" : ""} ${
    pesos === 1 ? "peso" : "pesos"
  }`;

  return cents === 0 ? pesoClause : `${pesoClause} con ${centClause}`;
}

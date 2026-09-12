/**
 * Comparing the account holder name on a CEP with the legal name on the CFDI.
 *
 * This is the last check before an irrevocable SPEI, and it runs on two strings
 * that describe the same company through two different systems, so it has to
 * absorb four kinds of legitimate difference without ever absorbing a real one:
 *
 * 1. Accents and case. A razon social written with accents and N tilde and the
 *    same one written in plain capitals are the same company. Banks fold both,
 *    the SAT does not.
 * 2. Punctuation and the ampersand. "S.A. de C.V.", "SA DE CV" and "S. A. de C.
 *    V." are one legal form written three ways, and "&" and "Y" are one word.
 * 3. The legal form itself. A bank prints the holder name; the CFDI prints the
 *    razon social with the societary type attached. Neither is wrong.
 * 4. Truncation. The CEP `Nombre` field is capped at 40 characters by the
 *    schema, so a long razon social simply stops mid-name, and Mexican banks
 *    routinely drop the second surname of a natural person.
 *
 * What it must never absorb is a different entity. So the three results are
 * asymmetric on purpose: `match` needs the two names to agree outright or to
 * agree on a real prefix, `partial` needs only one shared word, and `mismatch`
 * means no shared word at all. `partial` is deliberately over-inclusive, because
 * the cost of a false `partial` is a clerk glancing at a screen and the cost of a
 * false `match` is money that never comes back.
 *
 * `mismatch` is "no supporting evidence", not an accusation. Per ADR-0002 the
 * caller maps it to `requiere_verificacion` and a person decides.
 */

export type NameMatch = "match" | "partial" | "mismatch";

/**
 * Tokens that spell a Mexican societary type rather than a name.
 *
 * The single letters are here because the same forms are written spaced and
 * dotted: "S.A.P.I. de C.V." normalises to the tokens S A P I DE C V. They are
 * only ever removed from the END of a name, so a real word that happens to be one
 * letter long survives anywhere else.
 */
const LEGAL_FORM_TOKENS: ReadonlySet<string> = new Set([
  "S",
  "A",
  "B",
  "C",
  "V",
  "P",
  "I",
  "R",
  "L",
  "DE",
  "EN",
  "NC",
  "SA",
  "SAB",
  "SAPI",
  "SAPIB",
  "SAS",
  "SRL",
  "RL",
  "SC",
  "SCL",
  "SCP",
  "AC",
  "IAP",
  "CV",
  "SNC",
  "SPR",
  "SOFOM",
  "SOFIPO",
  "ENR",
  "ER",
]);

/**
 * Connectors that carry no identifying information.
 *
 * They stay in the token sequence, because dropping them would break the prefix
 * test, and they are only excluded when counting shared words.
 */
const CONNECTORS: ReadonlySet<string> = new Set([
  "DE",
  "DEL",
  "LA",
  "LAS",
  "EL",
  "LOS",
  "Y",
  "E",
]);

/**
 * Values a participant sends when it has no name to send. They are placeholders,
 * not names, so they produce no evidence at all.
 */
const PLACEHOLDERS: ReadonlySet<string> = new Set([
  "NA",
  "ND",
  "NO DISPONIBLE",
]);

/**
 * A CEP `Nombre` is capped at 40 characters by the schema. A name that arrives
 * this close to the cap is plausibly a truncation of a longer one.
 */
const TRUNCATION_SUSPECT_LENGTH = 30;

/** Tokens of prefix agreement that stand in for truncation on a short name. */
const PREFIX_TOKENS_FOR_MATCH = 3;

/**
 * Case, accents, punctuation and spacing, folded.
 *
 * "&" becomes " Y " rather than disappearing, so "GARZA & ASOCIADOS" and "GARZA Y
 * ASOCIADOS" normalise to the same string instead of to two different ones.
 * Letters outside A-Z are folded by decomposition, which also turns N tilde into N,
 * matching what banks print.
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/&/g, " Y ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Drops a trailing run of societary-type tokens. */
export function stripLegalForm(tokens: readonly string[]): string[] {
  let end = tokens.length;
  while (end > 0 && LEGAL_FORM_TOKENS.has(tokens[end - 1] as string)) {
    end -= 1;
  }
  return tokens.slice(0, end);
}

/**
 * The identifying part of a name: normalised, tokenised, legal form removed.
 *
 * Returns an empty array for a placeholder and for a string that is nothing but a
 * legal form, because "SA DE CV" identifies no one and two empty cores must not
 * be allowed to look like agreement.
 */
export function nameCore(raw: string): string[] {
  const normalized = normalizeName(raw);
  if (normalized === "" || PLACEHOLDERS.has(normalized)) {
    return [];
  }
  return stripLegalForm(normalized.split(" ").filter((token) => token !== ""));
}

/** The core as one string, for logging and for the evidence chips. */
export function normalizeLegalName(raw: string): string {
  return nameCore(raw).join(" ");
}

/** Words that count as shared evidence: the core minus the connectors. */
function significantTokens(core: readonly string[]): Set<string> {
  const significant = core.filter((token) => !CONNECTORS.has(token));
  return new Set(significant.length > 0 ? significant : core);
}

function isPrefix(
  shorter: readonly string[],
  longer: readonly string[],
): boolean {
  if (shorter.length === 0 || shorter.length > longer.length) {
    return false;
  }
  return shorter.every((token, index) => token === longer[index]);
}

/**
 * Compares the CEP account holder name with the CFDI legal name.
 *
 * `match` when the two cores are equal, or when the shorter is a prefix of the
 * longer and the agreement is strong enough to be truncation rather than
 * coincidence: either the shorter name is long enough to have hit the
 * 40-character field cap, or three or more leading words agree.
 *
 * `partial` when they share at least one significant word. `mismatch` when they
 * share none, or when either side carries no name at all.
 *
 * The answer does not depend on argument order. The parameters are named for the
 * two sides only so the call reads like the check it performs.
 */
export function nameMatch(cepName: string, legalName: string): NameMatch {
  const cepCore = nameCore(cepName);
  const legalCore = nameCore(legalName);
  if (cepCore.length === 0 || legalCore.length === 0) {
    return "mismatch";
  }

  if (cepCore.join(" ") === legalCore.join(" ")) {
    return "match";
  }

  const [shorter, longer] =
    cepCore.length <= legalCore.length
      ? [cepCore, legalCore]
      : [legalCore, cepCore];
  if (isPrefix(shorter, longer)) {
    // Measured on the shorter side, not on the CEP side, so the answer does not
    // depend on which string the caller happened to pass first.
    const looksTruncated =
      shorter.join(" ").length >= TRUNCATION_SUSPECT_LENGTH;
    if (looksTruncated || shorter.length >= PREFIX_TOKENS_FOR_MATCH) {
      return "match";
    }
  }

  const cepTokens = significantTokens(cepCore);
  const legalTokens = significantTokens(legalCore);
  for (const token of cepTokens) {
    if (legalTokens.has(token)) {
      return "partial";
    }
  }
  return "mismatch";
}

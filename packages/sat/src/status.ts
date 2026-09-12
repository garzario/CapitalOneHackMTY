/**
 * The four states of Article 69-B, and how the published file spells them.
 *
 * The order below is the order a taxpayer moves through, and it is the reason this
 * product keeps every list version instead of the newest one: "definitivo today" and
 * "definitivo on the day we paid" are different questions, and only the second one
 * decides whether a deduction we already took is still good.
 *
 * - `presunto`: the SAT presumes the operations are simulated and has published the
 *   taxpayer. The clock for the taxpayer to answer starts here.
 * - `desvirtuado`: the taxpayer answered and the SAT accepted. Not listed any more.
 * - `definitivo`: the taxpayer did not answer or the answer was rejected. Invoices
 *   issued by this taxpayer have no fiscal effect, retroactively.
 * - `sentencia_favorable`: a court ruled for the taxpayer. Not listed any more.
 *
 * TODO(FabriBanda): docs/06-regulatory-privacy.md should cite the article and the
 * timelines next to this list, because it is the half of the pitch a judge checks.
 */

import type { SatListStatus } from "@hackmty/core";

/** Every status, in the order a taxpayer moves through them. */
export const SAT_STATUSES: readonly SatListStatus[] = [
  "presunto",
  "desvirtuado",
  "definitivo",
  "sentencia_favorable",
] as const;

/** How the status reads in the UI, in the Spanish the published file uses. */
export const SAT_STATUS_LABELS: Record<SatListStatus, string> = {
  presunto: "Presunto",
  desvirtuado: "Desvirtuado",
  definitivo: "Definitivo",
  sentencia_favorable: "Sentencia favorable",
};

/**
 * The two statuses that mean the taxpayer is on the list right now. `desvirtuado`
 * and `sentencia_favorable` both mean the opposite, and a product that alerts on
 * them is a product the clerk stops trusting in a week.
 */
export const LISTED_STATUSES: readonly SatListStatus[] = [
  "presunto",
  "definitivo",
] as const;

export function isListed(status: SatListStatus): boolean {
  return LISTED_STATUSES.includes(status);
}

/** Strips accents and collapses whitespace, so "Sentencia  Favorable" parses. */
function fold(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/**
 * Reads the status column of the published file. Returns undefined rather than
 * throwing or guessing: an unreadable status is a rejected row the loader reports,
 * because a row silently dropped from a fiscal blacklist is the worst failure this
 * package has.
 */
export function parseSatStatus(raw: string): SatListStatus | undefined {
  const folded = fold(raw);
  return SAT_STATUSES.find((status) => status === folded);
}

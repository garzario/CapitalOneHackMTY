/**
 * The demo company, invented.
 *
 * A 28-person metalmecanica shop in Apodaca, which is the persona in docs/02: the
 * sole administrative assistant runs a payment file every Thursday, from CFDIs that
 * arrive by email and by WhatsApp, and a CLABE she has never seen before looks exactly
 * like a CLABE she has seen a hundred times.
 *
 * Apodaca is a real municipality. The company is not a real company, its RFC carries
 * the `SYN` prefix, and every object built from this profile carries
 * `synthetic: true`, which is what the UI watermarks from, per ADR-0002.
 */

import type { Clabe, Rfc } from "@hackmty/core";

export interface CompanyProfile {
  rfc: Rfc;
  legalName: string;
  /** Short name, for a screen that has no room for the full legal name. */
  tradeName: string;
  city: string;
  state: string;
  employees: number;
  /** The account the company pays suppliers FROM. */
  clabe: Clabe;
  bankName: string;
  /**
   * The account id the bank mirror hangs off. ObjectId-shaped rather than a UUID,
   * because Nessie mixes the two and nothing downstream may assume either. Fixed
   * rather than drawn, so a screenshot taken at 02:00 still names the same account
   * at 08:00.
   */
  bankAccountId: string;
  /**
   * The weekday the payment run happens, matching Date.getUTCDay: 0 is Sunday, so 4
   * is Thursday. Thursday and not Friday because a SPEI sent on Friday afternoon that
   * turns out to be wrong cannot be chased until Monday, which is the sentence the
   * persona says out loud in docs/02.
   */
  paymentRunWeekday: number;
  /** Always true. There is no non-synthetic company in this repository. */
  synthetic: true;
}

export const DEMO_COMPANY: CompanyProfile = {
  rfc: "SYN090615C01",
  legalName: "Metalicos del Norte SA de CV",
  tradeName: "Metalicos del Norte",
  city: "Apodaca",
  state: "Nuevo Leon",
  employees: 28,
  clabe: "058180001142789037",
  bankName: "Banregio",
  bankAccountId: "5e1a0f00c0ffee0000000001",
  paymentRunWeekday: 4,
  synthetic: true,
};

/** IVA at the general rate, which is what every synthetic CFDI here is stamped with. */
export const IVA_RATE = 0.16;

/**
 * Months of CFDI history the generator builds before the current payment-run week.
 * Eight is the number in issue #43, and it is the shortest window that gives the
 * `supplier_behaviour` detector a baseline worth computing: a supplier invoicing twice
 * a month needs more than a quarter before a jump means anything.
 */
export const HISTORY_MONTHS = 8;

/**
 * The payment run has to land inside this band. It is not enforced by padding: the
 * catalogue cadence in suppliers.ts produces about 101 lines a week on its own, and
 * the band is here so a test fails when somebody edits the cadence without noticing
 * what it does to the demo screen.
 */
export const RUN_SIZE_MIN = 70;
export const RUN_SIZE_MAX = 110;

/**
 * The seed the SentryOne generator defaults to. Same seed, same company, byte for
 * byte, on every machine. 69 after the article this whole product hangs off, and
 * deliberately not 86, which is the consumer generator's seed: two generators sharing
 * a seed makes a determinism bug in one of them look like a bug in the other.
 */
export const SENTRYONE_DEFAULT_SEED = 69;

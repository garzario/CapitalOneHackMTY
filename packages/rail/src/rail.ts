/**
 * What a payment rail is, and what the one-cent probe is allowed to carry.
 *
 * SentryOne verifies a beneficiary by sending one centavo to the account the
 * instruction names and reading the CEP that Banxico signs for it. Mexico has no
 * confirmation-of-payee API, so the cent is the only way to make the central bank
 * state, in a signed document, who holds that account. This package is the part
 * that sends it: one small interface, one adapter per rail, and nothing else.
 *
 * Four rules the interface exists to hold.
 *
 * 1. **The cent is 0.01 MXN and the rail may not choose another amount.**
 *    `CENT_AMOUNT` is the only amount any adapter here may send, because an
 *    amount is the one field of a transfer that cannot be taken back.
 * 2. **Nothing identifying leaves with it.** A rail receives the account, the
 *    amount and nothing else: no supplier name, no legal name, no invoice. The
 *    description a rail writes on its own row carries the amount and the word
 *    verification, and `assertNoIdentity` is the guard that fails the build of
 *    any adapter that drifts from that.
 * 3. **The clave de rastreo comes back from the rail, never from a keyboard.**
 *    It is the string the CEP is filed under at Banxico, so whoever sent the
 *    transfer is the only one who can know it. `claveRastreo` on the result is
 *    therefore the rail's answer and not an argument.
 * 4. **A rail that cannot run says so at construction.** `StpRail` refuses
 *    without its configuration rather than failing on the first request, which is
 *    the same rule `createCepSource` and `createExtractor` follow in apps/api: a
 *    request must never be the thing that discovers the server is misconfigured.
 */

import type { Clabe, RailId } from "@hackmty/core";

/**
 * The amount of the probe, in MXN major units like the rest of the domain.
 *
 * One centavo is the smallest amount SPEI moves, which is the whole point: the
 * probe has to be a real transfer for Banxico to publish a CEP for it, and it has
 * to be small enough that sending it is never a decision anybody weighs.
 */
export const CENT_AMOUNT = 0.01;

/**
 * The longest a clave de rastreo may be, from the SPEI field itself: up to 30
 * characters, letters and digits only. Both adapters mint inside this shape and
 * `assertClaveRastreo` is what stops one from drifting out of it.
 */
export const CLAVE_RASTREO_MAX_LENGTH = 30;

/** Letters and digits, upper case, at most 30. Anything else is not a clave. */
export const CLAVE_RASTREO_PATTERN = /^[A-Z0-9]{1,30}$/;

/** What the rail is told about the transfer. The account and the amount, only. */
export interface CentRequest {
  /** The instruction this probe verifies. Never sent to the rail's API. */
  instructionId: string;
  /** The account being probed, as the instruction printed it. */
  beneficiaryAccount: Clabe;
}

/** What a rail answers once the centavo is on its way. */
export interface CentSent {
  /** Which rail moved it. */
  rail: RailId;
  /** The clave de rastreo the rail filed the transfer under. */
  claveRastreo: string;
  /** When the rail accepted it, ISO 8601. */
  sentAt: string;
  /** Always `CENT_AMOUNT`. Stated rather than implied, so the ledger carries it. */
  amount: number;
  /**
   * The rail's own identifier for the row it created, when it has one: the Nessie
   * object id, or the STP `id` of the order. It is what lets somebody open the
   * row the clave was minted from.
   */
  reference?: string;
  /**
   * Clave SPEI of the sending participant, when the rail is a participant at all.
   * The Banxico portal needs both participants to answer, so a rail that knows
   * its own key hands it over. Nessie is not a bank and has none.
   */
  senderSpeiKey?: string;
  /**
   * True when no real rail moved money: the in-process rail the tests and
   * `bun run demo` use. It travels onto the `cent_sent` ledger event, so nothing
   * downstream can read a simulated probe as a settled transfer.
   */
  simulated: boolean;
}

/**
 * A rail that can send the one-cent probe.
 *
 * Deliberately one method. Everything else about a payment rail (balances,
 * statements, reversals) is outside what this product does, and an interface that
 * offered them would invite a route handler to use them.
 */
export interface PaymentRail {
  readonly rail: RailId;
  /**
   * Human-readable name of where the cent actually goes, for the boot log and the
   * demo output. It never claims more than the adapter does.
   */
  readonly describe: string;
  sendCent(request: CentRequest): Promise<CentSent>;
}

/** Thrown when a rail is asked to exist without the configuration it needs. */
export class RailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RailConfigError";
  }
}

/** Thrown when the rail accepted nothing and the cent did not leave. */
export class RailSendError extends Error {
  readonly rail: RailId;

  constructor(rail: RailId, message: string) {
    super(message);
    this.name = "RailSendError";
    this.rail = rail;
  }
}

/**
 * Turns a rail's own identifier into a clave de rastreo.
 *
 * A clave de rastreo is up to 30 alphanumeric characters and it is how a CEP is
 * found at Banxico, so it has to be stable, unique per transfer and readable back
 * to the row it came from. Taking the rail's object id and keeping its letters and
 * digits gives all three: the prefix says which rail minted it, and the rest is
 * the identifier of the row, upper-cased because SPEI fields are.
 *
 * Truncation is deliberate and documented rather than avoided: a Nessie `_id` is
 * a 24-character ObjectId or a 36-character UUID, and a UUID's 32 hexadecimal
 * characters do not fit under 30 with a prefix. The first characters of the id are
 * kept, which is still unique inside one account by a wide margin.
 */
export function claveRastreoFrom(prefix: string, reference: string): string {
  const head = keepAlphanumeric(prefix);
  const body = keepAlphanumeric(reference);
  if (body === "") {
    throw new RailConfigError(
      `the rail answered with no usable identifier (${reference}), so there is no clave de rastreo to file the CEP under`,
    );
  }
  return `${head}${body}`.slice(0, CLAVE_RASTREO_MAX_LENGTH);
}

function keepAlphanumeric(value: string): string {
  return value.replace(/[^0-9A-Za-z]+/g, "").toUpperCase();
}

/** Fails loudly on a clave no SPEI field could hold. */
export function assertClaveRastreo(clave: string): string {
  if (!CLAVE_RASTREO_PATTERN.test(clave)) {
    throw new RailConfigError(
      `"${clave}" is not a clave de rastreo: SPEI allows up to ${CLAVE_RASTREO_MAX_LENGTH} letters and digits`,
    );
  }
  return clave;
}

/**
 * The words a rail is allowed to write on its own row.
 *
 * Everything posted with our Nessie key is readable by anybody holding that key,
 * and an STP order is a banking record, so the text that travels with the probe
 * says what the movement is and nothing about who it is to. No supplier name, no
 * legal name, no CLABE, and no amount other than the cent.
 */
export const CENT_DESCRIPTION = "Verificacion de cuenta SPEI 0.01 MXN";

/**
 * Fails when a description would leak an identity into the rail's own system.
 *
 * It is a guard and not a sanitiser on purpose: silently stripping a CLABE out of
 * a string would hide the bug that put it there. The check is cheap enough to run
 * on every send.
 */
export function assertNoIdentity(description: string): string {
  if (/\d{10,}/.test(description)) {
    throw new RailConfigError(
      "the rail description carries a long digit run, which is how a CLABE or an account number ends up in somebody else's system",
    );
  }
  return description;
}

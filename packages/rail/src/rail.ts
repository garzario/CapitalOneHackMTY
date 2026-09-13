/**
 * What a payment rail is, and what it is allowed to carry.
 *
 * SentryOne verifies a beneficiary by sending one centavo to the account the
 * instruction names and reading the CEP that Banxico signs for it. Mexico has no
 * confirmation-of-payee API, so the cent is the only way to make the central bank
 * state, in a signed document, who holds that account. Since ADR-0008 the same
 * seam also carries the payment run itself, which is what makes the instruction the
 * payment order rather than a copy of one: one small interface, one adapter per
 * rail, and nothing else.
 *
 * Five rules the interface exists to hold.
 *
 * 1. **A rail sends the probe or the amount of an instruction this product holds,
 *    and nothing else.** `CENT_AMOUNT` is the probe and it is the only constant
 *    amount in the package; a payment's amount arrives on `PaymentOrder` from the
 *    instruction, to the account that instruction names, because an amount is the
 *    one field of a transfer that cannot be taken back. ADR-0008 made that rule
 *    narrower than it sounds rather than looser.
 * 2. **Nothing identifying leaves with it.** A rail receives the account, the
 *    amount and nothing else: no supplier name, no legal name, no invoice. The
 *    description a rail writes on somebody else's system is fixed and nameless, and
 *    `assertNoIdentity` is the guard that fails the send of any adapter that drifts
 *    from that. The one exception is `LayoutRail`, which writes a file the company
 *    itself uploads to its own bank and says so in its own header.
 * 3. **The clave de rastreo comes back from the rail, never from a keyboard.**
 *    It is the string the CEP is filed under at Banxico, so whoever sent the
 *    transfer is the only one who can know it. `claveRastreo` on the result is
 *    therefore the rail's answer and not an argument.
 * 4. **"We asked" and "the rail says it happened" are two different claims.**
 *    `PaymentSent.state` is what the rail itself reached, and `confirm` is the
 *    second question asked separately. A rail that cannot be asked does not
 *    implement it, which is not the same as a rail that answers no.
 * 5. **A rail that cannot run says so at construction.** `StpRail` refuses
 *    without its configuration rather than failing on the first request, which is
 *    the same rule `createCepSource` and `createExtractor` follow in apps/api: a
 *    request must never be the thing that discovers the server is misconfigured.
 */

import type { Clabe, PaymentLineState, RailId, Rfc } from "@hackmty/core";

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

/* -------------------------------------------------------------------------- */
/* The payment run                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Who is being paid, for the rails that write a file the company itself uploads to
 * its own bank portal.
 *
 * It is deliberately absent from what reaches a third party's API. A bank portal
 * layout needs the beneficiary name and a reference, because the person uploading
 * the file is the company's own clerk and the file never leaves their computer until
 * they hand it to their own bank. An STP order and a Nessie row get neither, which
 * is what rule 2 at the top of this file means.
 */
export interface PaymentBeneficiary {
  /** Legal name on the supplier's CFDI, which is the name being paid. */
  legalName: string;
  rfc: Rfc;
  /** The CFDI this line settles, for the reference column of a dispersal file. */
  cfdiUuids: readonly string[];
}

/**
 * One line of a payment run, as the rail is told about it.
 *
 * ADR-0008 in one type: the instruction this product already holds, its own amount,
 * and the account that instruction names. There is no shape of this object that
 * expresses an amount the instruction did not carry or an account it did not name,
 * which is the point.
 */
export interface PaymentOrder {
  /** The instruction this line pays. */
  instructionId: string;
  /** The run it belongs to, so a line can be traced back without a join. */
  runId: string;
  /** The account the instruction names, as the instruction printed it. */
  beneficiaryAccount: Clabe;
  /** Pesos of this line, exact to the centavo, from the instruction. */
  amount: number;
  /** Only for a rail that writes a file the company uploads itself. */
  beneficiary?: PaymentBeneficiary;
}

/**
 * What a rail answers about one line it accepted.
 *
 * `state` is the rail's own claim and the API never upgrades it. `queued` is a line
 * written into a file nobody has uploaded yet, `sent` is a line the rail took, and
 * `settled` is a rail saying the movement is on the account. A `queued` line carries
 * no clave de rastreo, because the clave is what the bank answers when the file is
 * processed, which is also why `claveRastreo` is optional here and on the
 * `payment_sent` ledger event.
 */
export interface PaymentSent {
  /**
   * Which rail carried it. Absent on a rail that names no participant: a dispersal
   * file is executed by the company's own bank, and this product is not it.
   */
  rail?: RailId;
  /** How far the rail itself got. Never `failed`: a refusal throws. */
  state: Extract<PaymentLineState, "queued" | "sent" | "settled">;
  /** The clave the transfer is filed under. Absent while the line is `queued`. */
  claveRastreo?: string;
  /** When the rail accepted it, ISO 8601. */
  sentAt: string;
  /** Pesos the rail was asked for, echoed so the caller adds up one number. */
  amount: number;
  /** The instruction this line pays, echoed so a result needs no index. */
  instructionId: string;
  /** The rail's own identifier for the row it created, when it has one. */
  reference?: string;
  /** Clave SPEI of the sending participant, when the rail is one. */
  senderSpeiKey?: string;
  /** True when no real rail moved money. Travels onto every event. */
  simulated: boolean;
}

/** What a rail answers when it is asked about a line it already accepted. */
export interface PaymentConfirmation {
  instructionId: string;
  /** `settled` when the rail can answer for the movement, `sent` when it cannot. */
  state: Extract<PaymentLineState, "sent" | "settled">;
  /** When the rail answered, ISO 8601. */
  at: string;
  /** One sentence about what the rail actually said. */
  detail: string;
}

/**
 * A rail that can disperse a payment run.
 *
 * Separate from `PaymentRail` because the two capabilities are not the same
 * question. A dispersal file can carry eighty-six payments and cannot verify one
 * account, since its clave de rastreo only exists once the bank has answered the
 * file; a SPEI participant can do both. Splitting the interface is what lets
 * `LayoutRail` exist without inventing a `RailId` for a file, which is the same
 * argument `FakeRail` makes for taking its rail as an argument.
 */
export interface DispersalRail {
  /**
   * Human-readable name of where the money actually goes, for the boot log and the
   * demo output. It never claims more than the adapter does.
   */
  readonly describe: string;
  /**
   * Sends one line of one instruction for that instruction's own amount.
   *
   * @throws RailSendError when the rail refused it. Nothing is appended to the
   *   ledger on a throw: a `payment_sent` for a payment that never left is the one
   *   entry this ledger must not hold.
   */
  send(order: PaymentOrder): Promise<PaymentSent>;
  /**
   * Asks the rail which of the lines it accepted it can now answer for.
   *
   * Optional, and the absence is the statement: a rail that cannot be asked does
   * not offer the method, and the caller leaves those lines on `sent` rather than
   * reading silence as a settlement.
   */
  confirm?(sent: readonly PaymentSent[]): Promise<PaymentConfirmation[]>;
}

/**
 * A rail that can send the one-cent probe, and therefore also a payment.
 *
 * Everything else about a payment rail (balances, statements, reversals) is outside
 * what this product does, and an interface that offered them would invite a route
 * handler to use them.
 */
export interface PaymentRail extends DispersalRail {
  readonly rail: RailId;
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

/**
 * The words a rail writes on a payment of the run.
 *
 * Same rule as `CENT_DESCRIPTION` and for the same reason: the row lands in somebody
 * else's system, so it says what the movement is and nothing about who it is to. The
 * supplier, the invoice and the account stay in our own ledger, where the receipt
 * reads them from.
 */
export const PAYMENT_DESCRIPTION = "Dispersion SPEI de corrida de pagos";

/**
 * Fails when the amount is not one this product may send.
 *
 * Positive, finite, and a whole number of centavos. The last one matters more than
 * it looks: a float with a third decimal is an amount no SPEI field can hold, and a
 * rail that rounded it would send a number nobody decided. The amount itself is
 * never checked against a limit here, because the limit is the instruction: ADR-0008
 * allows exactly the amount the instruction carries and `PaymentOrder` is the only
 * way to state one.
 */
export function assertPaymentAmount(amount: number): number {
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RailConfigError(
      `${amount} is not an amount this rail may send: a payment is a positive, finite number of pesos`,
    );
  }
  if (Math.abs(amount * 100 - cents) > 1e-6) {
    throw new RailConfigError(
      `${amount} is not a whole number of centavos, and a rail that rounded it would send an amount nobody decided`,
    );
  }
  return amount;
}

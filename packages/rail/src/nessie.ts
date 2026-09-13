/**
 * The demo rail: the one-cent probe as an outflow on the company's Nessie mirror.
 *
 * Nessie is the company's bank mirror in this product (ADR-0002, docs/09-api.md),
 * and that is exactly what it is here too. The cent is recorded as a WITHDRAWAL on
 * the mirror account: money leaving the account with no payee named. The mirror's
 * settled history is pushed as purchases, because a purchase carries a payee and
 * reconciliation needs one, and that is the opposite of what the probe needs. The
 * probe must name nobody: a row in a sandbox any other team can read with our key
 * has no business saying which supplier is being checked.
 *
 * What this rail is, said plainly so nothing in the demo has to be hedged: Nessie
 * is a sandbox, it is not a bank, and it does not move pesos or produce a CEP.
 * What it proves is the shape of the flow end to end, on a bank mirror account
 * this key holds: the cent is a real write against the real API with our own key,
 * the object id it answers with becomes the clave de rastreo, and the whole
 * pipeline from the cent to the decision hangs off that clave. Which of the key's
 * two mirror accounts it lands on is written out on `pickMirrorAccount` below,
 * because it is not the one `bank_reconciliation` reconciles and saying otherwise
 * on stage would be a claim nobody earned. The rail that would produce a Banxico
 * CEP is `StpRail`, which is documented and refuses to pretend it is configured.
 *
 * Three things it never does.
 *
 * - **It never creates a customer or an account.** The mirror account is found
 *   through the key: `GET /accounts` answers only this key's accounts, and the one
 *   `bun run nessie:mirror` created is recognised by its nickname. An orphan
 *   customer per probe would litter a shared pool and would also mean the probe
 *   was not recorded where the reconciliation control looks.
 * - **It never writes anything identifying.** The description is
 *   `CENT_DESCRIPTION`, checked by `assertNoIdentity` on the way out.
 * - **It never reports the clave before Nessie has answered.** No optimistic id,
 *   no client-side uuid: the clave is minted from the object the API returned, so
 *   a clave in our ledger always has a row behind it.
 *
 * Verified quirk that matters here and is not a bug to fix: a Nessie amount is
 * stored as a whole number, so the 0.01 that goes up reads back as 0. The exact
 * centavos live in our own ledger, which is the same reason docs/09-api.md gives
 * for the mirror's whole-peso amounts.
 */

import type { RailId } from "@hackmty/core";
import {
  MIRROR_ACCOUNT_NICKNAME,
  monterreyDay,
  type NessieAccount,
  NessieClient,
} from "@hackmty/nessie";
import {
  assertClaveRastreo,
  assertNoIdentity,
  CENT_AMOUNT,
  CENT_DESCRIPTION,
  type CentRequest,
  type CentSent,
  claveRastreoFrom,
  type PaymentRail,
  RailConfigError,
  RailSendError,
} from "./rail";

/**
 * Prefix of a clave de rastreo minted from a Nessie object id.
 *
 * Three characters, so 27 of the object id survive the 30-character SPEI field.
 * It is there to say out loud which rail minted the clave: a clave that starts
 * with NSS was filed in the Nessie mirror and not at Banxico, and nobody reading
 * the ledger later has to guess.
 */
export const NESSIE_CLAVE_PREFIX = "NSS";

/** Status a fresh row carries. Nessie has been seen with both of its two values. */
const CENT_STATUS = "pending";

/** `medium` of a withdrawal. The account balance, not reward points. */
const CENT_MEDIUM = "balance";

export interface NessieRailOptions {
  /** Defaults to a client built from `NESSIE_API_KEY`. */
  client?: NessieClient;
  /**
   * The mirror account to charge. Defaults to discovery through the key, which is
   * what a deployment uses; a test passes one and makes no discovery call.
   */
  accountId?: string;
  /** Injectable so a test asserts an exact `sentAt` instead of matching a regex. */
  now?: () => string;
}

/**
 * Why the account could not be found, as a sentence that names the fix.
 *
 * `bun run nessie:mirror` is the command that creates it, and saying so is the
 * difference between a clerk reporting a bug and a teammate running one line.
 */
const NO_ACCOUNT =
  'This key has no bank mirror account to charge the cent to. Run `bun run nessie:mirror` once, which creates the company customer and the "Cuenta operativa SPEI" account, and try again.';

export class NessieRail implements PaymentRail {
  readonly rail: RailId = "nessie";
  readonly describe =
    "Nessie sandbox, the company bank mirror (a write with our own key; not a bank and not a CEP)";

  private readonly client: NessieClient;
  private readonly now: () => string;
  private accountId: string | undefined;

  constructor(options: NessieRailOptions = {}) {
    this.client = options.client ?? new NessieClient();
    this.accountId = options.accountId;
    this.now = options.now ?? (() => new Date().toISOString());

    if (!this.client.configured) {
      throw new RailConfigError(
        "NESSIE_API_KEY is not set, so the cent has no rail to leave on. Copy .env.example to .env and paste the sandbox key, or set RAIL= to the rail you mean.",
      );
    }
  }

  /**
   * Sends the centavo and answers with the clave de rastreo it was filed under.
   *
   * The account is resolved once and cached: the id cannot change under us inside
   * one process, and a listing per probe would be a request nobody reads.
   *
   * The request is deliberately unread, and that is the property worth naming
   * rather than hiding: nothing about which instruction or which beneficiary is
   * being checked reaches Nessie. The row is a 0.01 outflow with a fixed
   * description, and everything that identifies the payment stays in our ledger.
   */
  async sendCent(_request: CentRequest): Promise<CentSent> {
    const accountId = await this.mirrorAccountId();
    const sentAt = this.now();
    const description = assertNoIdentity(CENT_DESCRIPTION);

    const row = await this.client
      .createWithdrawal(accountId, {
        medium: CENT_MEDIUM,
        transaction_date: monterreyDay(sentAt),
        amount: CENT_AMOUNT,
        status: CENT_STATUS,
        description,
      })
      .catch((cause: unknown) => {
        throw new RailSendError(
          "nessie",
          `the cent was not recorded on the bank mirror: ${messageOf(cause)}`,
        );
      });

    const reference = row._id;
    if (typeof reference !== "string" || reference.trim() === "") {
      throw new RailSendError(
        "nessie",
        "Nessie accepted the withdrawal and answered without an id, so there is no row to mint a clave de rastreo from",
      );
    }

    /* `senderSpeiKey` is deliberately absent: Nessie is not a SPEI participant,
       so it has no clave SPEI, and inventing one would be inventing a bank. The
       consequence is that a cent sent this way cannot build a Banxico portal
       query, and `resolveCepByClave` in apps/api says so rather than guessing. */
    return {
      rail: "nessie",
      claveRastreo: assertClaveRastreo(
        claveRastreoFrom(NESSIE_CLAVE_PREFIX, reference),
      ),
      sentAt,
      amount: CENT_AMOUNT,
      reference,
      simulated: false,
    };
  }

  /** The mirror account this key holds, found once and remembered. */
  private async mirrorAccountId(): Promise<string> {
    if (this.accountId !== undefined) {
      return this.accountId;
    }

    const accounts = await this.client
      .listAccounts()
      .catch((cause: unknown) => {
        throw new RailSendError(
          "nessie",
          `the bank mirror account could not be listed: ${messageOf(cause)}`,
        );
      });

    const found = pickMirrorAccount(accounts);
    if (found === undefined) {
      throw new RailSendError("nessie", NO_ACCOUNT);
    }

    this.accountId = found._id;
    return found._id;
  }
}

/**
 * The mirror account among this key's accounts.
 *
 * The nickname `bun run nessie:mirror` sets wins. With no such row, a key that
 * holds exactly one account is unambiguous and that account is used; two accounts
 * and no nickname is ambiguous, and charging the wrong one is worse than refusing,
 * so it refuses.
 *
 * Our key holds TWO accounts under that nickname, because the mirror was pushed
 * under two customers, and the two are indistinguishable through the key: same
 * nickname, same type, same balance, different `account_number` and different
 * owner. The first match is taken, which is deterministic and never alternates
 * between them, and that is the whole of the claim.
 *
 * What it is NOT is a claim about which of the two the reconciliation reads.
 * Verified on 2026-09-12 by reading the sandbox: `GET /accounts` answers
 * `3fce172e-1591-43b8-b112-08e4491e3651` first, which is the account abandoned
 * during development (issue #45), and the mirror `bun run nessie:mirror` keeps
 * reconciled is `ad2841a5-c274-47e4-84c8-e830667feea6`. So the probe lands on the
 * older account, and a deployment that needs it on the reconciled one passes
 * `accountId`. Nothing downstream reads the probe as reconciliation evidence: the
 * clave de rastreo is what the pipeline hangs off, and `bank_reconciliation` reads
 * `ledger_tx` rather than this row.
 */
export function pickMirrorAccount(
  accounts: readonly NessieAccount[],
): NessieAccount | undefined {
  const named = accounts.find(
    (account) => account.nickname === MIRROR_ACCOUNT_NICKNAME,
  );
  if (named !== undefined) {
    return named;
  }
  return accounts.length === 1 ? accounts[0] : undefined;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

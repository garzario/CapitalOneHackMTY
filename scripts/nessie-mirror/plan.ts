/**
 * The decisions `bun run nessie:mirror` makes, lifted out of the script itself.
 *
 * The script is a top-level program: importing it runs it, talks to Nessie and
 * writes a file, so nothing in it can be tested. Everything here is a pure
 * function over what the run observed, which is what lets the refusals below be
 * asserted one by one instead of trusted. `scripts/doctor.ts` and
 * `scripts/doctor/checks.ts` are split the same way and for the same reason.
 *
 * The refusals all protect one thing: `--import` REPLACES the company's rows in
 * `ledger_tx` with the rows Nessie answered. A replacement built on a partial
 * push, a read-back that threw, or a reconciliation that did not balance is a
 * ledger that is quietly shorter than the bank, and every rolling baseline the
 * engine computes off it moves with it.
 */

import type { MirrorIds } from "../../packages/nessie/src/mirror.ts";

/** What a later run, and `bun run doctor`, read back. Gitignored. */
export interface MirrorState {
  seed: number;
  weekOf: string;
  updatedAt: string;
  /** The account id in OUR ledger, which the imported rows are re-homed on. */
  localAccountId: string;
  /** The GET a judge can paste. No key in it, ever. */
  getPath: string;
  /**
   * The instant the POST that created the customer was accepted. That write is
   * what proves the key: a read answers 200 [] whatever the key is.
   */
  keyValidatedAt?: string;
  /**
   * The first twelve hex characters of SHA-256 over the key that write was made
   * with. Never the key. Without it `keyValidatedAt` says only that SOME key
   * once worked, which is not what the doctor claims when it reads it back.
   */
  keyFingerprint?: string;
  /**
   * The `--limit` the mirror on the account was pushed with, 0 meaning every
   * row. The verify pass reconciles against the rows THIS limit selects, so a
   * later run with a narrower default does not report the rest of the account
   * as missing days.
   */
  limit: number;
  /** How many generator rows that limit selects. The push target. */
  pushedRows: number;
  /** Purchases on the Nessie account, counted at the last verify. */
  purchases: number;
  ids: MirrorIds;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The wider of two limits, where 0 means every row and therefore always wins.
 *
 * A push does not replace what is on the account, it adds what is missing, so
 * the set on the account after two runs is the union of what each selected.
 */
export function widerLimit(left: number, right: number): number {
  return left === 0 || right === 0 ? 0 : Math.max(left, right);
}

export interface LimitInput {
  /** The `--limit` this run resolved to, default included. */
  limit: number;
  /** Whether this run pushed at all. A read-only run adds nothing. */
  pushed: boolean;
  /** The limit the state file recorded, absent before the first push. */
  previousLimit?: number;
}

/**
 * The limit that describes what is actually on the Nessie account now.
 *
 * This is what goes back into the state file, and it is a union rather than the
 * limit of the last run: a run that pushed 50 on top of an account seeded with
 * 200 left 200 there.
 */
export function coveredLimit(input: LimitInput): number {
  const pushedLimit = input.pushed ? input.limit : undefined;
  if (input.previousLimit === undefined) {
    return pushedLimit ?? input.limit;
  }
  if (pushedLimit === undefined) {
    return input.previousLimit;
  }
  return widerLimit(input.previousLimit, pushedLimit);
}

/**
 * The limit the read-back is reconciled against.
 *
 * The bug this closes: the verify pass used to compare the whole account
 * against whatever subset THIS run's `--limit` selected, so a default run
 * against an account seeded with `--limit=0` reported every day beyond the
 * newest 200 as a differing day, on a mirror that was in fact perfect. The set
 * pushed is the set to verify, so unless an operator names `--limit` on purpose
 * the covered limit decides.
 */
export function verifyLimit(
  input: LimitInput & { limitGiven: boolean },
): number {
  return input.limitGiven ? input.limit : coveredLimit(input);
}

/**
 * How many purchases the state should claim sit on the account.
 *
 * A verify counted them, so it wins outright. Without one the only honest
 * figure is what was there plus what this run created: writing the pushed
 * count alone made `bun run doctor` report "2 purchases" the morning after a
 * 200-row push followed by a two-row top-up.
 */
export function purchasesOnAccount(input: {
  /** Rows the read-back returned, absent when there was no verify. */
  verifiedRows?: number;
  /** What the state claimed before this run. */
  previous?: number;
  /** What this run created. */
  pushed?: number;
}): number {
  if (input.verifiedRows !== undefined) {
    return input.verifiedRows;
  }
  return (input.previous ?? 0) + (input.pushed ?? 0);
}

/**
 * Why the ids in the state file cannot be reused for this run, if they cannot.
 *
 * The ids are a Nessie customer, account and merchant map built for one seed and
 * one payment-run week. Reusing them for another dataset pushes a second
 * company's rows onto the first company's account, and the two are then
 * impossible to tell apart through the API: the amounts are all that come back.
 */
export function datasetMismatch(input: {
  previous?: Pick<MirrorState, "seed" | "weekOf" | "ids">;
  seed: number;
  weekOf: string;
}): string | undefined {
  const { previous } = input;
  if (previous === undefined) {
    return undefined;
  }
  if (previous.seed === input.seed && previous.weekOf === input.weekOf) {
    return undefined;
  }
  return `the mirror on account ${previous.ids.accountId} was seeded for seed ${previous.seed} week ${previous.weekOf}; pass --seed=${previous.seed} --week=${previous.weekOf} or bun run reset --nessie first`;
}

export type ImportDecision =
  | { kind: "go" }
  /** Nothing to do, and not an error: the run had no database to write to. */
  | { kind: "skip"; reason: string }
  /** The import would corrupt the ledger. The run fails. */
  | { kind: "refuse"; reason: string };

export interface ImportGate {
  /** Empty or absent means there is nowhere to import to. */
  databaseUrl?: string;
  /** Whether this run asked for the read-back at all. */
  verifyAsked: boolean;
  /** Failures the push counted, merchants and purchases together. */
  pushFailures: number;
  /** The push could not list the account, so it pushed nothing. */
  listingFailed: boolean;
  /**
   * Rows the read-back returned. Undefined until a read-back SUCCEEDED, which
   * is the point: initialising it from the generator's own rows made a failed
   * verify import the generator's mirror while claiming it came from the bank.
   */
  readBackRows?: number;
  /** Rows Nessie answered that the normaliser refused. */
  readBackRejected: number;
  /** The message the read-back threw, if it threw. */
  verifyError?: string;
  /** Days `reconcileByDay` reported as different. */
  differingDays: number;
  /** Rows the verify limit selects, which is what the import would leave. */
  selectedRows: number;
  /** Every outflow the generator built for the account. */
  outflows: number;
}

/**
 * Whether `--import` may replace the company's ledger rows with what came back.
 *
 * Ordered so the first cause is the one reported: a listing that failed explains
 * the failure count, a push that failed explains the missing rows, and a
 * read-back that threw explains everything after it.
 */
export function importDecision(gate: ImportGate): ImportDecision {
  if (gate.databaseUrl === undefined || gate.databaseUrl === "") {
    return {
      kind: "skip",
      reason: "DATABASE_URL is not set, so the import was skipped",
    };
  }
  if (!gate.verifyAsked) {
    return {
      kind: "refuse",
      reason: "--import needs --verify, which is what reads the rows back",
    };
  }
  if (gate.listingFailed) {
    return {
      kind: "refuse",
      reason:
        "the push could not list the account, so it pushed nothing and the mirror on Nessie is unproven",
    };
  }
  if (gate.pushFailures > 0) {
    return {
      kind: "refuse",
      reason: `the push reported ${plural(gate.pushFailures, "failure")}, so the mirror on Nessie is short of the generator's rows`,
    };
  }
  if (gate.verifyError !== undefined) {
    return {
      kind: "refuse",
      reason: `the read-back threw (${gate.verifyError}), so there is nothing to import`,
    };
  }
  if (gate.readBackRows === undefined) {
    return {
      kind: "refuse",
      reason: "the read-back never completed, so there is nothing to import",
    };
  }
  if (gate.readBackRejected > 0) {
    return {
      kind: "refuse",
      reason: `the read-back rejected ${plural(gate.readBackRejected, "row")}, so the import would be that much short`,
    };
  }
  if (gate.differingDays > 0) {
    return {
      kind: "refuse",
      reason: `the reconciliation reported ${plural(gate.differingDays, "differing day")}, so the ledger would not match the bank`,
    };
  }
  if (gate.selectedRows < gate.outflows) {
    // Refused rather than warned about. The import REPLACES the mirror, so a
    // limited import would silently shorten the company's bank history from
    // months to days and every rolling baseline computed off it would move.
    return {
      kind: "refuse",
      reason: `--import would leave ${gate.selectedRows} of ${gate.outflows} rows in the ledger. Run: bun run nessie:mirror --import --limit=0`,
    };
  }
  return { kind: "go" };
}

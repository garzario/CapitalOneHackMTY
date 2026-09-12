/**
 * The synthetic network of other tenants, generated deterministically.
 *
 * This is the honest part of the consortium and the sentence that has to be said
 * on stage without being asked: **the network in this repository is not real.**
 * SentryOne has one tenant, so there are no other companies to aggregate, and a
 * demo that implied otherwise would be the Wizard-of-Oz prototype Capital One
 * says it is hunting for. What exists instead is a network generated from the
 * same seed as the demo company, with `synthetic = TRUE` on every row in the
 * warehouse, so the claim is checkable rather than trusted.
 *
 * What it is, precisely:
 *
 * - the accounts the demo company has ALREADY established with a supplier (a
 *   payment complement, a prior payment, a verified CEP) are paid by many other
 *   tenants, for months, without incident. That is the corroboration case.
 * - the accounts that arrive in this week's payment run and are NOT established
 *   are either unseen by the network, or reported as fraud by one or two tenants.
 *   That is the hard negative, and it is the case the product exists for: a
 *   supplier forty companies pay, on an account none of them has ever paid.
 *
 * Nothing in here knows a name, an amount or an invoice. It takes RFCs and
 * CLABEs, hashes them on the way out through `hash.ts`, and what it returns is
 * already anonymised. The tenants are invented RFCs that never leave this
 * function: only `hashTenant` of them reaches the warehouse, so the network does
 * not even hold a list of which companies are in it.
 *
 * Deterministic from `createRng` in `@hackmty/seed`, which is the same generator
 * the demo company comes out of, so "seed 69" means one thing in this repository.
 */

import type { ConsortiumSnapshotRow } from "@hackmty/core";
import { createRng } from "@hackmty/seed";
import type { BeneficiaryEvent, Outcome } from "./ddl";
import {
  bankCodeOf,
  type HashOptions,
  hashClabe,
  hashRfc,
  hashTenant,
} from "./hash";

/** The seed the demo runs on, the same one `bun run seed` defaults to. */
export const DEMO_SEED = 69;

/** How many other tenants the generated network has. */
export const TENANT_COUNT = 64;

/** Tenants that pay an established account: the corroboration band. */
export const MIN_TENANTS_PER_PAIR = 6;
export const MAX_TENANTS_PER_PAIR = 41;

/** Months of history the oldest corroborated pair carries. */
export const MIN_HISTORY_MONTHS = 4;
export const MAX_HISTORY_MONTHS = 30;

/**
 * Share of unestablished accounts the network reports as fraud rather than
 * simply never having seen.
 *
 * Both outcomes are realistic and they read differently on the screen: "nobody
 * has ever paid this account" is a warning, "two companies reported it" is the
 * headline. A third of them carry the report so a demo has one of each.
 */
export const FRAUD_SHARE = 0.34;

/** What the generator needs to know about the tenant whose company this is. */
export interface SyntheticNetworkInput {
  /**
   * The company's suppliers and the accounts it has already established with
   * each. Only the RFC and the CLABEs are read.
   */
  suppliers: readonly {
    rfc: string;
    knownAccounts: readonly { clabe: string }[];
  }[];
  /**
   * This week's payment instructions. An account here that is not in
   * `knownAccounts` is the fresh one, and the network either has never seen it or
   * has a report on it.
   */
  instructions: readonly { supplierRfc: string; clabe: string }[];
  /** The day the run happens, ISO YYYY-MM-DD. History is counted back from it. */
  runDay: string;
  /** Defaults to `DEMO_SEED`. */
  seed?: number;
  /** The network-wide salt. Defaults to the documented demo value. */
  salt?: string;
}

export interface SyntheticNetwork {
  events: BeneficiaryEvent[];
  /** Pairs the network corroborates, for the script's summary line. */
  corroborated: number;
  /** Pairs the network has a fraud report on. */
  reported: number;
  /** Pairs in the run the network has never seen at all. */
  unseen: number;
}

/**
 * Builds the whole network as a list of events, ready for `insertEvents`.
 *
 * Pure and synchronous: the same input and seed give byte-identical events, which
 * is what lets two laptops seed the same network and `bun run consortium:pull`
 * produce the same local snapshot on both.
 */
export function syntheticNetwork(
  input: SyntheticNetworkInput,
): SyntheticNetwork {
  const rng = createRng(input.seed ?? DEMO_SEED);
  const hashing: HashOptions =
    input.salt === undefined ? {} : { salt: input.salt };
  const tenants = buildTenants(input.suppliers.length, hashing);
  const runDay = dayNumber(input.runDay);

  const events: BeneficiaryEvent[] = [];
  let corroborated = 0;
  let reported = 0;
  let unseen = 0;

  /* Established accounts first, so the RFC already has accounts in the network
     by the time the fresh ones are considered: that is what makes
     `other_accounts` non-zero on the hard negative and gives the screen the
     impersonation sentence instead of a shrug. */
  const established = new Set<string>();
  for (const supplier of input.suppliers) {
    const rfcHash = hashRfc(supplier.rfc, hashing);
    for (const account of supplier.knownAccounts) {
      const clabe = account.clabe;
      established.add(pairKey(supplier.rfc, clabe));
      const payers = rng.int(MIN_TENANTS_PER_PAIR, MAX_TENANTS_PER_PAIR);
      const months = rng.int(MIN_HISTORY_MONTHS, MAX_HISTORY_MONTHS);
      corroborated += 1;
      events.push(
        ...payments({
          tenants: rng.shuffle(tenants).slice(0, payers),
          rfcHash,
          clabeHash: hashClabe(clabe, hashing),
          bankCode: bankCodeOf(clabe),
          firstDay: runDay - Math.round(months * 30.436_875),
          lastDay: runDay - rng.int(1, 21),
          rng,
        }),
      );
    }
  }

  for (const instruction of input.instructions) {
    if (established.has(pairKey(instruction.supplierRfc, instruction.clabe))) {
      continue;
    }
    if (!rng.bool(FRAUD_SHARE)) {
      /* Unseen is the absence of rows, not a row that says "unseen". The local
         snapshot reports it as a consulted network with zero tenants, which is
         a different and weaker claim than "not consulted". */
      unseen += 1;
      continue;
    }
    reported += 1;
    const reporters = rng.shuffle(tenants).slice(0, rng.int(1, 2));
    const day = runDay - rng.int(2, 40);
    for (const tenantHash of reporters) {
      events.push({
        tenantHash,
        rfcHash: hashRfc(instruction.supplierRfc, hashing),
        clabeHash: hashClabe(instruction.clabe, hashing),
        bankCode: bankCodeOf(instruction.clabe),
        outcome: "fraud_reported",
        eventDate: isoDay(day),
        synthetic: true,
      });
    }
  }

  return { events, corroborated, reported, unseen };
}

/**
 * The other tenants, as hashes.
 *
 * Their RFCs are built here and discarded here. They are synthetic RFCs in the
 * SYN range ADR-0002 reserves, so even the pre-image of a tenant hash is a
 * company that does not exist.
 */
function buildTenants(suppliers: number, hashing: HashOptions): string[] {
  const count = Math.max(TENANT_COUNT, MAX_TENANTS_PER_PAIR + 1, suppliers);
  const tenants: string[] = [];
  for (let index = 0; index < count; index += 1) {
    tenants.push(
      hashTenant(`SYNNET${String(index).padStart(6, "0")}`, hashing),
    );
  }
  return tenants;
}

interface PaymentsInput {
  tenants: readonly string[];
  rfcHash: string;
  clabeHash: string;
  bankCode: string;
  firstDay: number;
  lastDay: number;
  rng: ReturnType<typeof createRng>;
}

/**
 * One `verified` row and one `paid` row per tenant, spread over the window.
 *
 * Two outcomes per tenant and not one, because that is what a real tenant of
 * this product produces: it verifies a beneficiary once with a CEP and then pays
 * it repeatedly. The first and last dates of the window are pinned to an actual
 * row so `min(event_date)` and `max(event_date)` in the view are the history the
 * generator meant, and not whatever the draws happened to produce.
 */
function payments(input: PaymentsInput): BeneficiaryEvent[] {
  const { tenants, rng } = input;
  const span = Math.max(input.lastDay - input.firstDay, 1);
  const events: BeneficiaryEvent[] = [];

  tenants.forEach((tenantHash, index) => {
    const row = (outcome: Outcome, day: number): BeneficiaryEvent => ({
      tenantHash,
      rfcHash: input.rfcHash,
      clabeHash: input.clabeHash,
      bankCode: input.bankCode,
      outcome,
      eventDate: isoDay(day),
      synthetic: true,
    });
    if (index === 0) {
      events.push(row("verified", input.firstDay), row("paid", input.lastDay));
      return;
    }
    const verified = input.firstDay + rng.int(0, span);
    events.push(
      row("verified", verified),
      row("paid", Math.min(verified + rng.int(1, span), input.lastDay)),
    );
  });

  return events;
}

/**
 * The same aggregate `BENEFICIARY_NETWORK` computes, in TypeScript, over a list of
 * events.
 *
 * Two implementations of one fold is a real cost and it buys the thing the demo
 * cannot do without: `bun run consortium:pull --offline` fills the local snapshot
 * with no Snowflake account and no conference Wi-Fi. Keeping the fold here rather
 * than in the script is what lets one test hold both of them to the same
 * properties, and the test in this folder asserts the columns against the view's
 * own SQL so a renamed column breaks the build rather than the demo.
 *
 * `tenants` counts every tenant that appears for the pair and `fraudReports`
 * counts the ones that reported it, exactly as the view does. A pair whose only
 * rows are reports therefore has `tenants === fraudReports`, and the engine reads
 * `fraudReports` first, so it is never mistaken for corroboration.
 */
export function aggregateNetwork(
  events: readonly BeneficiaryEvent[],
): ConsortiumSnapshotRow[] {
  const accountsPerRfc = new Map<string, Set<string>>();
  for (const event of events) {
    const accounts = accountsPerRfc.get(event.rfcHash) ?? new Set<string>();
    accounts.add(event.clabeHash);
    accountsPerRfc.set(event.rfcHash, accounts);
  }

  const byPair = new Map<
    string,
    { row: ConsortiumSnapshotRow; tenants: Set<string>; reporters: Set<string> }
  >();

  for (const event of events) {
    const key = `${event.rfcHash}|${event.clabeHash}`;
    const held = byPair.get(key) ?? {
      row: {
        rfcHash: event.rfcHash,
        clabeHash: event.clabeHash,
        bankCode: event.bankCode,
        tenants: 0,
        firstSeen: event.eventDate,
        lastSeen: event.eventDate,
        fraudReports: 0,
        otherAccounts: (accountsPerRfc.get(event.rfcHash)?.size ?? 1) - 1,
      },
      tenants: new Set<string>(),
      reporters: new Set<string>(),
    };
    held.tenants.add(event.tenantHash);
    if (event.outcome === "fraud_reported") {
      held.reporters.add(event.tenantHash);
    }
    if (event.eventDate < held.row.firstSeen) {
      held.row.firstSeen = event.eventDate;
    }
    if (event.eventDate > held.row.lastSeen) {
      held.row.lastSeen = event.eventDate;
    }
    byPair.set(key, held);
  }

  return [...byPair.values()]
    .map((held) => ({
      ...held.row,
      tenants: held.tenants.size,
      fraudReports: held.reporters.size,
    }))
    .sort((left, right) =>
      left.rfcHash === right.rfcHash
        ? left.clabeHash.localeCompare(right.clabeHash)
        : left.rfcHash.localeCompare(right.rfcHash),
    );
}

function pairKey(rfc: string, clabe: string): string {
  return `${rfc.toUpperCase()}|${clabe.replace(/\D+/g, "")}`;
}

/** Whole days since the epoch for a YYYY-MM-DD day, so arithmetic stays integer. */
function dayNumber(day: string): number {
  const at = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(at)) {
    throw new RangeError(`runDay must be ISO YYYY-MM-DD: ${day}`);
  }
  return Math.floor(at / 86_400_000);
}

function isoDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

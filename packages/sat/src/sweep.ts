/**
 * The retroactive sweep: what a new publication just did to invoices we already
 * paid and already deducted.
 *
 * This is the number the product is built around, so it is a fold over
 * `LedgerEvent[]` and nothing else. No database, no clock, no network: the same
 * events give the same `SweepResult` on every machine, which is what makes the
 * figure defensible when a judge asks where it came from.
 *
 * ## The two rates, stated rather than implied
 *
 * Article 69-B of the CFF says the operations covered by a definitively listed
 * taxpayer's invoices produce no fiscal effect. In the arithmetic below that
 * means the deduction taken against the invoice base is reversed and the IVA
 * credited against it is reversed with it.
 *
 * - **ISR at 30 percent.** The ordinary corporate rate under article 9 of the
 *   LISR. This is an ASSUMPTION about the company being protected, not a
 *   computation: a company at a loss, a company under a different regime or a
 *   physical person on the tarifa reverses a different amount. The rate is a
 *   parameter, it is exported, and the UI states it next to the figure rather
 *   than presenting the product of a rate and a base as a fact.
 * - **IVA at 16 percent.** The general rate under article 1 of the LIVA. The
 *   sweep does NOT multiply by it: it sums the IVA each CFDI actually carries,
 *   because a single invoice can mix rates and a border-region or zero-rated
 *   line would be overstated by a flat 16 percent. The constant is what the UI
 *   names when it explains the number, and the sum is what the number is.
 *
 * Neither rate is a penalty, a surcharge or an interest calculation. The
 * exposure reported here is the tax that has to be returned, and it is the floor
 * of what a publication costs rather than the whole of it.
 *
 * TODO(FabriBanda): docs/06-regulatory-privacy.md should carry the article
 * citation next to the sweep's output on screen. Until it does, the UI states
 * the rate it used.
 */

import type {
  Cfdi,
  LedgerEvent,
  PaymentComplement,
  PaymentInstruction,
  Rfc,
  SatListEntry,
  SatListStatus,
  Supplier,
  SweepResult,
} from "@hackmty/core";
import { fromCents, sumAmounts, toCents } from "@hackmty/core";
import { createSatIndex } from "./match";
import { isRfcShaped, isSyntheticRfc, normalizeRfc } from "./rfc";

/** Article 9 LISR, the ordinary corporate rate. An assumption, see above. */
export const DEFAULT_ISR_RATE = 0.3;

/** Article 1 LIVA, the general rate. Documented, not multiplied by, see above. */
export const DEFAULT_IVA_RATE = 0.16;

/** Everything a publication has to know about one newly listed supplier. */
export interface SweepSubject {
  supplier: Supplier;
  status: SatListStatus;
  /** CFDI of this supplier the ledger shows as paid, so already deducted. */
  paidCfdis: Cfdi[];
}

export interface SweepOptions {
  /** The version whose publication triggered this sweep. */
  listVersion: string;
  /**
   * The rows of that version, for a publication that is not in the ledger yet.
   * When it is absent the rows come from the `sat_list_published` event for
   * `listVersion`, which is the normal path: the event IS the publication.
   */
  entries?: readonly SatListEntry[];
  /** Only CFDIs paid at or before this instant count. Defaults to the whole ledger. */
  asOf?: string;
  /**
   * Overrides the 30 percent assumption for a company on a different regime.
   * There is deliberately no `ivaRate`: the IVA exposure is the IVA the CFDIs
   * carry, so a rate to multiply by would be a rate nobody could apply.
   */
  isrRate?: number;
}

/**
 * Prices a set of subjects somebody else assembled.
 *
 * Split out of `sweep` because the API holds its subjects in a repository rather
 * than in a ledger, and two different answers to "what does this publication
 * cost" is a bug waiting for a demo.
 */
export function priceSweep(
  subjects: readonly SweepSubject[],
  options: SweepOptions,
): SweepResult {
  const isrRate = options.isrRate ?? DEFAULT_ISR_RATE;

  const newlyListed = subjects.map((subject) => {
    const deductedBase = sumAmounts(
      subject.paidCfdis.map((cfdi) => cfdi.subtotal),
    );

    return {
      supplier: subject.supplier,
      status: subject.status,
      paidCfdis: subject.paidCfdis,
      deductedBase,
      isrExposure: applyRate(deductedBase, isrRate),
      // The IVA actually credited, never the base times a rate. See the header.
      ivaExposure: sumAmounts(subject.paidCfdis.map((cfdi) => cfdi.iva)),
    };
  });

  return {
    listVersion: options.listVersion,
    newlyListed,
    totalExposure: sumAmounts(
      newlyListed.flatMap((row) => [row.isrExposure, row.ivaExposure]),
    ),
  };
}

/** Rounds to the cent, so an exposure is a money value and not a float. */
function applyRate(base: number, rate: number): number {
  return fromCents(Math.round(toCents(base) * rate));
}

/**
 * Replays the ledger and prices what a new list version did to what we paid.
 *
 * One pass, in append order:
 *
 * 1. Fold the CFDIs by issuer, and fold `complement_received` and
 *    `payment_sent` into the set of CFDI uuids actually settled and the instant
 *    each one was settled at. An invoice that was received and never paid
 *    carries no exposure, and counting it would inflate the headline number,
 *    which is the fastest way to lose a judge.
 * 2. Take the rows of `listVersion` and diff them against every version
 *    published before it, so `newlyListed` means newly listed rather than
 *    listed-since-March.
 * 3. For each newly listed supplier, collect the paid CFDIs and price them.
 */
export function sweep(
  events: readonly LedgerEvent[],
  options: SweepOptions,
): SweepResult {
  const ledger = foldLedger(events, options.listVersion);
  const entries = options.entries ?? ledger.published;

  // Indexed rather than filtered per RFC: the official list is 29106 rows over
  // 14234 taxpayers, and a filter inside the loop makes publishing it quadratic.
  const version = createSatIndex(entries);
  const prior = createSatIndex(ledger.priorEntries);

  const newly: SweepSubject[] = [];
  const seen = new Set<Rfc>();

  for (const entry of entries) {
    const rfc = normalizeRfc(entry.rfc);
    if (seen.has(rfc)) {
      continue;
    }
    seen.add(rfc);

    const current = version.match(rfc);
    if (!current.listed) {
      // The version names this taxpayer, but its newest row in it clears them.
      continue;
    }
    if (prior.match(rfc).listed) {
      // Already listed before this version. Its exposure was priced then.
      continue;
    }

    const supplier = ledger.suppliers.get(rfc);
    if (supplier === undefined) {
      // A listed RFC we have never invoiced is news, not exposure.
      continue;
    }

    newly.push({
      supplier,
      status: current.effective?.status ?? entry.status,
      paidCfdis: paidFrom(ledger, rfc, options.asOf),
    });
  }

  return priceSweep(newly, options);
}

/**
 * The invoices of one issuer the ledger shows as actually paid. Exported because
 * the `bank_reconciliation` detector asks the same question from the other
 * direction, and two different answers to "was this paid" is a bug.
 */
export function paidCfdisOf(
  events: readonly LedgerEvent[],
  issuerRfc: Rfc,
  asOf?: string,
): Cfdi[] {
  return paidFrom(foldLedger(events, undefined), normalizeRfc(issuerRfc), asOf);
}

/* -------------------------------------------------------------------------- */
/* The fold                                                                    */
/* -------------------------------------------------------------------------- */

interface Ledger {
  cfdisByIssuer: Map<Rfc, Cfdi[]>;
  /** CFDI uuid to the instant the ledger says it was settled. */
  paidAt: Map<string, string>;
  suppliers: Map<Rfc, Supplier>;
  /** Rows of the version being swept. */
  published: SatListEntry[];
  /** Rows of every version published before it. */
  priorEntries: SatListEntry[];
}

function foldLedger(
  events: readonly LedgerEvent[],
  listVersion: string | undefined,
): Ledger {
  const cfdisByIssuer = new Map<Rfc, Cfdi[]>();
  const paidAt = new Map<string, string>();
  const complements: PaymentComplement[] = [];
  const instructions = new Map<string, PaymentInstruction>();
  const published: SatListEntry[] = [];
  const priorEntries: SatListEntry[] = [];
  let reachedVersion = false;

  for (const event of events) {
    switch (event.type) {
      case "cfdi_received": {
        push(cfdisByIssuer, normalizeRfc(event.cfdi.issuerRfc), event.cfdi);
        break;
      }
      case "complement_received": {
        complements.push(event.complement);
        settle(
          paidAt,
          event.complement.relatedCfdiUuid,
          event.complement.paidAt,
        );
        break;
      }
      case "instruction_received": {
        instructions.set(event.instruction.id, event.instruction);
        break;
      }
      case "payment_sent": {
        const instruction = instructions.get(event.instructionId);
        for (const uuid of instruction?.cfdiUuids ?? []) {
          settle(paidAt, uuid, event.at);
        }
        break;
      }
      case "sat_list_published": {
        if (listVersion !== undefined && event.listVersion === listVersion) {
          published.push(...event.entries);
          reachedVersion = true;
          break;
        }
        // Versions published after the one being swept are not hindsight the
        // sweep is allowed to use, so only what came before counts as prior.
        if (!reachedVersion) {
          priorEntries.push(...event.entries);
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    cfdisByIssuer,
    paidAt,
    suppliers: buildSuppliers(cfdisByIssuer, complements, paidAt),
    published,
    priorEntries,
  };
}

function settle(paidAt: Map<string, string>, uuid: string, at: string): void {
  const current = paidAt.get(uuid);
  if (current === undefined || at < current) {
    paidAt.set(uuid, at);
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const current = map.get(key);
  if (current === undefined) {
    map.set(key, [value]);
    return;
  }
  current.push(value);
}

function paidFrom(ledger: Ledger, issuerRfc: Rfc, asOf?: string): Cfdi[] {
  return (ledger.cfdisByIssuer.get(issuerRfc) ?? []).filter((cfdi) => {
    const at = ledger.paidAt.get(cfdi.uuid);
    return at !== undefined && (asOf === undefined || at <= asOf);
  });
}

/**
 * The supplier as the ledger knows it. Everything here is read off documents the
 * company received: the legal name is the one the issuer put on its own CFDI,
 * and a known account is one a payment complement confirmed the supplier
 * received money on. Nothing is filled in from elsewhere, because a sweep that
 * invented a supplier row would be showing a judge a taxpayer we cannot prove we
 * ever paid.
 */
function buildSuppliers(
  cfdisByIssuer: Map<Rfc, Cfdi[]>,
  complements: readonly PaymentComplement[],
  paidAt: Map<string, string>,
): Map<Rfc, Supplier> {
  const suppliers = new Map<Rfc, Supplier>();
  const issuerOf = new Map<string, Rfc>();

  for (const [rfc, cfdis] of cfdisByIssuer) {
    const sorted = [...cfdis].sort((left, right) =>
      left.issuedAt.localeCompare(right.issuedAt),
    );
    for (const cfdi of sorted) {
      issuerOf.set(cfdi.uuid, rfc);
    }

    const newest = sorted.at(-1);
    suppliers.set(rfc, {
      rfc,
      legalName: newest?.issuerName ?? rfc,
      knownAccounts: [],
      firstInvoiceAt: sorted[0]?.issuedAt ?? "",
      synthetic: sorted.every((cfdi) => cfdi.synthetic),
    });
  }

  for (const complement of complements) {
    const clabe = complement.beneficiaryAccount;
    const rfc = issuerOf.get(complement.relatedCfdiUuid);
    const supplier = rfc === undefined ? undefined : suppliers.get(rfc);
    if (clabe === undefined || supplier === undefined) {
      continue;
    }

    const at = paidAt.get(complement.relatedCfdiUuid) ?? complement.paidAt;
    const known = supplier.knownAccounts.find((row) => row.clabe === clabe);
    if (known === undefined) {
      supplier.knownAccounts.push({
        clabe,
        establishedBy: "payment_complement",
        establishedAt: at,
        timesPaid: 1,
      });
      continue;
    }
    known.timesPaid += 1;
    if (at < known.establishedAt) {
      known.establishedAt = at;
    }
  }

  for (const supplier of suppliers.values()) {
    // Most recent first, which is the order the supplier drawer renders.
    supplier.knownAccounts.sort((left, right) =>
      right.establishedAt.localeCompare(left.establishedAt),
    );
  }

  return suppliers;
}

/* -------------------------------------------------------------------------- */
/* The demo publication                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Raised when a simulated publication names an RFC that is not synthetic.
 *
 * ADR-0002 is binding: a real RFC never stands next to fabricated evidence. The
 * API validates it at the edge as well, and it is enforced here too because the
 * rule has to survive the next caller, not only this one.
 */
export class SyntheticOnlyError extends Error {
  constructor(readonly rfc: string) {
    super(
      `simulatePublication accepts synthetic RFCs only, and ${rfc} is not one. ADR-0002: a real RFC never stands next to fabricated evidence.`,
    );
    this.name = "SyntheticOnlyError";
  }
}

export interface SimulatePublicationOptions {
  /** The instant the demo publishes at. Injected, because this stays pure. */
  now: string;
  status?: SatListStatus;
  /** Defaults to the day of `now`. */
  publishedAt?: string;
  /** Defaults to `sim-<now>`, which sorts after every dated real version. */
  listVersion?: string;
  /**
   * Legal names we already hold, by RFC. An RFC with no name keeps the RFC as
   * its name: a name we do not have is not a name we make up.
   */
  names?: Readonly<Record<string, string>>;
}

export interface SimulatedPublication {
  listVersion: string;
  publishedAt: string;
  entries: SatListEntry[];
}

/**
 * Builds the list version the demo publishes on stage.
 *
 * This is the SAT publication a judge watches land, and it is not the real list
 * and not the committed snapshot. It names the company's own synthetic suppliers
 * so that the sweep that follows prices fabricated invoices against a fabricated
 * publication, and the only real RFCs in the product stay in the read-only
 * lookup box.
 *
 * @throws SyntheticOnlyError when an RFC is not RFC-shaped or does not carry the
 *   synthetic prefix.
 */
export function simulatePublication(
  rfcs: readonly string[],
  options: SimulatePublicationOptions,
): SimulatedPublication {
  const publishedAt = options.publishedAt ?? options.now.slice(0, 10);
  const listVersion = options.listVersion ?? `sim-${options.now}`;
  const status = options.status ?? "presunto";
  const names = options.names ?? {};

  const entries = rfcs.map((raw) => {
    const rfc = normalizeRfc(raw);
    if (!isRfcShaped(rfc) || !isSyntheticRfc(rfc)) {
      throw new SyntheticOnlyError(raw);
    }

    return {
      rfc,
      name: names[rfc] ?? rfc,
      status,
      publishedAt,
      listVersion,
    } satisfies SatListEntry;
  });

  return { listVersion, publishedAt, entries };
}

/**
 * The storage boundary.
 *
 * `Repository` is the only thing the routes know about. `MemoryRepository`
 * implements it over the synthetic dataset so the web app can be built against
 * a running API today, and the Postgres implementation lands behind the same
 * interface with no route change at all.
 *
 * TODO(fabbyyyy): issue #40, implement `PostgresRepository` in packages/db over the SQL
 * in `packages/db/src/queries.ts` and export it there, then swap it in from
 * `createDeps()` when DATABASE_URL is set. Nothing in `src/routes` should need
 * to change; if it does, this interface is wrong and it is cheaper to fix it now.
 *
 * The rule this file exists to protect: a repository queries and aggregates,
 * it never decides. Anything that weighs evidence belongs in @hackmty/core.
 */

import type {
  Cfdi,
  Decision,
  Detector,
  Finding,
  LedgerEvent,
  Metrics,
  PaymentInstruction,
  SatListEntry,
  Supplier,
} from "@hackmty/core";
import { sumAmounts } from "@hackmty/core";
import type {
  InstructionDetail,
  PaymentRun,
  PaymentRunItem,
  SatVersionSummary,
  SupplierDetail,
  VerifiedBeneficiary,
} from "./schemas";
import { createSyntheticDataset, type SyntheticDataset } from "./synthetic";

/** Everything a 69-B publication has to know about one newly listed supplier. */
export interface SweepSubject {
  supplier: Supplier;
  status: SatListEntry["status"];
  /** CFDI of this supplier that we have already paid, so already deducted. */
  paidCfdis: Cfdi[];
}

export interface IntakeRecord {
  instruction: PaymentInstruction;
  findings: Finding[];
  decision: Decision;
}

export interface LedgerQuery {
  since?: string;
  limit?: number;
}

export interface ResetSummary {
  seed: number;
  suppliers: number;
  instructions: number;
  events: number;
}

export interface Repository {
  /* Reads, one per endpoint in docs/09-api.md. */
  currentRun(): Promise<PaymentRun>;
  instructionDetail(id: string): Promise<InstructionDetail | undefined>;
  supplierDetail(rfc: string): Promise<SupplierDetail | undefined>;
  findSupplier(rfc: string): Promise<Supplier | undefined>;
  /** Used to attach an instruction to a supplier when only the folio is known. */
  cfdisByUuid(uuids: string[]): Promise<Cfdi[]>;
  /**
   * Every CFDI the company holds, from every issuer. The supplier-behaviour
   * detector needs the whole ledger as the denominator of its concentration
   * signal: handed one supplier's invoices it would read every supplier as 100%
   * of the spend.
   */
  allCfdis(): Promise<Cfdi[]>;
  satLookup(rfc: string): Promise<SatListEntry[]>;
  satVersions(): Promise<SatVersionSummary[]>;
  beneficiaries(): Promise<VerifiedBeneficiary[]>;
  metrics(): Promise<Metrics>;
  ledger(query: LedgerQuery): Promise<LedgerEvent[]>;

  /* Writes. Each one is append-only from the ledger's point of view. */
  appendEvent(event: LedgerEvent): Promise<void>;
  saveIntake(record: IntakeRecord): Promise<void>;
  recordDecision(
    instructionId: string,
    action: Decision["action"],
    decidedBy: string,
    decidedAt: string,
  ): Promise<Decision | undefined>;
  /** Stores a list version and returns what it touches. It does not price it. */
  publishSatList(
    listVersion: string,
    entries: SatListEntry[],
  ): Promise<SweepSubject[]>;
  saveVerifiedBeneficiary(row: VerifiedBeneficiary): Promise<void>;
  reset(seed: number): Promise<ResetSummary>;
}

const ALL_DETECTORS: readonly Detector[] = [
  "sat_69b",
  "clabe_forensics",
  "duplicate_invoice",
  "supplier_behaviour",
  "beneficiary_cep",
  "bank_reconciliation",
];

const DEFAULT_LEDGER_LIMIT = 500;

/**
 * Handed out on every read so a handler cannot mutate the store by accident.
 * Postgres gives us this for free, which is why it is a one-liner here rather
 * than a hand-written deep copy per type.
 */
function copy<T>(value: T): T {
  return structuredClone(value);
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export class MemoryRepository implements Repository {
  private data: SyntheticDataset;
  private seed: number;

  constructor(seed = 0) {
    this.data = createSyntheticDataset();
    this.seed = seed;
  }

  /* ---------------------------------------------------------------- reads */

  async currentRun(): Promise<PaymentRun> {
    const items: PaymentRunItem[] = [];

    for (const instruction of this.data.instructions) {
      const supplier = this.supplierRow(instruction.supplierRfc);
      if (supplier === undefined) {
        // An instruction always has a supplier row by the time it is stored.
        continue;
      }
      items.push({
        instruction: copy(instruction),
        supplier: copy(supplier),
        decision: copy(this.decisionRow(instruction.id) ?? null),
        findings: copy(this.findingsFor(instruction.id)),
      });
    }

    const actions = items.map((item) => item.decision?.action);

    return {
      id: this.data.runId,
      weekOf: this.data.weekOf,
      totals: {
        instructions: items.length,
        amount: sumAmounts(items.map((item) => item.instruction.amount)),
        held: actions.filter((action) => action === "hold").length,
        toVerify: actions.filter((action) => action === "verify").length,
        released: actions.filter((action) => action === "release").length,
      },
      items,
    };
  }

  async instructionDetail(id: string): Promise<InstructionDetail | undefined> {
    const instruction = this.data.instructions.find((row) => row.id === id);
    if (instruction === undefined) {
      return undefined;
    }
    return copy({
      instruction,
      decision: this.decisionRow(id) ?? null,
      findings: this.findingsFor(id),
      supplier: this.supplierRow(instruction.supplierRfc) ?? null,
    });
  }

  async supplierDetail(rfc: string): Promise<SupplierDetail | undefined> {
    const supplier = this.supplierRow(rfc);
    if (supplier === undefined) {
      return undefined;
    }

    const cfdis = this.data.cfdis.filter((cfdi) => cfdi.issuerRfc === rfc);
    const uuids = new Set(cfdis.map((cfdi) => cfdi.uuid));
    const instructionIds = new Set(
      this.data.instructions
        .filter((instruction) => instruction.supplierRfc === rfc)
        .map((instruction) => instruction.id),
    );

    return copy({
      supplier,
      cfdis,
      complements: this.data.complements.filter((complement) =>
        uuids.has(complement.relatedCfdiUuid),
      ),
      findings: this.data.findings.filter((finding) => {
        const { kind, id } = finding.subject;
        if (kind === "supplier") {
          return id === rfc;
        }
        if (kind === "cfdi") {
          return uuids.has(id);
        }
        return instructionIds.has(id);
      }),
      verifiedBeneficiaries: this.data.beneficiaries.filter(
        (row) => row.supplierRfc === rfc,
      ),
    });
  }

  async findSupplier(rfc: string): Promise<Supplier | undefined> {
    const supplier = this.supplierRow(rfc);
    return supplier === undefined ? undefined : copy(supplier);
  }

  async cfdisByUuid(uuids: string[]): Promise<Cfdi[]> {
    const wanted = new Set(uuids);
    return copy(this.data.cfdis.filter((cfdi) => wanted.has(cfdi.uuid)));
  }

  async allCfdis(): Promise<Cfdi[]> {
    return copy(this.data.cfdis);
  }

  async satLookup(rfc: string): Promise<SatListEntry[]> {
    return copy(
      this.data.satEntries
        .filter((entry) => entry.rfc === rfc)
        .sort((left, right) =>
          right.publishedAt.localeCompare(left.publishedAt),
        ),
    );
  }

  async satVersions(): Promise<SatVersionSummary[]> {
    const byVersion = new Map<string, { publishedAt: string; rows: number }>();

    for (const entry of this.data.satEntries) {
      const current = byVersion.get(entry.listVersion);
      if (current === undefined) {
        byVersion.set(entry.listVersion, {
          publishedAt: entry.publishedAt,
          rows: 1,
        });
        continue;
      }
      current.rows += 1;
      if (entry.publishedAt < current.publishedAt) {
        current.publishedAt = entry.publishedAt;
      }
    }

    return [...byVersion.entries()]
      .map(([listVersion, summary]) => ({ listVersion, ...summary }))
      .sort((left, right) => right.listVersion.localeCompare(left.listVersion));
  }

  async beneficiaries(): Promise<VerifiedBeneficiary[]> {
    return copy(this.data.beneficiaries);
  }

  /**
   * Tallies the labelled cases. It is a count and a division, which is what the
   * SQL version will be too.
   *
   * TODO(Apanawa): issue #55 owns the blind harness. Call it with the
   * detector output instead of the `firedDetectors` column, so the numbers come
   * from the real detectors rather than from the fixture's own labels.
   */
  async metrics(): Promise<Metrics> {
    const perDetector = Object.fromEntries(
      ALL_DETECTORS.map((detector) => [detector, { tp: 0, fp: 0, fn: 0 }]),
    ) as Metrics["perDetector"];

    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let trueNegatives = 0;

    for (const labelled of this.data.labelledCases) {
      const fired = labelled.firedDetectors;

      if (fired.length === 0) {
        if (labelled.fraudulent) {
          falseNegatives += 1;
          if (labelled.expectedDetector !== undefined) {
            perDetector[labelled.expectedDetector].fn += 1;
          }
        } else {
          trueNegatives += 1;
        }
        continue;
      }

      if (labelled.fraudulent) {
        truePositives += 1;
        for (const detector of fired) {
          perDetector[detector].tp += 1;
        }
      } else {
        falsePositives += 1;
        for (const detector of fired) {
          perDetector[detector].fp += 1;
        }
      }
    }

    return {
      cases: this.data.labelledCases.length,
      truePositives,
      falsePositives,
      falseNegatives,
      precision: ratio(truePositives, truePositives + falsePositives),
      recall: ratio(truePositives, truePositives + falseNegatives),
      falsePositiveRate: ratio(falsePositives, falsePositives + trueNegatives),
      perDetector,
    };
  }

  async ledger(query: LedgerQuery): Promise<LedgerEvent[]> {
    const limit = query.limit ?? DEFAULT_LEDGER_LIMIT;
    const since =
      query.since === undefined ? undefined : Date.parse(query.since);
    const events =
      since === undefined
        ? this.data.ledger
        : this.data.ledger.filter((event) => Date.parse(event.at) > since);

    return copy(events.slice(0, limit));
  }

  /* --------------------------------------------------------------- writes */

  async appendEvent(event: LedgerEvent): Promise<void> {
    const stored = copy(event);
    const last = this.data.ledger.at(-1);

    if (last !== undefined && Date.parse(stored.at) < Date.parse(last.at)) {
      // A backdated event is legal (a CFDI can arrive late) but rare, so pay
      // for the sort only when it actually happens.
      this.data.ledger.push(stored);
      this.data.ledger.sort((l, r) => Date.parse(l.at) - Date.parse(r.at));
      return;
    }

    this.data.ledger.push(stored);
  }

  async saveIntake(record: IntakeRecord): Promise<void> {
    const instruction = copy(record.instruction);
    this.ensureSupplier(instruction);

    this.data.instructions.push(instruction);
    for (const finding of record.findings) {
      this.data.findings.push(copy(finding));
    }
    this.data.findingsByInstruction[instruction.id] = record.findings.map(
      (finding) => finding.id,
    );
    this.data.decisions.push(copy(record.decision));
  }

  async recordDecision(
    instructionId: string,
    action: Decision["action"],
    decidedBy: string,
    decidedAt: string,
  ): Promise<Decision | undefined> {
    const current = this.decisionRow(instructionId);
    if (current === undefined) {
      return undefined;
    }

    current.action = action;
    current.decidedBy = decidedBy;
    current.decidedAt = decidedAt;

    return copy(current);
  }

  async publishSatList(
    listVersion: string,
    entries: SatListEntry[],
  ): Promise<SweepSubject[]> {
    this.data.satEntries = this.data.satEntries.filter(
      (entry) => entry.listVersion !== listVersion,
    );
    for (const entry of entries) {
      this.data.satEntries.push(copy(entry));
    }

    const paidUuids = this.paidCfdiUuids();
    const subjects: SweepSubject[] = [];

    for (const entry of entries) {
      const supplier = this.supplierRow(entry.rfc);
      if (supplier === undefined) {
        // A listed RFC we have never paid is not an exposure, it is news.
        continue;
      }
      subjects.push(
        copy({
          supplier,
          status: entry.status,
          paidCfdis: this.data.cfdis.filter(
            (cfdi) => cfdi.issuerRfc === entry.rfc && paidUuids.has(cfdi.uuid),
          ),
        }),
      );
    }

    return subjects;
  }

  async saveVerifiedBeneficiary(row: VerifiedBeneficiary): Promise<void> {
    const stored = copy(row);
    const index = this.data.beneficiaries.findIndex(
      (existing) =>
        existing.supplierRfc === stored.supplierRfc &&
        existing.clabe === stored.clabe,
    );

    if (index === -1) {
      this.data.beneficiaries.push(stored);
    } else {
      this.data.beneficiaries[index] = stored;
    }

    const supplier = this.supplierRow(stored.supplierRfc);
    if (supplier === undefined) {
      return;
    }

    const account = supplier.knownAccounts.find(
      (known) => known.clabe === stored.clabe,
    );
    if (account === undefined) {
      supplier.knownAccounts.unshift({
        clabe: stored.clabe,
        establishedBy: "cep",
        establishedAt: stored.verifiedAt,
        timesPaid: 0,
      });
      return;
    }
    account.establishedBy = "cep";
    account.establishedAt = stored.verifiedAt;
  }

  /**
   * TODO(garzario): issue #43, drive this from @hackmty/seed so the seed number
   * changes the data. Today it rebuilds the same fixture and only records the
   * number, which is honest but not yet useful.
   */
  async reset(seed: number): Promise<ResetSummary> {
    this.data = createSyntheticDataset();
    this.seed = seed;

    return {
      seed: this.seed,
      suppliers: this.data.suppliers.length,
      instructions: this.data.instructions.length,
      events: this.data.ledger.length,
    };
  }

  /* --------------------------------------------------------------- private */

  private supplierRow(rfc: string): Supplier | undefined {
    return this.data.suppliers.find((supplier) => supplier.rfc === rfc);
  }

  private decisionRow(instructionId: string): Decision | undefined {
    return this.data.decisions.find(
      (decision) => decision.instructionId === instructionId,
    );
  }

  private findingsFor(instructionId: string): Finding[] {
    const ids = new Set(this.data.findingsByInstruction[instructionId] ?? []);
    return this.data.findings.filter((finding) => ids.has(finding.id));
  }

  /** CFDI we have already paid: a complement arrived, or a payment went out. */
  private paidCfdiUuids(): Set<string> {
    const paid = new Set<string>();

    for (const complement of this.data.complements) {
      paid.add(complement.relatedCfdiUuid);
    }
    for (const event of this.data.ledger) {
      if (event.type !== "payment_sent") {
        continue;
      }
      const instruction = this.data.instructions.find(
        (row) => row.id === event.instructionId,
      );
      for (const uuid of instruction?.cfdiUuids ?? []) {
        paid.add(uuid);
      }
    }

    return paid;
  }

  /**
   * An instruction for an RFC we have never seen still has to render in the run,
   * so a row is created from what the documents actually say. The legal name
   * comes from the CFDI when we hold one, and otherwise stays the RFC itself:
   * a name we do not have is not a name we invent.
   */
  private ensureSupplier(instruction: PaymentInstruction): void {
    if (this.supplierRow(instruction.supplierRfc) !== undefined) {
      return;
    }

    const cfdi = this.data.cfdis.find(
      (row) =>
        row.issuerRfc === instruction.supplierRfc ||
        instruction.cfdiUuids.includes(row.uuid),
    );

    this.data.suppliers.push({
      rfc: instruction.supplierRfc,
      legalName: cfdi?.issuerName ?? instruction.supplierRfc,
      knownAccounts: [],
      firstInvoiceAt: cfdi?.issuedAt ?? instruction.receivedAt,
      synthetic: instruction.synthetic,
    });
  }
}

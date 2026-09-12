/**
 * The storage boundary.
 *
 * `Repository` is the only thing the routes know about. `MemoryRepository`
 * implements it over the synthetic dataset so the web app can be built against
 * a running API today, and the Postgres implementation lands behind the same
 * interface with no route change at all.
 *
 * `PostgresRepository` in `postgres-repo.ts` is the second implementation, over
 * the SQL in `packages/db/src/queries.ts`, and `bootRepository()` picks it when
 * DATABASE_URL is set without one file in `src/routes` changing.
 *
 * The rule this file exists to protect: a repository queries and aggregates,
 * it never decides. Anything that weighs evidence belongs in @hackmty/core.
 */

import type {
  Cfdi,
  ConsortiumPull,
  ConsortiumSnapshotRow,
  Decision,
  Finding,
  LedgerEvent,
  LedgerTx,
  Metrics,
  PaymentComplement,
  PaymentInstruction,
  SatListEntry,
  Supplier,
} from "@hackmty/core";
import { runMoney, sumAmounts } from "@hackmty/core";
import { computeMetrics, HOLDOUT_CASES, runEngine } from "@hackmty/seed";
import type {
  InstructionDetail,
  PaymentRun,
  PaymentRunItem,
  SatVersionSummary,
  SupplierDetail,
  VerifiedBeneficiary,
} from "./schemas";
import { createSyntheticDataset, type SyntheticDataset } from "./synthetic";

/** Who the company is, for the header of a constancia. */
export interface CompanyIdentity {
  rfc: string;
  legalName: string;
  /** True while the store is the synthetic one, which the document watermarks. */
  synthetic: boolean;
}

/**
 * Everything a constancia needs about one stored list version, read without
 * publishing anything. `publishSatList` is the write; this is the read that
 * lets the document be reprinted a year later without moving the ledger.
 */
export interface SweepSnapshot {
  listVersion: string;
  /** DOF publication date of the version, from its own rows. */
  publishedAt: string;
  subjects: SweepSubject[];
  /**
   * Supplier RFCs the company holds. It is the denominator: "one of twelve
   * suppliers is on the list" is an answer, "one supplier is on the list" is a
   * claim with nothing behind it.
   */
  suppliersChecked: number;
}

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

/**
 * What the local consortium snapshot answers about one hashed pair.
 *
 * Three fields and not one, because three states have to be told apart and
 * collapsing any two of them would make the product claim something it cannot.
 * `pull` absent is "the network was never consulted here". `pull` present with
 * `pair` absent is "the network WAS consulted and has never seen this account",
 * which is a much stronger statement. `accountsForRfc` is what makes the
 * impersonation case visible: the supplier is in the network, on other accounts.
 */
export interface ConsortiumLookup {
  pull?: ConsortiumPull;
  pair?: ConsortiumSnapshotRow;
  /** Accounts the network holds for this RFC, the looked-up one included. */
  accountsForRfc: number;
}

export interface Repository {
  /* Reads, one per endpoint in docs/09-api.md. */
  company(): Promise<CompanyIdentity>;
  currentRun(): Promise<PaymentRun>;
  /** One run by id. Undefined when this store does not hold that run. */
  run(id: string): Promise<PaymentRun | undefined>;
  /** A stored list version, priced but not republished. Undefined when unknown. */
  sweepSnapshot(listVersion: string): Promise<SweepSnapshot | undefined>;
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
  /**
   * Every payment complement the company holds. The duplicate detector needs
   * them to know what is already settled, and bank reconciliation builds its
   * expected payments from them, so both read the whole set rather than one
   * supplier's.
   */
  allComplements(): Promise<PaymentComplement[]>;
  /**
   * The company's bank statement, mirrored from Nessie and normalised into
   * `LedgerTx`. Only `bank_reconciliation` reads it. An empty array means the
   * mirror was not imported, and the detector reports that rather than calling
   * every payment missing from a statement we do not hold.
   */
  bankMirror(): Promise<LedgerTx[]>;
  satLookup(rfc: string): Promise<SatListEntry[]>;
  satVersions(): Promise<SatVersionSummary[]>;
  beneficiaries(): Promise<VerifiedBeneficiary[]>;
  /**
   * The local consortium snapshot for one HASHED pair. The repository never sees
   * an RFC or a CLABE here: `src/consortium.ts` hashes them before it asks, which
   * is what keeps the privacy boundary in one file.
   */
  consortiumLookup(
    rfcHash: string,
    clabeHash: string,
  ): Promise<ConsortiumLookup>;
  metrics(): Promise<Metrics>;
  ledger(query: LedgerQuery): Promise<LedgerEvent[]>;
  /**
   * Every event the verification of one instruction is folded out of, in append
   * order: its `cent_sent`, `cep_awaited` and `decision_made`, plus the
   * `cep_verified` of the account it pays to.
   *
   * A targeted read rather than a slice of `ledger`, because the seeded company's
   * ledger is thousands of events long and that one answers the oldest 500: the
   * cent that left a minute ago would never be in the page. `beneficiaryAccount`
   * is the instruction's CLABE, because a `cep_verified` names an account and no
   * instruction, which is the honest shape for evidence about who holds an
   * account.
   */
  verificationEvents(
    instructionId: string,
    beneficiaryAccount: string,
  ): Promise<LedgerEvent[]>;

  /* Writes. Each one is append-only from the ledger's point of view. */
  appendEvent(event: LedgerEvent): Promise<void>;
  saveIntake(record: IntakeRecord): Promise<void>;
  /**
   * A person confirms an action. `reason` is what they wrote about it, and it
   * travels with the decision so the `decision_made` event carries the argument
   * and not only the verdict.
   */
  recordDecision(
    instructionId: string,
    action: Decision["action"],
    decidedBy: string,
    decidedAt: string,
    reason?: string,
  ): Promise<Decision | undefined>;
  /**
   * A decision the engine reached itself on new evidence, with the findings it
   * weighed.
   *
   * Separate from `recordDecision` because that one is a person changing the
   * action and nothing else, and says so: it carries the pesos and the evidence
   * over unchanged. Here the evidence is what changed, so the findings are stored
   * first and the decision is the engine's whole arithmetic. `decidedBy` is the
   * caller's to set and is `SYSTEM_DECIDER` on the only path that uses this.
   *
   * Findings are added and never removed. A finding is evidence about a moment,
   * and the decision names the ones it weighed, so a control that stopped firing
   * (a CEP turning a new account into a known one) leaves its earlier finding on
   * the record instead of rewriting what the clerk was shown yesterday.
   */
  recordEngineDecision(decision: Decision): Promise<void>;
  /** Stores a list version and returns what it touches. It does not price it. */
  publishSatList(
    listVersion: string,
    entries: SatListEntry[],
  ): Promise<SweepSubject[]>;
  saveVerifiedBeneficiary(row: VerifiedBeneficiary): Promise<void>;
  /**
   * Replaces the whole local snapshot and records the pull that produced it.
   *
   * Replaces and never merges: a pair the network has stopped corroborating must
   * not stay in the snapshot, because a stale corroboration is the one way this
   * signal turns into a false release. `bun run consortium:pull` is the caller on
   * the Postgres path and a route test is the caller on the memory one.
   */
  replaceConsortiumSnapshot(input: {
    rows: readonly ConsortiumSnapshotRow[];
    pulledAt: string;
    source: ConsortiumPull["source"];
  }): Promise<number>;
  reset(seed: number): Promise<ResetSummary>;
}

const DEFAULT_LEDGER_LIMIT = 500;

/**
 * Handed out on every read so a handler cannot mutate the store by accident.
 * Postgres gives us this for free, which is why it is a one-liner here rather
 * than a hand-written deep copy per type.
 */
function copy<T>(value: T): T {
  return structuredClone(value);
}

/** How a repository gets its data. The seed is what `POST /api/v1/seed` passes. */
export type DatasetFactory = (seed: number) => SyntheticDataset;

export class MemoryRepository implements Repository {
  private data: SyntheticDataset;
  private seed: number;
  private readonly build: DatasetFactory;
  /**
   * The local consortium snapshot, empty until something fills it.
   *
   * It sits beside the dataset rather than inside it on purpose: the network is
   * not company data, it survives a `reset` the way the Postgres table survives a
   * re-seed, and a store that wiped it when the company was regenerated would
   * report "not consulted" after a rehearsal reset and quietly change every
   * decision on the screen.
   */
  private consortium: {
    pull?: ConsortiumPull;
    rows: ConsortiumSnapshotRow[];
  } = { rows: [] };

  /**
   * `build` defaults to the hand-written fixture in `./synthetic.ts`, which ignores
   * the seed. `SEED=sentryone` hands in the generated company from @hackmty/seed
   * instead, and then the seed number actually changes the data.
   */
  constructor(
    seed = 0,
    build: DatasetFactory = () => createSyntheticDataset(),
  ) {
    this.build = build;
    this.data = build(seed);
    this.seed = seed;
  }

  /* ---------------------------------------------------------------- reads */

  async company(): Promise<CompanyIdentity> {
    return {
      rfc: this.data.companyRfc,
      legalName: this.data.companyName,
      // This store is the synthetic one by construction. The Postgres one will
      // answer false, and the constancia stops printing the band on that day.
      synthetic: true,
    };
  }

  /**
   * One run by id.
   *
   * There is exactly one run in this store, so the honest implementation is to
   * answer it when the id matches and undefined otherwise, rather than to
   * pretend a history exists. `current` is accepted as an alias so a link can
   * be built before the run id is known, which is what the screens do.
   */
  async run(id: string): Promise<PaymentRun | undefined> {
    if (id !== "current" && id !== this.data.runId) {
      return undefined;
    }
    return this.currentRun();
  }

  /**
   * Prices a stored list version against everything already paid, without
   * publishing anything.
   *
   * It shares `sweepSubjectsFor` with `publishSatList`, because two different
   * answers to "what did this version touch" is a bug waiting for a judge to
   * find it: the constancia has to say the same thing the screen said.
   */
  async sweepSnapshot(listVersion: string): Promise<SweepSnapshot | undefined> {
    const entries = this.data.satEntries.filter(
      (entry) => entry.listVersion === listVersion,
    );
    if (entries.length === 0) {
      return undefined;
    }

    const publishedAt = entries
      .map((entry) => entry.publishedAt)
      .sort()[0] as string;

    return {
      listVersion,
      publishedAt,
      subjects: this.sweepSubjectsFor(entries),
      suppliersChecked: this.data.suppliers.length,
    };
  }

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
        /* The pesos, from the same pure function the Postgres store calls. Two
           implementations of "how much did this run stop" is how a screen and a
           constancia end up disagreeing in front of a judge. */
        ...runMoney(items),
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

  async allComplements(): Promise<PaymentComplement[]> {
    return copy(this.data.complements);
  }

  async bankMirror(): Promise<LedgerTx[]> {
    return copy(this.data.bankMirror);
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
   * The same three-state answer the Postgres path gives, over an in-memory map.
   *
   * A fresh store holds no pull, so the network reads as `not_consulted` and this
   * repository decides exactly what it decided before the consortium existed.
   * That is deliberate: every route test that predates issue #164 has to keep
   * passing without being told about a network.
   */
  async consortiumLookup(
    rfcHash: string,
    clabeHash: string,
  ): Promise<ConsortiumLookup> {
    const result: ConsortiumLookup = {
      accountsForRfc: this.consortium.rows.filter(
        (row) => row.rfcHash === rfcHash,
      ).length,
    };
    if (this.consortium.pull !== undefined) {
      result.pull = copy(this.consortium.pull);
    }
    const pair = this.consortium.rows.find(
      (row) => row.rfcHash === rfcHash && row.clabeHash === clabeHash,
    );
    if (pair !== undefined) {
      result.pair = copy(pair);
    }
    return result;
  }

  /**
   * The blind evaluation, recomputed on demand.
   *
   * The numbers come from `@hackmty/seed`: the labelled cases in
   * `packages/seed/src/holdout/cases`, put through the same six controls
   * `pipeline.ts` runs on intake and scored by `computeMetrics`. Nothing here
   * counts a column the fixture wrote about itself, which is the whole reason
   * the precision on the metrics screen is worth reading.
   *
   * It is recomputed per request rather than cached. Thirty cases through six
   * controls is a few milliseconds, and a cached evaluation that survives a
   * change to a control is a number nobody can trust mid-build-night.
   */
  async metrics(): Promise<Metrics> {
    const predictions = runEngine(HOLDOUT_CASES);
    return computeMetrics(HOLDOUT_CASES, predictions).metrics;
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

  /**
   * The verification events of one instruction, with the same matching rules as
   * `readVerificationEvents` in `packages/db`: the instruction id on the three
   * kinds that carry one, and the beneficiary account on `cep_verified`.
   *
   * The accounts are compared as the two stores hold them, character for
   * character, rather than digits-only. Normalising here and not in SQL is how the
   * two repositories would start answering different things for the same ledger,
   * and the parity suite would not catch it because it would ask both through this
   * method.
   */
  async verificationEvents(
    instructionId: string,
    beneficiaryAccount: string,
  ): Promise<LedgerEvent[]> {
    return copy(
      this.data.ledger.filter((event) => {
        if (event.type === "cent_sent" || event.type === "cep_awaited") {
          return event.instructionId === instructionId;
        }
        if (event.type === "decision_made") {
          return event.decision.instructionId === instructionId;
        }
        if (event.type === "cep_verified") {
          return event.cep.beneficiaryAccount === beneficiaryAccount;
        }
        return false;
      }),
    );
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
    reason?: string,
  ): Promise<Decision | undefined> {
    const current = this.decisionRow(instructionId);
    if (current === undefined) {
      return undefined;
    }

    current.action = action;
    current.decidedBy = decidedBy;
    current.decidedAt = decidedAt;
    /* Deleted and not left in place when no reason is given: a release with an
       argument, followed by a hold with none, must not read as if the second one
       carried the first one's sentence. */
    if (reason === undefined) {
      delete current.reason;
    } else {
      current.reason = reason;
    }

    return copy(current);
  }

  /**
   * The engine's decision, with its findings.
   *
   * The stored decision row is replaced in place rather than appended to, because
   * `decisionRow` answers the first row for an instruction and a second one would
   * be invisible; the Postgres store inserts and answers the newest, and the two
   * agree on what a reader sees. The findings are a union, so the evidence the
   * clerk saw before this ran is still on the line.
   */
  async recordEngineDecision(decision: Decision): Promise<void> {
    const stored = copy(decision);
    const known = new Set(this.data.findings.map((finding) => finding.id));

    for (const finding of stored.findings) {
      if (!known.has(finding.id)) {
        this.data.findings.push(copy(finding));
      }
    }
    const attached = new Set([
      ...(this.data.findingsByInstruction[stored.instructionId] ?? []),
      ...stored.findings.map((finding) => finding.id),
    ]);
    this.data.findingsByInstruction[stored.instructionId] = [...attached];

    const index = this.data.decisions.findIndex(
      (row) => row.instructionId === stored.instructionId,
    );
    if (index === -1) {
      this.data.decisions.push(stored);
      return;
    }
    this.data.decisions[index] = stored;
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

    return this.sweepSubjectsFor(entries);
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

  async replaceConsortiumSnapshot(input: {
    rows: readonly ConsortiumSnapshotRow[];
    pulledAt: string;
    source: ConsortiumPull["source"];
  }): Promise<number> {
    this.consortium = {
      pull: {
        pulledAt: input.pulledAt,
        source: input.source,
        rows: input.rows.length,
      },
      rows: input.rows.map((row) => copy(row)),
    };
    return input.rows.length;
  }

  /**
   * Rebuilds the company from the factory this repository was constructed with.
   * Under `SEED=sentryone` the seed number really does change the data; under the
   * hand-written fixture it rebuilds the same rows and only records the number,
   * which is honest but not useful, and is why the sentryone path exists.
   */
  async reset(seed: number): Promise<ResetSummary> {
    this.data = this.build(seed);
    this.seed = seed;

    return {
      seed: this.seed,
      suppliers: this.data.suppliers.length,
      instructions: this.data.instructions.length,
      events: this.data.ledger.length,
    };
  }

  /* --------------------------------------------------------------- private */

  /**
   * The suppliers a set of list rows touches, with the CFDI of theirs we have
   * already paid. Shared by the publish write and the constancia read so the
   * document can never disagree with the screen.
   */
  private sweepSubjectsFor(entries: readonly SatListEntry[]): SweepSubject[] {
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

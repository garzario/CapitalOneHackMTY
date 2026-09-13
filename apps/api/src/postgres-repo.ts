/**
 * The same `Repository` as `MemoryRepository`, over Postgres.
 *
 * This is what turns the data platform from a diagram into the thing the API
 * actually answers from: the event ledger, the hypertables and the continuous
 * aggregates in `packages/db` are behind every endpoint in docs/09-api.md once
 * `DATABASE_URL` is set, and not one file in `src/routes` changed to get there.
 * That was the promise `repo.ts` made and this file is the payment.
 *
 * Three rules it lives under.
 *
 * 1. **Parity with `MemoryRepository`, method by method.** The two are asserted
 *    against each other in `postgres-repo.test.ts` on the same seeded company:
 *    same run id, same week, same totals, same ordered lines, same findings per
 *    line. A screenshot taken against memory has to still be true against
 *    Postgres, or the demo is two products.
 * 2. **No SQL here.** Every statement lives in `packages/db/src/queries.ts`,
 *    which is the file a judge is shown when they ask how a query works. This
 *    one composes those calls and shapes what docs/09-api.md names.
 * 3. **It queries and aggregates, it never decides.** `load` runs the six
 *    controls through `assessRun`, exactly as the memory path does at boot, and
 *    stores what comes back. Nothing in this file weighs evidence itself.
 *
 * It imports no `bun:*` module and touches no Bun global, per ADR-0005: the
 * query layer and the driver are runtime neutral, and only the migration runner
 * is bun-only, which is why it is reached from a test and from `bun run migrate`
 * and never from here.
 */

import { nameMatch } from "@hackmty/cep";
import type {
  Actor,
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
import type { Db } from "@hackmty/db/queries";
import {
  appendLedgerEvent,
  appendLedgerEvents,
  countConsortiumAccounts,
  countSentryOne,
  currentPaymentRun,
  deleteLedgerTxForAccount,
  findingsForSubjects,
  findingsForSupplier,
  getCompany,
  getConsortiumPair,
  getConsortiumPull,
  getInstruction,
  getSupplier,
  insertCfdis,
  insertDecision,
  insertFindings,
  insertInstruction,
  insertInstructions,
  insertLedgerTx,
  insertPaymentComplements,
  insertSatListVersion,
  latestCancellation,
  latestDecision,
  latestListPublisher,
  latestRunWeek,
  listCfdis,
  listCfdisByIssuer,
  listCfdisByUuid,
  listComplementsForCfdis,
  listLedgerTx,
  listPaidCfdisByIssuer,
  listPaymentComplements,
  listSatEntries,
  listSatVersions,
  listVerifiedBeneficiaries,
  listVerifiedBeneficiariesFor,
  lookupSatEntries,
  markInstructionSent,
  readLedger,
  readVerificationEvents,
  recordKnownAccount,
  replaceConsortiumSnapshot,
  selectSuppliers,
  transact,
  truncateSentryOne,
  upsertCompany,
  upsertSupplier,
  upsertVerifiedBeneficiary,
} from "@hackmty/db/queries";
import { normalizeRfc } from "@hackmty/sat";
import type { SentryOneOptions } from "@hackmty/seed";
import {
  computeMetrics,
  DEMO_COMPANY,
  HOLDOUT_CASES,
  loadSentryOne,
  runEngine,
} from "@hackmty/seed";
import { assessRun } from "./assess";
import type {
  Cancellation,
  CompanyIdentity,
  ConsortiumLookup,
  IntakeRecord,
  LedgerQuery,
  Repository,
  ResetSummary,
  SweepSnapshot,
  SweepSubject,
} from "./repo";
import type {
  InstructionDetail,
  PaymentRun,
  PaymentRunItem,
  SatVersionSummary,
  SupplierDetail,
  VerifiedBeneficiary,
} from "./schemas";
import { runInstant } from "./sentryone";

/** Monterrey is UTC minus 6 all year, so there is no daylight-saving seam. */
const MONTERREY_OFFSET_MS = 6 * 60 * 60 * 1000;
const MS_PER_DAY = 86_400_000;

/**
 * The Monday of the week an instant falls in, cut in Monterrey time.
 *
 * Pure and local rather than imported from the generator, because this is the
 * answer for an empty database: no instruction means no week to read off one, so
 * the run screen opens on the current week and reports zero lines instead of
 * refusing. A generator import here would also drag the seed into the hot path
 * of an endpoint that must answer on a database nobody seeded.
 */
export function mondayInMonterrey(instant: string): string {
  const local = new Date(Date.parse(instant) - MONTERREY_OFFSET_MS);
  const weekday = local.getUTCDay();
  const back = weekday === 0 ? 6 : weekday - 1;
  return new Date(local.getTime() - back * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/** What `PostgresRepository.load` wrote, for the line `bun run seed` prints. */
export interface SentryOneLoadResult extends ResetSummary {
  weekOf: string;
  runId: string;
  cfdis: number;
  complements: number;
  bankMirrorRows: number;
  /** What the engine found on the run it just stored, not what it promised. */
  findings: number;
  held: number;
  toVerify: number;
  heroInstructionIds: string[];
  demoRfcs: string[];
}

export class PostgresRepository implements Repository {
  private readonly sql: Db;

  constructor(sql: Db) {
    this.sql = sql;
  }

  /* ---------------------------------------------------------------- reads */

  /**
   * Who the company is.
   *
   * A database that has never been seeded has no company row, and the honest
   * answer is blanks: the constancia prints an empty header until `bun run seed`
   * has run, which is visibly wrong on the page rather than quietly wrong in the
   * data. A name invented here would be printed on a document an accountant
   * files.
   */
  async company(): Promise<CompanyIdentity> {
    const row = await getCompany(this.sql);
    if (row === undefined) {
      return { rfc: "", legalName: "", synthetic: true };
    }
    return {
      rfc: row.rfc,
      legalName: row.legalName,
      synthetic: row.synthetic,
    };
  }

  /**
   * The open payment run.
   *
   * The anchor is the company row, written once by `load`, and never the newest
   * instruction: an intake that arrives on the following Monday joins the run
   * the clerk already has open, exactly as `MemoryRepository` does by holding one
   * list, instead of re-deriving a later week and taking the seeded lines off the
   * screen. That is why the window is open ended, and why `latestRunWeek` is
   * only the fallback for a database nobody has seeded.
   */
  async currentRun(): Promise<PaymentRun> {
    const company = await getCompany(this.sql);
    const weekOf =
      company?.weekOf ??
      (await latestRunWeek(this.sql)) ??
      mondayInMonterrey(new Date().toISOString());
    // The generator names the run `run-<weekOf>` and the id on the screen has to
    // be the id in `.seed/sentryone.json`, so it is stored and read back, and
    // rebuilt the same way only when there is no company row to read it from.
    const runId = company?.runId ?? `run-${weekOf}`;
    const rows = await currentPaymentRun(this.sql, weekOf, {
      openEnded: true,
    });

    const items: PaymentRunItem[] = [];
    for (const row of rows) {
      if (row.supplier === undefined) {
        // An instruction always has a supplier row by the time it is stored.
        continue;
      }
      items.push({
        instruction: row.instruction,
        supplier: row.supplier,
        decision: row.decision ?? null,
        findings: row.findings,
      });
    }

    const actions = items.map((item) => item.decision?.action);

    return {
      id: runId,
      weekOf,
      totals: {
        instructions: items.length,
        amount: sumAmounts(items.map((item) => item.instruction.amount)),
        held: actions.filter((action) => action === "hold").length,
        toVerify: actions.filter((action) => action === "verify").length,
        released: actions.filter((action) => action === "release").length,
        ...runMoney(items),
      },
      items,
    };
  }

  /**
   * One run by id. There is one run in this store, the current week's, so the
   * honest answer is that one when the id matches and undefined otherwise,
   * rather than a history that does not exist. `current` is an alias, which is
   * what lets a link be built before the id is known.
   */
  async run(id: string): Promise<PaymentRun | undefined> {
    const run = await this.currentRun();
    return id === "current" || id === run.id ? run : undefined;
  }

  async sweepSnapshot(listVersion: string): Promise<SweepSnapshot | undefined> {
    const entries = await listSatEntries(this.sql, listVersion);
    if (entries.length === 0) {
      return undefined;
    }

    const publishedAt = entries
      .map((entry) => entry.publishedAt)
      .sort()[0] as string;

    return {
      listVersion,
      publishedAt,
      subjects: await this.sweepSubjectsFor(entries),
      suppliersChecked: (await countSentryOne(this.sql)).suppliers,
    };
  }

  async instructionDetail(id: string): Promise<InstructionDetail | undefined> {
    const instruction = await getInstruction(this.sql, id);
    if (instruction === undefined) {
      return undefined;
    }
    const decision = await latestDecision(this.sql, id);

    return {
      instruction,
      decision: decision ?? null,
      findings: await this.findingsForInstruction(id, decision),
      supplier: (await getSupplier(this.sql, instruction.supplierRfc)) ?? null,
    };
  }

  async supplierDetail(rfc: string): Promise<SupplierDetail | undefined> {
    const supplier = await getSupplier(this.sql, rfc);
    if (supplier === undefined) {
      return undefined;
    }

    const cfdis = await listCfdisByIssuer(this.sql, rfc);
    const complements = await listComplementsForCfdis(
      this.sql,
      cfdis.map((cfdi) => cfdi.uuid),
    );
    const beneficiaries = await listVerifiedBeneficiariesFor(this.sql, rfc);

    return {
      supplier,
      cfdis,
      complements,
      findings: await findingsForSupplier(this.sql, rfc),
      verifiedBeneficiaries: beneficiaries.map(toApiBeneficiary),
    };
  }

  async findSupplier(rfc: string): Promise<Supplier | undefined> {
    return getSupplier(this.sql, rfc);
  }

  async cfdisByUuid(uuids: string[]): Promise<Cfdi[]> {
    return listCfdisByUuid(this.sql, uuids);
  }

  async allCfdis(): Promise<Cfdi[]> {
    return listCfdis(this.sql);
  }

  async allComplements(): Promise<PaymentComplement[]> {
    return listPaymentComplements(this.sql);
  }

  /**
   * The bank mirror of the company's own account.
   *
   * `ledger_tx` also holds the consumer dataset, so the account id comes off the
   * company row rather than from whichever rows happen to be in the table. No
   * company row means no mirror, and `bank_reconciliation` reports that it was
   * not imported instead of calling every payment missing from a statement we do
   * not hold.
   */
  async bankMirror(): Promise<LedgerTx[]> {
    const company = await getCompany(this.sql);
    if (company === undefined) {
      return [];
    }
    return listLedgerTx(this.sql, company.bankAccountId);
  }

  /**
   * The 69-B rows this instance holds for one RFC. The official snapshot is not
   * merged in here: `routes/sat.ts` does that, because the lookup box is the one
   * endpoint that reads the real list and it owns saying which download answered.
   */
  async satLookup(rfc: string): Promise<SatListEntry[]> {
    return lookupSatEntries(this.sql, normalizeRfc(rfc));
  }

  async satVersions(): Promise<SatVersionSummary[]> {
    const versions = await listSatVersions(this.sql);
    return versions
      .map((version) => ({
        listVersion: version.listVersion,
        publishedAt: version.publishedAt,
        rows: version.rows,
      }))
      .sort((left, right) => right.listVersion.localeCompare(left.listVersion));
  }

  async beneficiaries(): Promise<VerifiedBeneficiary[]> {
    const rows = await listVerifiedBeneficiaries(this.sql);
    return rows.map(toApiBeneficiary);
  }

  /**
   * The local consortium snapshot, three reads against the tables 0009 created
   * and not one against Snowflake.
   *
   * That is the point of the snapshot: a payment decision never waits on a
   * warehouse, so the demo works with the network unplugged and a judge can
   * unplug it. `bun run consortium:pull` is the only thing here that ever talks
   * to Snowflake, and it runs on a laptop rather than inside a request.
   */
  async consortiumLookup(
    rfcHash: string,
    clabeHash: string,
  ): Promise<ConsortiumLookup> {
    const [pull, pair, accountsForRfc] = await Promise.all([
      getConsortiumPull(this.sql),
      getConsortiumPair(this.sql, rfcHash, clabeHash),
      countConsortiumAccounts(this.sql, rfcHash),
    ]);
    return {
      accountsForRfc,
      ...(pull === undefined ? {} : { pull }),
      ...(pair === undefined ? {} : { pair }),
    };
  }

  /**
   * The blind evaluation, recomputed on demand and identical to the memory
   * path's. The labelled cases live in `packages/seed/src/holdout` and are not
   * in any table on purpose: a score read out of the same database the product
   * writes to is a score nobody can check.
   */
  async metrics(): Promise<Metrics> {
    return computeMetrics(HOLDOUT_CASES, runEngine(HOLDOUT_CASES)).metrics;
  }

  async ledger(query: LedgerQuery): Promise<LedgerEvent[]> {
    const options: { since?: string; limit?: number } = {};
    if (query.since !== undefined) {
      options.since = query.since;
    }
    if (query.limit !== undefined) {
      options.limit = query.limit;
    }
    // The default limit stays the query layer's to own, so the two stores and
    // the endpoint cannot end up with three different answers to "how many".
    return readLedger(this.sql, options);
  }

  async verificationEvents(
    instructionId: string,
    beneficiaryAccount: string,
  ): Promise<LedgerEvent[]> {
    return readVerificationEvents(this.sql, instructionId, beneficiaryAccount);
  }

  async cancellation(instructionId: string): Promise<Cancellation | undefined> {
    return latestCancellation(this.sql, instructionId);
  }

  async publisher(listVersion: string): Promise<Actor | undefined> {
    return latestListPublisher(this.sql, listVersion);
  }

  /* --------------------------------------------------------------- writes */

  /**
   * Appends one event, and projects `payment_sent` onto its instruction. The
   * event is the record and `instructions.sent_at` is the projection, which is
   * what lets the run screen separate "not paid yet" from "paid and missing from
   * the bank mirror" without folding the ledger on every read.
   */
  async appendEvent(event: LedgerEvent): Promise<void> {
    await appendLedgerEvent(this.sql, event);
    if (event.type === "payment_sent") {
      await markInstructionSent(this.sql, event.instructionId, event.at);
    }
  }

  async saveIntake(record: IntakeRecord): Promise<void> {
    await transact(this.sql, async (tx) => {
      await this.ensureSupplier(tx, record.instruction);
      await insertInstruction(tx, record.instruction);
      // The findings go in before the decision: the join table has a foreign key
      // on them, so a decision that cites evidence the database does not hold is
      // refused rather than stored.
      await insertFindings(tx, record.findings);
      await insertDecision(tx, record.decision);
    });
  }

  /**
   * A person confirms an action.
   *
   * A new row, never an update: the clerk can hold on Thursday and release on
   * Friday and both have to survive, because the constancia has to be able to
   * say what was decided when. The pesos and the evidence are carried over
   * unchanged, because the person changed the action and not the arithmetic.
   */
  async recordDecision(
    instructionId: string,
    action: Decision["action"],
    actor: Actor,
    decidedAt: string,
    reason?: string,
  ): Promise<Decision | undefined> {
    const current = await latestDecision(this.sql, instructionId);
    if (current === undefined) {
      return undefined;
    }

    const decision: Decision = {
      instructionId,
      action,
      expectedLoss: current.expectedLoss,
      delayCostPerDay: current.delayCostPerDay,
      findings: current.findings,
      decidedAt,
      decidedBy: actor.name,
      decidedByRole: actor.role,
    };
    if (reason !== undefined) {
      decision.reason = reason;
    }
    await insertDecision(this.sql, decision);

    return decision;
  }

  /**
   * The engine's own decision on new evidence, findings first.
   *
   * One transaction, and the findings go in before the decision for the same
   * reason `saveIntake` does it in that order: `decision_findings` has a foreign
   * key on them, so a decision citing evidence the database does not hold is
   * refused rather than stored. `insertFindings` is `on conflict do nothing`, so a
   * finding the run already carried is not duplicated and not overwritten.
   */
  async recordEngineDecision(decision: Decision): Promise<void> {
    await transact(this.sql, async (tx) => {
      await insertFindings(tx, decision.findings);
      await insertDecision(tx, decision);
    });
  }

  async publishSatList(
    listVersion: string,
    entries: SatListEntry[],
  ): Promise<SweepSubject[]> {
    const publishedAt = entries.map((entry) => entry.publishedAt).sort()[0];
    if (publishedAt === undefined) {
      // A version with no rows is not a publication. Nothing is stored, so the
      // constancia can never be printed for a version that says nothing.
      return [];
    }

    await insertSatListVersion(
      this.sql,
      {
        listVersion,
        publishedAt,
        rows: entries.length,
        source: "api",
      },
      entries,
    );

    return this.sweepSubjectsFor(entries);
  }

  /**
   * Stores the evidence from a CEP verification, and records the account it
   * proves.
   *
   * The name comparison is `nameMatch` from @hackmty/cep, which knows what
   * "SA de CV" and a bank-truncated corporate name mean in Mexico. A supplier we
   * do not hold answers `mismatch`, because a holder name that matches nothing we
   * know is not a match.
   */
  async saveVerifiedBeneficiary(row: VerifiedBeneficiary): Promise<void> {
    const supplier = await getSupplier(this.sql, row.supplierRfc);

    await upsertVerifiedBeneficiary(this.sql, {
      ...row,
      nameMatch:
        supplier === undefined
          ? "mismatch"
          : nameMatch(row.cep.beneficiaryName, supplier.legalName),
    });

    if (supplier === undefined) {
      return;
    }
    await recordKnownAccount(this.sql, supplier.rfc, {
      clabe: row.clabe,
      establishedBy: "cep",
      establishedAt: row.verifiedAt,
      timesPaid: 0,
    });
  }

  async replaceConsortiumSnapshot(input: {
    rows: readonly ConsortiumSnapshotRow[];
    pulledAt: string;
    source: ConsortiumPull["source"];
  }): Promise<number> {
    return replaceConsortiumSnapshot(this.sql, input);
  }

  /**
   * Regenerates the demo company, with `MemoryRepository.reset`'s own mapping of
   * the seed number: 0 is "no seed given", so the generator picks its default
   * company rather than being handed the literal 0 and building a different one.
   * Two stores that answer `POST /api/v1/seed` with two companies would be two
   * products again.
   *
   * The answer is projected down to `ResetSummary`, which is the body
   * docs/09-api.md promises for that endpoint. `load` keeps the wider result for
   * `bun run seed`, which prints the demo ids.
   */
  async reset(seed: number): Promise<ResetSummary> {
    const loaded = await this.load(seed === 0 ? {} : { seed });
    return {
      // The argument is echoed, as MemoryRepository does: a caller that sent 0
      // reads 0 back, and the default company it got is the same on both stores.
      seed,
      suppliers: loaded.suppliers,
      instructions: loaded.instructions,
      events: loaded.events,
    };
  }

  /**
   * Loads the generated demo company into Postgres, in one transaction.
   *
   * Public and taking the generator's own options, because `bun run seed` has to
   * be able to pass `--week`, and because the seed script and `POST /api/v1/seed`
   * must write the same rows: two loaders would be two companies that drift
   * apart on the morning of the demo.
   *
   * The order is the order the documents actually arrived in, and the findings
   * come last because they are the engine's answer to the rest. `truncateSentryOne`
   * first and `deleteLedgerTxForAccount` rather than `truncateLedger`, because
   * `ledger_tx` also holds the consumer dataset and a reseed of this company must
   * not touch it. Running it twice gives the same run.
   */
  async load(options: SentryOneOptions = {}): Promise<SentryOneLoadResult> {
    const snapshot = loadSentryOne(options);
    const assessed = assessRun({
      suppliers: snapshot.suppliers,
      cfdis: snapshot.cfdis,
      complements: snapshot.complements,
      instructions: snapshot.instructions,
      satEntries: snapshot.satEntries,
      bankMirror: snapshot.bankMirror,
      // The same instant the memory path gives the controls, so the two stores
      // cannot disagree about what the engine saw.
      now: runInstant(snapshot.runDay),
    });

    await transact(this.sql, async (tx) => {
      const accountIds = new Set([DEMO_COMPANY.bankAccountId]);
      const previous = await getCompany(tx);
      if (previous !== undefined) {
        accountIds.add(previous.bankAccountId);
      }
      await truncateSentryOne(tx);
      for (const accountId of accountIds) {
        await deleteLedgerTxForAccount(tx, accountId);
      }

      await upsertCompany(tx, {
        rfc: snapshot.companyRfc,
        legalName: snapshot.companyName,
        bankAccountId: DEMO_COMPANY.bankAccountId,
        // The run anchor, so `currentRun` reads the run the seed opened instead
        // of guessing it from whichever instruction arrived last.
        weekOf: snapshot.weekOf,
        runId: snapshot.runId,
        synthetic: true,
      });
      for (const supplier of snapshot.suppliers) {
        await upsertSupplier(tx, supplier);
      }
      await insertCfdis(tx, snapshot.cfdis);
      await insertPaymentComplements(tx, snapshot.complements);
      await insertInstructions(tx, snapshot.instructions);
      await insertLedgerTx(tx, snapshot.bankMirror);

      for (const [listVersion, entries] of groupByListVersion(
        snapshot.satEntries,
      )) {
        await insertSatListVersion(
          tx,
          {
            listVersion,
            publishedAt: entries
              .map((entry) => entry.publishedAt)
              .sort()[0] as string,
            rows: entries.length,
            source: "seed",
          },
          entries,
        );
      }

      await appendLedgerEvents(tx, snapshot.ledger);
      await insertFindings(tx, assessed.findings);
      for (const decision of assessed.decisions) {
        await insertDecision(tx, decision);
      }
    });

    return {
      seed: snapshot.seed,
      suppliers: snapshot.suppliers.length,
      instructions: snapshot.instructions.length,
      events: snapshot.ledger.length,
      cfdis: snapshot.cfdis.length,
      complements: snapshot.complements.length,
      bankMirrorRows: snapshot.bankMirror.length,
      weekOf: snapshot.weekOf,
      runId: snapshot.runId,
      findings: assessed.findings.length,
      held: assessed.decisions.filter((row) => row.action === "hold").length,
      toVerify: assessed.decisions.filter((row) => row.action === "verify")
        .length,
      heroInstructionIds: snapshot.heroInstructionIds,
      demoRfcs: snapshot.demoRfcs,
    };
  }

  /* -------------------------------------------------------------- private */

  /**
   * The suppliers a set of list rows touches, with the invoices of theirs we
   * have already paid. Shared by the publish write and the constancia read, for
   * the reason `MemoryRepository` shares its own: the document has to say the
   * same thing the screen said.
   */
  private async sweepSubjectsFor(
    entries: readonly SatListEntry[],
  ): Promise<SweepSubject[]> {
    const rfcs = [...new Set(entries.map((entry) => entry.rfc))];
    const suppliers = new Map(
      (await selectSuppliers(this.sql, rfcs)).map((supplier) => [
        supplier.rfc,
        supplier,
      ]),
    );

    const paid = new Map<string, Cfdi[]>();
    for (const rfc of rfcs) {
      if (suppliers.has(rfc)) {
        paid.set(rfc, await listPaidCfdisByIssuer(this.sql, rfc));
      }
    }

    const subjects: SweepSubject[] = [];
    for (const entry of entries) {
      const supplier = suppliers.get(entry.rfc);
      if (supplier === undefined) {
        // A listed RFC we have never paid is not an exposure, it is news.
        continue;
      }
      subjects.push({
        supplier,
        status: entry.status,
        paidCfdis: paid.get(entry.rfc) ?? [],
      });
    }

    return subjects;
  }

  /**
   * The findings on one line: the ones that justified its current decision, plus
   * any later finding whose subject is the instruction itself. The same union
   * `currentPaymentRun` builds, so the detail panel and the run screen can never
   * show a different rail for the same line.
   */
  private async findingsForInstruction(
    id: string,
    decision: Decision | undefined,
  ): Promise<Finding[]> {
    const bySubject = await findingsForSubjects(this.sql, "instruction", [id]);
    const seen = new Set<string>();
    const findings: Finding[] = [];

    for (const finding of [
      ...(decision?.findings ?? []),
      ...(bySubject.get(id) ?? []),
    ]) {
      if (!seen.has(finding.id)) {
        seen.add(finding.id);
        findings.push(finding);
      }
    }

    return findings;
  }

  /**
   * An instruction for an RFC we have never seen still has to render in the run,
   * so a row is created from what the documents actually say. The legal name
   * comes from the CFDI when we hold one, and otherwise stays the RFC itself: a
   * name we do not have is not a name we invent. Same rule as the memory store's.
   */
  private async ensureSupplier(
    tx: Db,
    instruction: PaymentInstruction,
  ): Promise<void> {
    if ((await getSupplier(tx, instruction.supplierRfc)) !== undefined) {
      return;
    }

    const issued = await listCfdisByIssuer(tx, instruction.supplierRfc);
    const cfdi =
      issued.at(-1) ?? (await listCfdisByUuid(tx, instruction.cfdiUuids))[0];

    await upsertSupplier(tx, {
      rfc: instruction.supplierRfc,
      legalName: cfdi?.issuerName ?? instruction.supplierRfc,
      knownAccounts: [],
      firstInvoiceAt: cfdi?.issuedAt ?? instruction.receivedAt,
      synthetic: instruction.synthetic,
    });
  }
}

/**
 * The API shape of a registry row. The database also stores how close the CEP
 * holder name was to the legal name; docs/09-api.md does not serve it on this
 * endpoint, and the API never invents a second shape by adding it.
 */
function toApiBeneficiary(row: {
  supplierRfc: string;
  clabe: string;
  cep: VerifiedBeneficiary["cep"];
  verifiedAt: string;
}): VerifiedBeneficiary {
  return {
    supplierRfc: row.supplierRfc,
    clabe: row.clabe,
    cep: row.cep,
    verifiedAt: row.verifiedAt,
  };
}

function groupByListVersion(
  entries: readonly SatListEntry[],
): Map<string, SatListEntry[]> {
  const grouped = new Map<string, SatListEntry[]>();
  for (const entry of entries) {
    const rows = grouped.get(entry.listVersion);
    if (rows === undefined) {
      grouped.set(entry.listVersion, [entry]);
      continue;
    }
    rows.push(entry);
  }
  return grouped;
}

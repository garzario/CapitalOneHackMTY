/**
 * The queries against a real Postgres.
 *
 * These run only when TEST_DATABASE_URL points at a database this suite may
 * empty, and are skipped otherwise, which is what keeps CI free of a service
 * container while still letting a laptop with the local Postgres 18 or the Tiger
 * service prove the SQL. Each case names the edge it exists for.
 *
 * DATABASE_URL is deliberately NOT a fallback. The suite migrates first and
 * truncates before every group, and bun loads `.env` into every test run, so a
 * fallback would wipe the demo database the moment somebody ran `bun test` on a
 * laptop that is configured for a rehearsal.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import type {
  Cfdi,
  Decision,
  Finding,
  LedgerEvent,
  PaymentComplement,
  PaymentInstruction,
  Supplier,
} from "@hackmty/core";
import { assessSupplierBehaviour, sumAmounts } from "@hackmty/core";
import { createSql, type Sql } from "./index";
import { migrate } from "./migrate";
import {
  appendLedgerEvent,
  appendLedgerEvents,
  countLedgerEvents,
  countLedgerTx,
  countSentryOne,
  currentPaymentRun,
  deleteLedgerTxBySource,
  deleteLedgerTxForAccount,
  findingsFor,
  findingsForSubjects,
  findingsForSupplier,
  getCompany,
  getInstruction,
  getSupplier,
  getVerifiedBeneficiary,
  insertCfdis,
  insertDecision,
  insertFindings,
  insertInstruction,
  insertInstructions,
  insertLedgerTx,
  insertPaymentComplements,
  insertSatListVersion,
  latestDecision,
  latestRunWeek,
  listCfdis,
  listCfdisByIssuer,
  listCfdisByUuid,
  listComplementsForCfdis,
  listLedgerTx,
  listPaidCfdisByIssuer,
  listSatVersions,
  listSuppliers,
  listUnassessedInstructions,
  listVerifiedBeneficiaries,
  lookupSatEntries,
  markInstructionSent,
  readLedger,
  recordKnownAccount,
  type SupplierHistory,
  supplierHistory,
  supplierWeeklyOutflow,
  truncateLedger,
  truncateSentryOne,
  upsertCompany,
  upsertSupplier,
  upsertVerifiedBeneficiary,
} from "./queries";

const url = process.env.TEST_DATABASE_URL;
const enabled =
  url !== undefined &&
  url.trim() !== "" &&
  // Belt and braces: refuse to run against the configured database even when
  // somebody points TEST_DATABASE_URL at the same place by mistake.
  url.trim() !== (process.env.DATABASE_URL ?? "").trim();

const UUID_A = "a17e5b83-9c2f-4d60-b4a1-6e8c3f0d9b22";
const UUID_B = "b5d31c07-72ae-4f95-8a3e-1c6b40d8e7f5";
const UUID_C = "c9e2d4a1-3f6b-4c8d-9e0f-1a2b3c4d5e6f";
const COMPLEMENT_A = "3c9f4e21-8b05-4d7a-9e63-0f2a5c1b8d44";

const supplier: Supplier = {
  rfc: "SYN990202S02",
  legalName: "Maquinados Industriales Regios SA de CV",
  knownAccounts: [
    {
      clabe: "012180100091764613",
      establishedBy: "payment_complement",
      establishedAt: "2021-12-01T15:00:00.000Z",
      timesPaid: 52,
    },
  ],
  firstInvoiceAt: "2021-11-02T15:00:00.000Z",
  delayCostPerDay: 640,
  synthetic: true,
};

function cfdi(uuid: string, issuedAt: string, total: number): Cfdi {
  const subtotal = Math.round((total / 1.16) * 100) / 100;
  return {
    uuid,
    serie: "A",
    folio: uuid.slice(0, 4),
    issuedAt,
    issuerRfc: supplier.rfc,
    issuerName: supplier.legalName,
    receiverRfc: "SYN090615C01",
    subtotal,
    iva: Math.round((total - subtotal) * 100) / 100,
    total,
    paymentMethod: "PPD",
    paymentForm: "03",
    synthetic: true,
  };
}

function instruction(
  id: string,
  receivedAt: string,
  extra: Partial<PaymentInstruction> = {},
): PaymentInstruction {
  return {
    id,
    supplierRfc: supplier.rfc,
    cfdiUuids: [UUID_A],
    clabe: "014180004551203983",
    amount: 31320,
    source: "email",
    receivedAt,
    synthetic: true,
    ...extra,
  };
}

function finding(id: string, subjectId: string, amount: number): Finding {
  return {
    id,
    detector: "clabe_forensics",
    severity: "critical",
    state: "requiere_verificacion",
    subject: { kind: "instruction", id: subjectId },
    amountAtRisk: amount,
    explanation: "La cuenta cambio de banco y ningun documento la respalda.",
    evidence: { editOperations: 2, checkDigit: "valid", ocrSourced: false },
    createdAt: "2026-09-09T14:05:00.000Z",
  };
}

describe.skipIf(!enabled)("packages/db queries against Postgres", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = createSql(url);
    await migrate(sql);
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await truncateSentryOne(sql);
    await truncateLedger(sql);
  });

  describe("the event ledger", () => {
    it("keeps append order inside one instant, which the generator produces constantly", async () => {
      const at = "2026-09-03T15:12:00.000Z";
      const events: LedgerEvent[] = [
        { type: "cfdi_received", at, cfdi: cfdi(UUID_A, at, 31320) },
        {
          type: "complement_received",
          at,
          complement: {
            uuid: COMPLEMENT_A,
            relatedCfdiUuid: UUID_A,
            paidAt: at,
            paidAmount: 31320,
            synthetic: true,
          },
        },
        { type: "payment_sent", at, instructionId: "INS-1" },
      ];
      expect(await appendLedgerEvents(sql, events)).toBe(3);

      const read = await readLedger(sql);
      expect(read.map((event) => event.type)).toEqual([
        "cfdi_received",
        "complement_received",
        "payment_sent",
      ]);
      expect(read).toEqual(events);
    });

    it("treats since as exclusive and compares it as an instant", async () => {
      await appendLedgerEvent(sql, {
        type: "payment_sent",
        at: "2026-09-08T18:00:00.000Z",
        instructionId: "INS-1",
      });
      await appendLedgerEvent(sql, {
        type: "payment_sent",
        at: "2026-09-08T18:00:01.000Z",
        instructionId: "INS-2",
      });

      const afterZ = await readLedger(sql, {
        since: "2026-09-08T18:00:00.000Z",
      });
      const afterOffset = await readLedger(sql, {
        since: "2026-09-08T12:00:00.000-06:00",
      });
      expect(afterZ.map((event) => event.at)).toEqual([
        "2026-09-08T18:00:01.000Z",
      ]);
      expect(afterOffset).toEqual(afterZ);
    });

    it("honours limit and counts what it holds", async () => {
      await appendLedgerEvents(
        sql,
        Array.from({ length: 7 }, (_unused, index) => ({
          type: "payment_sent" as const,
          at: `2026-09-08T18:00:0${index}.000Z`,
          instructionId: `INS-${index}`,
        })),
      );
      expect(await readLedger(sql, { limit: 3 })).toHaveLength(3);
      expect(await countLedgerEvents(sql)).toBe(7);
    });

    it("accepts a verification_call, the event type 0003 refused", async () => {
      const call: LedgerEvent = {
        type: "verification_call",
        at: "2026-09-12T03:00:00.000Z",
        instructionId: "INS-1",
        supplierRfc: supplier.rfc,
        outcome: "denied",
        clabeLast4: "3983",
        evidence: "Esa cuenta no es nuestra.",
        transcript: [{ role: "supplier", text: "Esa cuenta no es nuestra." }],
        manual: true,
      };
      await appendLedgerEvent(sql, call);
      expect(await readLedger(sql)).toEqual([call]);
    });

    it("is append-only in the server: an update or a delete is refused, loudly", async () => {
      await appendLedgerEvent(sql, {
        type: "payment_sent",
        at: "2026-09-08T18:00:00.000Z",
        instructionId: "INS-1",
      });
      // 0003 wrote this guard as rules that ignored the write. 0005 turns it
      // into a trigger that raises, because a hypertable refuses rules and a
      // silent no-op is the worse of the two behaviours anyway.
      // A postgres.js query only runs once something calls its then(), and
      // expect().rejects inspects the promise without doing so, hence the
      // async wrappers: without them the query never executes and the test
      // waits forever.
      await expect(
        (async () => {
          await sql`update ledger_events set type = 'decision_made'`;
        })(),
      ).rejects.toThrow(/append-only/);
      await expect(
        (async () => {
          await sql`delete from ledger_events`;
        })(),
      ).rejects.toThrow(/append-only/);
      const read = await readLedger(sql);
      expect(read).toHaveLength(1);
      expect(read[0]?.type).toBe("payment_sent");
    });
  });

  describe("suppliers and known accounts", () => {
    it("round trips a supplier with its accounts newest first", async () => {
      await upsertSupplier(sql, supplier);
      await recordKnownAccount(sql, supplier.rfc, {
        clabe: "014180004551203983",
        establishedBy: "payment_complement",
        establishedAt: "2026-08-14T15:00:00.000Z",
        timesPaid: 1,
      });

      const stored = await getSupplier(sql, supplier.rfc);
      expect(stored?.knownAccounts.map((account) => account.clabe)).toEqual([
        "014180004551203983",
        "012180100091764613",
      ]);
      expect(stored?.delayCostPerDay).toBe(640);
      expect(stored?.firstInvoiceAt).toBe(supplier.firstInvoiceAt);
    });

    it("moves the first invoice earlier on a back-fill, never later", async () => {
      await upsertSupplier(sql, supplier);
      await upsertSupplier(sql, {
        ...supplier,
        firstInvoiceAt: "2019-05-06T15:00:00.000Z",
      });
      expect((await getSupplier(sql, supplier.rfc))?.firstInvoiceAt).toBe(
        "2019-05-06T15:00:00.000Z",
      );
      await upsertSupplier(sql, {
        ...supplier,
        firstInvoiceAt: "2024-01-01T15:00:00.000Z",
      });
      expect((await getSupplier(sql, supplier.rfc))?.firstInvoiceAt).toBe(
        "2019-05-06T15:00:00.000Z",
      );
    });

    it("never downgrades the evidence behind an account", async () => {
      await upsertSupplier(sql, { ...supplier, knownAccounts: [] });
      await recordKnownAccount(sql, supplier.rfc, {
        clabe: "014180004551203983",
        establishedBy: "cep",
        establishedAt: "2026-09-10T16:45:00.000Z",
        timesPaid: 0,
      });
      await recordKnownAccount(sql, supplier.rfc, {
        clabe: "014180004551203983",
        establishedBy: "instruction",
        establishedAt: "2026-09-11T10:00:00.000Z",
        timesPaid: 1,
      });

      const [account] =
        (await getSupplier(sql, supplier.rfc))?.knownAccounts ?? [];
      expect(account?.establishedBy).toBe("cep");
      expect(account?.establishedAt).toBe("2026-09-10T16:45:00.000Z");
      // The payment still counts even though the evidence stayed the CEP.
      expect(account?.timesPaid).toBe(1);
    });

    it("keeps a supplier with no account at an empty list, not [null]", async () => {
      await upsertSupplier(sql, { ...supplier, knownAccounts: [] });
      expect((await getSupplier(sql, supplier.rfc))?.knownAccounts).toEqual([]);
      expect(await getSupplier(sql, "SYN999999ZZZ")).toBeUndefined();
    });

    it("loading the same supplier twice is a no-op, not a doubled payment count", async () => {
      await upsertSupplier(sql, supplier);
      await upsertSupplier(sql, supplier);
      const stored = await getSupplier(sql, supplier.rfc);
      expect(stored?.knownAccounts[0]?.timesPaid).toBe(52);
      expect(await listSuppliers(sql)).toHaveLength(1);
    });
  });

  describe("CFDI and complements", () => {
    it("ignores a re-ingest of the same UUID", async () => {
      const invoice = cfdi(UUID_A, "2026-08-25T16:20:00.000Z", 31320);
      expect(await insertCfdis(sql, [invoice])).toBe(1);
      expect(
        await insertCfdis(sql, [{ ...invoice, total: 1, subtotal: 1, iva: 0 }]),
      ).toBe(0);
      expect((await listCfdis(sql))[0]?.total).toBe(31320);
    });

    it("lists one issuer newest first inside a window", async () => {
      await insertCfdis(sql, [
        cfdi(UUID_A, "2026-07-28T16:10:00.000Z", 28420),
        cfdi(UUID_B, "2026-08-25T16:20:00.000Z", 31320),
        cfdi(UUID_C, "2026-09-01T16:20:00.000Z", 1000),
      ]);
      const inWindow = await listCfdisByIssuer(sql, supplier.rfc, {
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
      });
      expect(inWindow.map((row) => row.uuid)).toEqual([UUID_B]);
      const all = await listCfdisByIssuer(sql, supplier.rfc);
      expect(all.map((row) => row.uuid)).toEqual([UUID_C, UUID_B, UUID_A]);
      expect(
        (await listCfdisByUuid(sql, [UUID_C, UUID_A])).map((r) => r.uuid),
      ).toEqual([UUID_A, UUID_C]);
    });

    it("returns the complements of a set of invoices, and refuses an orphan", async () => {
      await insertCfdis(sql, [cfdi(UUID_A, "2026-07-28T16:10:00.000Z", 28420)]);
      const complement: PaymentComplement = {
        uuid: COMPLEMENT_A,
        relatedCfdiUuid: UUID_A,
        paidAt: "2026-08-14T15:00:00.000Z",
        paidAmount: 28420,
        paymentTotal: 28420,
        operationNumber: "SYNSPEI20260814001",
        beneficiaryAccount: "014180004551203983",
        synthetic: true,
      };
      expect(await insertPaymentComplements(sql, [complement])).toBe(1);
      expect(await listComplementsForCfdis(sql, [UUID_A])).toEqual([
        complement,
      ]);
      expect(await listComplementsForCfdis(sql, [])).toEqual([]);

      // The foreign key is the guard: a complement for an invoice we never
      // received is a loud failure, not a silent row.
      await expect(
        insertPaymentComplements(sql, [
          { ...complement, uuid: UUID_C, relatedCfdiUuid: UUID_B },
        ]),
      ).rejects.toThrow();
    });
  });

  describe("instructions", () => {
    beforeEach(async () => {
      await upsertSupplier(sql, supplier);
    });

    it("round trips the CFDI list and the optional fields", async () => {
      const stored = instruction(
        "INS-2026-09-07-001",
        "2026-09-09T14:02:00.000Z",
        {
          cfdiUuids: [UUID_A, UUID_B],
          text: "Cuenta nueva.",
          imageRef: "intake/INS-1/image",
          ocrConfidence: 0.86,
        },
      );
      await insertInstruction(sql, stored);
      await insertInstruction(sql, { ...stored, amount: 1 });
      expect(await getInstruction(sql, stored.id)).toEqual(stored);
      expect(await getInstruction(sql, "INS-nope")).toBeUndefined();
    });

    it("projects payment_sent onto sent_at, keeping the earliest", async () => {
      const stored = instruction("INS-1", "2026-09-09T14:02:00.000Z");
      await insertInstruction(sql, stored);
      await markInstructionSent(sql, stored.id, "2026-09-11T17:10:00.000Z");
      await markInstructionSent(sql, stored.id, "2026-09-11T17:20:00.000Z");
      expect((await getInstruction(sql, stored.id))?.sentAt).toBe(
        "2026-09-11T17:10:00.000Z",
      );
    });

    it("finds the week of the newest instruction, Monday based, in Monterrey time", async () => {
      expect(await latestRunWeek(sql)).toBeUndefined();
      await insertInstructions(sql, [
        instruction("INS-1", "2026-09-09T14:02:00.000Z"),
        // Sunday 2026-09-13 23:30 in Monterrey is Monday 05:30 UTC. The week is
        // still the one that started on Monday the 7th.
        instruction("INS-2", "2026-09-14T05:30:00.000Z"),
      ]);
      expect(await latestRunWeek(sql)).toBe("2026-09-07");
    });

    it("lists what has no decision yet, oldest first", async () => {
      await insertInstructions(sql, [
        instruction("INS-2", "2026-09-10T14:02:00.000Z"),
        instruction("INS-1", "2026-09-09T14:02:00.000Z"),
      ]);
      expect(
        (await listUnassessedInstructions(sql)).map((row) => row.id),
      ).toEqual(["INS-1", "INS-2"]);
      await insertDecision(sql, {
        instructionId: "INS-1",
        action: "release",
        expectedLoss: 0,
        delayCostPerDay: 640,
        findings: [],
        decidedAt: "2026-09-11T16:30:00.000Z",
      });
      expect(
        (await listUnassessedInstructions(sql)).map((row) => row.id),
      ).toEqual(["INS-2"]);
    });
  });

  describe("findings and decisions", () => {
    beforeEach(async () => {
      await upsertSupplier(sql, supplier);
      await insertInstruction(
        sql,
        instruction("INS-1", "2026-09-09T14:02:00.000Z"),
      );
    });

    it("stores a finding on a bank row, the subject kind 0003 refused", async () => {
      const unbacked: Finding = {
        ...finding("fnd-tx", "tx-2026w37-06", 18400),
        detector: "bank_reconciliation",
        subject: { kind: "ledger_tx", id: "tx-2026w37-06" },
      };
      expect(await insertFindings(sql, [unbacked])).toBe(1);
      expect(await findingsFor(sql, "ledger_tx", "tx-2026w37-06")).toEqual([
        unbacked,
      ]);
    });

    it("keeps every decision moment and answers with the newest", async () => {
      const first = finding("fnd-1", "INS-1", 31320);
      await insertFindings(sql, [first]);
      const thursday: Decision = {
        instructionId: "INS-1",
        action: "verify",
        expectedLoss: 31320,
        delayCostPerDay: 640,
        findings: [first],
        decidedAt: "2026-09-10T16:30:00.000Z",
      };
      const friday: Decision = {
        ...thursday,
        action: "release",
        expectedLoss: 0,
        decidedAt: "2026-09-11T09:00:00.000Z",
        decidedBy: "clerk-synthetic",
      };
      const firstId = await insertDecision(sql, thursday);
      const secondId = await insertDecision(sql, friday);
      expect(secondId).toBeGreaterThan(firstId);

      const latest = await latestDecision(sql, "INS-1");
      expect(latest).toEqual(friday);
      expect(latest?.findings).toEqual([first]);
      expect((await countSentryOne(sql)).decisions).toBe(2);
    });

    it("answers with the row appended last, even when it was decided earlier", async () => {
      // The engine stamps a seeded decision at the instant the run was prepared,
      // and that instant sits ahead of the clerk's wall clock whenever the run
      // day is ahead of today. Ordered by decided_at, the clerk's hold would be
      // appended and never returned, and the screen would keep showing the
      // engine's answer to a question a person already answered.
      const evidence = finding("fnd-late", "INS-1", 31320);
      await insertFindings(sql, [evidence]);
      const engine: Decision = {
        instructionId: "INS-1",
        action: "verify",
        expectedLoss: 31320,
        delayCostPerDay: 640,
        findings: [evidence],
        decidedAt: "2026-09-30T15:00:00.000Z",
      };
      const clerk: Decision = {
        ...engine,
        action: "hold",
        decidedAt: "2026-09-11T09:00:00.000Z",
        decidedBy: "ana.tesoreria",
      };
      await insertDecision(sql, engine);
      await insertDecision(sql, clerk);

      expect(await latestDecision(sql, "INS-1")).toEqual(clerk);
    });

    it("refuses a decision that cites a finding the database does not hold", async () => {
      await expect(
        insertDecision(sql, {
          instructionId: "INS-1",
          action: "hold",
          expectedLoss: 1,
          delayCostPerDay: 0,
          findings: [finding("fnd-ghost", "INS-1", 1)],
          decidedAt: "2026-09-10T16:30:00.000Z",
        }),
      ).rejects.toThrow();
      // The transaction rolled the decision row back with it.
      expect(await latestDecision(sql, "INS-1")).toBeUndefined();
    });

    it("finds an invoice finding whatever case its uuid was written in", async () => {
      // The parser in packages/core uppercases the folio fiscal and the uuid
      // column hands it back lowercase. Both spellings are the same invoice.
      await insertCfdis(sql, [cfdi(UUID_A, "2026-08-25T16:20:00.000Z", 31320)]);
      const upper = UUID_A.toUpperCase();
      const onCfdi: Finding = {
        ...finding("fnd-upper", upper, 31320),
        detector: "duplicate_invoice",
        subject: { kind: "cfdi", id: upper },
      };
      await insertFindings(sql, [onCfdi]);

      const stored = {
        ...onCfdi,
        subject: { kind: "cfdi" as const, id: UUID_A },
      };
      expect(await findingsFor(sql, "cfdi", upper)).toEqual([stored]);
      expect(await findingsFor(sql, "cfdi", UUID_A)).toEqual([stored]);
      expect(
        (await findingsForSubjects(sql, "cfdi", [upper])).get(upper),
      ).toEqual([stored]);
      expect(
        (await findingsForSupplier(sql, supplier.rfc)).map((row) => row.id),
      ).toEqual(["fnd-upper"]);
    });

    it("gathers everything that touches a supplier for the drawer", async () => {
      await insertCfdis(sql, [cfdi(UUID_A, "2026-08-25T16:20:00.000Z", 31320)]);
      const onInstruction = finding("fnd-i", "INS-1", 31320);
      const onCfdi: Finding = {
        ...finding("fnd-c", UUID_A, 31320),
        detector: "duplicate_invoice",
        subject: { kind: "cfdi", id: UUID_A },
        createdAt: "2026-09-09T14:06:00.000Z",
      };
      const onSupplier: Finding = {
        ...finding("fnd-s", supplier.rfc, 0),
        detector: "sat_69b",
        subject: { kind: "supplier", id: supplier.rfc },
        createdAt: "2026-09-09T14:07:00.000Z",
      };
      const elsewhere: Finding = {
        ...finding("fnd-x", "INS-other", 1),
        createdAt: "2026-09-09T14:08:00.000Z",
      };
      await insertFindings(sql, [onInstruction, onCfdi, onSupplier, elsewhere]);

      expect(
        (await findingsForSupplier(sql, supplier.rfc)).map((row) => row.id),
      ).toEqual(["fnd-s", "fnd-c", "fnd-i"]);
    });
  });

  describe("the payment run", () => {
    it("assembles the week with the newest decision and its findings", async () => {
      await upsertSupplier(sql, supplier);
      const monday = instruction("INS-1", "2026-09-07T14:02:00.000Z");
      const thursday = instruction("INS-2", "2026-09-10T15:02:00.000Z");
      const lastWeek = instruction("INS-0", "2026-09-03T15:02:00.000Z");
      await insertInstructions(sql, [monday, thursday, lastWeek]);
      const evidence = finding("fnd-1", "INS-2", 31320);
      await insertFindings(sql, [evidence]);
      await insertDecision(sql, {
        instructionId: "INS-2",
        action: "verify",
        expectedLoss: 31320,
        delayCostPerDay: 640,
        findings: [evidence],
        decidedAt: "2026-09-10T16:30:00.000Z",
      });

      const weekOf = await latestRunWeek(sql);
      expect(weekOf).toBe("2026-09-07");
      const run = await currentPaymentRun(sql, weekOf ?? "");

      expect(run.map((item) => item.instruction.id)).toEqual([
        "INS-1",
        "INS-2",
      ]);
      expect(run[0]?.decision).toBeUndefined();
      expect(run[0]?.findings).toEqual([]);
      expect(run[0]?.supplier?.rfc).toBe(supplier.rfc);
      expect(run[1]?.decision?.action).toBe("verify");
      expect(run[1]?.findings).toEqual([evidence]);
    });

    it("cuts the week in Monterrey time at both ends", async () => {
      await upsertSupplier(sql, supplier);
      await insertInstructions(sql, [
        // Sunday 2026-09-06 23:30 Monterrey: the week before.
        instruction("INS-before", "2026-09-07T05:30:00.000Z"),
        // Monday 2026-09-07 00:30 Monterrey: this week.
        instruction("INS-first", "2026-09-07T06:30:00.000Z"),
        // Sunday 2026-09-13 23:30 Monterrey: still this week.
        instruction("INS-last", "2026-09-14T05:30:00.000Z"),
        // Monday 2026-09-14 00:30 Monterrey: next week.
        instruction("INS-after", "2026-09-14T06:30:00.000Z"),
      ]);
      const run = await currentPaymentRun(sql, "2026-09-07");
      expect(run.map((item) => item.instruction.id)).toEqual([
        "INS-first",
        "INS-last",
      ]);
    });

    it("keeps the Monday but drops the upper bound when the run is open ended", async () => {
      // The run screen reads it this way. An intake that lands next Monday joins
      // the run the clerk has open instead of starting a second one, which is
      // what the in-memory store does by holding one list; the week before is
      // still not part of it.
      await upsertSupplier(sql, supplier);
      await insertInstructions(sql, [
        instruction("INS-before", "2026-09-07T05:30:00.000Z"),
        instruction("INS-first", "2026-09-07T06:30:00.000Z"),
        instruction("INS-next-week", "2026-09-14T06:30:00.000Z"),
      ]);

      expect(
        (await currentPaymentRun(sql, "2026-09-07", { openEnded: true })).map(
          (item) => item.instruction.id,
        ),
      ).toEqual(["INS-first", "INS-next-week"]);
      expect(
        (await currentPaymentRun(sql, "2026-09-07")).map(
          (item) => item.instruction.id,
        ),
      ).toEqual(["INS-first"]);
    });
  });

  describe("the SAT list", () => {
    const entries = [
      {
        rfc: "SYN020202BBB",
        name: "Empaques Regios SA de CV",
        status: "presunto" as const,
        publishedAt: "2026-08-29",
        listVersion: "2026-08-29",
      },
      {
        rfc: "SYN120303LLL",
        name: "Comercializadora Mitras SA de CV",
        status: "desvirtuado" as const,
        publishedAt: "2026-06-27",
        listVersion: "2026-08-29",
      },
    ];

    it("loads a version once and never rewrites it", async () => {
      const version = {
        listVersion: "2026-08-29",
        publishedAt: "2026-08-29",
        rows: 2,
        source: "test",
      };
      expect(await insertSatListVersion(sql, version, entries)).toBe(2);
      expect(await insertSatListVersion(sql, version, entries)).toBe(0);
      expect(await listSatVersions(sql)).toEqual([version]);
    });

    it("answers a lookup newest publication first across versions", async () => {
      await insertSatListVersion(
        sql,
        {
          listVersion: "2026-06-27",
          publishedAt: "2026-06-27",
          rows: 1,
          source: "t",
        },
        [
          {
            rfc: "SYN020202BBB",
            name: "Empaques Regios SA de CV",
            status: "presunto",
            publishedAt: "2026-06-27",
            listVersion: "2026-06-27",
          },
        ],
      );
      await insertSatListVersion(
        sql,
        {
          listVersion: "2026-08-29",
          publishedAt: "2026-08-29",
          rows: 2,
          source: "t",
        },
        [
          ...entries
            .filter((e) => e.rfc === "SYN020202BBB")
            .map((e) => ({
              ...e,
              status: "desvirtuado" as const,
            })),
        ],
      );
      const found = await lookupSatEntries(sql, "SYN020202BBB");
      expect(found.map((row) => [row.listVersion, row.status])).toEqual([
        ["2026-08-29", "desvirtuado"],
        ["2026-06-27", "presunto"],
      ]);
      expect(await lookupSatEntries(sql, "SYN999999ZZZ")).toEqual([]);
      expect((await listSatVersions(sql)).map((v) => v.listVersion)).toEqual([
        "2026-08-29",
        "2026-06-27",
      ]);
    });
  });

  describe("the company", () => {
    it("holds exactly one row and replaces it on a reseed", async () => {
      expect(await getCompany(sql)).toBeUndefined();

      const company = {
        rfc: "SYN090615C01",
        legalName: "Metalicos del Norte SA de CV",
        bankAccountId: "5e1a0f00c0ffee0000000001",
        weekOf: "2026-09-07",
        runId: "run-2026-09-07",
        synthetic: true,
      };
      await upsertCompany(sql, company);
      expect(await getCompany(sql)).toEqual(company);

      // A reseed with a different week is still the same company row: the
      // constancia has one header and the mirror has one account.
      await upsertCompany(sql, {
        ...company,
        legalName: "Metalicos del Norte",
        weekOf: "2026-09-14",
        runId: "run-2026-09-14",
      });
      const reseeded = await getCompany(sql);
      expect(reseeded?.legalName).toBe("Metalicos del Norte");
      expect(reseeded?.weekOf).toBe("2026-09-14");
      expect(reseeded?.runId).toBe("run-2026-09-14");
      const rows = await sql<{ count: number }[]>`
        select count(*)::int as count from company
      `;
      expect(rows[0]?.count).toBe(1);
    });

    it("hands the anchored week back as a plain date, not an instant", async () => {
      // `week_of` is a date column and the API compares it as the "YYYY-MM-DD"
      // the generator prints. A driver that returned a Date would render it in
      // the process timezone and put the run on the Sunday on a UTC machine.
      await upsertCompany(sql, {
        rfc: "SYN090615C01",
        legalName: "Metalicos del Norte SA de CV",
        bankAccountId: "5e1a0f00c0ffee0000000001",
        weekOf: "2026-09-07",
        runId: "run-2026-09-07",
        synthetic: true,
      });
      expect((await getCompany(sql))?.weekOf).toBe("2026-09-07");
    });
  });

  describe("the bank mirror of one account", () => {
    it("is replaced by account, so the consumer dataset survives a reseed", async () => {
      const row = (id: string, accountId: string) => ({
        id,
        accountId,
        occurredAt: "2026-09-03T17:00:00.000Z",
        amount: 12000,
        direction: "debit" as const,
        source: "seed",
        raw: {},
      });
      await insertLedgerTx(sql, [
        row("1f0f6c56-1b0c-4bd4-9d6c-3a1e8e0b2c21", "acc-company"),
        row("1f0f6c56-1b0c-4bd4-9d6c-3a1e8e0b2c22", "acc-company"),
        row("1f0f6c56-1b0c-4bd4-9d6c-3a1e8e0b2c23", "acc-consumer"),
      ]);

      expect(await deleteLedgerTxForAccount(sql, "acc-company")).toBe(2);
      expect(await listLedgerTx(sql, "acc-company")).toEqual([]);
      expect((await listLedgerTx(sql, "acc-consumer")).length).toBe(1);
      expect(await deleteLedgerTxForAccount(sql, "acc-nothing")).toBe(0);
    });
  });

  describe("the invoices a sweep is priced against", () => {
    it("counts an invoice with a complement and one an instruction says was sent", async () => {
      await upsertSupplier(sql, supplier);
      await insertCfdis(sql, [
        cfdi(UUID_A, "2026-06-02T16:00:00.000Z", 28420),
        cfdi(UUID_B, "2026-07-02T16:00:00.000Z", 31320),
        cfdi(UUID_C, "2026-08-02T16:00:00.000Z", 18000),
      ]);
      await insertPaymentComplements(sql, [
        {
          uuid: COMPLEMENT_A,
          relatedCfdiUuid: UUID_A,
          paidAt: "2026-06-18T15:00:00.000Z",
          paidAmount: 28420,
          synthetic: true,
        },
      ]);
      await insertInstruction(
        sql,
        instruction("INS-PAID", "2026-07-16T15:00:00.000Z", {
          cfdiUuids: [UUID_B],
        }),
      );
      await insertInstruction(
        sql,
        instruction("INS-PENDING", "2026-08-13T15:00:00.000Z", {
          cfdiUuids: [UUID_C],
        }),
      );
      // Only the sent one counts. UUID_C is still in this week's run, so
      // nothing has been deducted for it and it is not an exposure yet.
      await markInstructionSent(sql, "INS-PAID", "2026-07-16T17:00:00.000Z");

      const paid = await listPaidCfdisByIssuer(sql, supplier.rfc);
      expect(paid.map((row) => row.uuid)).toEqual([UUID_A, UUID_B]);
      expect(await listPaidCfdisByIssuer(sql, "SYN010101AAA")).toEqual([]);
    });
  });

  describe("the verified beneficiary registry", () => {
    const xml =
      '<SPEI_Tercero claveRastreo="SYNCEP20260910001" sintetico="true">\n  <Beneficiario Nombre="CONSULTORÍA FISCAL ANÁHUAC SC" />\n</SPEI_Tercero>';

    it("stores the CEP byte for byte and reads it back", async () => {
      await upsertSupplier(sql, { ...supplier, knownAccounts: [] });
      const record = {
        supplierRfc: supplier.rfc,
        clabe: "030580000999000119",
        cep: {
          claveRastreo: "SYNCEP20260910001",
          transferredAt: "2026-09-10T16:44:12.000Z",
          amount: 0.01,
          senderName: "Metalmecanica Sintetica de Apodaca SA de CV",
          senderBank: "058",
          beneficiaryName: "CONSULTORÍA FISCAL ANÁHUAC SC",
          beneficiaryAccount: "030580000999000119",
          beneficiaryBank: "030",
          beneficiaryRfc: "NA",
          numeroCertificado: "00001000000504465028",
          signatureValid: false,
          signatureReason: "unconfirmed_scheme",
          xml,
          synthetic: true,
        },
        nameMatch: "partial" as const,
        verifiedAt: "2026-09-10T16:45:00.000Z",
      };
      await upsertVerifiedBeneficiary(sql, record);
      const stored = await getVerifiedBeneficiary(
        sql,
        supplier.rfc,
        record.clabe,
      );
      expect(stored).toEqual(record);
      expect(await listVerifiedBeneficiaries(sql)).toEqual([record]);
      expect(
        await getVerifiedBeneficiary(sql, supplier.rfc, "000000000000000000"),
      ).toBeUndefined();

      // A second verification of the same account replaces the evidence.
      await upsertVerifiedBeneficiary(sql, {
        ...record,
        nameMatch: "match",
        cep: {
          ...record.cep,
          signatureValid: true,
          signatureReason: "verified",
        },
      });
      const replaced = await getVerifiedBeneficiary(
        sql,
        supplier.rfc,
        record.clabe,
      );
      expect(replaced?.nameMatch).toBe("match");
      expect(replaced?.cep.signatureValid).toBe(true);
      expect((await countSentryOne(sql)).beneficiaries).toBe(1);
    });
  });

  describe("the bank mirror", () => {
    it("reads ledger_tx rows back into the one shape the engine takes", async () => {
      const rows = [
        {
          id: "8f0f6c56-1b0c-4bd4-9d6c-3a1e8e0b2c11",
          accountId: "acc-synthetic-mtx",
          occurredAt: "2026-09-10T06:00:00.000Z",
          amount: 18400,
          direction: "debit" as const,
          source: "seed",
          raw: { day: "2026-09-10", synthetic: true },
        },
        {
          id: "8f0f6c56-1b0c-4bd4-9d6c-3a1e8e0b2c12",
          accountId: "acc-synthetic-mtx",
          occurredAt: "2026-09-04T06:00:00.000Z",
          amount: 150000,
          direction: "debit" as const,
          merchantId: "m-1",
          category: "proveedores",
          source: "nessie",
          raw: {},
        },
      ];
      expect(await insertLedgerTx(sql, rows)).toBe(2);
      const read = await listLedgerTx(sql, "acc-synthetic-mtx");
      expect(read.map((row) => row.id)).toEqual([rows[1]?.id, rows[0]?.id]);
      expect(read[1]).toEqual(rows[0]);
      expect(read[0]).toEqual(rows[1]);
    });

    /**
     * The edge `bun run nessie:mirror --import` turns on: the generator's rows
     * for one account are replaced by what Nessie answered, and nothing else in
     * the ledger moves.
     */
    it("deletes one account's rows from one source and leaves the rest", async () => {
      const rows = [
        {
          id: "1a0f6c56-1b0c-4bd4-9d6c-3a1e8e0b2c21",
          accountId: "acc-company",
          occurredAt: "2026-09-10T12:00:00.000Z",
          amount: 18400,
          direction: "debit" as const,
          source: "seed",
          raw: {},
        },
        {
          id: "1a0f6c56-1b0c-4bd4-9d6c-3a1e8e0b2c22",
          accountId: "acc-company",
          occurredAt: "2026-09-04T12:00:00.000Z",
          amount: 150000,
          direction: "debit" as const,
          source: "nessie",
          raw: {},
        },
        {
          id: "1a0f6c56-1b0c-4bd4-9d6c-3a1e8e0b2c23",
          accountId: "acc-other",
          occurredAt: "2026-09-04T12:00:00.000Z",
          amount: 900,
          direction: "debit" as const,
          source: "seed",
          raw: {},
        },
      ];
      expect(await insertLedgerTx(sql, rows)).toBe(3);

      expect(await deleteLedgerTxBySource(sql, "acc-company", "seed")).toBe(1);
      expect(
        (await listLedgerTx(sql, "acc-company")).map((row) => row.source),
      ).toEqual(["nessie"]);
      // Another account's rows from the same source are untouched.
      expect(await countLedgerTx(sql, "acc-other")).toBe(1);
      // A second import finds nothing left to delete, which is what makes it safe
      // to run twice before a rehearsal.
      expect(await deleteLedgerTxBySource(sql, "acc-company", "seed")).toBe(0);
    });
  });

  /**
   * supplier_weekly_outflow is one name over two definitions: the plain view in
   * 0007 and, where the extension exists, the continuous aggregate that replaces
   * it in 0008. These cases run against whichever one this server has, and every
   * assertion is about the contract both of them owe, never about the shape of
   * one. On the local PostgreSQL 18 the plain view is what answers, which is the
   * offline demo path, and that is worth a run before every rehearsal.
   */
  describe("supplier_weekly_outflow and the behaviour detector feed", () => {
    const OTHER_RFC = "SYN880101T44";
    const NOW = "2026-09-10T22:00:00.000Z";
    /** 2026-08-31 and 2026-09-07 are both Mondays. */
    const FIRST_WEEK = "2026-08-31T00:00:00.000Z";
    const SECOND_WEEK = "2026-09-07T00:00:00.000Z";

    /** Deterministic and valid: the uuid column is a uuid, not text. */
    function uuidOf(index: number): string {
      return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
    }

    /**
     * Writes an invoice the way the loader does: the projection row and the
     * `cfdi_received` event that is the system of record, at the same instant.
     * The aggregate reads the event ledger, so an invoice written to only one of
     * the two would make the two disagree, which is what the totals below check.
     */
    async function receive(
      uuid: string,
      issuedAt: string,
      total: number,
      issuerRfc: string = supplier.rfc,
    ): Promise<Cfdi> {
      const row: Cfdi = { ...cfdi(uuid, issuedAt, total), issuerRfc };
      await insertCfdis(sql, [row]);
      await appendLedgerEvent(sql, {
        type: "cfdi_received",
        at: issuedAt,
        cfdi: row,
      });
      return row;
    }

    /** The fixture every case in this group reads. */
    async function seedInvoices(): Promise<Cfdi[]> {
      await upsertSupplier(sql, supplier);
      return [
        await receive(uuidOf(1), "2026-08-31T15:00:00.000Z", 1000.1),
        await receive(uuidOf(2), "2026-09-06T23:59:59.000Z", 2500.2),
        await receive(uuidOf(3), "2026-09-07T00:00:00.000Z", 99.99),
        // A second issuer, which is the denominator of the concentration
        // signal and must never land in this supplier's own series.
        await receive(uuidOf(4), "2026-09-07T05:00:00.000Z", 400, OTHER_RFC),
      ];
    }

    it("cuts the bucket on Monday 00:00 UTC, not on the local week", async () => {
      await seedInvoices();

      const weeks = await supplierWeeklyOutflow(sql, supplier.rfc);

      // The second invoice is 23:59:59 UTC on a Sunday, which is Sunday 17:59
      // in Monterrey. Cutting the week locally would move it into the next
      // bucket and the detector would read a week that never happened.
      expect(weeks).toEqual([
        {
          week: FIRST_WEEK,
          invoices: 2,
          outflow: 3500.3,
          maxInvoice: 2500.2,
        },
        {
          week: SECOND_WEEK,
          invoices: 1,
          outflow: 99.99,
          maxInvoice: 99.99,
        },
      ]);
    });

    it("totals the same pesos the cfdis table holds, to the cent", async () => {
      const written = await seedInvoices();

      const weeks = await supplierWeeklyOutflow(sql, supplier.rfc);
      const mine = written.filter((row) => row.issuerRfc === supplier.rfc);

      // 1000.10 + 2500.20 + 99.99 is 3600.2900000000004 as a float sum. The
      // aggregate adds in numeric and sumAmounts adds in cents, so both say
      // 3600.29 and the two paths agree on money rather than nearly agreeing.
      expect(sumAmounts(weeks.map((week) => week.outflow))).toBe(
        sumAmounts(mine.map((row) => row.total)),
      );
      expect(sumAmounts(weeks.map((week) => week.outflow))).toBe(3600.29);
    });

    it("counts the CFDI events and nothing else in the ledger", async () => {
      await seedInvoices();
      await appendLedgerEvents(sql, [
        {
          type: "payment_sent",
          at: "2026-09-08T18:00:00.000Z",
          instructionId: "INS-1",
        },
        {
          type: "instruction_received",
          at: "2026-09-08T18:00:00.000Z",
          instruction: instruction("INS-1", "2026-09-08T18:00:00.000Z"),
        },
      ]);

      const weeks = await supplierWeeklyOutflow(sql, supplier.rfc);
      expect(weeks.map((week) => week.invoices)).toEqual([2, 1]);
    });

    it("keeps a second issuer out of this supplier's series", async () => {
      await seedInvoices();

      const others = await supplierWeeklyOutflow(sql, OTHER_RFC);
      expect(others).toEqual([
        { week: SECOND_WEEK, invoices: 1, outflow: 400, maxInvoice: 400 },
      ]);
    });

    it("hands the behaviour detector its input with nothing in between", async () => {
      await seedInvoices();

      const history = await supplierHistory(sql, supplier.rfc, 4, { now: NOW });
      if (history === undefined) {
        throw new Error("the supplier was written, so it has to come back");
      }

      // The whole point of the shape: no mapping step, no second object.
      const assessment = assessSupplierBehaviour(history);
      expect(assessment.supplierRfc).toBe(supplier.rfc);
      // Three invoices is below the eight the detector needs, and it says so
      // instead of firing on a sample that cannot carry a test.
      expect(assessment.gate).toBe("insufficient_history");
      expect(assessment.finding).toBeNull();

      expect(history.now).toBe(NOW);
      expect(history.weeks.map((week) => week.week)).toEqual([
        FIRST_WEEK,
        SECOND_WEEK,
      ]);
    });

    it("reads every issuer into cfdis, because that is the denominator", async () => {
      await seedInvoices();

      const history = await supplierHistory(sql, supplier.rfc, 4, { now: NOW });

      // Handed one supplier's invoices the concentration signal would read
      // every supplier as 100 percent of the spend.
      expect(history?.cfdis.map((row) => row.issuerRfc)).toContain(OTHER_RFC);
      expect(history?.cfdis).toHaveLength(4);
    });

    it("bounds the invoices by the window and keeps the partial first bucket", async () => {
      await seedInvoices();

      // One week back from Thursday 22:00 is the previous Thursday, which is
      // inside the bucket that opened on Monday 2026-08-31.
      const history = await supplierHistory(sql, supplier.rfc, 1, { now: NOW });

      expect(history?.cfdis.map((row) => row.uuid)).toEqual([
        uuidOf(2),
        uuidOf(3),
        uuidOf(4),
      ]);
      // The bucket containing the lower bound still belongs to the window:
      // filtering on the raw instant would start the series a week late.
      expect(history?.weeks.map((week) => week.week)).toEqual([
        FIRST_WEEK,
        SECOND_WEEK,
      ]);
    });

    it("answers undefined for an RFC we hold no supplier row for", async () => {
      await seedInvoices();
      expect(await supplierHistory(sql, "SYN770707Q99", 4, { now: NOW })).toBe(
        undefined,
      );
    });

    it("refuses a window that is not a positive number of weeks", async () => {
      await upsertSupplier(sql, supplier);
      expect(
        supplierHistory(sql, supplier.rfc, 0, { now: NOW }),
      ).rejects.toThrow(RangeError);
      expect(
        supplierHistory(sql, supplier.rfc, 4, { now: "no" }),
      ).rejects.toThrow(RangeError);
    });

    it("answers an empty series for a supplier that has never invoiced", async () => {
      await upsertSupplier(sql, supplier);

      const history = await supplierHistory(sql, supplier.rfc, 4, { now: NOW });
      expect(history?.weeks).toEqual([]);
      expect(history?.cfdis).toEqual([]);
      // Empty is a real answer and not a missing one: the detector gates on it.
      expect(assessSupplierBehaviour(history as SupplierHistory).gate).toBe(
        "insufficient_history",
      );
    });
  });

  it("truncates every table, and counts say so", async () => {
    await upsertSupplier(sql, supplier);
    await appendLedgerEvent(sql, {
      type: "payment_sent",
      at: "2026-09-08T18:00:00.000Z",
      instructionId: "INS-1",
    });
    await truncateSentryOne(sql);
    const counts = await countSentryOne(sql);
    expect(Object.values(counts).every((count) => count === 0)).toBe(true);
  });
});

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
import { createSql, type Sql } from "./index";
import { migrate } from "./migrate";
import {
  appendLedgerEvent,
  appendLedgerEvents,
  countCeptinela,
  countLedgerEvents,
  currentPaymentRun,
  findingsFor,
  findingsForSubjects,
  findingsForSupplier,
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
  listSatVersions,
  listSuppliers,
  listUnassessedInstructions,
  listVerifiedBeneficiaries,
  lookupSatEntries,
  markInstructionSent,
  readLedger,
  recordKnownAccount,
  truncateCeptinela,
  truncateLedger,
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
    await truncateCeptinela(sql);
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
      expect((await countCeptinela(sql)).decisions).toBe(2);
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
      expect((await countCeptinela(sql)).beneficiaries).toBe(1);
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
  });

  it("truncates every table, and counts say so", async () => {
    await upsertSupplier(sql, supplier);
    await appendLedgerEvent(sql, {
      type: "payment_sent",
      at: "2026-09-08T18:00:00.000Z",
      instructionId: "INS-1",
    });
    await truncateCeptinela(sql);
    const counts = await countCeptinela(sql);
    expect(Object.values(counts).every((count) => count === 0)).toBe(true);
  });
});

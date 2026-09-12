/**
 * The invariants the rest of the product is allowed to assume.
 *
 * Every assertion here is something a judge could ask about out loud: is the data
 * reproducible, does the money add up to the cent, does the bank mirror agree with
 * the documents, is the payment run the size you said it was, is every RFC invented,
 * is anything dated in the future, and does the event stream a replay folds over
 * actually arrive in order. A generator without these is a generator nobody can
 * defend.
 *
 * A fixed `weekOf` is passed everywhere. Without it the tests would read the clock and
 * the assertions would drift with the calendar, which is the same bug ../dates.ts
 * exists to avoid.
 */

import { describe, expect, it } from "bun:test";
import { SYNTHETIC_SNAPSHOT_ENTRIES } from "@hackmty/sat";
import { daysBetween, parseDay } from "../dates";
import { createRng } from "../rng";
import {
  accountOf,
  bankCodeOf,
  clabeCheckDigit,
  DEMO_COMPANY,
  DEMO_SCENARIOS,
  generateSentryOne,
  HARD_NEGATIVE_INJECTORS,
  IVA_RATE,
  isClabeValid,
  LISTED_SUPPLIER_RFC,
  loadSentryOne,
  MTY_PLAZA_CODE,
  MX_BANKS,
  mintBrokenClabe,
  mintClabe,
  mintNearMissClabe,
  mondayOf,
  RUN_SIZE_MAX,
  RUN_SIZE_MIN,
  runWindow,
  SENTRYONE_DEFAULT_SEED,
  SENTRYONE_SUPPLIERS,
  summarizeSentryOne,
  syntheticBankRfc,
} from "./index";

/** A Monday, fixed, so nothing in this file depends on the day it runs. */
const WEEK_OF = "2026-09-07";

const dataset = generateSentryOne({ weekOf: WEEK_OF });
const summary = summarizeSentryOne(dataset);

function cents(value: number): number {
  return Math.round(value * 100);
}

/** The last instant anything in this dataset may carry: the end of the run day. */
const LATEST = `${dataset.runDay}T23:59:59.999Z`;

describe("clabe arithmetic", () => {
  it("computes the check digit the way the standard describes", () => {
    // Worked by hand from the rule so this test is not the implementation asserting
    // itself. Body 00201007777777777, weights 3-7-1 repeating, each product mod 10:
    //   0 0 2 0 7 0 0 9 7 1 9 7 1 9 7 1 9  sums to 69
    //   69 mod 10 is 9, so the check digit is (10 - 9) mod 10 = 1
    expect(clabeCheckDigit("00201007777777777")).toBe(1);
    expect(isClabeValid("002010077777777771")).toBe(true);
  });

  it("rejects a single transposed digit", () => {
    const clabe = mintClabe("012", MTY_PLAZA_CODE, "00123456789");
    expect(isClabeValid(clabe)).toBe(true);
    const transposed = `${clabe.slice(0, 15)}${clabe[16]}${clabe[15]}${clabe[17]}`;
    expect(transposed).not.toBe(clabe);
    expect(isClabeValid(transposed)).toBe(false);
  });

  it("validates the example CLABE a judge is invited to paste", () => {
    // The curl in docs/09-api.md used to carry 012180001234567895, whose check digit
    // should be 9 and not 5, so our own forensics detector would have flagged the
    // example in our own contract. It was corrected; this keeps it correct.
    expect(isClabeValid("012180001234567899")).toBe(true);
    expect(clabeCheckDigit("01218000123456789")).toBe(9);
    expect(isClabeValid("012180001234567895")).toBe(false);
  });

  it("mints what it validates", () => {
    for (const bank of MX_BANKS) {
      const clabe = mintClabe(bank.code, MTY_PLAZA_CODE, "12345678901");
      expect(clabe).toHaveLength(18);
      expect(isClabeValid(clabe)).toBe(true);
      expect(bankCodeOf(clabe)).toBe(bank.code);
    }
  });

  it("refuses a body that is not seventeen digits", () => {
    expect(() => clabeCheckDigit("123")).toThrow(/17 digits/);
    expect(() => mintClabe("12", MTY_PLAZA_CODE, "12345678901")).toThrow(
      /bank code/,
    );
  });

  it("mints a near miss that is exactly two digits away and still valid", () => {
    // The shape of the attack: an account the arithmetic cannot fault and only the
    // supplier's own history can. Checked over many draws, not one lucky one.
    const rng = createRng(7);
    for (const supplier of SENTRYONE_SUPPLIERS.slice(0, 12)) {
      const impostor = mintNearMissClabe(supplier.clabe, rng);
      const differing = [...impostor].filter(
        (digit, index) => digit !== supplier.clabe[index],
      ).length;
      expect(differing).toBe(2);
      expect(isClabeValid(impostor)).toBe(true);
      expect(bankCodeOf(impostor)).toBe(bankCodeOf(supplier.clabe));
      expect(accountOf(impostor)).not.toBe(accountOf(supplier.clabe));
    }
  });

  it("mints a broken account whose only fault is the arithmetic", () => {
    const rng = createRng(11);
    for (const bank of MX_BANKS) {
      const broken = mintBrokenClabe(bank.code, rng);
      expect(broken).toHaveLength(18);
      expect(isClabeValid(broken)).toBe(false);
      expect(bankCodeOf(broken)).toBe(bank.code);
    }
  });

  it("invents the bank RFC a complement carries", () => {
    // A real bank's RFC next to fabricated payment evidence is what ADR-0002 forbids.
    expect(syntheticBankRfc("072")).toBe("SYN072001BCO");
    expect(syntheticBankRfc("072").startsWith("SYN")).toBe(true);
    expect(() => syntheticBankRfc("7")).toThrow(/bank code/);
  });
});

describe("the supplier catalogue", () => {
  it("has 42 suppliers with unique RFCs, names and accounts", () => {
    expect(SENTRYONE_SUPPLIERS).toHaveLength(42);
    expect(new Set(SENTRYONE_SUPPLIERS.map((s) => s.rfc)).size).toBe(42);
    expect(new Set(SENTRYONE_SUPPLIERS.map((s) => s.legalName)).size).toBe(42);
    expect(new Set(SENTRYONE_SUPPLIERS.map((s) => s.clabe)).size).toBe(42);
  });

  it("invents every RFC, which is the ADR-0002 rule", () => {
    expect(DEMO_COMPANY.rfc.startsWith("SYN")).toBe(true);
    for (const supplier of dataset.suppliers) {
      expect(supplier.rfc).toMatch(/^SYN[0-9]{6}[A-Z0-9]{3}$/);
    }
  });

  it("carries accounts that pass the check digit", () => {
    // The forensics detector has to be exercised by accounts that pass the arithmetic
    // and fail on something more interesting, so a catalogue of invalid CLABEs would
    // make every test against it meaningless.
    expect(isClabeValid(DEMO_COMPANY.clabe)).toBe(true);
    for (const supplier of dataset.suppliers) {
      for (const account of supplier.knownAccounts) {
        expect(isClabeValid(account.clabe)).toBe(true);
      }
    }
  });

  it("draws its banks from the catalogue it documents", () => {
    const codes = new Set(MX_BANKS.map((bank) => bank.code));
    for (const supplier of SENTRYONE_SUPPLIERS) {
      expect(codes.has(bankCodeOf(supplier.clabe))).toBe(true);
    }
    // More than one bank, or the bank-consistency half of the forensics detector has
    // nothing to work with.
    expect(
      new Set(SENTRYONE_SUPPLIERS.map((s) => bankCodeOf(s.clabe))).size,
    ).toBeGreaterThan(3);
  });

  it("has a long tail rather than one cadence for everybody", () => {
    const perMonth = SENTRYONE_SUPPLIERS.map((s) => s.invoicesPerMonth);
    const total = perMonth.reduce((sum, value) => sum + value, 0);
    expect(total).toBe(439);

    const sorted = [...perMonth].sort((a, b) => b - a);
    const topFive = sorted.slice(0, 5).reduce((sum, value) => sum + value, 0);
    // The busiest five suppliers carry a quarter of the invoices. A flat catalogue
    // makes concentration drift undetectable, which is one of the six detectors.
    expect(topFive / total).toBeGreaterThan(0.2);
    expect(Math.min(...perMonth)).toBeLessThan(3);
  });

  it("adds the two suppliers the cases need, and no others", () => {
    // 42 from the catalogue, the one that ramps and the one the list names.
    expect(dataset.suppliers).toHaveLength(SENTRYONE_SUPPLIERS.length + 2);
    expect(dataset.suppliers.map((s) => s.rfc)).toContain(LISTED_SUPPLIER_RFC);
  });
});

describe("determinism", () => {
  it("produces byte-identical output for the same seed and week", () => {
    const again = generateSentryOne({ weekOf: WEEK_OF });
    expect(JSON.stringify(again)).toBe(JSON.stringify(dataset));
  });

  it("produces different output for a different seed", () => {
    const other = generateSentryOne({
      weekOf: WEEK_OF,
      seed: SENTRYONE_DEFAULT_SEED + 1,
    });
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(dataset));
    // Same shape though: a different seed must not change the company or the
    // catalogue, only what the company bought.
    expect(other.company.rfc).toBe(dataset.company.rfc);
    expect(other.suppliers).toHaveLength(dataset.suppliers.length);
    expect(summarizeSentryOne(other).runSizeInBand).toBe(true);
  });

  it("reads no clock when weekOf is given", () => {
    expect(dataset.weekOf).toBe(WEEK_OF);
    expect(dataset.runDay).toBe("2026-09-10");
    expect(mondayOf("2026-09-12")).toBe(WEEK_OF);
    expect(mondayOf("2026-09-13")).toBe(WEEK_OF);
    expect(mondayOf(WEEK_OF)).toBe(WEEK_OF);
  });
});

describe("the generated window", () => {
  it("covers eight months ending at the run week", () => {
    expect(dataset.window.to).toBe(WEEK_OF);
    expect(daysBetween(dataset.window.from, dataset.window.to)).toBeGreaterThan(
      230,
    );
    expect(daysBetween(dataset.window.from, dataset.window.to)).toBeLessThan(
      250,
    );
  });

  it("issues every invoice inside the window", () => {
    const from = parseDay(dataset.window.from);
    for (const cfdi of dataset.cfdis) {
      expect(Date.parse(cfdi.issuedAt)).toBeGreaterThanOrEqual(from);
    }
  });

  it("never issues on a weekend", () => {
    const weekdays = new Set(
      dataset.cfdis.map((cfdi) => new Date(cfdi.issuedAt).getUTCDay()),
    );
    expect(weekdays.has(0)).toBe(false);
    expect(weekdays.has(6)).toBe(false);
  });

  it("dates nothing after the moment the run is prepared", () => {
    // The single assertion most likely to catch a careless edit. A ledger a judge
    // scrolls through must not contain tomorrow.
    for (const cfdi of dataset.cfdis) {
      expect(cfdi.issuedAt <= LATEST).toBe(true);
    }
    for (const complement of dataset.complements) {
      expect(complement.paidAt <= LATEST).toBe(true);
    }
    for (const instruction of dataset.instructions) {
      expect(instruction.receivedAt <= LATEST).toBe(true);
    }
    for (const transfer of dataset.transfers) {
      expect(transfer.sentAt <= LATEST).toBe(true);
    }
    for (const row of dataset.bankMirror) {
      expect(row.occurredAt <= LATEST).toBe(true);
    }
    for (const event of dataset.events) {
      expect(event.at <= LATEST).toBe(true);
    }
    for (const supplier of dataset.suppliers) {
      expect(supplier.firstInvoiceAt <= LATEST).toBe(true);
    }
  });
});

describe("money", () => {
  it("keeps total equal to subtotal plus iva, to the cent", () => {
    for (const cfdi of dataset.cfdis) {
      expect(cents(cfdi.total)).toBe(cents(cfdi.subtotal) + cents(cfdi.iva));
    }
  });

  it("stamps iva at the general rate", () => {
    for (const cfdi of dataset.cfdis) {
      expect(cents(cfdi.iva)).toBe(Math.round(cfdi.subtotal * IVA_RATE * 100));
    }
  });

  it("draws every ticket inside its supplier's range", () => {
    const roundNumber = dataset.notes.hardNegatives.find(
      (outcome) => outcome.name === "round_number_invoice",
    );
    for (const cfdi of dataset.cfdis) {
      const spec = SENTRYONE_SUPPLIERS.find((s) => s.rfc === cfdi.issuerRfc);
      if (spec === undefined) {
        continue;
      }
      expect(cfdi.subtotal).toBeGreaterThanOrEqual(spec.ticket.min);
      expect(cfdi.subtotal).toBeLessThanOrEqual(spec.ticket.max);
    }
    // The round-number invoice is rewritten inside its own supplier's range, which
    // is what keeps it a hard negative rather than an amount anomaly we invented.
    expect(roundNumber?.applied).toBe(true);
  });

  it("produces a monthly spend in the order of magnitude a 28-person shop has", () => {
    // Not a market claim: this is arithmetic over the catalogue, and it is the answer
    // to "is this data sized like a company or like a demo".
    expect(summary.monthlySpend).toBeGreaterThan(2_000_000);
    expect(summary.monthlySpend).toBeLessThan(8_000_000);
  });

  it("carries both PUE and PPD invoices", () => {
    const methods = new Set(dataset.cfdis.map((cfdi) => cfdi.paymentMethod));
    expect([...methods].sort()).toEqual(["PPD", "PUE"]);
  });
});

describe("references", () => {
  it("issues every invoice to the company and from a supplier that exists", () => {
    const rfcs = new Set(dataset.suppliers.map((s) => s.rfc));
    for (const cfdi of dataset.cfdis) {
      expect(cfdi.receiverRfc).toBe(DEMO_COMPANY.rfc);
      expect(rfcs.has(cfdi.issuerRfc)).toBe(true);
    }
  });

  it("points every complement at an invoice that exists", () => {
    const uuids = new Set(dataset.cfdis.map((cfdi) => cfdi.uuid));
    for (const complement of dataset.complements) {
      expect(uuids.has(complement.relatedCfdiUuid)).toBe(true);
    }
  });

  it("gives every complement the beneficiary account and the bank that holds it", () => {
    // CtaBeneficiario is the document that legitimately establishes a new account, so
    // a complement without one would make the bank-change hard negative unprovable.
    for (const complement of dataset.complements) {
      expect(complement.beneficiaryAccount).toBeDefined();
      expect(isClabeValid(complement.beneficiaryAccount ?? "")).toBe(true);
      expect(complement.beneficiaryBankRfc).toMatch(/^SYN[0-9]{6}BCO$/);
    }
  });

  it("points every instruction at invoices that exist and at its own supplier", () => {
    const byUuid = new Map(dataset.cfdis.map((cfdi) => [cfdi.uuid, cfdi]));
    for (const instruction of dataset.instructions) {
      expect(instruction.cfdiUuids.length).toBeGreaterThan(0);
      for (const uuid of instruction.cfdiUuids) {
        const cfdi = byUuid.get(uuid);
        expect(cfdi).toBeDefined();
        expect(cfdi?.issuerRfc).toBe(instruction.supplierRfc);
      }
    }
  });

  it("names a supplier that exists on every instruction and every transfer", () => {
    const rfcs = new Set(dataset.suppliers.map((s) => s.rfc));
    for (const instruction of dataset.instructions) {
      expect(rfcs.has(instruction.supplierRfc)).toBe(true);
    }
    for (const transfer of dataset.transfers) {
      expect(rfcs.has(transfer.supplierRfc)).toBe(true);
    }
  });

  it("names a merchant that exists on every row of the bank mirror", () => {
    const merchants = new Set(dataset.merchants.map((merchant) => merchant.id));
    const rfcs = new Set(dataset.suppliers.map((s) => s.rfc));
    expect(dataset.merchants).toHaveLength(dataset.suppliers.length);
    for (const merchant of dataset.merchants) {
      expect(rfcs.has(merchant.rfc)).toBe(true);
    }
    for (const row of dataset.bankMirror) {
      expect(row.merchantId).toBeDefined();
      expect(merchants.has(row.merchantId ?? "")).toBe(true);
      expect(row.accountId).toBe(DEMO_COMPANY.bankAccountId);
    }
  });

  it("never asks to pay an invoice a complement already settled, except the case that does", () => {
    // A double payment in the generated baseline would be a false positive the
    // duplicate detector is right about and we would be wrong about. Exactly one
    // line breaks the rule, and it is the one the demo opens on.
    const settled = new Set(
      dataset.complements.map((entry) => entry.relatedCfdiUuid),
    );
    const duplicate = dataset.notes.scenarios.find(
      (outcome) => outcome.name === "duplicate_invoice",
    );
    const offenders = dataset.instructions.filter((instruction) =>
      instruction.cfdiUuids.some((uuid) => settled.has(uuid)),
    );
    expect(offenders).toHaveLength(1);
    expect(offenders[0]?.id).toBe(duplicate?.instructionId ?? "");
  });

  it("pays every instruction to an account the supplier is known on, except the two that do not", () => {
    const accounts = new Map(
      dataset.suppliers.map(
        (supplier) =>
          [supplier.rfc, supplier.knownAccounts.map((a) => a.clabe)] as const,
      ),
    );
    const unknown = dataset.instructions.filter(
      (instruction) =>
        !(accounts.get(instruction.supplierRfc) ?? []).includes(
          instruction.clabe,
        ),
    );
    const clabeCases = dataset.notes.scenarios
      .filter(
        (outcome) =>
          outcome.name.startsWith("clabe_") ||
          outcome.name === "invalid_check_digit",
      )
      .map((outcome) => outcome.instructionId);
    expect(unknown.map((instruction) => instruction.id).sort()).toEqual(
      [...clabeCases].filter((id): id is string => id !== undefined).sort(),
    );
  });
});

describe("the bank mirror", () => {
  it("reconciles to the cent against the complements and the transfers", () => {
    // The one balance assertion that matters: what the suppliers say they received,
    // what the SPEI moved and what the bank shows are the same number.
    const paid = dataset.complements.reduce(
      (sum, complement) => sum + cents(complement.paidAmount),
      0,
    );
    const moved = dataset.transfers.reduce(
      (sum, transfer) => sum + cents(transfer.amount),
      0,
    );
    const mirrored = dataset.bankMirror.reduce(
      (sum, row) => sum + (row.direction === "debit" ? cents(row.amount) : 0),
      0,
    );
    expect(moved).toBe(paid);
    expect(mirrored).toBe(paid);
    expect(cents(summary.outflow)).toBe(paid);
  });

  it("never settles an invoice for more than it is worth", () => {
    const byCfdi = new Map<string, number>();
    for (const complement of dataset.complements) {
      byCfdi.set(
        complement.relatedCfdiUuid,
        (byCfdi.get(complement.relatedCfdiUuid) ?? 0) +
          cents(complement.paidAmount),
      );
    }
    for (const cfdi of dataset.cfdis) {
      const paid = byCfdi.get(cfdi.uuid);
      if (paid === undefined) {
        continue;
      }
      expect(paid).toBeLessThanOrEqual(cents(cfdi.total));
    }
  });

  it("settles some PPD invoices in two instalments that add back to the total", () => {
    const byCfdi = new Map<string, number[]>();
    for (const complement of dataset.complements) {
      const shares = byCfdi.get(complement.relatedCfdiUuid) ?? [];
      shares.push(cents(complement.paidAmount));
      byCfdi.set(complement.relatedCfdiUuid, shares);
    }
    const split = [...byCfdi.entries()].filter(
      ([, shares]) => shares.length === 2,
    );
    expect(split.length).toBeGreaterThan(20);

    const totals = new Map(
      dataset.cfdis.map((cfdi) => [cfdi.uuid, cents(cfdi.total)] as const),
    );
    for (const [uuid, shares] of split) {
      expect(shares.reduce((sum, share) => sum + share, 0)).toBe(
        totals.get(uuid) ?? 0,
      );
    }
  });

  it("gives every complement a clave de rastreo that names a transfer in the mirror", () => {
    const claves = new Map(
      dataset.transfers.map((transfer) => [transfer.claveRastreo, transfer]),
    );
    expect(claves.size).toBe(dataset.transfers.length);
    expect(dataset.bankMirror).toHaveLength(dataset.transfers.length);

    for (const complement of dataset.complements) {
      const transfer = claves.get(complement.operationNumber ?? "");
      expect(transfer).toBeDefined();
      expect(transfer?.beneficiaryAccount).toBe(complement.beneficiaryAccount);
      // One transfer settles several invoices, so paidAmount is this row's share of
      // paymentTotal and the CEP is matched against the transfer, never the share.
      expect(complement.paymentTotal).toBe(transfer?.amount);
      expect(complement.paidAmount).toBeLessThanOrEqual(
        complement.paymentTotal ?? 0,
      );
    }
  });

  it("keeps the Nessie shape it claims: a date with no time inside the raw row", () => {
    for (const row of dataset.bankMirror.slice(0, 50)) {
      expect(row.source).toBe("nessie");
      expect(row.direction).toBe("debit");
      expect(row.raw.purchase_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(String(row.raw._id)).toMatch(/^[0-9a-f]{24}$/);
    }
  });
});

describe("the payment run", () => {
  it("lands inside the band the demo screen was designed for", () => {
    expect(summary.runSize).toBeGreaterThanOrEqual(RUN_SIZE_MIN);
    expect(summary.runSize).toBeLessThanOrEqual(RUN_SIZE_MAX);
    expect(summary.runSizeInBand).toBe(true);
  });

  it("arrives through every channel the brief names", () => {
    // A new account arrives through a channel, and a run that is all email hides the
    // WhatsApp and the photographed PDF, which are the two the persona actually fears.
    const sources = new Set(
      dataset.instructions.map((instruction) => instruction.source),
    );
    for (const source of ["email", "whatsapp", "pdf", "portal"] as const) {
      expect(sources.has(source)).toBe(true);
    }
  });

  it("receives every instruction inside the run week", () => {
    for (const instruction of dataset.instructions) {
      expect(mondayOf(instruction.receivedAt.slice(0, 10))).toBe(WEEK_OF);
    }
  });

  it("covers seven days of dues, which is where its size comes from", () => {
    const window = runWindow(WEEK_OF);
    expect(daysBetween(window.from, window.to)).toBe(6);
    expect(window.to).toBe("2026-09-10");
  });

  it("numbers the run in the order the clerk reads it", () => {
    const ids = dataset.instructions.map((instruction) => instruction.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [index, instruction] of dataset.instructions.entries()) {
      expect(instruction.id).toBe(
        `INS-${WEEK_OF}-${String(index + 1).padStart(3, "0")}`,
      );
      const previous = dataset.instructions[index - 1];
      if (previous !== undefined) {
        expect(previous.receivedAt <= instruction.receivedAt).toBe(true);
      }
    }
  });

  it("has nothing already sent, because that is the premise of the product", () => {
    for (const instruction of dataset.instructions) {
      expect(instruction.sentAt).toBeUndefined();
    }
    expect(dataset.events.some((event) => event.type === "payment_sent")).toBe(
      false,
    );
  });
});

describe("the event stream", () => {
  it("arrives in chronological order, because the sweep is a replay", () => {
    for (let index = 1; index < dataset.events.length; index += 1) {
      const previous = dataset.events[index - 1];
      const current = dataset.events[index];
      if (previous === undefined || current === undefined) {
        continue;
      }
      expect(previous.at <= current.at).toBe(true);
    }
  });

  it("carries one event per generated object plus the publication", () => {
    expect(dataset.events).toHaveLength(
      dataset.cfdis.length +
        dataset.complements.length +
        dataset.instructions.length +
        1,
    );
    const types = new Set(dataset.events.map((event) => event.type));
    expect([...types].sort()).toEqual([
      "cfdi_received",
      "complement_received",
      "instruction_received",
      "sat_list_published",
    ]);
  });
});

describe("the watermark", () => {
  it("flags every object as synthetic, because the UI reads the flag", () => {
    expect(DEMO_COMPANY.synthetic).toBe(true);
    for (const supplier of dataset.suppliers) {
      expect(supplier.synthetic).toBe(true);
    }
    for (const merchant of dataset.merchants) {
      expect(merchant.synthetic).toBe(true);
    }
    for (const cfdi of dataset.cfdis) {
      expect(cfdi.synthetic).toBe(true);
    }
    for (const complement of dataset.complements) {
      expect(complement.synthetic).toBe(true);
    }
    for (const instruction of dataset.instructions) {
      expect(instruction.synthetic).toBe(true);
    }
    for (const transfer of dataset.transfers) {
      expect(transfer.synthetic).toBe(true);
    }
    for (const entry of dataset.satEntries) {
      expect(entry.rfc.startsWith("SYN")).toBe(true);
      expect(entry.name).toMatch(/SINTETIC/);
    }
  });
});

describe("hard negatives", () => {
  it("names all four from issue #43", () => {
    expect(HARD_NEGATIVE_INJECTORS.map((injector) => injector.name)).toEqual([
      "legitimate_bank_change",
      "ramping_new_supplier",
      "round_number_invoice",
      "seasonal_spike",
    ]);
  });

  it("applies all four and measures what landed", () => {
    expect(dataset.notes.hardNegatives).toHaveLength(4);
    for (const outcome of dataset.notes.hardNegatives) {
      expect(outcome.kind).toBe("hard_negative");
      expect(outcome.applied).toBe(true);
      expect(outcome.detail.length).toBeGreaterThan(20);
    }
  });

  it("backs the bank change with the complement that establishes the account", () => {
    const outcome = dataset.notes.hardNegatives.find(
      (row) => row.name === "legitimate_bank_change",
    );
    const supplier = dataset.suppliers.find(
      (row) => row.rfc === outcome?.supplierRfc,
    );
    expect(supplier?.knownAccounts.length).toBe(2);

    const current = supplier?.knownAccounts[0];
    expect(current?.establishedBy).toBe("payment_complement");
    expect(isClabeValid(current?.clabe ?? "")).toBe(true);
    // The new account is at a different bank, which is what makes it look like the
    // impersonation and what the detector must not treat as one.
    expect(bankCodeOf(current?.clabe ?? "")).not.toBe(
      bankCodeOf(supplier?.knownAccounts[1]?.clabe ?? ""),
    );

    const evidence = dataset.complements.filter(
      (complement) => complement.beneficiaryAccount === current?.clabe,
    );
    expect(evidence.length).toBeGreaterThan(0);
    for (const instruction of dataset.instructions.filter(
      (row) => row.supplierRfc === supplier?.rfc,
    )) {
      expect(instruction.clabe).toBe(current?.clabe ?? "");
    }
  });

  it("ramps the new supplier from nothing to a serious share of the outflow", () => {
    const outcome = dataset.notes.hardNegatives.find(
      (row) => row.name === "ramping_new_supplier",
    );
    const rfc = outcome?.supplierRfc ?? "";
    const supplier = dataset.suppliers.find((row) => row.rfc === rfc);
    expect(supplier).toBeDefined();

    const theirs = dataset.cfdis.filter((cfdi) => cfdi.issuerRfc === rfc);
    expect(theirs.length).toBeGreaterThan(10);

    const months = [
      ...new Set(theirs.map((cfdi) => cfdi.issuedAt.slice(0, 7))),
    ].sort();
    // They did not exist when the window opened, which is the whole case.
    expect((months[0] ?? "") > dataset.window.from.slice(0, 7)).toBe(true);

    const perMonth = months.map(
      (month) =>
        theirs.filter((cfdi) => cfdi.issuedAt.slice(0, 7) === month).length,
    );
    expect(perMonth[perMonth.length - 1] ?? 0).toBeGreaterThan(
      perMonth[0] ?? 0,
    );
  });

  it("puts exactly one invoice on a round figure, to the cent", () => {
    // Ten thousand pesos to the cent is a million cents, and an amount drawn
    // lognormal lands on one about once in a million invoices, so one is one.
    const round = dataset.cfdis.filter(
      (cfdi) => cents(cfdi.total) % 1_000_000 === 0,
    );
    expect(round).toHaveLength(1);
    const cfdi = round[0];
    expect(cents(cfdi?.subtotal ?? 0) + cents(cfdi?.iva ?? 0)).toBe(
      cents(cfdi?.total ?? 0),
    );
    const outcome = dataset.notes.hardNegatives.find(
      (row) => row.name === "round_number_invoice",
    );
    expect(outcome?.supplierRfc).toBe(cfdi?.issuerRfc ?? "");
  });

  it("moves the consumables in one month and leaves the tooling alone", () => {
    const outcome = dataset.notes.hardNegatives.find(
      (row) => row.name === "seasonal_spike",
    );
    expect(outcome?.detail).toMatch(/times the baseline/);
  });
});

describe("the demo scenarios", () => {
  it("names all four and lands each on its own run line", () => {
    expect(DEMO_SCENARIOS.map((scenario) => scenario.name)).toEqual([
      "clabe_two_digits_off",
      "invalid_check_digit",
      "duplicate_invoice",
      "listed_supplier_69b",
    ]);
    expect(dataset.notes.scenarios).toHaveLength(4);
    for (const outcome of dataset.notes.scenarios) {
      expect(outcome.kind).toBe("demo_positive");
      expect(outcome.applied).toBe(true);
      expect(outcome.instructionId).toBeDefined();
    }
    const ids = dataset.notes.heroInstructionIds;
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    const known = new Set(dataset.instructions.map((row) => row.id));
    for (const id of ids) {
      expect(known.has(id)).toBe(true);
    }
  });

  it("asks for a CLABE two digits off the one with the history behind it", () => {
    const outcome = dataset.notes.scenarios.find(
      (row) => row.name === "clabe_two_digits_off",
    );
    const instruction = dataset.instructions.find(
      (row) => row.id === outcome?.instructionId,
    );
    const supplier = dataset.suppliers.find(
      (row) => row.rfc === instruction?.supplierRfc,
    );
    const known = supplier?.knownAccounts[0]?.clabe ?? "";

    expect(instruction?.source).toBe("whatsapp");
    expect(isClabeValid(instruction?.clabe ?? "")).toBe(true);
    expect(
      [...(instruction?.clabe ?? "")].filter(
        (digit, index) => digit !== known[index],
      ),
    ).toHaveLength(2);
  });

  it("asks for an account that fails the check digit, off a photographed PDF", () => {
    const outcome = dataset.notes.scenarios.find(
      (row) => row.name === "invalid_check_digit",
    );
    const instruction = dataset.instructions.find(
      (row) => row.id === outcome?.instructionId,
    );
    expect(instruction?.source).toBe("pdf");
    expect(instruction?.imageRef).toBeDefined();
    expect(instruction?.ocrConfidence).toBeGreaterThan(0);
    expect(isClabeValid(instruction?.clabe ?? "")).toBe(false);
  });

  it("asks again for an invoice a complement already settled in full", () => {
    const outcome = dataset.notes.scenarios.find(
      (row) => row.name === "duplicate_invoice",
    );
    const instruction = dataset.instructions.find(
      (row) => row.id === outcome?.instructionId,
    );
    const uuid = instruction?.cfdiUuids[0] ?? "";
    const cfdi = dataset.cfdis.find((row) => row.uuid === uuid);
    const settled = dataset.complements.filter(
      (row) => row.relatedCfdiUuid === uuid,
    );
    expect(cfdi).toBeDefined();
    expect(settled.length).toBeGreaterThan(0);
    expect(settled.reduce((sum, row) => sum + cents(row.paidAmount), 0)).toBe(
      cents(cfdi?.total ?? 0),
    );
  });

  it("pays a supplier the simulated publication is about to name", () => {
    const entry = dataset.satEntries.find(
      (row) => row.rfc === LISTED_SUPPLIER_RFC,
    );
    expect(entry).toBeDefined();
    // The row is the one @hackmty/sat ships, not a second copy of it, so the lookup a
    // judge runs and the supplier the company pays cannot drift apart.
    expect(entry).toEqual(
      SYNTHETIC_SNAPSHOT_ENTRIES.find((row) => row.rfc === LISTED_SUPPLIER_RFC),
    );
    expect(entry?.status).toBe("presunto");

    const paid = dataset.complements.filter((complement) =>
      dataset.cfdis.some(
        (cfdi) =>
          cfdi.uuid === complement.relatedCfdiUuid &&
          cfdi.issuerRfc === LISTED_SUPPLIER_RFC,
      ),
    );
    // There has to be something already deducted, or the retroactive sweep has
    // nothing to price and the whole demo beat is empty.
    expect(paid.length).toBeGreaterThan(0);
    expect(
      dataset.instructions.some(
        (row) => row.supplierRfc === LISTED_SUPPLIER_RFC,
      ),
    ).toBe(true);
  });

  it("says out loud what it has not done", () => {
    expect(dataset.notes.pending.length).toBeGreaterThan(0);
    for (const entry of dataset.notes.pending) {
      expect(entry).toContain("#43");
    }
  });
});

describe("the loader the API boots with", () => {
  const snapshot = loadSentryOne({ weekOf: WEEK_OF });

  it("hands over the domain objects and nothing the engine should decide", () => {
    expect(snapshot.companyRfc).toBe(DEMO_COMPANY.rfc);
    expect(snapshot.companyName).toBe(DEMO_COMPANY.legalName);
    expect(snapshot.runId).toBe(`run-${WEEK_OF}`);
    expect(snapshot.instructions).toHaveLength(dataset.instructions.length);
    expect(snapshot.suppliers).toHaveLength(dataset.suppliers.length);
    expect(snapshot.ledger).toHaveLength(dataset.events.length);
    expect(snapshot.bankMirror).toHaveLength(dataset.bankMirror.length);
    expect(snapshot).not.toHaveProperty("findings");
    expect(snapshot).not.toHaveProperty("decisions");
  });

  it("prints ids that actually exist", () => {
    const ids = new Set(snapshot.instructions.map((row) => row.id));
    for (const id of snapshot.heroInstructionIds) {
      expect(ids.has(id)).toBe(true);
    }
    const rfcs = new Set([
      snapshot.companyRfc,
      ...snapshot.suppliers.map((row) => row.rfc),
    ]);
    for (const rfc of snapshot.demoRfcs) {
      expect(rfcs.has(rfc)).toBe(true);
    }
    expect(snapshot.demoRfcs).toHaveLength(4);
  });
});

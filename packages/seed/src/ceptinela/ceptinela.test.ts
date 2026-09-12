/**
 * The invariants the rest of the product is allowed to assume.
 *
 * Every assertion here is something a judge could ask about out loud: is the data
 * reproducible, does the money add up to the cent, is the payment run the size you said
 * it was, is every RFC invented, and does the event stream a replay folds over actually
 * arrive in order. A generator without these is a generator nobody can defend.
 *
 * A fixed `weekOf` is passed everywhere. Without it the tests would read the clock and
 * the assertions would drift with the calendar, which is the same bug ../dates.ts exists
 * to avoid.
 */

import { describe, expect, it } from "bun:test";
import { daysBetween, parseDay } from "../dates";
import {
  bankCodeOf,
  CEPTINELA_DEFAULT_SEED,
  CEPTINELA_SUPPLIERS,
  clabeCheckDigit,
  DEMO_COMPANY,
  generateCeptinela,
  HARD_NEGATIVE_INJECTORS,
  IVA_RATE,
  isClabeValid,
  MTY_PLAZA_CODE,
  MX_BANKS,
  mintClabe,
  mondayOf,
  RUN_SIZE_MAX,
  RUN_SIZE_MIN,
  runWindow,
  summarizeCeptinela,
} from "./index";

/** A Monday, fixed, so nothing in this file depends on the day it runs. */
const WEEK_OF = "2026-09-07";

const dataset = generateCeptinela({ weekOf: WEEK_OF });
const summary = summarizeCeptinela(dataset);

function cents(value: number): number {
  return Math.round(value * 100);
}

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

  it("shows that the example CLABE in docs/09-api.md fails the check digit", () => {
    // Found while writing this. The curl a judge is invited to paste carries
    // 012180001234567895, whose check digit should be 9, not 5. Our own forensics
    // detector would flag the example in our own contract.
    // TODO(fabbyyyy): fix the example in docs/09-api.md to 012180001234567899 and
    // delete this test. It exists to keep the bug from being forgotten, not to
    // enshrine it.
    expect(isClabeValid("012180001234567895")).toBe(false);
    expect(clabeCheckDigit("01218000123456789")).toBe(9);
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
});

describe("the supplier catalogue", () => {
  it("has 42 suppliers with unique RFCs, names and accounts", () => {
    expect(CEPTINELA_SUPPLIERS).toHaveLength(42);
    expect(new Set(CEPTINELA_SUPPLIERS.map((s) => s.rfc)).size).toBe(42);
    expect(new Set(CEPTINELA_SUPPLIERS.map((s) => s.legalName)).size).toBe(42);
    expect(new Set(CEPTINELA_SUPPLIERS.map((s) => s.clabe)).size).toBe(42);
  });

  it("invents every RFC, which is the ADR-0002 rule", () => {
    expect(DEMO_COMPANY.rfc.startsWith("SYN")).toBe(true);
    for (const supplier of CEPTINELA_SUPPLIERS) {
      expect(supplier.rfc).toMatch(/^SYN[0-9]{6}[A-Z0-9]{3}$/);
    }
  });

  it("carries accounts that pass the check digit", () => {
    // The forensics detector has to be exercised by accounts that pass the arithmetic
    // and fail on something more interesting, so a catalogue of invalid CLABEs would
    // make every test against it meaningless.
    expect(isClabeValid(DEMO_COMPANY.clabe)).toBe(true);
    for (const supplier of CEPTINELA_SUPPLIERS) {
      expect(isClabeValid(supplier.clabe)).toBe(true);
    }
  });

  it("draws its banks from the catalogue it documents", () => {
    const codes = new Set(MX_BANKS.map((bank) => bank.code));
    for (const supplier of CEPTINELA_SUPPLIERS) {
      expect(codes.has(bankCodeOf(supplier.clabe))).toBe(true);
    }
    // More than one bank, or the bank-consistency half of the forensics detector has
    // nothing to work with.
    expect(
      new Set(CEPTINELA_SUPPLIERS.map((s) => bankCodeOf(s.clabe))).size,
    ).toBeGreaterThan(3);
  });

  it("has a long tail rather than one cadence for everybody", () => {
    const perMonth = CEPTINELA_SUPPLIERS.map((s) => s.invoicesPerMonth);
    const total = perMonth.reduce((sum, value) => sum + value, 0);
    expect(total).toBe(439);

    const sorted = [...perMonth].sort((a, b) => b - a);
    const topFive = sorted.slice(0, 5).reduce((sum, value) => sum + value, 0);
    // The busiest five suppliers carry a quarter of the invoices. A flat catalogue
    // makes concentration drift undetectable, which is one of the six detectors.
    expect(topFive / total).toBeGreaterThan(0.2);
    expect(Math.min(...perMonth)).toBeLessThan(3);
  });
});

describe("determinism", () => {
  it("produces byte-identical output for the same seed and week", () => {
    const again = generateCeptinela({ weekOf: WEEK_OF });
    expect(JSON.stringify(again)).toBe(JSON.stringify(dataset));
  });

  it("produces different output for a different seed", () => {
    const other = generateCeptinela({
      weekOf: WEEK_OF,
      seed: CEPTINELA_DEFAULT_SEED + 1,
    });
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(dataset));
    // Same shape though: a different seed must not change the company or the catalogue.
    expect(other.suppliers).toHaveLength(dataset.suppliers.length);
    expect(other.company.rfc).toBe(dataset.company.rfc);
  });

  it("reads no clock when weekOf is given", () => {
    expect(dataset.weekOf).toBe(WEEK_OF);
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

  it("never issues on a Sunday", () => {
    const weekdays = new Set(
      dataset.cfdis.map((cfdi) => new Date(cfdi.issuedAt).getUTCDay()),
    );
    expect(weekdays.has(0)).toBe(false);
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
    const specs = new Map(CEPTINELA_SUPPLIERS.map((s) => [s.rfc, s] as const));
    for (const cfdi of dataset.cfdis) {
      const spec = specs.get(cfdi.issuerRfc);
      expect(spec).toBeDefined();
      if (spec === undefined) {
        continue;
      }
      expect(cfdi.subtotal).toBeGreaterThanOrEqual(spec.ticket.min);
      expect(cfdi.subtotal).toBeLessThanOrEqual(spec.ticket.max);
    }
  });

  it("produces a monthly spend in the order of magnitude a 28-person shop has", () => {
    // Not a market claim: this is arithmetic over the catalogue, and it is the answer
    // to "is this data sized like a company or like a demo".
    expect(summary.monthlySpend).toBeGreaterThan(2_000_000);
    expect(summary.monthlySpend).toBeLessThan(6_000_000);
  });
});

describe("references", () => {
  it("issues every invoice to the company and from a known supplier", () => {
    const rfcs = new Set(CEPTINELA_SUPPLIERS.map((s) => s.rfc));
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

  it("never asks to pay an invoice a complement already settled", () => {
    // A double payment in the generated baseline would be a false positive the
    // duplicate detector is right about and we would be wrong about.
    const settled = new Set(
      dataset.complements.map((entry) => entry.relatedCfdiUuid),
    );
    for (const instruction of dataset.instructions) {
      for (const uuid of instruction.cfdiUuids) {
        expect(settled.has(uuid)).toBe(false);
      }
    }
  });

  it("pays every instruction to an account the supplier is known on", () => {
    const accounts = new Map(
      dataset.suppliers.map(
        (supplier) =>
          [supplier.rfc, supplier.knownAccounts.map((a) => a.clabe)] as const,
      ),
    );
    for (const instruction of dataset.instructions) {
      expect(accounts.get(instruction.supplierRfc)).toContain(
        instruction.clabe,
      );
    }
  });
});

describe("the payment run", () => {
  it("lands inside the band the demo screen was designed for", () => {
    expect(summary.runSize).toBeGreaterThanOrEqual(RUN_SIZE_MIN);
    expect(summary.runSize).toBeLessThanOrEqual(RUN_SIZE_MAX);
    expect(summary.runSizeInBand).toBe(true);
  });

  it("arrives through more than one channel", () => {
    // A new account arrives through a channel, and a run that is all email hides the
    // WhatsApp and the photographed PDF, which are the two the persona actually fears.
    const sources = new Set(
      dataset.instructions.map((instruction) => instruction.source),
    );
    expect(sources.size).toBeGreaterThan(2);
  });

  it("receives every instruction inside the run week", () => {
    for (const instruction of dataset.instructions) {
      expect(instruction.receivedAt >= `${WEEK_OF}T00:00`).toBe(true);
      expect(mondayOf(instruction.receivedAt.slice(0, 10))).toBe(WEEK_OF);
    }
  });

  it("covers seven days of dues, which is where its size comes from", () => {
    // 439 invoices a month over seven days is about 101 lines. A four-day window
    // would quietly produce 55 and nobody would know why the screen looked thin.
    const window = runWindow(WEEK_OF);
    expect(daysBetween(window.from, window.to)).toBe(6);
    expect(window.to).toBe("2026-09-10");
  });

  it("gives every instruction a unique id", () => {
    const ids = new Set(dataset.instructions.map((i) => i.id));
    expect(ids.size).toBe(dataset.instructions.length);
  });
});

describe("the event stream", () => {
  it("arrives in chronological order, because the sweep is a replay", () => {
    for (let index = 1; index < dataset.events.length; index += 1) {
      const previous = dataset.events[index - 1];
      const current = dataset.events[index];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (previous === undefined || current === undefined) {
        continue;
      }
      expect(previous.at <= current.at).toBe(true);
    }
  });

  it("carries one event per generated object and nothing else", () => {
    expect(dataset.events).toHaveLength(
      dataset.cfdis.length +
        dataset.complements.length +
        dataset.instructions.length,
    );
    const types = new Set(dataset.events.map((event) => event.type));
    expect([...types].sort()).toEqual([
      "cfdi_received",
      "complement_received",
      "instruction_received",
    ]);
  });
});

describe("the watermark", () => {
  it("flags every object as synthetic, because the UI reads the flag", () => {
    expect(DEMO_COMPANY.synthetic).toBe(true);
    for (const supplier of dataset.suppliers) {
      expect(supplier.synthetic).toBe(true);
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

  it("reports itself as not applied rather than claiming a case it did not inject", () => {
    // The honest half of a scaffold: notes.hardNegatives must never say a case is in
    // the dataset when the injector body is still a TODO.
    expect(dataset.notes.hardNegatives).toHaveLength(4);
    for (const outcome of dataset.notes.hardNegatives) {
      expect(outcome.applied).toBe(false);
      expect(outcome.detail).toContain("TODO(Apanawa)");
    }
  });

  it("lists what is still open, so bun run seed can print it", () => {
    expect(dataset.notes.pending.length).toBeGreaterThan(0);
    for (const entry of dataset.notes.pending) {
      expect(entry).toContain("#43");
    }
  });

  it("leaves the hero instruction to the engine", () => {
    // The hero is whichever line carries the highest amountAtRisk, and that is the
    // engine's answer. A generator that picks it is a generator marking its own work.
    expect(dataset.notes.heroInstructionId).toBeUndefined();
  });
});

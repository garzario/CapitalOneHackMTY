/**
 * The figures the judged documents quote have to be the figures the generator
 * produces.
 *
 * This test exists because they were not. `docs/02-persona.md` claimed a
 * reference run of 92 invoices totalling MXN 673,460.27 over 42 suppliers,
 * `docs/03-user-journey.md` repeated the total, and `docs/print/one-pager.html`
 * printed all three on a sheet meant to be handed to a judge on paper. The
 * generator was producing MXN 2,174,210.76 over 44 suppliers. Nobody wrote a
 * wrong number: the numbers were right when they were written and the seed
 * moved underneath them.
 *
 * That is the failure mode worth automating against, because it is silent. The
 * persona is rubric row 12 and the one-pager is physical, and both invite the
 * reader to check: "Seed 69 output for week 2026-09-07" is an instruction to go
 * and run it. A judge who does and gets a different answer has learned
 * something about the whole repository, not just about that row.
 *
 * When this test fails, the generator changed. Read the numbers it reports and
 * update the three documents; do not adjust the expectations here to match a
 * document, because the document is not the source of truth.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateCeptinela } from "./generator";

/** The exact run the three documents cite. */
const SEED = 69;
const WEEK_OF = "2026-09-07";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");

const PERSONA = join(REPO_ROOT, "docs", "02-persona.md");
const JOURNEY = join(REPO_ROOT, "docs", "03-user-journey.md");
const ONE_PAGER = join(REPO_ROOT, "docs", "print", "one-pager.html");

const dataset = generateCeptinela({ seed: SEED, weekOf: WEEK_OF });

const instructions = dataset.instructions.length;
const suppliers = dataset.suppliers.length;
const runTotal = dataset.instructions.reduce(
  (sum, instruction) => sum + instruction.amount,
  0,
);
const settledCfdis = new Set(
  dataset.instructions.flatMap((instruction) => instruction.cfdiUuids),
).size;

/** Grouping thousands the way the documents write them. */
function grouped(value: number, decimals: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("the reference run the documents cite", () => {
  test("is still the dataset those documents were written against", () => {
    /* A guard on the guard. If the generator starts returning nothing, every
       "the document contains this number" assertion below would be comparing
       against zero and could pass by accident. */
    expect(instructions).toBeGreaterThan(0);
    expect(suppliers).toBeGreaterThan(0);
    expect(runTotal).toBeGreaterThan(0);
    expect(dataset.weekOf).toBe(WEEK_OF);
  });
});

describe("docs/02-persona.md", () => {
  const source = read(PERSONA);

  test("quotes the instruction count of the reference run", () => {
    expect(source).toContain(`${instructions} payment instructions`);
  });

  test("quotes the pesos leaving in the reference run", () => {
    /* The figure that was wrong by more than a factor of three. */
    expect(source).toContain(`MXN ${grouped(runTotal, 2)}`);
  });

  test("quotes the supplier count", () => {
    expect(source).toContain(`${suppliers} active synthetic suppliers`);
  });

  test("quotes the CFDIs the run settles", () => {
    expect(source).toContain(`settling ${settledCfdis} CFDIs`);
  });

  test("names the company the generator actually builds", () => {
    expect(source).toContain(dataset.company.legalName);
  });

  test("still leaves the venue interviews unchecked", () => {
    /* Two conversations with real people cannot be done by anyone working in
       this repository, and a ticked box here would be a fabricated claim about
       research. It stays unchecked until a human ticks it. */
    expect(source).toContain("- [ ] Ask one accountant");
    expect(source).toContain("- [ ] Ask one administrative clerk");
  });
});

describe("docs/03-user-journey.md", () => {
  const source = read(JOURNEY);

  test("quotes the same run as the persona", () => {
    expect(source).toContain(
      `${instructions} payment instructions totaling MXN ${grouped(runTotal, 2)}`,
    );
  });
});

describe("docs/print/one-pager.html", () => {
  const source = read(ONE_PAGER);

  test("prints the instruction count", () => {
    expect(source).toContain(`<strong>${instructions}</strong>`);
  });

  test("prints the supplier count", () => {
    expect(source).toContain(`<strong>${suppliers}</strong>`);
  });

  test("prints the run total to two significant figures", () => {
    /* The sheet says "MXN 2.17M" because a stat tile has no room for pesos and
       centavos. Rounded down, never up: a printed figure a judge can check
       should never overstate. */
    const millions = Math.floor(runTotal / 10_000) / 100;

    expect(source).toContain(`MXN ${millions.toFixed(2)}M`);
  });
});

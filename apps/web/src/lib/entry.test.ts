/**
 * The entry screen makes two kinds of claim and both are checkable, so both are
 * checked here rather than read.
 *
 * The first is about the gate. Each row of the capability list says which rule it
 * is about, and the row carries the request that rule is asked of: if those two
 * ever stop matching, the screen would be explaining one rule while showing the
 * verdict of another, which is worse than showing nothing. The verdict itself is
 * `packages/core`'s, so what is tested here is the wiring and the direction
 * (an owner may do a clerk's work and never the other way round), not the rule.
 *
 * The second is about the numbers. Every threshold on screen names the file and
 * the constant it came from, and these tests open that file and look. A row that
 * survives a rename would print an address a judge cannot follow, which is the
 * one thing this repository's rule about numbers exists to prevent.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Actor, DecideRule } from "@hackmty/core";
import { CAPABILITIES, capabilityVerdict, THRESHOLDS } from "./entry";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");

const CLERK: Actor = { name: "Lupita Elizondo", role: "clerk" };
const OWNER: Actor = { name: "Gerardo Villarreal", role: "owner" };

describe("the capability list", () => {
  test("covers the three shapes of a decision, once each", () => {
    /* The union is closed in `packages/core/src/actor.ts`. A fourth rule added
       there has to appear on this screen, or the screen quietly stops being the
       whole answer to "what may this person do". */
    const rules: DecideRule[] = [
      "ordinary",
      "override_release",
      "reopen_cancelled",
    ];

    expect(CAPABILITIES.map((capability) => capability.id).sort()).toEqual(
      [...rules].sort(),
    );
  });

  test("each row really produces the rule it names", () => {
    /* This is the test that matters. The row's `request` is the evidence of its
       sentence, so a row that claims to be about the owner's exception while
       carrying an ordinary request would render a green badge next to prose
       saying the opposite. */
    for (const capability of CAPABILITIES) {
      expect([
        capability.id,
        capabilityVerdict(capability, CLERK).rule,
      ]).toEqual([capability.id, capability.id]);
    }
  });

  test("the clerk may do the ordinary work and neither exception", () => {
    const verdicts = new Map(
      CAPABILITIES.map((capability) => [
        capability.id,
        capabilityVerdict(capability, CLERK),
      ]),
    );

    expect(verdicts.get("ordinary")?.allowed).toBe(true);
    expect(verdicts.get("override_release")?.allowed).toBe(false);
    expect(verdicts.get("reopen_cancelled")?.allowed).toBe(false);
  });

  test("the owner may do all three, including the clerk's own work", () => {
    /* Deliberate and not accidental: the owner of a company with two people in
       it is not locked out of their own payment run. */
    for (const capability of CAPABILITIES) {
      expect([
        capability.id,
        capabilityVerdict(capability, OWNER).allowed,
      ]).toEqual([capability.id, true]);
    }
  });

  test("both exceptions demand a written reason and the ordinary one does not", () => {
    const reasonOf = (id: DecideRule) => {
      const capability = CAPABILITIES.find((row) => row.id === id);

      if (capability === undefined) {
        throw new Error(`no capability for ${id}`);
      }

      return capabilityVerdict(capability, OWNER).requiresReason;
    };

    expect(reasonOf("override_release")).toBe(true);
    expect(reasonOf("reopen_cancelled")).toBe(true);
    /* An API that refused an ordinary hold with no prose would be refused by the
       clerk instead, outside the product, where nothing is recorded at all. */
    expect(reasonOf("ordinary")).toBe(false);
  });
});

describe("the thresholds panel", () => {
  test("there are thresholds to check", () => {
    /* A guard on the guard: an empty list would pass every test below. */
    expect(THRESHOLDS.length).toBeGreaterThanOrEqual(5);
  });

  test("every row names a file that exists and the constants in it", () => {
    const missing: string[] = [];

    for (const threshold of THRESHOLDS) {
      let source = "";

      try {
        source = readFileSync(join(REPO_ROOT, threshold.file), "utf8");
      } catch {
        missing.push(`${threshold.file} is not in the repository`);
        continue;
      }

      for (const name of threshold.constants) {
        if (!source.includes(`export const ${name}`)) {
          missing.push(`${threshold.file} does not export ${name}`);
        }
      }
    }

    /* The failure this prevents: a constant renamed in `packages/core` leaves a
       screen printing an address a judge cannot follow, and nothing else fails. */
    expect(missing).toEqual([]);
  });

  test("every row says something, and says where it came from", () => {
    for (const threshold of THRESHOLDS) {
      expect([threshold.question, threshold.question.length > 0]).toEqual([
        threshold.question,
        true,
      ]);
      expect([threshold.question, threshold.value.length > 0]).toEqual([
        threshold.question,
        true,
      ]);
      expect([threshold.question, threshold.constants.length > 0]).toEqual([
        threshold.question,
        true,
      ]);
    }
  });

  test("no threshold is stated as a percentage or a probability", () => {
    /* ADR-0009 forbids a probability, a percentage or a score on any screen of
       this product. The per-severity loss priors and the concentration share are
       the two values that would break it, and both are deliberately absent: the
       rows that are here are counts, days, pesos and one robust z. */
    const offenders = THRESHOLDS.filter(
      (threshold) =>
        threshold.value.includes("%") ||
        threshold.value.toLowerCase().includes("por ciento") ||
        threshold.value.toLowerCase().includes("probabilidad"),
    );

    expect(offenders.map((threshold) => threshold.question)).toEqual([]);
  });
});

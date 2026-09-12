/**
 * The LLM boundary, asserted instead of promised.
 *
 * ADR-0004 and section 6 of docs/06-regulatory-privacy.md both say the same
 * thing: the model transcribes and the model decides nothing. That claim is only
 * worth the points it scores if a judge can check it in a few seconds, so this
 * file checks it two ways.
 *
 * 1. **Structural.** The package source is read and searched for the vocabulary
 *    of a decision. If somebody imports `decide`, returns a `Finding`, or asks
 *    the model for a recommendation, this fails and names the file.
 * 2. **Behavioural.** The prompts and the response schemas are inspected. A
 *    field a judgment could be written into is a field that will eventually
 *    carry one.
 *
 * `findClabeCandidates` and the check digit are in `postprocess.test.ts`. This
 * file is about what the package is allowed to be.
 */

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import {
  AUDIO_PROMPT,
  AUDIO_RESPONSE_SCHEMA,
  IMAGE_PROMPT,
  IMAGE_RESPONSE_SCHEMA,
} from "./extract";

const SOURCE_DIR = new URL(".", import.meta.url);

/** Every shipped source file: tests and fixtures are not part of the claim. */
function sourceFiles(): Array<{ name: string; text: string }> {
  return readdirSync(SOURCE_DIR)
    .filter((name) => name.endsWith(".ts"))
    .filter((name) => !name.endsWith(".test.ts"))
    .filter((name) => name !== "fixtures.ts")
    .map((name) => ({
      name,
      text: readFileSync(new URL(name, SOURCE_DIR), "utf8"),
    }));
}

/**
 * Identifiers that would mean this package had crossed into the decision.
 *
 * They are matched against code only. Every one of them appears in the prose of
 * this repository constantly, which is why comments are stripped first: the rule
 * is about what the package does, not about what it is allowed to explain.
 */
const FORBIDDEN = [
  "decide",
  "Finding",
  "Decision",
  "Severity",
  "detect",
  "score",
  "recommend",
  "risk",
];

/**
 * Removes block and line comments, and nothing else. The lookbehind keeps the
 * `//` of a URL from swallowing the rest of the line it sits on, which would
 * hide a violation written next to one.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(?<!:)\/\/[^\n]*/g, " ");
}

describe("the package cannot reach the decision", () => {
  it("ships at least the four modules this claim is about", () => {
    expect(
      sourceFiles()
        .map((file) => file.name)
        .sort(),
    ).toEqual(["extract.ts", "gemini.ts", "index.ts", "postprocess.ts"]);
  });

  it("names nothing from the decision layer in its code", () => {
    const offences: string[] = [];
    for (const file of sourceFiles()) {
      const code = stripComments(file.text);
      for (const word of FORBIDDEN) {
        if (new RegExp(`\\b${word}`, "i").test(code)) {
          offences.push(`${file.name} mentions ${word}`);
        }
      }
    }

    expect(offences).toEqual([]);
  });

  it("imports from core only the check digit and the normaliser", () => {
    const imports = sourceFiles()
      .flatMap(
        (file) => file.text.match(/import\s*{[^}]+}\s*from\s*"[^"]+"/g) ?? [],
      )
      .filter((statement) => statement.includes('"@hackmty/core"'));

    expect(imports).toHaveLength(1);
    expect(imports[0]).toContain("clabeCheckDigit");
    expect(imports[0]).toContain("normalizeClabe");
  });
});

describe("the model is asked to transcribe and nothing else", () => {
  it("offers no schema field a judgment could be written into", () => {
    const fields = new Set([
      ...Object.keys(IMAGE_RESPONSE_SCHEMA.properties ?? {}),
      ...Object.keys(AUDIO_RESPONSE_SCHEMA.properties ?? {}),
    ]);

    expect([...fields].sort()).toEqual([
      "amount",
      "clabe",
      "clarity",
      "rawText",
      "supplierHint",
      "transcript",
    ]);
  });

  it("forbids a guess in both prompts", () => {
    for (const prompt of [IMAGE_PROMPT, AUDIO_PROMPT]) {
      expect(prompt).toContain("Never guess a digit");
      expect(prompt).toContain("do not judge");
    }
  });

  it("sends no supplier, no history and no ledger", () => {
    for (const prompt of [IMAGE_PROMPT, AUDIO_PROMPT]) {
      expect(prompt.toLowerCase()).not.toContain("known account");
      expect(prompt.toLowerCase()).not.toContain("previous");
      expect(prompt.toLowerCase()).not.toContain("rfc");
    }
  });
});

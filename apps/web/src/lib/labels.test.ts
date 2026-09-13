/**
 * The copy rules of this product, enforced over the dictionary every screen
 * reads instead of trusted to whoever writes the next label.
 *
 * Two of them are binding and they are not style preferences.
 *
 * **Never "seguro".** ADR-0002 and ADR-0009 forbid it in any language: a SPEI
 * cannot be recalled, so nothing in this interface may promise that a payment is
 * safe. `confiable` is the strongest word available and it is a statement about
 * the documents we hold, not a guarantee about the transfer.
 *
 * **Never a probability.** No percentage and no decimal score anywhere on screen.
 * `estimateLoss` in `packages/core/src/decision.ts` says in its own comment that
 * its figure is an upper bound on the evidence rather than a calibrated
 * probability, so 0.73 next to a supplier's name would be a precision nobody
 * earned and a question the engine cannot answer.
 *
 * The third test is the coverage the compiler cannot state: that the two unions
 * ADR-0009 defines are described in words, not only coloured.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Confidence, TransactionState } from "@hackmty/core";
import * as labels from "./labels";

const SRC_DIR = join(import.meta.dir, "..");

/** Every string in the dictionary, whatever shape its export has. */
function everyLabel(): Array<{ where: string; text: string }> {
  const found: Array<{ where: string; text: string }> = [];

  for (const [name, value] of Object.entries(labels)) {
    if (typeof value === "string") {
      found.push({ where: name, text: value });
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string") found.push({ where: name, text: entry });
      }
      continue;
    }

    if (typeof value === "object" && value !== null) {
      for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === "string") {
          found.push({ where: `${name}.${key}`, text: entry });
        }
      }
    }
  }

  return found;
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (entry.name.includes(".test.")) continue;
    if (/\.(ts|tsx)$/.test(entry.name)) found.push(full);
  }

  return found.sort();
}

const all = everyLabel();

describe("the words the clerk reads", () => {
  test("there is a dictionary to check", () => {
    /* A guard on the guard: an empty list passes every assertion below. */
    expect(all.length).toBeGreaterThan(60);
  });

  test("nothing promises that a payment is safe", () => {
    /* Word boundaries, so "asegurar" and "seguramente" are not false hits: the
       forbidden thing is the verdict, in Spanish or in English. */
    const forbidden = /\b(seguro|segura|seguros|seguras|safe)\b/i;
    const offenders = all.filter((entry) => forbidden.test(entry.text));

    expect(offenders).toEqual([]);
  });

  test("no label carries a probability, a percentage or a score", () => {
    const offenders = all.filter(
      (entry) =>
        entry.text.includes("%") ||
        /\b\d+[.,]\d+\b/.test(entry.text) ||
        /\b(probabilidad|porcentaje|puntaje|score|riesgo de \d)/i.test(
          entry.text,
        ),
    );

    /* The example placeholder on the intake form is a peso amount and lives in
       its own screen, not here. A decimal in the dictionary would be a figure
       asserted about a supplier, which is the thing ADR-0009 forbids. */
    expect(offenders).toEqual([]);
  });

  test("the word seguro is absent from the rest of the interface too", () => {
    /* One file may name the words, and it is the one that bans them:
       `lib/assistant.ts` scrubs a streamed sentence against its own
       `FORBIDDEN_WORDS`, so the list has to be written down somewhere. An
       exemption with no reason is how the next one gets added, so this is the
       reason and there is exactly one entry. */
    const ALLOWED = new Set(["assistant.ts"]);

    /* The dictionary is the rule, and this is the backstop for copy written
       straight into a component. It reads the sources rather than the rendered
       DOM, which is the limitation worth stating: it proves no source says it. */
    const forbidden = /\b(seguro|segura|seguros|seguras)\b/i;
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC_DIR)) {
      if (ALLOWED.has(file.split("/").at(-1) ?? "")) continue;

      const code = readFileSync(file, "utf8");

      for (const line of code.split("\n")) {
        /* Comment lines are skipped, because the rule itself is documented in
           English prose that names the forbidden word, in this file and in
           `components/Chips.tsx`. Only quoted strings in real code count, which
           is where a label a clerk can read would live. */
        const trimmed = line.trim();
        if (
          trimmed.startsWith("//") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("/*")
        ) {
          continue;
        }

        const quoted = line.match(/"[^"]*"|'[^']*'/g) ?? [];

        for (const text of quoted) {
          if (forbidden.test(text)) offenders.push(`${file}: ${text}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("ADR-0009 vocabulary", () => {
  const levels: Confidence[] = ["confiable", "precaucion", "alerta"];
  const states: TransactionState[] = [
    "rojo",
    "cancelado",
    "enviado",
    "pendiente",
    "liberado",
  ];

  test("every level has a word, a sentence and a bar count", () => {
    expect(labels.CONFIDENCE_ORDER.toSorted()).toEqual(levels.toSorted());

    for (const level of levels) {
      expect(labels.CONFIDENCE_LABEL[level].length).toBeGreaterThan(0);
      /* A level with no explanation is a colour. The sentence is what a clerk
         reads when they ask why a line is where it is. */
      expect(labels.CONFIDENCE_HELP[level].length).toBeGreaterThan(20);
      expect(labels.CONFIDENCE_BARS[level]).toBeGreaterThanOrEqual(1);
      expect(labels.CONFIDENCE_BARS[level]).toBeLessThanOrEqual(3);
    }
  });

  test("the meter rises with the level, so it reads as a ramp", () => {
    /* `alerta` fills three bars and `confiable` one. Inverting this would make
       the chip say the opposite of the word beside it to anyone who reads the
       shape before the text, which is everybody at two metres. */
    expect(labels.CONFIDENCE_BARS.alerta).toBeGreaterThan(
      labels.CONFIDENCE_BARS.precaucion,
    );
    expect(labels.CONFIDENCE_BARS.precaucion).toBeGreaterThan(
      labels.CONFIDENCE_BARS.confiable,
    );
  });

  test("every state has a word and a sentence", () => {
    expect(labels.STATE_ORDER.toSorted()).toEqual(states.toSorted());

    for (const state of states) {
      expect(labels.STATE_LABEL[state].length).toBeGreaterThan(0);
      expect(labels.STATE_HELP[state].length).toBeGreaterThan(20);
    }
  });
});

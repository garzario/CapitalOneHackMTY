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

        /* EVIDENCE_ACTION holds an object per detector, so its words are one
           level further down and would otherwise go unchecked. */
        if (typeof entry === "object" && entry !== null) {
          for (const [inner, text] of Object.entries(entry)) {
            if (typeof text === "string") {
              found.push({ where: `${name}.${key}.${inner}`, text });
            }
          }
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

/**
 * The verdict this product may not print, matched as a word and never as a
 * substring: "aseguro" and "asegurado" are ordinary Spanish rather than a
 * promise about a transfer, and a check that fired on them is a check somebody
 * turns off. Plain ASCII, because every value in this dictionary is written
 * without accents, and declared once so the two tests that read it cannot
 * drift apart.
 */
const NEVER_SEGURO = /\b(seguro|segura|seguros|seguras)\b/i;

/* The same verdict in English, kept apart from the one above because the source
   scan may not read it: `env(safe-area-inset-bottom)` is a CSS function name in
   a quoted style, not a claim about a payment. */
const NEVER_SAFE = /\bsafe\b/i;

describe("the words the clerk reads", () => {
  test("there is a dictionary to check", () => {
    /* A guard on the guard: an empty list passes every assertion below. */
    expect(all.length).toBeGreaterThan(60);
  });

  test("nothing promises that a payment is safe", () => {
    /* Word boundaries, so "asegurar" and "seguramente" are not false hits: the
       forbidden thing is the verdict, in Spanish or in English. */
    const offenders = all.filter(
      (entry) => NEVER_SEGURO.test(entry.text) || NEVER_SAFE.test(entry.text),
    );

    expect(offenders).toEqual([]);
  });

  test("the boundary is a word and not a substring", () => {
    /* The check above must not fire on ordinary Spanish, or the next person
       deletes it instead of the word it exists for. */
    expect(
      NEVER_SEGURO.test("el proveedor me aseguro que cambio de banco"),
    ).toBe(false);
    expect(NEVER_SEGURO.test("quedo asegurado el envio")).toBe(false);
    expect(NEVER_SEGURO.test("este pago es seguro")).toBe(true);
    expect(NEVER_SEGURO.test("la cuenta es segura")).toBe(true);
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
          if (NEVER_SEGURO.test(text)) offenders.push(`${file}: ${text}`);
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

  test("every level has a word and a sentence", () => {
    expect(labels.CONFIDENCE_ORDER.toSorted()).toEqual(levels.toSorted());

    for (const level of levels) {
      expect(labels.CONFIDENCE_LABEL[level].length).toBeGreaterThan(0);
      /* A level with no explanation is a colour. The sentence is what a clerk
         reads when they ask why a line is where it is, and it is the whole of
         the second channel now that the meter beside the word is gone. */
      expect(labels.CONFIDENCE_HELP[level].length).toBeGreaterThan(20);
    }
  });

  test("every state has a word and a sentence", () => {
    expect(labels.STATE_ORDER.toSorted()).toEqual(states.toSorted());

    for (const state of states) {
      expect(labels.STATE_LABEL[state].length).toBeGreaterThan(0);
      expect(labels.STATE_HELP[state].length).toBeGreaterThan(20);
    }
  });

  test("no level or state label carries a digit or a percent sign", () => {
    /* The other half of ADR-0009: three words and never a number. A percentage
       next to a supplier's name is a precision nobody earned, because the
       expected-loss arithmetic says in its own comment that it is an upper
       bound on the evidence and not a calibrated probability. */
    const numeric = /[0-9%]/;
    const offenders = [
      ...Object.entries(labels.CONFIDENCE_LABEL),
      ...Object.entries(labels.CONFIDENCE_HELP),
      ...Object.entries(labels.STATE_LABEL),
      ...Object.entries(labels.STATE_HELP),
    ]
      .filter(([, text]) => numeric.test(text))
      .map(([key, text]) => `${key}: ${text}`);

    expect(offenders).toEqual([]);
  });

  test("every level and every state has a non-empty label, badge and help sentence", () => {
    /* The badge class is the one of the three the tests above do not reach, and
       an empty one renders an unstyled word next to five styled ones. A
       dictionary written with an empty string does not fail the type checker. */
    const missing: string[] = [];

    for (const level of levels) {
      for (const [name, value] of [
        ["CONFIDENCE_LABEL", labels.CONFIDENCE_LABEL[level]],
        ["CONFIDENCE_BADGE", labels.CONFIDENCE_BADGE[level]],
        ["CONFIDENCE_HELP", labels.CONFIDENCE_HELP[level]],
      ]) {
        if ((value ?? "").trim() === "") missing.push(`${name}.${level}`);
      }
    }

    for (const state of states) {
      for (const [name, value] of [
        ["STATE_LABEL", labels.STATE_LABEL[state]],
        ["STATE_BADGE", labels.STATE_BADGE[state]],
        ["STATE_HELP", labels.STATE_HELP[state]],
      ]) {
        if ((value ?? "").trim() === "") missing.push(`${name}.${state}`);
      }
    }

    expect(missing).toEqual([]);
    /* And the orders a facet select offers are the whole set rather than a
       subset somebody trimmed. */
    expect(labels.CONFIDENCE_ORDER).toHaveLength(
      Object.keys(labels.CONFIDENCE_LABEL).length,
    );
    expect(labels.STATE_ORDER).toHaveLength(
      Object.keys(labels.STATE_LABEL).length,
    );
  });
});

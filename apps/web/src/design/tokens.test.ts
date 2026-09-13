/**
 * The design system is a promise the codebase cannot keep on its own: nothing
 * in CSS fails when you reference a token that does not exist, or define a
 * colour that only exists in light. Both render as nothing, silently, and a
 * screenshot taken at midday in light mode shows neither.
 *
 * These tests are the enforcement. They read the real files off disk rather
 * than a fixture, because a fixture would drift from the stylesheet the app
 * actually ships.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  CONFIDENCE_BADGE,
  CONFIDENCE_ORDER,
  STATE_BADGE,
  STATE_ORDER,
} from "../lib/labels";

const DESIGN_DIR = import.meta.dir;
const SRC_DIR = join(DESIGN_DIR, "..");
const TOKENS_PATH = join(DESIGN_DIR, "tokens.css");
const PRIMITIVES_PATH = join(DESIGN_DIR, "primitives.css");

const tokensCss = readFileSync(TOKENS_PATH, "utf8");
const primitivesCss = readFileSync(PRIMITIVES_PATH, "utf8");

/** Every .ts, .tsx and .css file under src, tests excluded. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (entry.name.includes(".test.")) continue;
    if (/\.(ts|tsx|css)$/.test(entry.name)) found.push(full);
  }

  return found.sort();
}

/**
 * The body of the first brace-balanced block after `marker`. Written by hand
 * rather than with a regex because the dark theme nests `:root` inside a media
 * query, and a regex that stops at the first closing brace reads the wrong
 * block without saying so.
 */
function blockAfter(css: string, marker: string): string {
  const markerAt = css.indexOf(marker);
  if (markerAt === -1) throw new Error(`marker not in tokens.css: ${marker}`);

  const open = css.indexOf("{", markerAt);
  if (open === -1) throw new Error(`no block after marker: ${marker}`);

  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }

  throw new Error(`unbalanced block after marker: ${marker}`);
}

function definitionsIn(css: string): Set<string> {
  return new Set(
    [...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1] as string),
  );
}

/** Every declaration of a block, as name to the value as written. */
function declarationsIn(css: string): Map<string, string> {
  const found = new Map<string, string>();

  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    found.set(match[1] as string, (match[2] as string).trim());
  }

  return found;
}

/**
 * A token whose whole value is another token, like
 * `--c-level-alerta: var(--c-hold)`.
 *
 * An alias is exempt from the dark-counterpart rule below, and it is the one
 * exemption that is safe: a custom property is resolved where it is used, not
 * where it is declared, so an alias picks up whatever the token it points at is
 * worth under the current colour scheme. Redeclaring it in the dark block would
 * be the same value written twice, which is the drift the rule exists to stop.
 */
function aliasOf(value: string): string | null {
  const match = /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(value);

  return match === null ? null : (match[1] as string);
}

const files = sourceFiles(SRC_DIR);
const defined = definitionsIn(tokensCss);

describe("token definitions", () => {
  test("tokens.css is the file that defines them", () => {
    /* A guard on the guard. If the walker or the regex breaks, every other
       test in this file passes vacuously against an empty set. */
    expect(files.length).toBeGreaterThan(10);
    expect(defined.size).toBeGreaterThan(50);
  });

  test("every token the app reads is defined", () => {
    const missing: string[] = [];

    for (const file of files) {
      const css = readFileSync(file, "utf8");

      for (const match of css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
        const token = match[1] as string;
        if (!defined.has(token)) {
          missing.push(`${relative(SRC_DIR, file)} reads ${token}`);
        }
      }
    }

    /* The edge case: a typo. `var(--c-boder)` is valid CSS, resolves to
       nothing, and paints a transparent border nobody notices until a judge
       is looking at the screen. */
    expect(missing).toEqual([]);
  });

  test("every colour token has a dark counterpart, or is an alias", () => {
    const light = declarationsIn(blockAfter(tokensCss, ":root {"));
    const dark = definitionsIn(
      blockAfter(tokensCss, "@media (prefers-color-scheme: dark)"),
    );

    const colourTokens = [...light.keys()].filter((token) =>
      token.startsWith("--c-"),
    );
    const lightOnly = colourTokens.filter(
      (token) =>
        !dark.has(token) && aliasOf(light.get(token) as string) === null,
    );

    /* The edge case: a colour added to `:root` and forgotten in the dark
       block keeps its light value on a dark surface. Low-contrast ink on a
       near-black canvas is unreadable, and the person who added it was in
       light mode. */
    expect(colourTokens.length).toBeGreaterThan(20);
    expect(lightOnly).toEqual([]);
  });

  test("every alias points at a token that exists", () => {
    const light = declarationsIn(blockAfter(tokensCss, ":root {"));
    const dangling: string[] = [];

    for (const [token, value] of light) {
      const target = aliasOf(value);

      if (target !== null && !defined.has(target)) {
        dangling.push(`${token} points at ${target}`);
      }
    }

    /* The edge case the exemption above opens: an alias onto a token that was
       renamed resolves to nothing, in both themes, and paints a transparent
       chip rather than failing. */
    expect(dangling).toEqual([]);
  });
});

/**
 * The level and the state are the vocabulary of the whole product, and ADR-0009
 * makes `packages/core` the only place either is derived. The compiler already
 * fails when `lib/labels.ts` stops covering one of the two unions, because those
 * maps are `Record<Confidence, string>` and `Record<TransactionState, string>`.
 *
 * What the compiler cannot see is the stylesheet. A fourth level added to the
 * domain would reach the screens with a class nobody wrote, and a chip with no
 * rule behind it renders as unstyled text next to a peso figure. These two tests
 * are that half of the contract.
 */
describe("levels and states have a palette", () => {
  for (const level of CONFIDENCE_ORDER) {
    test(`${level} has its tokens and its class`, () => {
      for (const suffix of ["", "-soft", "-ink"]) {
        expect(defined.has(`--c-level-${level}${suffix}`)).toBe(true);
      }

      expect(CONFIDENCE_BADGE[level]).toBe(`level level-${level}`);
      expect(primitivesCss).toContain(`.level-${level} {`);
    });
  }

  for (const state of STATE_ORDER) {
    test(`${state} has its tokens and its class`, () => {
      for (const suffix of ["", "-soft", "-ink"]) {
        expect(defined.has(`--c-state-${state}${suffix}`)).toBe(true);
      }

      expect(STATE_BADGE[state]).toBe(`state state-${state}`);
      expect(primitivesCss).toContain(`.state-${state} {`);
    });
  }
});

describe("where a colour may be written", () => {
  test("no colour is written outside tokens.css", () => {
    const offenders: string[] = [];

    for (const file of files) {
      if (file === TOKENS_PATH) continue;

      const css = readFileSync(file, "utf8");
      const literals = [
        ...css.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g),
      ];

      if (literals.length > 0) {
        offenders.push(
          `${relative(SRC_DIR, file)}: ${literals.map((m) => m[0]).join(", ")}`,
        );
      }
    }

    /* The edge case this caught for real: the drawer scrim was
       `rgba(10, 12, 16, 0.45)` inline in primitives.css, so the one surface
       that needed a different value in dark mode could not have one. */
    expect(offenders).toEqual([]);
  });
});

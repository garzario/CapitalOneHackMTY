/**
 * What has to stay true about `print.css`, and the one regression worth a test.
 *
 * A print stylesheet is the easiest file in a design system to break without
 * noticing, because nothing on screen changes and nobody opens the print dialog
 * on the way to a demo. The failure is silent and it is specific: somebody adds a
 * panel that floats over the page, and from then on every printed sheet carries
 * it stamped across the content.
 *
 * So the sweep below is the point of the file. It reads the primitives for every
 * class the system positions `fixed` or `sticky`, and asks whether print has an
 * answer for each one. It is written against the source rather than against a
 * rendered page on purpose: the browser check belongs in `bun run audit:web`, and
 * this one has to fail in CI, in under a second, on the commit that introduces
 * the element rather than on the day somebody prints.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DESIGN_DIR = import.meta.dir;
/**
 * Comments are stripped before anything is read.
 *
 * Both assertions below search for CSS syntax, and both would otherwise find it
 * in prose: this file's own header explains why it declares no `@layer` by
 * writing the word, and the primitives name source files like `RunScreen.tsx`,
 * which reads as a class selector to any regex looking for one.
 */
function code(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, " ");
}

const printCss = code(readFileSync(join(DESIGN_DIR, "print.css"), "utf8"));
const primitivesCss = code(
  readFileSync(join(DESIGN_DIR, "primitives.css"), "utf8"),
);
const indexCss = readFileSync(join(DESIGN_DIR, "..", "index.css"), "utf8");

/** The `@media print` body, which is the only part of the file that applies. */
const printBlock = printCss.slice(printCss.indexOf("@media print"));

/**
 * Every class the primitives pin to the viewport.
 *
 * Read off the source rather than listed here, because a list here is a list
 * that goes stale the first time somebody adds a panel and does not think of
 * this file, which is the exact case the test exists to catch.
 */
function pinnedClasses(css: string): string[] {
  const found = new Set<string>();

  for (const match of css.matchAll(
    /(\.[a-z][a-z0-9-]*)[^{}]*\{([^{}]*)\}/g,
  )) {
    const selector = match[1] as string;
    const body = match[2] as string;

    if (/position:\s*(fixed|sticky)/.test(body)) {
      found.add(selector);
    }
  }

  return [...found].sort();
}

describe("print.css", () => {
  test("declares no layer, which is the whole of its authority", () => {
    /* Every other design system file sits in a cascade layer so a Tailwind
       utility beats it. That is right on screen and wrong on paper: an
       `overflow-hidden` utility that survives into print takes the run table off
       the page. An unlayered rule outranks every layer, so this file must not
       join one. */
    expect(printCss).not.toContain("@layer");
  });

  test("is imported after every file that could be overridden", () => {
    const imports = [...indexCss.matchAll(/@import "([^"]+)"/g)].map(
      (match) => match[1] as string,
    );

    expect(imports.at(-1)).toBe("./design/print.css");
  });

  test("answers for every class the primitives pin to the viewport", () => {
    const pinned = pinnedClasses(primitivesCss);

    /* A guard on the guard: if the regex stops matching, the assertion below
       passes over an empty set and this file protects nothing. */
    expect(pinned.length).toBeGreaterThan(2);

    const unanswered = pinned.filter(
      (selector) => !printBlock.includes(`${selector},`) && !printBlock.includes(`${selector} `),
    );

    expect(unanswered).toEqual([]);
  });

  test("writes no colour of its own", () => {
    /* The same rule tokens.test.ts enforces over the whole design system, said
       again here because this is the file most likely to break it: a print
       override is written in a hurry against a printer that is already warm, and
       a literal grey typed into a border is how the one palette becomes two. */
    expect(printBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/);
  });

  test("the paper palette is in tokens.css, and it reaches dark mode", () => {
    /* Dark mode here is `prefers-color-scheme` and nothing else: this app has no
       theme attribute, so the print block has to beat a media query rather than a
       selector. It does that by being later in the file, which is only true while
       it stays at the end. */
    const tokensCss = code(
      readFileSync(join(DESIGN_DIR, "tokens.css"), "utf8"),
    );
    const printAt = tokensCss.indexOf("@media print");
    const darkAt = tokensCss.indexOf("@media (prefers-color-scheme: dark)");

    expect(printAt).toBeGreaterThan(-1);
    expect(printAt).toBeGreaterThan(darkAt);
    expect(tokensCss.slice(printAt)).toContain("--c-canvas");
    expect(tokensCss.slice(printAt)).toContain("--c-ink");
  });

  test("reprints the table header on every sheet the run spans", () => {
    /* `position: sticky` is how the header stays put while a clerk scrolls
       ninety-two lines, and it means nothing to a printer: without this, sheet
       two of a payment run is unlabelled columns of pesos. */
    expect(printBlock).toContain("table-header-group");
  });
});

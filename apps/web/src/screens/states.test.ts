/**
 * Every screen answers for itself when there is nothing to show.
 *
 * `States.tsx` opens with the claim that "every screen in the app renders all
 * three, so none of them can blank out on a judge". That was a comment, and a
 * comment is not a guarantee: the intake screen had no empty state at all, so
 * an instruction that passed all six controls came back as a decision badge
 * with no words next to it.
 *
 * This test is the guarantee. It reads the screen sources rather than
 * rendering them, which is a real limitation and worth stating: it proves the
 * affordance is present in the file, not that it is reachable. What it does
 * buy is the case that actually happens, which is a new screen written at
 * 04:00 with a happy path and nothing else.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SCREENS_DIR = import.meta.dir;

/**
 * Screens that render no collection, so they have nothing to be empty of. Each
 * one needs a reason, because "it does not need one" is the sentence every
 * missing empty state was shipped under.
 */
const NO_COLLECTION: Record<string, string> = {
  "VerifyCallScreen.tsx":
    "renders one call and its transcript, never a list. Its absent state is the error block.",
};

function screenFiles(): string[] {
  return readdirSync(SCREENS_DIR)
    .filter((name) => name.endsWith("Screen.tsx"))
    .sort();
}

function source(name: string): string {
  return readFileSync(join(SCREENS_DIR, name), "utf8");
}

const screens = screenFiles();

describe("screen states", () => {
  test("there are screens to check", () => {
    /* A guard on the guard: a broken glob makes every test below pass over an
       empty list. Six screens are named in the product, plus the instruction
       detail and the verification call. */
    expect(screens.length).toBeGreaterThanOrEqual(6);
  });

  test("every screen says something when loading", () => {
    /* Either the skeleton, for a screen that fetches, or `aria-busy` on the
       control, for a screen that submits. A form does not need a skeleton; it
       needs a button that admits it is working. */
    const silent = screens.filter((name) => {
      const code = source(name);

      return !code.includes("<LoadingBlock") && !code.includes("aria-busy");
    });

    expect(silent).toEqual([]);
  });

  test("every screen says something when it fails", () => {
    /* No exemptions. A screen with no error branch renders nothing at all when
       the API is down, and the fallback notice does not cover a write. */
    const silent = screens.filter(
      (name) => !source(name).includes("<ErrorBlock"),
    );

    expect(silent).toEqual([]);
  });

  test("every screen that lists something says when the list is empty", () => {
    const silent = screens.filter(
      (name) =>
        !(name in NO_COLLECTION) && !source(name).includes("<EmptyBlock"),
    );

    expect(silent).toEqual([]);
  });

  test("every exemption names a screen that exists", () => {
    /* A stale exemption is worse than none: it silently excuses whatever
       screen is renamed into that filename later. */
    const stale = Object.keys(NO_COLLECTION).filter(
      (name) => !screens.includes(name),
    );

    expect(stale).toEqual([]);
  });
});

/**
 * One h1 per page, and exactly one.
 *
 * The app shipped with no `h1` anywhere: every screen title was an `h2`, so a
 * screen reader's outline began at level two under nothing, and the "jump to
 * the main heading" gesture landed nowhere.
 *
 * The fix used to live on each screen, in `SectionHeader`. It lives in the
 * shell now, because the shell grew a top bar that names the section you are
 * in on every route -- which is what an h1 is -- and a screen that also
 * rendered one would put two on the page. So the invariant moved rather than
 * relaxed: the shell owns exactly one h1, no screen writes one, and a screen
 * that still wants a page-level heading renders at most one `SectionHeader`,
 * which is now an h2 under the shell's h1.
 */
describe("the document outline", () => {
  test("the shell renders exactly one h1", () => {
    const shell = readFileSync(
      join(SCREENS_DIR, "..", "components", "AppShell.tsx"),
      "utf8",
    );

    expect(shell.match(/<h1/g) ?? []).toHaveLength(1);
  });

  test("no screen writes its own h1, so the count cannot drift", () => {
    for (const name of screenFiles()) {
      expect([name, source(name).includes("<h1")]).toEqual([name, false]);
    }
  });

  test("no screen renders two page-level headings", () => {
    for (const name of screenFiles()) {
      const uses = source(name).match(/<SectionHeader/g) ?? [];

      expect([name, uses.length <= 1]).toEqual([name, true]);
    }
  });
});

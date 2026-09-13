/**
 * The appearance, and the three things about it that are promises rather than
 * behaviour.
 *
 * **It opens light.** On a machine whose operating system is in dark mode, on a
 * borrowed projector, in a private window with no storage at all. That is the
 * whole point of the change: the app used to follow `prefers-color-scheme`, so
 * the first frame a judge saw depended on a setting nobody in this team made.
 *
 * **It is remembered.** A reload during a demo must not undo a choice somebody
 * made ten seconds earlier in front of the table.
 *
 * **It reaches the document.** `design/tokens.css` hangs the entire dark palette
 * off `:root[data-theme="dark"]`, so a store that kept the choice in memory and
 * never wrote the attribute would be a button that does nothing, with no error
 * anywhere.
 *
 * These run without a browser, so the window and the document are stubs, the
 * same way `actor.test.ts` stubs them: what is under test is that the module
 * tolerates whatever it is handed, and a browser refusing to cooperate is one of
 * the cases it has to tolerate.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyStoredTheme,
  currentTheme,
  DEFAULT_THEME,
  otherTheme,
  setTheme,
  storedTheme,
  THEME_KEY,
  THEME_LABEL,
  THEME_TOGGLE_LABEL,
  toggleTheme,
} from "./theme";

type Storage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const held = new Map(Object.entries(initial));

  return {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => {
      held.set(key, value);
    },
  };
}

/** A storage that throws on both halves, which is a private window. */
function refusingStorage(): Storage {
  return {
    getItem: () => {
      throw new Error("storage is blocked");
    },
    setItem: () => {
      throw new Error("storage is blocked");
    },
  };
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);

/**
 * The window and the document this module touches, and nothing else.
 *
 * `location` is on the window for the same reason `actor.test.ts` puts it there:
 * `bun test` shares a process across files, and a half-built window left behind
 * here makes an unrelated module throw on import.
 */
function stubBrowser(storage: Storage) {
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: storage,
      location: { search: "" },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    configurable: true,
    writable: true,
  });

  const dataset: Record<string, string> = {};

  Object.defineProperty(globalThis, "document", {
    value: { documentElement: { dataset } },
    configurable: true,
    writable: true,
  });

  return dataset;
}

/** The case where the attribute cannot be written at all. */
function stubBrowserWithoutDocument(storage: Storage) {
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: storage,
      location: { search: "" },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    configurable: true,
    writable: true,
  });

  Reflect.deleteProperty(globalThis, "document");
}

function restore(
  name: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(globalThis, name);

    return;
  }

  Object.defineProperty(globalThis, name, descriptor);
}

afterEach(() => {
  restore("window", originalWindow);
  restore("document", originalDocument);
});

describe("the appearance opens light", () => {
  test("light is the default", () => {
    expect(DEFAULT_THEME).toBe("light");
  });

  test("an empty storage is light", () => {
    stubBrowser(memoryStorage());

    expect(storedTheme()).toBe("light");
  });

  test("a storage that refuses to be read is light", () => {
    stubBrowser(refusingStorage());

    /* The edge case: a private window throws on the first read. The appearance
       is a convenience and must never be the reason a screen fails. */
    expect(storedTheme()).toBe("light");
  });

  test("a value the union does not hold is light", () => {
    stubBrowser(memoryStorage({ [THEME_KEY]: "auto" }));

    /* The edge case this closes for good: a key left behind by an older build,
       or by a hand-edited storage, that is neither of the two words. */
    expect(storedTheme()).toBe("light");
  });

  test("the operating system is never asked", () => {
    /* The regression this whole change is about. The module reads storage and
       the default, and nothing else: a `prefers-color-scheme` query anywhere in
       it would put the first frame of a demo back in somebody else's hands.

       Comments are stripped first, because the header of that file explains the
       decision by naming the media feature it does not use. */
    const source = readFileSync(join(import.meta.dir, "theme.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");

    expect(source).not.toContain("prefers-color-scheme");
    expect(source).not.toContain("matchMedia");
  });
});

describe("the choice is remembered", () => {
  test("dark survives the next read", () => {
    const storage = memoryStorage();
    stubBrowser(storage);

    setTheme("dark");

    expect(storage.getItem(THEME_KEY)).toBe("dark");
    expect(storedTheme()).toBe("dark");
  });

  test("a stored choice is what the app starts in", () => {
    const dataset = stubBrowser(memoryStorage({ [THEME_KEY]: "dark" }));

    expect(applyStoredTheme()).toBe("dark");
    expect(dataset.theme).toBe("dark");
    expect(currentTheme()).toBe("dark");
  });

  test("a storage that refuses to be written still switches this tab", () => {
    const dataset = stubBrowser(refusingStorage());

    setTheme("dark");

    /* The edge case: nothing was persisted and the toggle still has to work,
       because the alternative is a button that visibly does nothing. */
    expect(currentTheme()).toBe("dark");
    expect(dataset.theme).toBe("dark");
  });
});

describe("the choice reaches the document", () => {
  test("applying writes the attribute the stylesheet reads", () => {
    const dataset = stubBrowser(memoryStorage());

    applyStoredTheme();

    expect(dataset.theme).toBe("light");
  });

  test("switching rewrites it", () => {
    const dataset = stubBrowser(memoryStorage());

    applyStoredTheme();
    expect(toggleTheme()).toBe("dark");
    expect(dataset.theme).toBe("dark");

    expect(toggleTheme()).toBe("light");
    expect(dataset.theme).toBe("light");
  });

  test("a document that is not there is not an exception", () => {
    stubBrowserWithoutDocument(memoryStorage());

    /* The edge case: this module is imported by tests and by any tool that
       renders the app without a DOM. Nothing to paint is not a failure. */
    expect(() => applyStoredTheme()).not.toThrow();
    expect(currentTheme()).toBe("light");
  });
});

describe("the words on the button", () => {
  test("the two appearances have a name, in ASCII Spanish", () => {
    expect(THEME_LABEL.light).toBe("Claro");
    expect(THEME_LABEL.dark).toBe("Oscuro");

    for (const text of [
      THEME_LABEL.light,
      THEME_LABEL.dark,
      THEME_TOGGLE_LABEL,
    ]) {
      /* The repository's own rule: no accented characters and no emoji in UI
         copy, so a label survives every terminal, PDF and projector it lands
         on. */
      expect(text).toMatch(/^[ -~]+$/);
    }
  });

  test("the other one is the one the press produces", () => {
    expect(otherTheme("light")).toBe("dark");
    expect(otherTheme("dark")).toBe("light");
  });
});

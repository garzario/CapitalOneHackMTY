/**
 * The identity every write carries, and the two ways a selector can lose it.
 *
 * These tests run without a browser, so the storage is a stub: what is being
 * tested is that the module tolerates whatever it is handed, because the two
 * cases that matter are both a browser refusing to cooperate. A private window
 * throws on the first write, and cleared site data answers a read with
 * something unparsable. Neither may be the reason a payment run cannot be
 * decided, so both fall back to the clerk.
 *
 * The snapshot is tested by reference and not by value, because the reference is
 * the contract: `useActor` hands it to `useSyncExternalStore`, which compares
 * snapshots by identity, and a getter that built a new object per call would
 * re-render for ever.
 */

import { afterAll, afterEach, describe, expect, it, test } from "bun:test";
import type { Actor } from "@hackmty/core";
import { ACTOR_NAME_MAX_LENGTH } from "@hackmty/core";
import {
  actorHeaderValue,
  actorSnapshot,
  currentActor,
  DEFAULT_ACTOR,
  DEMO_ACTORS,
  isActorName,
  setCurrentActor,
  subscribeActor,
} from "./actor";

type Storage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/**
 * The window this module touches, and nothing else, plus the `location` every
 * other module of `src/lib` reads.
 *
 * The stub is global and `bun test` shares a process across files, so a window
 * with no `location` on it is not a local decision: `resource.ts` asks
 * `typeof window === "undefined"` and then reads `window.location.search`, so a
 * half-built stub left behind here makes an unrelated test file throw on import.
 * `restoreWindow` puts back whatever was there.
 */
function stubWindow(storage: Storage) {
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
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

function restoreWindow() {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");

    return;
  }

  Object.defineProperty(globalThis, "window", originalWindow);
}

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const held = new Map(Object.entries(initial));

  return {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => {
      held.set(key, value);
    },
  };
}

afterEach(() => {
  /* The module caches the answer, so every test sets its own and the next one
     must not read the last one's. Writing through the setter is what clears it. */
  setCurrentActor(DEFAULT_ACTOR);
});

afterAll(restoreWindow);

describe("the two people of the synthetic company", () => {
  test("the clerk is the default, because she runs the Thursday payment run", () => {
    expect(DEFAULT_ACTOR.role).toBe("clerk");
    expect(DEMO_ACTORS[0]).toEqual(DEFAULT_ACTOR);
  });

  test("there is exactly one owner, and it is the other one", () => {
    const owners = DEMO_ACTORS.filter((person) => person.role === "owner");

    expect(owners).toHaveLength(1);
    expect(DEMO_ACTORS).toHaveLength(2);
  });
});

describe("currentActor", () => {
  test("reads the choice this browser remembered", () => {
    const owner = DEMO_ACTORS[1] as Actor;

    stubWindow(memoryStorage({ "sentryone.actor": JSON.stringify(owner) }));

    expect(currentActor()).toEqual(owner);
  });

  test("falls back to the clerk on a half-written value", () => {
    /* Cleared site data, a truncated write, or somebody editing the key by hand.
       A role this product does not have is not a role. */
    stubWindow(
      memoryStorage({ "sentryone.actor": '{"name":"","role":"auditor"}' }),
    );

    expect(currentActor()).toEqual(DEFAULT_ACTOR);
  });

  test("falls back to the clerk when storage throws", () => {
    stubWindow({
      getItem: () => {
        throw new Error("storage is blocked");
      },
      setItem: () => {
        throw new Error("storage is blocked");
      },
    });

    expect(currentActor()).toEqual(DEFAULT_ACTOR);
    /* And the identity still holds for this tab: the setter swallows the throw
       rather than taking the screen down with it. */
    expect(setCurrentActor(DEMO_ACTORS[1] as Actor)).toEqual(DEMO_ACTORS[1]);
    expect(actorSnapshot()).toEqual(DEMO_ACTORS[1]);
  });
});

describe("the store the screens read", () => {
  test("the snapshot is one object until the choice changes", () => {
    stubWindow(memoryStorage());

    const first = actorSnapshot();

    expect(actorSnapshot()).toBe(first);

    setCurrentActor(DEMO_ACTORS[1] as Actor);

    expect(actorSnapshot()).not.toBe(first);
    expect(actorSnapshot()).toEqual(DEMO_ACTORS[1]);
  });

  test("a listener hears the choice, and nothing after it unsubscribes", () => {
    stubWindow(memoryStorage());

    let heard = 0;
    const stop = subscribeActor(() => {
      heard += 1;
    });

    setCurrentActor(DEMO_ACTORS[1] as Actor);
    setCurrentActor(DEMO_ACTORS[0] as Actor);

    expect(heard).toBe(2);

    stop();
    setCurrentActor(DEMO_ACTORS[1] as Actor);

    expect(heard).toBe(2);
  });
});

describe("actorHeaderValue", () => {
  test("is the form docs/09-api.md documents", () => {
    expect(actorHeaderValue({ name: "Lupita Elizondo", role: "clerk" })).toBe(
      "role=clerk; name=Lupita Elizondo",
    );
    expect(
      actorHeaderValue({ name: "Gerardo Villarreal", role: "owner" }),
    ).toBe("role=owner; name=Gerardo Villarreal");
  });
});

/**
 * The one question this module answers, and the two ways answering it wrong puts
 * a name in the ledger that nobody typed.
 *
 * Who may decide what is deliberately not tested here: `decideRequirement` in
 * `@hackmty/core` owns that rule, the API refuses on the same function, and
 * `packages/core/src/actor.test.ts` is where it is covered. A second suite over a
 * second copy of the rule is how the two come to disagree.
 */
describe("isActorName", () => {
  it("accepts a real name with its spaces", () => {
    expect(isActorName("Maria del Carmen Ruiz")).toBe(true);
  });

  it("refuses a name carrying the header separator", () => {
    /* `X-Actor` splits its pairs on `;`, and a name cut at one would put a
       different person in the ledger than the one who signed. The API refuses it
       rather than truncating, and so does the screen. */
    expect(isActorName("Ruiz; Maria")).toBe(false);
  });

  it("refuses an empty name, which the API answers 400 for anyway", () => {
    expect(isActorName("   ")).toBe(false);
  });

  it("holds the bound the header parser and the ledger share", () => {
    expect(isActorName("a".repeat(ACTOR_NAME_MAX_LENGTH))).toBe(true);
    expect(isActorName("a".repeat(ACTOR_NAME_MAX_LENGTH + 1))).toBe(false);
  });
});

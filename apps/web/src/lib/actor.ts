/**
 * Who the screens are acting as, for the header every write carries.
 *
 * `X-Actor` is required on every write endpoint (docs/09-api.md, "The actor on
 * every write"), so the client has to hold an identity before it can hold a
 * button. This module is that identity and nothing else: it is data layer and it
 * renders nothing. The selector that lets a person switch is a screen concern
 * and lives in `screens/EntryScreen.tsx`; what lives here is the store it writes
 * to and the subscription the rest of the app reads, because a screen that has
 * to be drawn differently for each of the two people cannot wait for a reload to
 * find out which one is acting.
 *
 * **It is not authentication.** There is no password, no session and no check:
 * the header is a name and a role the caller chooses, the API records it on the
 * ledger, and a deployment that needs real identity puts authentication in front
 * of the API. `docs/06-regulatory-privacy.md` section 4.4 says that in full, and
 * the demo has to say it out loud rather than letting a judge assume a login
 * exists.
 *
 * The choice is kept in `localStorage` so a reload does not hand the run back to
 * somebody else, and every read of it is defensive: a browser with storage
 * blocked still gets the clerk and still works.
 */

import type { Actor, ActorRole } from "@hackmty/core";
import { useSyncExternalStore } from "react";

export const ACTOR_HEADER = "x-actor";

/** Where the choice is remembered. Namespaced, because the origin is shared. */
const STORAGE_KEY = "sentryone.actor";

/**
 * The two people in the synthetic company.
 *
 * Lupita is the persona of `docs/02-persona.md` and the default, because she is
 * the one who runs the Thursday payment run. The owner exists because two things
 * in this product are his and the screens have to be able to be him: a release
 * over a finding, and reopening a line the run cancelled. Both names are
 * synthetic, like every other name in this repository.
 */
export const DEMO_ACTORS: readonly Actor[] = [
  { name: "Lupita Elizondo", role: "clerk" },
  { name: "Gerardo Villarreal", role: "owner" },
];

export const DEFAULT_ACTOR: Actor = DEMO_ACTORS[0] as Actor;

function isRole(value: unknown): value is ActorRole {
  return value === "clerk" || value === "owner";
}

/**
 * The identity this browser is acting as.
 *
 * Anything unreadable falls back to the clerk rather than throwing: a private
 * window, cleared site data or a half-written value must not be the reason a
 * payment run cannot be decided.
 */
export function currentActor(): Actor {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_ACTOR;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "name" in parsed &&
      "role" in parsed &&
      typeof parsed.name === "string" &&
      parsed.name.trim() !== "" &&
      isRole(parsed.role)
    ) {
      return { name: parsed.name, role: parsed.role };
    }
  } catch {
    /* Storage is a convenience here and never the source of truth. */
  }
  return DEFAULT_ACTOR;
}

/**
 * The identity as the screens read it, cached so that two renders of the same
 * choice are the same object.
 *
 * `useSyncExternalStore` compares snapshots by reference, so a getter that
 * parsed `localStorage` on every call would hand React a new object every time
 * and re-render for ever. The cache is invalidated by the two things that can
 * change the choice, the selector in this tab and another tab writing the same
 * key, and by nothing else.
 */
let cached: Actor | null = null;

const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) {
    listener();
  }
}

/** Remembers the choice. Returns the actor, so a caller can set state with it. */
export function setCurrentActor(actor: Actor): Actor {
  cached = actor;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(actor));
  } catch {
    /* A browser that refuses storage still gets the identity for this tab. */
  }

  publish();

  return actor;
}

/**
 * The identity, by reference, for a component that has to re-render when it
 * changes.
 *
 * Every write still reads `currentActor()` at the moment it is sent, which is
 * the header's own source. This is the same value for the parts of the screen
 * that have to be drawn differently for one of the two people, which is the
 * whole point of the selector: a button the API would answer `403` to is a
 * button this product must not offer.
 */
export function actorSnapshot(): Actor {
  cached ??= currentActor();

  return cached;
}

/**
 * Subscribes to the choice, including the choice made in another tab.
 *
 * The `storage` event fires on every other document of this origin and never on
 * the one that wrote, which is exactly the half this store cannot see for
 * itself: a judge with the run open on two tabs must not be told two different
 * things about who is acting.
 */
export function subscribeActor(listener: () => void): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) {
      return;
    }

    cached = null;
    publish();
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The identity this browser is acting as, live. */
export function useActor(): Actor {
  return useSyncExternalStore(subscribeActor, actorSnapshot, serverActor);
}

/** Nothing is stored where there is no browser, so the clerk is the answer. */
function serverActor(): Actor {
  return DEFAULT_ACTOR;
}

/** The header value, in the form docs/09-api.md documents. */
export function actorHeaderValue(actor: Actor = currentActor()): string {
  return `role=${actor.role}; name=${actor.name}`;
}

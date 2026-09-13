/**
 * Who the screens are acting as, for the header every write carries.
 *
 * `X-Actor` is required on every write endpoint (docs/09-api.md, "The actor on
 * every write"), so the client has to hold an identity before it can hold a
 * button. This module is that identity and nothing else: it is data layer, it
 * renders nothing, and the selector that lets a person switch is a screen
 * concern.
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

/** Remembers the choice. Returns the actor, so a caller can set state with it. */
export function setCurrentActor(actor: Actor): Actor {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(actor));
  } catch {
    /* A browser that refuses storage still gets the identity for this tab. */
  }
  return actor;
}

/** The header value, in the form docs/09-api.md documents. */
export function actorHeaderValue(actor: Actor = currentActor()): string {
  return `role=${actor.role}; name=${actor.name}`;
}

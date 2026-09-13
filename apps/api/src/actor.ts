/**
 * `X-Actor`, the header that makes the ledger answer "who".
 *
 * SentryOne holds no credentials and no session, which is a product decision and
 * not an omission: `packages/core/src/domain.ts` says on `Actor` that a payments
 * tool which asks a clerk to register before it can stop a bad payment is a tool
 * nobody opens on the Thursday of the payment run. What replaces the account is
 * this header plus an append-only ledger, so every human action in the product has
 * a name against it and a deployment that needs authentication puts it in front of
 * the API.
 *
 * The parse is deliberately strict about one thing and deliberately relaxed about
 * another, and both are in the contract in docs/09-api.md. A name may carry spaces
 * and is taken as the rest of the pair, so "Lupita Elizondo" needs no quoting. A
 * name may not carry a `;`, because the separator is the only structure this
 * header has and truncating a name at a semicolon would record a different person
 * than the one who acted.
 *
 * What this file never does is decide whether the actor is allowed to do the
 * thing. That is the route's question, it is checked on exactly one shape
 * (`owner` for a release over a finding), and mixing it in here would put an
 * authorisation rule in a parser.
 */

import type { Actor, ActorRole } from "@hackmty/core";

export const ACTOR_HEADER = "x-actor";

/** Names longer than this are refused rather than truncated. */
export const ACTOR_NAME_MAX = 120;

const ROLES: readonly ActorRole[] = ["clerk", "owner"];

/**
 * The sentence every route shows when the header is missing or malformed. One
 * message and not five, because the clerk cannot act on the difference between
 * "no role" and "bad role": both mean the caller did not say who is acting.
 */
export const ACTOR_REQUIRED = `Send the actor on the ${ACTOR_HEADER} header, for example "role=clerk; name=Lupita Elizondo". role is clerk or owner and name is 1 to ${ACTOR_NAME_MAX} characters with no semicolon.`;

/**
 * Parses `role=clerk; name=Lupita Elizondo` into an `Actor`, or `undefined`.
 *
 * Order free, whitespace tolerant, case insensitive on the keys and on the role.
 * The name keeps its own case, because it is a person's name and it is going on a
 * ledger row somebody will read out loud.
 */
export function parseActor(
  header: string | undefined | null,
): Actor | undefined {
  if (header === undefined || header === null) {
    return undefined;
  }

  let name: string | undefined;
  let role: ActorRole | undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      return undefined;
    }
    const key = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();

    if (key === "role") {
      const candidate = value.toLowerCase();
      if (!ROLES.includes(candidate as ActorRole)) {
        return undefined;
      }
      role = candidate as ActorRole;
      continue;
    }
    if (key === "name") {
      if (value === "" || value.length > ACTOR_NAME_MAX) {
        return undefined;
      }
      name = value;
      continue;
    }
    /* An unknown key is refused rather than ignored. A header that carried
       `rol=owner` and was read as "no role" would be a typo that silently
       downgrades who the ledger says acted. */
    return undefined;
  }

  if (name === undefined || role === undefined) {
    return undefined;
  }
  return { name, role };
}

/** The actor on a request, read from the headers it carries. */
export function actorOf(headers: Headers): Actor | undefined {
  return parseActor(headers.get(ACTOR_HEADER));
}

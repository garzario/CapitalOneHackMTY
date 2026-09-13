/**
 * `X-Actor`, the header that makes the ledger answer "who".
 *
 * **Scope, stated because it matters more than the code.** Issue #199 is where the
 * header becomes a requirement on every write, with the middleware, the ledger
 * fields and the 400 that names it. This file is the one check issue #204 could not
 * land without: a payment a definitive SAT listing cancelled may only be reopened
 * by a named owner with a written reason, and "owner" has to come from somewhere.
 * So the parser and the role check live here, behind the header name and the exact
 * grammar docs/09-api.md already documents, and #199 generalises this rather than
 * inventing a second spelling. If that issue lands first, this file is deleted and
 * its callers read the actor off the context instead.
 *
 * The grammar, from docs/09-api.md:
 *
 * ```
 * X-Actor: role=clerk; name=Lupita Elizondo
 * ```
 *
 * Two keys, order free, separated by `;`. `role` is `clerk` or `owner`. `name` is
 * 1 to 120 characters and is the rest of its pair, spaces included, so a real name
 * needs no quoting. A name with a `;` in it is refused rather than truncated,
 * because half a name on a ledger event is worse than no event.
 *
 * An unparseable header is a `400` and never a `403`: nothing about the caller was
 * rejected, the request did not say who was acting. A well formed header with the
 * wrong role is the `403`.
 *
 * `Actor` is a name and a role and not a user account. SentryOne holds no
 * credentials and no session, because a product that asks a clerk to register
 * before it can stop a bad payment is a product nobody opens on a Thursday.
 */

import type { Actor, ActorRole } from "@hackmty/core";

/** The header name, in the one place that spells it. */
export const ACTOR_HEADER = "x-actor";

export const ACTOR_NAME_MAX = 120;

const ROLES: readonly ActorRole[] = ["clerk", "owner"];

export type ActorParse =
  | { ok: true; actor: Actor }
  | { ok: false; message: string };

/** The message a missing or malformed header answers with, naming the header. */
const MALFORMED =
  `El encabezado ${ACTOR_HEADER} hace falta o no se puede leer. ` +
  "Se espera role=clerk|owner; name=<nombre>, como lo describe docs/09-api.md.";

/**
 * Reads the actor off a raw header value.
 *
 * Pure, so the rule is unit tested without an HTTP request, which is the same
 * reason `foldVerification` takes a list of events instead of a repository.
 */
export function parseActor(raw: string | undefined): ActorParse {
  if (raw === undefined || raw.trim() === "") {
    return { ok: false, message: MALFORMED };
  }

  let role: ActorRole | undefined;
  let name: string | undefined;

  for (const pair of raw.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) {
      return { ok: false, message: MALFORMED };
    }
    const key = pair.slice(0, separator).trim().toLowerCase();
    const value = pair.slice(separator + 1).trim();

    if (key === "role") {
      const candidate = value.toLowerCase();
      if (!ROLES.includes(candidate as ActorRole)) {
        return {
          ok: false,
          message: `El rol ${value} no existe. ${ACTOR_HEADER} acepta clerk u owner.`,
        };
      }
      role = candidate as ActorRole;
      continue;
    }
    if (key === "name") {
      if (value === "" || value.length > ACTOR_NAME_MAX) {
        return { ok: false, message: MALFORMED };
      }
      name = value;
      continue;
    }
    return { ok: false, message: MALFORMED };
  }

  if (role === undefined || name === undefined) {
    return { ok: false, message: MALFORMED };
  }
  return { ok: true, actor: { role, name } };
}

/**
 * `X-Actor`, the header that makes the ledger answer "who".
 *
 * Nothing in this product executes without a person, so every write carries a name
 * and a role and the event it appends records them. That is the whole of the
 * identity model and it is deliberately not authentication: SentryOne holds no
 * credentials and no session, because a product that asks a clerk to register
 * before it can stop a bad payment is a product nobody opens on a Thursday. A
 * deployment that needs authentication puts it in front of this API, and this header
 * stays what the ledger records. `docs/06-regulatory-privacy.md` carries that
 * argument and says what production needs.
 *
 * ```
 * X-Actor: role=clerk; name=Lupita Elizondo
 * ```
 *
 * Three parsing decisions, each one a thing that would otherwise be discovered at
 * 04:00.
 *
 * - **`name` is the rest of the pair, spaces included.** A real name needs no
 *   quoting, so "name=Lupita Elizondo" is one value and not two.
 * - **A `;` inside a name is a refusal and never a truncation.** Two keys separated
 *   by `;` is the grammar, so a name carrying one is ambiguous, and half a name on a
 *   ledger entry is worse than a 400 that says so.
 * - **A missing header is `400` and not `403`.** Nothing about the caller was
 *   rejected: the request did not say who was acting. `403` is about who is asking
 *   and is reserved for a role that may not do the thing.
 *
 * TODO(garzario): issue #199 mounts this on every write endpoint and adds the
 * owner-only override. This file is the parser and the only thing it knows about
 * roles is how to read one; which role may do what belongs to the route.
 */

import type { Actor, ActorRole } from "@hackmty/core";
import type { Context } from "hono";

export const ACTOR_HEADER = "X-Actor";

/** 1 to 120 characters, which is a name and not a paragraph. */
export const ACTOR_NAME_MAX = 120;

const ROLES: readonly ActorRole[] = ["clerk", "owner"];

/** What a caller is told when the header is missing or unreadable. */
export function actorProblem(detail: string): string {
  return `${ACTOR_HEADER} says who is acting and this request did not: ${detail}. Send it as "${ACTOR_HEADER}: role=clerk; name=Lupita Elizondo", with role clerk or owner and a name of 1 to ${ACTOR_NAME_MAX} characters.`;
}

export type ActorResult =
  | { ok: true; actor: Actor }
  | { ok: false; message: string };

/**
 * Reads the header into an `Actor`, or says what is wrong with it.
 *
 * Pure, so the grammar is asserted directly rather than through a route: the name
 * with a space in it, the name with a semicolon in it and the unknown role are three
 * cases and they are three tests.
 */
export function parseActor(raw: string | undefined | null): ActorResult {
  if (raw === undefined || raw === null || raw.trim() === "") {
    return { ok: false, message: actorProblem("the header is not there") };
  }

  const pairs = raw.split(";");
  let role: string | undefined;
  let name: string | undefined;

  for (const pair of pairs) {
    const at = pair.indexOf("=");
    if (at === -1) {
      return {
        ok: false,
        message: actorProblem(`"${pair.trim()}" is not a key=value pair`),
      };
    }
    const key = pair.slice(0, at).trim().toLowerCase();
    const value = pair.slice(at + 1).trim();

    if (key === "role") {
      if (role !== undefined) {
        return { ok: false, message: actorProblem("role is there twice") };
      }
      role = value.toLowerCase();
      continue;
    }
    if (key === "name") {
      if (name !== undefined) {
        return { ok: false, message: actorProblem("name is there twice") };
      }
      name = value;
      continue;
    }
    return {
      ok: false,
      message: actorProblem(`"${key}" is not a key this header carries`),
    };
  }

  if (role === undefined || !ROLES.includes(role as ActorRole)) {
    return {
      ok: false,
      message: actorProblem(
        role === undefined ? "it carries no role" : `"${role}" is not a role`,
      ),
    };
  }
  if (name === undefined || name === "" || name.length > ACTOR_NAME_MAX) {
    return {
      ok: false,
      message: actorProblem(
        name === undefined || name === ""
          ? "it carries no name"
          : `the name is ${name.length} characters long`,
      ),
    };
  }

  return { ok: true, actor: { name, role: role as ActorRole } };
}

/** The actor on this request, read off the header. */
export function actorOf(c: Context): ActorResult {
  return parseActor(c.req.header(ACTOR_HEADER));
}

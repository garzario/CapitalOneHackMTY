import { ACTOR_NAME_MAX_LENGTH, type Actor, isActorRole } from "@hackmty/core";
import { createMiddleware } from "hono/factory";
import { fail } from "../http";

/**
 * The header that makes the ledger answer "who".
 *
 * Every write in this product carries it, and the middleware here is the only
 * place that reads it. `docs/09-api.md`, "The actor on every write", is the
 * contract and this file is its implementation; the rule about what a role is
 * allowed to do lives in `@hackmty/core` (`decideRequirement`), because the
 * screens and the assistant have to agree with it before anybody presses
 * anything.
 *
 * ```
 * X-Actor: role=clerk; name=Lupita Elizondo
 * ```
 *
 * Why a header and not a session: SentryOne holds no credentials, no password and
 * no login. A payments product that asks a clerk to register before it can stop a
 * bad transfer does not get opened on the Thursday of the payment run, and the
 * thing ADR-0002 actually demands is that every execution has a person's name
 * against it in an append-only ledger. A deployment that needs authentication
 * puts it in front of this API and the header stays what the ledger records.
 * `docs/06-regulatory-privacy.md` section 4.4 says that in full, including what
 * production needs, so that nobody reads the demo selector as a login.
 *
 * The consequence is stated rather than hidden: this header is caller-controlled,
 * exactly like `X-Request-Id` next door, so it is an identity the product
 * records and not one it verifies.
 */
export const ACTOR_HEADER = "X-Actor";

/** Methods that read. Everything else is a write and needs a name against it. */
const SAFE_METHODS: readonly string[] = ["GET", "HEAD", "OPTIONS"];

/**
 * The one sentence a caller gets when the header is missing or malformed. It
 * names the header and shows the form, because the fix is to send it and a
 * message that only said "forbidden" would send somebody reading code instead.
 */
export const ACTOR_REQUIRED_MESSAGE =
  `Every write carries the ${ACTOR_HEADER} header, in the form ` +
  `"${ACTOR_HEADER}: role=clerk; name=Lupita Elizondo". ` +
  `role is clerk or owner and name is 1 to ${ACTOR_NAME_MAX_LENGTH} characters. ` +
  "See docs/09-api.md, The actor on every write.";

declare module "hono" {
  interface ContextVariableMap {
    /** Set by `requireActor` on every write, so a handler never re-parses it. */
    actor: Actor;
  }
}

export type ActorParse =
  | { ok: true; actor: Actor }
  | { ok: false; message: string };

/**
 * Parses the header, and answers a value rather than throwing.
 *
 * Two pairs separated by `;`, order free, `key=value`, and the value of `name`
 * is the rest of its own pair with its spaces intact, so a real name needs no
 * quoting. A name carrying a `;` is refused rather than truncated: half a
 * surname on an append-only ledger is worse than a rejected request, and the
 * caller is a program that can encode it properly.
 *
 * It is exported because two routes that stream cannot use the middleware as
 * written (`text/event-stream` has to start before a handler can fail), and both
 * of them parse the same header with the same function rather than a second
 * reading of the same contract.
 */
export function parseActorHeader(raw: string | undefined | null): ActorParse {
  if (raw === undefined || raw === null || raw.trim() === "") {
    return { ok: false, message: ACTOR_REQUIRED_MESSAGE };
  }

  let role: string | undefined;
  let name: string | undefined;

  for (const part of raw.split(";")) {
    const pair = part.trim();
    if (pair === "") {
      continue;
    }
    const equals = pair.indexOf("=");
    if (equals === -1) {
      return { ok: false, message: ACTOR_REQUIRED_MESSAGE };
    }
    const key = pair.slice(0, equals).trim().toLowerCase();
    const value = pair.slice(equals + 1).trim();

    if (key === "role") {
      role = value.toLowerCase();
      continue;
    }
    if (key === "name") {
      name = value;
      continue;
    }
    /* An unknown key is refused instead of ignored. A caller that sent
       `rol=owner` and got a 200 as a clerk would have been lied to. */
    return { ok: false, message: ACTOR_REQUIRED_MESSAGE };
  }

  if (role === undefined || name === undefined) {
    return { ok: false, message: ACTOR_REQUIRED_MESSAGE };
  }
  if (!isActorRole(role)) {
    return { ok: false, message: ACTOR_REQUIRED_MESSAGE };
  }
  if (name === "" || name.length > ACTOR_NAME_MAX_LENGTH) {
    return { ok: false, message: ACTOR_REQUIRED_MESSAGE };
  }

  return { ok: true, actor: { name, role } };
}

/**
 * Refuses a write that does not say who is acting.
 *
 * `400 bad_request` and not `403 forbidden`: nothing about the caller was
 * rejected, the request did not state who was acting. A 403 is what this API
 * answers when it knows who is asking and the answer is no, which is the role
 * rule in `routes/instructions.ts`.
 *
 * It is mounted per write route rather than once over `/api/v1`, so that a POST
 * to a path that does not exist still answers `404 not_found` instead of a
 * complaint about a header it would never have needed. A new write endpoint adds
 * it by hand, and `app.test.ts` walks the documented list to catch one that did
 * not.
 */
export const requireActor = createMiddleware(async (c, next) => {
  if (SAFE_METHODS.includes(c.req.method)) {
    return next();
  }

  const parsed = parseActorHeader(c.req.header(ACTOR_HEADER));
  if (!parsed.ok) {
    return fail(c, 400, "bad_request", parsed.message);
  }

  c.set("actor", parsed.actor);
  return next();
});

/**
 * The actor of the request, for a handler that runs behind `requireActor`.
 *
 * It throws rather than returning undefined, because an unguarded write route is
 * a bug in the route tree and not a state a handler should paper over with an
 * anonymous default. The error is the one `app.onError` turns into a 500, which
 * is the honest status for "this server is wired wrong".
 */
export function actorOf(c: { get(key: "actor"): Actor | undefined }): Actor {
  const actor = c.get("actor");
  if (actor === undefined) {
    throw new Error(
      `this route ran without requireActor, so no ${ACTOR_HEADER} was read`,
    );
  }
  return actor;
}

/**
 * Who may do what, and how a name and a role read on a document.
 *
 * `Actor` and `ActorRole` live in `./domain.ts` because they are part of every
 * write and of half the ledger. What lives here is the rule that reads them, and
 * it is here rather than in a route handler for the reason the whole package
 * exists: the API has to enforce it, the assistant panel has to show it before
 * anybody presses anything (`ActionProposal.requiresRole`), the constancia has to
 * print it and the offline mock has to agree with all three. Four
 * implementations of "can Lupita release this" is how a screen offers a button
 * the API then refuses.
 *
 * The rule is deliberately narrow, and `docs/02-persona.md` is the argument.
 * That page puts a formal maker-checker in the anti-persona column: this company
 * has one clerk who assembles the payment run and an owner working elsewhere in
 * the business. An approval chain it does not have is a control that gets
 * bypassed, so exactly two shapes ask for the owner, and both are the same
 * sentence in different words: somebody is overruling the evidence.
 *
 * 1. A release on a line that is not `confiable`, or one the engine was holding.
 *    Something stands against the payment, the findings say what, and letting it
 *    go anyway is the exception that page says the owner approves.
 * 2. Reopening a line the run already cancelled. A cancelled line is closed: the
 *    money did not leave and the record says so. Putting it back in front of the
 *    run is not housekeeping, it is a second decision about the same pesos.
 *
 * Everything else, the payment run leaving on the rail included, is the clerk's
 * own work. A product that asked for a second signature to hold a payment would
 * be a product that holds nothing on a Thursday afternoon.
 *
 * Both shapes also demand prose. `Decision.reason` stays optional in the
 * contract, because an API that refused an ordinary hold with no sentence would
 * be refused by the clerk instead, outside the product, where nothing is
 * recorded at all. On these two it is required: an exception approved with no
 * argument is exactly the record ADR-0002 says this product must never hold.
 *
 * Pure, like the rest of this package: no clock, no network, no mutation.
 */

import type { Action, Actor, ActorRole, Decision, Finding } from "./domain";
import { confidenceOf } from "./levels";

/**
 * Longest name the header may carry.
 *
 * Long enough for a Mexican legal name with both surnames, short enough that the
 * field cannot become a place to paste a paragraph. One constant, because the
 * header parser, the request bodies that name a person and the stored decision
 * all have to agree: a name the API accepts and the ledger truncates is a
 * signature that does not match itself.
 */
export const ACTOR_NAME_MAX_LENGTH = 120;

/** The whole set, so a caller can render a selector without hardcoding it. */
export const ACTOR_ROLES: readonly ActorRole[] = ["clerk", "owner"];

export function isActorRole(value: string): value is ActorRole {
  return (ACTOR_ROLES as readonly string[]).includes(value);
}

/**
 * The role as a Mexican accountant reads it on a constancia or an evidence
 * letter.
 *
 * Spanish, because the documents are, and a noun rather than a title: the point
 * of printing it is to say which of the two people in this company signed, not
 * to invent an org chart with job grades in it.
 */
export const ACTOR_ROLE_LABEL: Readonly<Record<ActorRole, string>> = {
  clerk: "capturista",
  owner: "dueño",
};

/** `Lupita Elizondo (capturista)`, which is how every document prints an actor. */
export function describeActor(actor: Actor): string {
  return `${actor.name} (${ACTOR_ROLE_LABEL[actor.role]})`;
}

/**
 * True when somebody holding `held` may do something that asks for `required`.
 *
 * An owner may do a clerk's work, and that direction is deliberate rather than
 * accidental: the owner of a company that has two people in it is not locked out
 * of their own payment run. The other direction is the whole rule.
 */
export function roleSatisfies(held: ActorRole, required: ActorRole): boolean {
  return required === "clerk" ? true : held === "owner";
}

/** Which of the three shapes a `decide` request is. */
export type DecideRule = "ordinary" | "override_release" | "reopen_cancelled";

/** What `decideRequirement` reads: the action, the evidence, and the line's fate. */
export interface DecideRequest {
  action: Action;
  /**
   * The findings standing against this line. Optional, because a caller holding
   * no evidence is asking about an ordinary decision and is answered as one.
   */
  findings?: readonly Finding[];
  /**
   * The decision on the line before this one, which is what makes a release an
   * override rather than a first answer. A line the engine held or asked to
   * verify is a line something stopped.
   */
  standing?: Pick<Decision, "action"> | null;
  /**
   * True when the payment run already dropped this line: the ledger holds a
   * `payment_cancelled` for it. It is a fact about the ledger and not a state a
   * person typed, which is why the caller passes it rather than this function
   * deriving it from an action.
   */
  cancelled?: boolean;
}

/** The rule that fired, and what it asks of whoever is acting. */
export interface DecideRequirement {
  rule: DecideRule;
  /** The role the `X-Actor` header has to carry. */
  requiresRole: ActorRole;
  /** True when the product refuses the action with no written reason. */
  requiresReason: boolean;
}

const ORDINARY: DecideRequirement = {
  rule: "ordinary",
  requiresRole: "clerk",
  requiresReason: false,
};

/**
 * True when letting this payment go means going past something.
 *
 * The question is asked in the vocabulary of the product rather than by counting
 * rows: a release is an override when the line is not `confiable`, which is
 * `confidenceOf` in `./levels.ts`, or when the standing decision was holding it.
 * Counting findings would get the `info` case wrong, and that case is on the
 * screen every day: a supplier who was listed and cleared their name carries a
 * row that stops nothing, and asking the owner to approve a payment nothing
 * stands against is how a control becomes a formality somebody clicks through.
 */
function isOverride(request: DecideRequest): boolean {
  if (request.action !== "release") {
    return false;
  }
  return (
    confidenceOf(request.findings ?? [], request.standing) !== "confiable" ||
    request.standing?.action === "hold"
  );
}

/**
 * What one `decide` asks of the person making it.
 *
 * Cancelled is checked first, because it is the stronger statement: a line the
 * run dropped is closed whatever the new action is, so holding it again is still
 * reopening it, and answering `ordinary` there would let a clerk quietly put a
 * dropped payment back into a run nobody looked at twice.
 */
export function decideRequirement(request: DecideRequest): DecideRequirement {
  if (request.cancelled === true) {
    return {
      rule: "reopen_cancelled",
      requiresRole: "owner",
      requiresReason: true,
    };
  }

  if (isOverride(request)) {
    return {
      rule: "override_release",
      requiresRole: "owner",
      requiresReason: true,
    };
  }

  return ORDINARY;
}

/**
 * True when this actor may make this decision. The reason is a separate question
 * and a separate answer code, because "you may not do this" and "say why" are
 * two different things to tell a person.
 */
export function mayDecide(actor: Actor, request: DecideRequest): boolean {
  return roleSatisfies(actor.role, decideRequirement(request).requiresRole);
}

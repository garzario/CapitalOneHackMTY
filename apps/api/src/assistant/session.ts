/**
 * One conversation, folded out of the ledger it was written to.
 *
 * `AssistantSession` is a projection and never a second copy, for the same reason
 * `VerificationState` is: two homes for one history is two histories, and the one
 * that gets updated is never the one somebody reads. So the panel's memory is
 * `assistant_message` rows, the session is this fold over them, and a conversation
 * a clerk reopens tomorrow is the same object an auditor reads next year next to
 * the payment it was about.
 *
 * The fold is pure. `assistantSessionFrom` takes the events and answers the
 * session, so the memory repository and the Postgres one share it rather than each
 * building a session their own way, which is the bug `scripts/web-mock.test.ts`
 * exists to catch on the other side of the product.
 *
 * Three fields are derived rather than stored, and each one is a decision:
 *
 * - `actor` is the actor of the first turn a person typed. A session belongs to one
 *   person, and the first thing in it is always a person: the assistant never opens
 *   a conversation.
 * - `startedAt` is that first event's instant, not the clock of whoever asked.
 * - `runId` is present only when something in the conversation actually names a
 *   run, which today is an `execute_run` proposal. A session id stamped with the
 *   current run at read time would claim the conversation was about a run it may
 *   never have mentioned.
 */

import type {
  ActionProposal,
  Actor,
  AssistantMessage,
  AssistantSession,
  LedgerEvent,
} from "@hackmty/core";

/** The actor a session falls back to when no person's turn carries one. */
const UNKNOWN_ACTOR: Actor = { name: "desconocido", role: "clerk" };

/** Every `assistant_message` of one session, in append order. */
export function assistantMessagesFrom(
  events: readonly LedgerEvent[],
  sessionId: string,
): AssistantMessage[] {
  return events
    .filter(
      (event) =>
        event.type === "assistant_message" && event.sessionId === sessionId,
    )
    .map((event) =>
      event.type === "assistant_message"
        ? event.message
        : /* Unreachable: the filter above is the narrowing. It is written as a
             throw rather than a cast so a future event kind that reuses the name
             fails loudly here instead of producing an empty message. */
          (() => {
            throw new Error("not an assistant_message event");
          })(),
    );
}

/**
 * The session, or `undefined` when nobody holds that id.
 *
 * `undefined` and not an empty session: docs/09-api.md answers `404` for a session
 * nobody holds, and an empty conversation with a minted actor would let a client
 * believe it had reopened something.
 */
export function assistantSessionFrom(
  messages: readonly AssistantMessage[],
  sessionId: string,
): AssistantSession | undefined {
  if (messages.length === 0) {
    return undefined;
  }

  const first = messages[0];
  const actor =
    messages.find((message) => message.actor !== undefined)?.actor ??
    UNKNOWN_ACTOR;
  const runId = messages
    .map((message) => runIdOf(message.proposal))
    .find((id) => id !== undefined);

  const session: AssistantSession = {
    id: sessionId,
    actor,
    startedAt: first?.at ?? new Date(0).toISOString(),
    messages: [...messages],
  };
  if (runId !== undefined) {
    session.runId = runId;
  }
  return session;
}

/** The run a proposal names, when it names one. */
function runIdOf(proposal: ActionProposal | undefined): string | undefined {
  if (proposal?.kind !== "execute_run") {
    return undefined;
  }
  const runId = proposal.payload.runId;
  return typeof runId === "string" ? runId : undefined;
}

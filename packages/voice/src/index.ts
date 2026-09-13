/**
 * @hackmty/voice is the verification call: the ElevenLabs conversational agent
 * that phones a supplier and asks whether the account we are about to pay is
 * theirs.
 *
 * Three pieces, in the order the product uses them. `buildVerificationScript`
 * writes what is said, `VoiceClient` creates the agent, places the call and
 * reads the transcript back, and `parseVerificationOutcome` turns that
 * transcript into one of four outcomes with the sentence it was read from.
 *
 * The rule the whole package exists under: none of the four outcomes releases a
 * payment. A `confirmed` is evidence, exactly like a CEP, and the release is
 * still a `decision_made` a person signs. See README.md next to this file for
 * the script, the endpoints and where each of them was verified.
 *
 * There are two lines, not one, and the second one is the exception to the rule
 * above rather than a hole in it. `buildOwnerScript` and `parseOwnerOutcome` are
 * the guided tour's call to the OWNER of the company, who is the one person this
 * product lets release a payment something stands against, and what their answer
 * becomes is the same `decision_made` with their name and their words on it. The
 * supplier line still releases nothing. `VoiceClient` is shared, because it is
 * one provider and one account with two agents stored in it.
 *
 * Server only. `apps/web` never imports this package; the browser fallback talks
 * to the same agent through the public widget, which needs no key.
 */

export * from "./client";
export * from "./fixtures";
export * from "./numbers";
export * from "./outcome";
export * from "./owner-fixtures";
export * from "./owner-outcome";
export * from "./owner-script";
export * from "./script";

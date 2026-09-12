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
 * Server only. `apps/web` never imports this package; the browser fallback talks
 * to the same agent through the public widget, which needs no key.
 */

export * from "./client";
export * from "./fixtures";
export * from "./outcome";
export * from "./script";

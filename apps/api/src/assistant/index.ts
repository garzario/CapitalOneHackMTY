/**
 * The assistant panel: Gemini with function calling over this API's own reads, and
 * a proposal a person presses.
 *
 * Read in this order. ADR-0007 is the boundary and it is worth reading first, then
 * `tools.ts` for the nine reads and why each one is a GET through our own router,
 * `proposals.ts` for the five things the panel may offer and why the payload is ours
 * and not the model's, `turn.ts` for the loop that ties them together, and
 * `mask.ts` plus `cost.ts` for the two questions the rubric says a third-party model
 * has to be answered about: what leaves the perimeter, and what it costs.
 *
 * Nothing in this folder decides, writes a decision, sends a centavo or executes a
 * run. That is the property that makes the panel credible rather than the property
 * that makes it impressive: pull the model out and the product still works, with a
 * worse front door.
 */

export * from "./cost";
export * from "./intake";
export * from "./mask";
export * from "./model";
export * from "./proposals";
export * from "./routes";
export * from "./session";
export * from "./tools";
export * from "./turn";

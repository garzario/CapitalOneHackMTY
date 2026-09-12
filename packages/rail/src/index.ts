/**
 * @hackmty/rail is the only place that sends the one-cent verification.
 *
 * `PaymentRail` is the interface, `NessieRail` is the demo rail on the company's
 * bank mirror, `StpRail` is the documented production path that refuses to run
 * unconfigured, and `FakeRail` is the in-process one the suite and `bun run demo`
 * use. `resolveRail` picks one from the environment.
 *
 * Read README.md in this folder before quoting any of it in the pitch: it says
 * which rail has run against a live API and which has not.
 */

export * from "./fake";
export * from "./nessie";
export * from "./rail";
export * from "./resolve";
export * from "./stp";

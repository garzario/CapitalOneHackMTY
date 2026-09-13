/**
 * @hackmty/rail is the only place in SentryOne that moves money.
 *
 * Two things leave through it and nothing else: the 0.01 MXN verification probe, and
 * one line of one payment instruction for that instruction's own amount to the
 * account it names (ADR-0008). `PaymentRail` is the interface, `NessieRail` is the
 * demo rail on the company's bank mirror, `StpRail` is the documented production path
 * that refuses to run unconfigured, `LayoutRail` is the bank-portal file a PyME
 * actually uses, and `FakeRail` is the in-process one the suite and `bun run demo`
 * use. `resolveRail` picks one from the environment.
 *
 * Read README.md in this folder before quoting any of it in the pitch: it says
 * which rail has run against a live API and which has not.
 */

export * from "./fake";
export * from "./layout";
export * from "./nessie";
export * from "./rail";
export * from "./resolve";
export * from "./stp";

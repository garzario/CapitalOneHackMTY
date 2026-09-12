/**
 * @hackmty/seed generates the synthetic Mexican transaction history the demo runs
 * on. Deterministic from a seed, so every teammate and every rerun sees the same
 * data. See generator.ts for what makes the shape defensible.
 */

export * from "./catalogs/mx-income";
export * from "./catalogs/mx-merchants";
export * from "./catalogs/mx-people";
export * from "./dates";
export * from "./generator";
export * from "./rng";

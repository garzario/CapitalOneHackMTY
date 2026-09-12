/**
 * The example cases, imported rather than read from disk so that `apps/api` can serve
 * `GET /api/v1/metrics` on the Node runtime without touching a file system. Adding a
 * case is two lines: the JSON file, and an import here.
 *
 * These three are SCAFFOLDING, not the evaluation set. The real labelled cases are
 * authored by the holdout owner and the detector author does not read them before the
 * detectors merge, which is the whole point of a blind evaluation. See ./README.md.
 *
 * Every file is passed through `parseHoldoutCase` at module load, so a malformed case
 * fails at import and never reaches the metrics table as a silently skipped row.
 */

import clabeNewAccountUnbacked from "./cases/clabe-new-account-unbacked.json";
import legitimateBankChangeRelease from "./cases/legitimate-bank-change-release.json";
import sat69bDefinitivoHold from "./cases/sat-69b-definitivo-hold.json";
import type { HoldoutCase } from "./types";
import { parseHoldoutCase } from "./types";

/** The directory the loader in scripts/eval.ts reads, relative to the repository root. */
export const HOLDOUT_CASES_DIR = "packages/seed/src/holdout/cases";

export const EXAMPLE_HOLDOUT_CASES: readonly HoldoutCase[] = [
  sat69bDefinitivoHold,
  clabeNewAccountUnbacked,
  legitimateBankChangeRelease,
].map((value) => parseHoldoutCase(value));

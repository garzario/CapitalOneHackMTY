/**
 * The refusals and the arithmetic of `bun run nessie:mirror`.
 *
 * Every case here is a way the command used to do the wrong thing quietly:
 * import a ledger built on a push that failed, reconcile the whole account
 * against the newest two hundred rows and call the rest missing, write a
 * purchase count that was neither what is on the account nor what was pushed,
 * or reuse one dataset's Nessie ids for another dataset.
 */

import { describe, expect, it } from "bun:test";
import type { MirrorIds } from "../../packages/nessie/src/mirror.ts";
import {
  coveredLimit,
  datasetMismatch,
  type ImportGate,
  importDecision,
  purchasesOnAccount,
  verifyLimit,
  widerLimit,
} from "./plan.ts";

const IDS: MirrorIds = {
  customerId: "cust-1",
  accountId: "acct-1",
  merchants: {},
  purchases: 0,
  skipped: { credits: 0, overLimit: 0, alreadyThere: 0, failures: 0 },
  pushedAt: "2026-09-12T04:00:00.000Z",
  firstFailures: [],
  listingFailed: false,
};

/** A run where everything went right, so each case below changes one thing. */
const CLEAN: ImportGate = {
  databaseUrl: "postgres://localhost:5432/test",
  verifyAsked: true,
  pushFailures: 0,
  listingFailed: false,
  readBackRows: 2446,
  readBackRejected: 0,
  differingDays: 0,
  selectedRows: 2446,
  outflows: 2446,
};

describe("the --import gate", () => {
  it("goes ahead when the push, the read-back and the reconciliation all held", () => {
    expect(importDecision(CLEAN)).toEqual({ kind: "go" });
  });

  it("skips rather than fails with no database to write to", () => {
    const decision = importDecision({ ...CLEAN, databaseUrl: "" });
    expect(decision.kind).toBe("skip");
    expect(decision.kind === "skip" && decision.reason).toContain(
      "DATABASE_URL is not set",
    );
  });

  it("refuses a push that reported failures, and says so", () => {
    const decision = importDecision({ ...CLEAN, pushFailures: 3 });
    expect(decision.kind).toBe("refuse");
    expect(decision.kind === "refuse" && decision.reason).toContain(
      "the push reported 3 failures",
    );
  });

  it("refuses when the account could not be listed, before the failure count", () => {
    const decision = importDecision({
      ...CLEAN,
      listingFailed: true,
      pushFailures: 1,
    });
    expect(decision.kind).toBe("refuse");
    expect(decision.kind === "refuse" && decision.reason).toContain(
      "could not list the account",
    );
  });

  it("refuses when the read-back threw, and quotes it", () => {
    const decision = importDecision({
      ...CLEAN,
      verifyError: "fetch failed",
      readBackRows: undefined,
    });
    expect(decision.kind).toBe("refuse");
    expect(decision.kind === "refuse" && decision.reason).toContain(
      "the read-back threw (fetch failed)",
    );
  });

  it("refuses when no read-back ever came home", () => {
    // The bug this closes: the rows to import used to START as the generator's
    // own rows, so a verify that never ran imported the generator's mirror and
    // reported it as the bank's.
    const decision = importDecision({ ...CLEAN, readBackRows: undefined });
    expect(decision.kind).toBe("refuse");
    expect(decision.kind === "refuse" && decision.reason).toContain(
      "the read-back never completed",
    );
  });

  it("refuses when the read-back was partly rejected", () => {
    const decision = importDecision({ ...CLEAN, readBackRejected: 4 });
    expect(decision.kind).toBe("refuse");
    expect(decision.kind === "refuse" && decision.reason).toContain(
      "rejected 4 rows",
    );
  });

  it("refuses when any calendar day differs", () => {
    const decision = importDecision({ ...CLEAN, differingDays: 1 });
    expect(decision.kind).toBe("refuse");
    expect(decision.kind === "refuse" && decision.reason).toContain(
      "1 differing day",
    );
  });

  it("refuses an import that would leave the ledger short of the mirror", () => {
    const decision = importDecision({ ...CLEAN, selectedRows: 200 });
    expect(decision.kind).toBe("refuse");
    expect(decision.kind === "refuse" && decision.reason).toContain(
      "--import would leave 200 of 2446 rows",
    );
  });

  it("refuses without a verify, which is what reads the rows back", () => {
    const decision = importDecision({ ...CLEAN, verifyAsked: false });
    expect(decision.kind).toBe("refuse");
    expect(decision.kind === "refuse" && decision.reason).toContain(
      "--import needs --verify",
    );
  });
});

describe("the limit the read-back is reconciled against", () => {
  it("is the limit the account was pushed with, not this run's default", () => {
    // The whole account was pushed once. A later default run must not report
    // every day beyond the newest 50 as a differing day.
    expect(
      verifyLimit({
        limit: 50,
        limitGiven: false,
        pushed: true,
        previousLimit: 200,
      }),
    ).toBe(200);
    expect(
      verifyLimit({
        limit: 50,
        limitGiven: false,
        pushed: true,
        previousLimit: 0,
      }),
    ).toBe(0);
  });

  it("is this run's limit when an operator named one", () => {
    expect(
      verifyLimit({
        limit: 50,
        limitGiven: true,
        pushed: true,
        previousLimit: 200,
      }),
    ).toBe(50);
  });

  it("falls back to this run's limit before anything was ever pushed", () => {
    expect(verifyLimit({ limit: 200, limitGiven: false, pushed: true })).toBe(
      200,
    );
  });
});

describe("the limit written back to the state", () => {
  it("is the union, because a push adds rather than replaces", () => {
    expect(widerLimit(50, 200)).toBe(200);
    expect(widerLimit(200, 0)).toBe(0);
    expect(coveredLimit({ limit: 50, pushed: true, previousLimit: 200 })).toBe(
      200,
    );
    expect(coveredLimit({ limit: 400, pushed: true, previousLimit: 200 })).toBe(
      400,
    );
  });

  it("is unchanged by a run that only read", () => {
    expect(coveredLimit({ limit: 50, pushed: false, previousLimit: 200 })).toBe(
      200,
    );
  });
});

describe("the purchases the state claims are on the account", () => {
  it("is what the read-back counted when there was one", () => {
    expect(
      purchasesOnAccount({ verifiedRows: 200, previous: 0, pushed: 200 }),
    ).toBe(200);
  });

  it("is the previous count plus what was pushed when there was none", () => {
    // A push without a verify used to write the pushed count alone, so a
    // two-row top-up on a 200-row account reported two purchases.
    expect(purchasesOnAccount({ previous: 200, pushed: 2 })).toBe(202);
  });

  it("is the pushed count on the very first run", () => {
    expect(purchasesOnAccount({ pushed: 200 })).toBe(200);
  });
});

describe("the dataset the saved ids belong to", () => {
  const previous = { seed: 69, weekOf: "2026-09-07", ids: IDS };

  it("is reused when the seed and the week match", () => {
    expect(
      datasetMismatch({ previous, seed: 69, weekOf: "2026-09-07" }),
    ).toBeUndefined();
    expect(datasetMismatch({ seed: 70, weekOf: "2026-09-14" })).toBeUndefined();
  });

  it("is refused for another seed, and says how to get the old one back", () => {
    expect(datasetMismatch({ previous, seed: 70, weekOf: "2026-09-07" })).toBe(
      "the mirror on account acct-1 was seeded for seed 69 week 2026-09-07; pass --seed=69 --week=2026-09-07 or bun run reset --nessie first",
    );
  });

  it("is refused for another week", () => {
    expect(
      datasetMismatch({ previous, seed: 69, weekOf: "2026-09-14" }),
    ).toContain("was seeded for seed 69 week 2026-09-07");
  });
});

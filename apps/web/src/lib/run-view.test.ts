/**
 * Tests for the two answers the payment run gives before anyone reads a row.
 *
 * Both are load-bearing for the ten-second read, and both have a failure mode
 * that looks fine on a laptop and costs the demo: an order that changes
 * between renders, and a headline number that stops matching the table the
 * moment a clerk presses Retener with no API behind the page.
 */

import { describe, expect, test } from "bun:test";
import type { Action, Detector, Finding } from "@hackmty/core";
import { runMoney } from "@hackmty/core";
import type { PaymentRun, PaymentRunItem } from "./contract";
import { CONFIDENCE_ORDER, STATE_ORDER } from "./labels";
import {
  countsFor,
  diffRuns,
  levelCounts,
  lineLevels,
  matchesFacets,
  matchesFilter,
  orderItems,
  parseRunFacets,
  type RunFacets,
  runChangeSentence,
  runFacetsQuery,
  runVerdict,
  verdictDelta,
} from "./run-view";

let seq = 0;

function finding(amountAtRisk: number): Finding {
  seq += 1;

  return {
    id: `f-${seq}`,
    detector: "duplicate_invoice",
    severity: "critical",
    state: "comprobable",
    subject: { kind: "instruction", id: `ins-${seq}` },
    amountAtRisk,
    explanation: "Hallazgo sintetico para la prueba.",
    evidence: {},
    createdAt: "2026-09-10T10:00:00.000Z",
  };
}

function item(
  id: string,
  action: Action,
  amount: number,
  findings: Finding[] = [],
): PaymentRunItem {
  return {
    instruction: {
      id,
      supplierRfc: "SYN010101AAA",
      cfdiUuids: [],
      clabe: "012180001234567899",
      amount,
      source: "email",
      receivedAt: "2026-09-08",
      synthetic: true,
    },
    supplier: {
      rfc: "SYN010101AAA",
      legalName: "Proveedor Sintetico SA de CV",
      knownAccounts: [],
      firstInvoiceAt: "2025-01-15",
      synthetic: true,
    },
    decision: {
      instructionId: id,
      action,
      expectedLoss: 0,
      delayCostPerDay: 0,
      findings,
      decidedAt: "2026-09-10T10:00:00.000Z",
    },
    findings,
  };
}

function run(items: PaymentRunItem[]): PaymentRun {
  return {
    id: "run-2026w37",
    weekOf: "2026-09-07",
    /* Deliberately wrong. Nothing under test may read these, because the API
       totals go stale the moment a decision is applied without the API. */
    totals: {
      instructions: 999,
      amount: 999,
      held: 999,
      toVerify: 999,
      released: 999,
      heldAmount: 999,
      toVerifyAmount: 999,
      releasedAmount: 999,
      stoppedAmount: 999,
      amountAtRisk: 999,
      retroactive69bBase: 999,
      retroactive69bExposure: 999,
      confiable: 999,
      precaucion: 999,
      alerta: 999,
      rojo: 999,
      cancelado: 999,
      enviado: 999,
      pendiente: 999,
      liberado: 999,
    },
    items,
  };
}

describe("orderItems", () => {
  test("puts what is stopped before what is leaving", () => {
    const ordered = orderItems([
      item("a", "release", 100),
      item("b", "verify", 100),
      item("c", "hold", 100),
    ]);

    expect(ordered.map((row) => row.instruction.id)).toEqual(["c", "b", "a"]);
  });

  test("puts the largest amount first inside one state", () => {
    const ordered = orderItems([
      item("small", "hold", 1_000),
      item("large", "hold", 900_000),
      item("mid", "hold", 50_000),
    ]);

    expect(ordered.map((row) => row.instruction.id)).toEqual([
      "large",
      "mid",
      "small",
    ]);
  });

  test("keeps the input order when the state and the amount tie", () => {
    /* The edge case: two rows for the same amount must not swap between
       renders. A table that reshuffles under the cursor while a clerk is
       reaching for Retener is worse than a table in the wrong order. */
    const ordered = orderItems([
      item("first", "hold", 184_300),
      item("second", "hold", 184_300),
      item("third", "hold", 184_300),
    ]);

    expect(ordered.map((row) => row.instruction.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  test("does not reorder the array it was given", () => {
    /* The run object lives in the resource cache and is shared with the alert
       rail and the drawer. Sorting in place would reorder their copy too. */
    const input = [item("a", "release", 1), item("b", "hold", 2)];
    const snapshot = input.map((row) => row.instruction.id);

    orderItems(input);

    expect(input.map((row) => row.instruction.id)).toEqual(snapshot);
  });

  test("survives an empty run", () => {
    expect(orderItems([])).toEqual([]);
  });
});

describe("runVerdict", () => {
  test("counts verify as money that has not left", () => {
    /* The edge case worth stating out loud: `verify` is not a release. The
       payment is waiting on a callback to a number we already had, so its
       pesos belong in the stopped figure, not in the released one. */
    const verdict = runVerdict(
      run([
        item("h", "hold", 500_000),
        item("v", "verify", 231_910.5),
        item("r", "release", 100_000),
      ]),
    );

    expect(verdict.stoppedCount).toBe(2);
    expect(verdict.stoppedAmount).toBe(731_910.5);
    expect(verdict.heldCount).toBe(1);
    expect(verdict.toVerifyCount).toBe(1);
    expect(verdict.releasedCount).toBe(1);
    expect(verdict.releasedAmount).toBe(100_000);
  });

  test("splits the stopped figure into held and to verify", () => {
    /* The bar under the figure paints these two next to the released amount,
       so a split that does not add back up to `stoppedAmount` would draw a
       bar that contradicts the number above it. */
    const verdict = runVerdict(
      run([
        item("h", "hold", 500_000),
        item("v", "verify", 231_910.5),
        item("r", "release", 100_000),
      ]),
    );

    expect(verdict.heldAmount).toBe(500_000);
    expect(verdict.toVerifyAmount).toBe(231_910.5);
    expect(verdict.heldAmount + verdict.toVerifyAmount).toBe(
      verdict.stoppedAmount,
    );
  });

  test("leaves the verify half at zero when nothing is awaiting a call", () => {
    /* A run of holds alone must not leave an amber segment in the bar, and
       the empty segment is the one that is easy to leave behind when the
       amounts are accumulated in the same loop. */
    const verdict = runVerdict(
      run([
        item("a", "hold", 40),
        item("b", "hold", 2),
        item("c", "release", 9),
      ]),
    );

    expect(verdict.toVerifyAmount).toBe(0);
    expect(verdict.heldAmount).toBe(42);
    expect(verdict.stoppedAmount).toBe(42);
  });

  test("reads the items and never the totals", () => {
    /* The bug this pins: offline, pressing Retener rewrites one item and
       leaves `run.totals` untouched. A headline computed from the totals then
       contradicts the table directly underneath it. */
    const verdict = runVerdict(run([item("only", "hold", 42)]));

    expect(verdict.totalCount).toBe(1);
    expect(verdict.totalAmount).toBe(42);
    expect(verdict.stoppedAmount).toBe(42);
  });

  test("names the finding with the most pesos at risk", () => {
    const verdict = runVerdict(
      run([
        item("a", "hold", 10, [finding(1_000)]),
        item("b", "hold", 10, [finding(412_875), finding(2_000)]),
        item("c", "release", 10, [finding(90)]),
      ]),
    );

    expect(verdict.worst?.finding.amountAtRisk).toBe(412_875);
    expect(verdict.worst?.instructionId).toBe("b");
  });

  test("keeps the first of two findings tied on pesos at risk", () => {
    /* The edge case: a tie must resolve the same way every render, or the
       sentence at the top of the screen changes while a judge is reading it. */
    const tied = run([
      item("first", "hold", 10, [finding(500_000)]),
      item("second", "hold", 10, [finding(500_000)]),
    ]);

    expect(runVerdict(tied).worst?.instructionId).toBe("first");
    expect(runVerdict(tied).worst?.instructionId).toBe("first");
  });

  test("has no worst risk when nothing was found", () => {
    const verdict = runVerdict(run([item("clean", "release", 10)]));

    expect(verdict.worst).toBeNull();
    expect(verdict.stoppedCount).toBe(0);
  });

  test("reports an empty run as zero rather than throwing", () => {
    const verdict = runVerdict(run([]));

    expect(verdict.totalCount).toBe(0);
    expect(verdict.totalAmount).toBe(0);
    expect(verdict.stoppedCount).toBe(0);
    expect(verdict.worst).toBeNull();
  });
});

/**
 * The filter decides what the table shows before anything else does, and it has
 * one failure mode that would be invisible on the demo run and wrong on a real
 * one: disagreeing with `runVerdict` about what "not leaving" means. Both read
 * the same NOT_LEAVING list, and these tests are what keeps a third definition
 * from being written next to a fourth.
 */
describe("the run filter", () => {
  const items = [
    item("a", "hold", 100),
    item("b", "verify", 200),
    item("c", "release", 300),
    item("d", "release", 400),
  ];

  test("stopped is hold and verify, not just hold", () => {
    const kept = items.filter((i) => matchesFilter(i, "stopped"));

    expect(kept.map((i) => i.instruction.id)).toEqual(["a", "b"]);
  });

  test("released is the exact complement of stopped", () => {
    const kept = items.filter((i) => matchesFilter(i, "released"));

    expect(kept.map((i) => i.instruction.id)).toEqual(["c", "d"]);
  });

  test("all keeps everything", () => {
    expect(items.filter((i) => matchesFilter(i, "all"))).toHaveLength(4);
  });

  test("the three buckets never drop or double-count a row", () => {
    const counts = countsFor(items);

    expect(counts).toEqual({ stopped: 2, released: 2, all: 4 });
    expect(counts.stopped + counts.released).toBe(counts.all);
  });

  test("the counts agree with the headline the card prints", () => {
    /* The card says "7 de 92" from runVerdict and the filter says "No salen 7"
       from countsFor. Two numbers on one screen that are supposed to be the
       same number is exactly the kind of thing that drifts. */
    const verdict = runVerdict(run(items));

    expect(countsFor(items).stopped).toBe(verdict.stoppedCount);
    expect(countsFor(items).released).toBe(verdict.releasedCount);
  });

  test("an empty run has three empty buckets", () => {
    expect(countsFor([])).toEqual({ stopped: 0, released: 0, all: 0 });
  });
});

/* ------------------------------------------------- the level and the state */

/** A finding of one control, for the facets and for the level rules. */
function detected(
  detector: Detector,
  severity: Finding["severity"] = "warning",
  evidence: Finding["evidence"] = {},
): Finding {
  seq += 1;

  return {
    id: `f-${seq}`,
    detector,
    severity,
    state: "comprobable",
    subject:
      detector === "sat_69b"
        ? { kind: "supplier", id: "SYN080910HI8" }
        : { kind: "instruction", id: `ins-${seq}` },
    amountAtRisk: 1_000,
    explanation: "Hallazgo sintetico para la prueba.",
    evidence,
    createdAt: "2026-09-10T10:00:00.000Z",
  };
}

/** The row the retroactive sweep priced: a definitive listing with its pesos. */
function definitive69b(base = 878_592.59, exposure = 404_152.59): Finding {
  return detected("sat_69b", "critical", {
    status: "definitivo",
    listedNow: true,
    deductedBase: base,
    retroactiveExposure: exposure,
  });
}

describe("lineLevels", () => {
  test("the field the API attached wins over the derivation", () => {
    /* The API derives both with the verification and the execution in hand, so
       its answer is strictly better informed than anything this screen can
       compute from the run payload alone. A line that carries them is read, not
       recomputed. */
    const line = {
      ...item("a", "hold", 100, [definitive69b()]),
      confidence: "confiable" as const,
      state: "enviado" as const,
    };

    expect(lineLevels(line)).toEqual({
      confidence: "confiable",
      state: "enviado",
    });
  });

  test("a held line with a critical finding derives alerta and rojo", () => {
    const levels = lineLevels(
      item("a", "hold", 100, [detected("duplicate_invoice", "critical")]),
    );

    expect(levels).toEqual({ confidence: "alerta", state: "rojo" });
  });

  test("a clean released line derives confiable and liberado", () => {
    expect(lineLevels(item("a", "release", 100))).toEqual({
      confidence: "confiable",
      state: "liberado",
    });
  });

  test("a definitive 69-B listing derives cancelado, not rojo", () => {
    /* ADR-0009 rule 4, and it is the one the second beat of the demo turns on:
       a definitive listing is not a hold somebody can wait out, because the
       comprobantes have no fiscal effect at all. The finding travels on the
       LINE and the fallback reads it there, which is why a decision signed
       before the publication still answers cancelado. */
    const levels = lineLevels(item("a", "hold", 100, [definitive69b()]));

    expect(levels).toEqual({ confidence: "alerta", state: "cancelado" });
  });

  test("derives over the line's findings and not the decision's", () => {
    /* The publication is new evidence on a line whose decision was signed
       before it, so the finding is on the item and the stored decision still
       remembers the two it weighed at the time. Deriving from the decision's
       copy would leave the row reading `rojo` under a definitive listing. */
    const listing = definitive69b();
    const stale = item("a", "hold", 100, [listing]);
    const line = {
      ...stale,
      decision: { ...stale.decision, findings: [] },
    };

    expect(lineLevels(line).state).toBe("cancelado");
  });
});

describe("levelCounts", () => {
  const items = [
    item("a", "hold", 100, [detected("duplicate_invoice", "critical")]),
    item("b", "verify", 200, [detected("clabe_forensics")]),
    item("c", "release", 300),
    item("d", "release", 400),
  ];

  test("the three levels add up to the lines", () => {
    const counts = levelCounts(items);

    expect(counts.confiable + counts.precaucion + counts.alerta).toBe(
      items.length,
    );
    expect(counts.alerta).toBe(1);
  });

  test("the five states add up to the lines", () => {
    const counts = levelCounts(items);

    expect(
      counts.rojo +
        counts.cancelado +
        counts.enviado +
        counts.pendiente +
        counts.liberado,
    ).toBe(items.length);
    expect(counts.rojo).toBe(2);
    expect(counts.liberado).toBe(2);
  });

  test("an empty run counts eight zeros rather than throwing", () => {
    expect(Object.values(levelCounts([]))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test("over a slice, every count is the number of rows that facet leaves in it", () => {
    /* The screen prints these counts beside the facet options, and the table
       under them applies the segmented slice as well as the facet. Counted over
       the whole run instead, the "No salen" slice offered `Liberado · 2` and
       picking it produced an empty table with a sentence claiming no line of
       the run had that state. The count and the rows have to come off the same
       set, and this is what that means arithmetically. */
    const slice = items.filter((line) => matchesFilter(line, "stopped"));
    const counts = levelCounts(slice);

    for (const state of STATE_ORDER) {
      expect(
        slice.filter((line) => matchesFacets(line, { state })).length,
      ).toBe(counts[state]);
    }

    for (const level of CONFIDENCE_ORDER) {
      expect(
        slice.filter((line) => matchesFacets(line, { level })).length,
      ).toBe(counts[level]);
    }

    /* The case that failed: two released lines the slice does not hold, so the
       option is worth zero here and two over the run. */
    expect(counts.liberado).toBe(0);
    expect(levelCounts(items).liberado).toBe(2);
  });
});

/* ------------------------------------------------------------- the pesos */

describe("the pesos on the verdict", () => {
  const items = [
    item("a", "hold", 500_000, [definitive69b()]),
    item("b", "verify", 231_910.5, [detected("clabe_forensics")]),
    item("c", "release", 100_000),
  ];

  test("the three figures are runMoney over the items, not a second arithmetic", () => {
    /* The tile and `totals` on GET /api/v1/run/current have to be the same
       number, and the only way to guarantee that is for both to be this
       function. A sum written here would be a second implementation that
       agrees today. */
    const verdict = runVerdict(run(items));
    const money = runMoney(items);

    expect(verdict.amountAtRisk).toBe(money.amountAtRisk);
    expect(verdict.retroactive69bBase).toBe(money.retroactive69bBase);
    expect(verdict.retroactive69bExposure).toBe(money.retroactive69bExposure);
    expect(verdict.retroactive69bExposure).toBe(404_152.59);
    expect(verdict.retroactive69bBase).toBe(878_592.59);
  });

  test("a run with no 69-B finding reports zero for the pair", () => {
    /* The ordinary Thursday. The tile then says that no publication has reached
       a supplier of this run, which is a result and not an empty cell. */
    const verdict = runVerdict(
      run([item("a", "hold", 10, [detected("duplicate_invoice", "critical")])]),
    );

    expect(verdict.retroactive69bBase).toBe(0);
    expect(verdict.retroactive69bExposure).toBe(0);
    expect(verdict.amountAtRisk).toBeGreaterThan(0);
  });

  test("the same supplier on two lines is priced once", () => {
    /* `runMoney` keys the pair on the RFC, and this asserts the verdict inherits
       that: two instructions to one listed supplier is one set of voided
       deductions, and adding it twice would double the loudest figure on the
       screen. */
    const verdict = runVerdict(
      run([
        item("a", "hold", 10, [definitive69b()]),
        item("b", "hold", 20, [definitive69b()]),
      ]),
    );

    expect(verdict.retroactive69bExposure).toBe(404_152.59);
  });
});

/* ------------------------------------------------------------- the facets */

describe("the facets", () => {
  const held = item("held", "hold", 100, [definitive69b()]);
  const toVerify = item("verify", "verify", 200, [detected("clabe_forensics")]);
  const clean = item("clean", "release", 300);
  const items = [held, toVerify, clean];

  function kept(facets: RunFacets): string[] {
    return items
      .filter((line) => matchesFacets(line, facets))
      .map((line) => line.instruction.id);
  }

  test("no facet matches every line", () => {
    expect(kept({})).toEqual(["held", "verify", "clean"]);
  });

  test("the state facet reads the line's state and not its action", () => {
    expect(kept({ state: "cancelado" })).toEqual(["held"]);
    expect(kept({ state: "liberado" })).toEqual(["clean"]);
  });

  test("the level facet keeps one level", () => {
    expect(kept({ level: "alerta" })).toEqual(["held"]);
    expect(kept({ level: "precaucion" })).toEqual(["verify"]);
    expect(kept({ level: "confiable" })).toEqual(["clean"]);
  });

  test("the control facet matches any finding of that detector", () => {
    expect(kept({ control: "sat_69b" })).toEqual(["held"]);
    expect(kept({ control: "clabe_forensics" })).toEqual(["verify"]);
    expect(kept({ control: "duplicate_invoice" })).toEqual([]);
  });

  test("none is the lines no control raised anything on", () => {
    /* Not the same question as "confiable": a line can carry an info finding
       and still be trusted, so "no findings" needs its own option. */
    expect(kept({ control: "none" })).toEqual(["clean"]);
  });

  test("the facets combine with AND", () => {
    expect(kept({ level: "alerta", control: "sat_69b" })).toEqual(["held"]);
    expect(kept({ level: "alerta", control: "clabe_forensics" })).toEqual([]);
    expect(kept({ state: "cancelado", level: "confiable" })).toEqual([]);
  });

  test("the facets narrow the slice the segmented control already picked", () => {
    /* The two filters are independent and both apply, which is what the screen
       does: `.filter(matchesFilter).filter(matchesFacets)`. */
    const rows = items
      .filter((line) => matchesFilter(line, "stopped"))
      .filter((line) => matchesFacets(line, { level: "alerta" }));

    expect(rows.map((line) => line.instruction.id)).toEqual(["held"]);
  });
});

describe("parseRunFacets and runFacetsQuery", () => {
  test("read the three keys out of a query", () => {
    const facets = parseRunFacets(
      new URLSearchParams("state=cancelado&level=alerta&control=sat_69b"),
    );

    expect(facets).toEqual({
      state: "cancelado",
      level: "alerta",
      control: "sat_69b",
    });
  });

  test("ignore a value the domain does not have", () => {
    /* A hand-edited URL, or a link from a build where a state was called
       something else. Ignoring it shows the run; honouring it would show an
       empty table for a reason nobody can see. */
    const facets = parseRunFacets(
      new URLSearchParams("state=verde&level=0.73&control=astrologia"),
    );

    expect(facets).toEqual({});
  });

  test("ignore a key that only exists on the prototype of the dictionaries", () => {
    /* The guards ask the label dictionaries whether they hold the value, and a
       membership test that walks the prototype chain answers yes for every
       method on `Object.prototype`. Those are the values a hand-edited URL is
       most likely to reach by accident, and honouring one filtered the table to
       nothing while the select still read "Todos". */
    const facets = parseRunFacets(
      new URLSearchParams(
        "state=toString&level=constructor&control=hasOwnProperty",
      ),
    );

    expect(facets).toEqual({});
  });

  test("ignore prototype keys on the control facet, which has an extra value of its own", () => {
    /* `none` is a real control value that is not a detector, so the control
       guard has one more branch than the other two and needs its own case. */
    expect(parseRunFacets(new URLSearchParams("control=valueOf"))).toEqual({});
    expect(
      parseRunFacets(new URLSearchParams("control=isPrototypeOf")),
    ).toEqual({});
  });

  test("keep the valid half of a query whose other half is nonsense", () => {
    const facets = parseRunFacets(
      new URLSearchParams("state=rojo&level=muy-alerta"),
    );

    expect(facets).toEqual({ state: "rojo" });
  });

  test("none is a control value and not an unknown one", () => {
    expect(parseRunFacets(new URLSearchParams("control=none"))).toEqual({
      control: "none",
    });
  });

  test("serialise nothing as an empty string", () => {
    /* So the caller can decide whether there is a `?` to write at all: `/run?`
       and `/run` are two URLs for one screen. */
    expect(runFacetsQuery({})).toBe("");
  });

  test("omit an unset facet rather than sending it empty", () => {
    expect(runFacetsQuery({ level: "alerta" })).toBe("level=alerta");
  });

  test("round trip through a URLSearchParams", () => {
    const facets: RunFacets = {
      state: "enviado",
      level: "precaucion",
      control: "beneficiary_cep",
    };

    expect(parseRunFacets(new URLSearchParams(runFacetsQuery(facets)))).toEqual(
      facets,
    );
    expect(
      parseRunFacets(new URLSearchParams(runFacetsQuery({ control: "none" }))),
    ).toEqual({ control: "none" });
  });
});

/* -------------------------------------------------------- what just changed */

describe("diffRuns", () => {
  test("two reads of the same run report nothing", () => {
    const before = run([item("a", "hold", 100), item("b", "release", 200)]);

    expect(diffRuns(before, before)).toEqual([]);
  });

  test("a line the publication moved reports both sides", () => {
    /* The second beat of the demo, in one assertion: a line the engine had put
       on `verify` is re-scored to `hold` over a definitive listing, so both the
       action and the state moved. */
    const before = run([item("moved", "verify", 100)]);
    const after = run([item("moved", "hold", 100, [definitive69b()])]);

    expect(diffRuns(before, after)).toEqual([
      {
        instructionId: "moved",
        legalName: "Proveedor Sintetico SA de CV",
        before: { action: "verify", state: "rojo" },
        after: { action: "hold", state: "cancelado" },
      },
    ]);
  });

  test("a line intake added reports no before", () => {
    const before = run([item("a", "hold", 100)]);
    const after = run([item("a", "hold", 100), item("new", "verify", 50)]);
    const changes = diffRuns(before, after);

    expect(changes).toHaveLength(1);
    expect(changes[0]?.instructionId).toBe("new");
    expect(changes[0]?.before).toBeNull();
  });

  test("a line whose amount changed but whose action and state did not is not reported", () => {
    /* A corrected amount is not a line that moved. Reporting it would put a
       sentence on the screen about a change nobody has to act on, and light up
       a row for it. */
    const before = run([item("a", "hold", 100)]);
    const after = run([item("a", "hold", 999_999)]);

    expect(diffRuns(before, after)).toEqual([]);
  });

  test("reports in the order of the new run", () => {
    const before = run([item("a", "verify", 1), item("b", "verify", 2)]);
    const after = run([item("a", "hold", 1), item("b", "hold", 2)]);

    expect(diffRuns(before, after).map((line) => line.instructionId)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("verdictDelta", () => {
  test("the same verdict moved nothing", () => {
    const verdict = runVerdict(
      run([item("a", "hold", 100, [definitive69b()])]),
    );

    expect(verdictDelta(verdict, verdict)).toEqual({
      retroactive69bExposure: 0,
      amountAtRisk: 0,
      heldCount: 0,
      toVerifyCount: 0,
    });
  });

  test("a publication moves the exposure and trades one count for the other", () => {
    /* The shape of beat 2: the line that was awaiting a call is now held, and
       the retroactive exposure the sweep priced arrives with it. */
    const before = runVerdict(run([item("a", "verify", 100)]));
    const after = runVerdict(run([item("a", "hold", 100, [definitive69b()])]));
    const delta = verdictDelta(before, after);

    expect(delta.retroactive69bExposure).toBe(404_152.59);
    expect(delta.heldCount).toBe(1);
    expect(delta.toVerifyCount).toBe(-1);
    expect(delta.amountAtRisk).toBeGreaterThan(0);
  });
});

describe("runChangeSentence", () => {
  const at = new Date("2026-09-12T14:03:22");

  test("says nothing at all when nothing moved", () => {
    /* The live region has to exist before it has anything to say, so the empty
       answer is the string and not a null: a region that is silent is a region
       that announces nothing. */
    expect(
      runChangeSentence(
        {
          retroactive69bExposure: 0,
          amountAtRisk: 0,
          heldCount: 0,
          toVerifyCount: 0,
        },
        [],
        at,
      ),
    ).toBe("");
  });

  test("names the retroactive exposure, the pesos at risk and the line", () => {
    const sentence = runChangeSentence(
      {
        retroactive69bExposure: 404_152.59,
        amountAtRisk: 404_152.59,
        heldCount: 1,
        toVerifyCount: -1,
      },
      [
        {
          instructionId: "INS-2026-09-07-070",
          legalName: "Materiales Sinteticos Ocho SA de CV",
          before: { action: "verify", state: "rojo" },
          after: { action: "hold", state: "cancelado" },
        },
      ],
      at,
    );

    expect(sentence).toContain("La exposicion retroactiva subio");
    expect(sentence).toContain("404,152.59");
    expect(sentence).toContain(
      "INS-2026-09-07-070 paso de Verificar a Retener",
    );
  });

  test("says nothing a level or a state may not say", () => {
    /* ADR-0009 reaches the live region too: it is a sentence on the screen. */
    const sentence = runChangeSentence(
      {
        retroactive69bExposure: -1_000,
        amountAtRisk: -1_000,
        heldCount: -1,
        toVerifyCount: 0,
      },
      [
        {
          instructionId: "INS-1",
          legalName: "Proveedor Sintetico SA de CV",
          before: null,
          after: { action: "release", state: "liberado" },
        },
      ],
      at,
    );

    expect(sentence).not.toMatch(/segur[oa]s?\b/i);
    expect(sentence).not.toMatch(/%/);
    expect(sentence).toContain("bajo");
    expect(sentence).toContain("INS-1 entro a la corrida en Liberar");
  });

  test("counts the lines it does not name", () => {
    /* A publication that re-scores nine lines must not print nine clauses into
       a live region while a judge is being talked at. */
    const changes = ["a", "b", "c", "d", "e"].map((id) => ({
      instructionId: id,
      legalName: "Proveedor Sintetico SA de CV",
      before: { action: "verify" as const, state: "rojo" as const },
      after: { action: "hold" as const, state: "rojo" as const },
    }));

    const sentence = runChangeSentence(
      {
        retroactive69bExposure: 0,
        amountAtRisk: 0,
        heldCount: 5,
        toVerifyCount: -5,
      },
      changes,
      at,
    );

    expect(sentence).toContain("y 2 lineas mas");
    expect(sentence).not.toContain("d paso");
  });
});

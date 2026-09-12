import { describe, expect, it } from "bun:test";
import type { Cfdi, SweepResult } from "@hackmty/core";
import {
  buildReplay,
  monthOf,
  monthsBetween,
  REPLAY_BUDGET_MS,
  stepDurationMs,
} from "./replay";

function cfdi(issuedAt: string, subtotal: number, uuid: string): Cfdi {
  return {
    uuid,
    issuedAt,
    issuerRfc: "SYN980101S01",
    issuerName: "Aceros y Laminas del Norte SA de CV",
    receiverRfc: "SYN090615C01",
    subtotal,
    iva: subtotal * 0.16,
    total: subtotal * 1.16,
    paymentMethod: "PPD",
    synthetic: true,
  };
}

function supplier(rfc: string) {
  return {
    rfc,
    legalName: `Proveedor ${rfc}`,
    knownAccounts: [],
    firstInvoiceAt: "2026-02-01T15:00:00.000Z",
    synthetic: true,
  };
}

const SWEEP: SweepResult = {
  listVersion: "2026-09-04",
  newlyListed: [
    {
      supplier: supplier("SYN980101S01"),
      status: "definitivo",
      paidCfdis: [
        cfdi("2026-02-10T15:00:00.000Z", 100000, "a"),
        cfdi("2026-05-10T15:00:00.000Z", 200000, "b"),
      ],
      deductedBase: 300000,
      isrExposure: 90000,
      ivaExposure: 48000,
    },
    {
      supplier: supplier("SYN990202S02"),
      status: "presunto",
      paidCfdis: [cfdi("2026-08-10T15:00:00.000Z", 50000, "c")],
      deductedBase: 50000,
      isrExposure: 15000,
      ivaExposure: 8000,
    },
  ],
  totalExposure: 161000,
};

describe("monthOf", () => {
  it("reads the month off an instant", () => {
    expect(monthOf("2026-08-11T16:40:00.000Z")).toBe("2026-08");
  });

  it("answers empty for something that is not an instant", () => {
    expect(monthOf("ayer")).toBe("");
  });
});

describe("monthsBetween", () => {
  it("fills the gap, so a quiet month still gets a tick", () => {
    expect(monthsBetween("2026-02", "2026-05")).toEqual([
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
  });

  it("crosses a year boundary", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("answers one month when both ends are the same", () => {
    expect(monthsBetween("2026-03", "2026-03")).toEqual(["2026-03"]);
  });
});

describe("buildReplay", () => {
  it("walks every month from the first paid invoice to the last", () => {
    const { frames } = buildReplay(SWEEP);

    expect(frames.map((frame) => frame.month)).toEqual([
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("lands exactly on the totals the engine reported", () => {
    const { frames, totals } = buildReplay(SWEEP);
    const last = frames[frames.length - 1];

    // The whole animation is worthless if it ends a cent away from the number
    // the sweep computed, so this is the assertion that matters most here.
    expect(last?.deductedBase).toBe(350000);
    expect(last?.isrExposure).toBe(105000);
    expect(last?.ivaExposure).toBe(56000);
    expect(last?.totalExposure).toBe(SWEEP.totalExposure);
    expect(totals.totalExposure).toBe(SWEEP.totalExposure);
  });

  it("lights a supplier in the month of its first already-paid invoice", () => {
    const { frames } = buildReplay(SWEEP);
    const byMonth = new Map(frames.map((frame) => [frame.month, frame]));

    expect(byMonth.get("2026-02")?.lit).toEqual(["SYN980101S01"]);
    expect(byMonth.get("2026-05")?.lit).toEqual([]);
    expect(byMonth.get("2026-08")?.lit).toEqual(["SYN990202S02"]);
  });

  it("never un-lights a supplier once it is lit", () => {
    const { frames } = buildReplay(SWEEP);

    let previous = 0;
    for (const frame of frames) {
      expect(frame.litSoFar.length).toBeGreaterThanOrEqual(previous);
      previous = frame.litSoFar.length;
    }
    expect(frames[frames.length - 1]?.litSoFar).toHaveLength(2);
  });

  it("only ever climbs, so a counter never runs backwards on screen", () => {
    const { frames } = buildReplay(SWEEP);

    let previous = -1;
    for (const frame of frames) {
      expect(frame.deductedBase).toBeGreaterThanOrEqual(previous);
      previous = frame.deductedBase;
    }
  });

  it("counts the invoices of each month", () => {
    const byMonth = new Map(
      buildReplay(SWEEP).frames.map((frame) => [frame.month, frame.invoices]),
    );

    expect(byMonth.get("2026-02")).toBe(1);
    expect(byMonth.get("2026-03")).toBe(0);
    expect(byMonth.get("2026-05")).toBe(1);
  });

  it("walks the whole ledger window, quiet months included", () => {
    const { frames } = buildReplay(SWEEP, {
      window: {
        from: "2026-01-05T15:00:00.000Z",
        to: "2026-09-30T15:00:00.000Z",
      },
    });

    // The story is eight months of this company's ledger replayed. A timeline
    // that skips the quiet months tells the reader the publication only
    // touched what it touched, which is the opposite of the point.
    expect(frames[0]?.month).toBe("2026-01");
    expect(frames[frames.length - 1]?.month).toBe("2026-09");
    expect(frames).toHaveLength(9);
    expect(frames[frames.length - 1]?.totalExposure).toBe(SWEEP.totalExposure);
  });

  it("never narrows the window below the invoices it has to show", () => {
    const { frames } = buildReplay(SWEEP, {
      window: {
        from: "2026-04-01T15:00:00.000Z",
        to: "2026-06-01T15:00:00.000Z",
      },
    });

    expect(frames[0]?.month).toBe("2026-02");
    expect(frames[frames.length - 1]?.month).toBe("2026-08");
  });

  it("ignores a window whose instants cannot be read", () => {
    const { frames } = buildReplay(SWEEP, {
      window: { from: "ayer", to: "manana" },
    });

    expect(frames[0]?.month).toBe("2026-02");
  });

  it("produces no frames for a sweep that priced nothing", () => {
    const empty = buildReplay({
      listVersion: "2026-09-04",
      newlyListed: [],
      totalExposure: 0,
    });

    expect(empty.frames).toEqual([]);
    expect(empty.totals.totalExposure).toBe(0);
  });

  it("survives a listed supplier with no paid invoice behind it", () => {
    const newsOnly = buildReplay({
      listVersion: "2026-09-04",
      newlyListed: [
        {
          supplier: supplier("SYN010303S03"),
          status: "presunto",
          paidCfdis: [],
          deductedBase: 0,
          isrExposure: 0,
          ivaExposure: 0,
        },
      ],
      totalExposure: 0,
    });

    expect(newsOnly.frames).toEqual([]);
  });

  it("skips an invoice whose date cannot be read rather than inventing a month", () => {
    const dirty = buildReplay({
      ...SWEEP,
      newlyListed: [
        {
          ...SWEEP.newlyListed[0],
          paidCfdis: [
            cfdi("2026-02-10T15:00:00.000Z", 100000, "a"),
            cfdi("ayer", 999999, "bad"),
          ],
        },
        SWEEP.newlyListed[1],
      ],
    } as SweepResult);

    expect(dirty.frames.some((frame) => frame.month === "")).toBe(false);
  });
});

describe("stepDurationMs", () => {
  it("keeps the whole replay inside the budget", () => {
    for (const frames of [1, 4, 8, 14, 40]) {
      expect(stepDurationMs(frames) * frames).toBeLessThanOrEqual(
        REPLAY_BUDGET_MS,
      );
    }
  });

  it("caps a short replay so three months do not crawl for a second each", () => {
    expect(stepDurationMs(2)).toBeLessThanOrEqual(320);
  });

  it("answers zero for no frames", () => {
    expect(stepDurationMs(0)).toBe(0);
  });
});

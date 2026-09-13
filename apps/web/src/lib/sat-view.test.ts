import { describe, expect, test } from "bun:test";
import type { LedgerEvent, SweepResult } from "@hackmty/core";
import { retryAfterSeconds } from "./api";
import type { PaymentRunItem } from "./contract";
import { mockRun, mockSweep } from "./mock";
import {
  definitiveSimulationSweep,
  satEventChangesRun,
  satLineState,
  satLookupFailure,
  satRunLines,
} from "./sat-view";

describe("SAT screen projections", () => {
  test("parses the Retry-After delta carried by a 429", () => {
    expect(retryAfterSeconds("17")).toBe(17);
    expect(retryAfterSeconds("not-a-delay")).toBeUndefined();
  });

  test("turns Retry-After into an actionable rate-limit message", () => {
    expect(
      satLookupFailure({
        status: 429,
        message: "rate limited",
        retryAfterSeconds: 17,
      }),
    ).toContain("17 segundos");
  });

  test("refreshes only for publication consequences", () => {
    const event = (type: LedgerEvent["type"]) => ({ type }) as LedgerEvent;

    expect(satEventChangesRun(event("sat_list_published"))).toBe(true);
    expect(satEventChangesRun(event("decision_made"))).toBe(true);
    expect(satEventChangesRun(event("payment_cancelled"))).toBe(true);
    expect(satEventChangesRun(event("cfdi_received"))).toBe(false);
  });

  test("a definitive synthetic publication moves the affected line to cancelado", () => {
    const line = satRunLines(mockRun().items)[0];
    expect(line).toBeDefined();
    expect(satLineState(line as PaymentRunItem)).toBe("rojo");
    expect(
      satLineState(
        line as PaymentRunItem,
        definitiveSimulationSweep(mockSweep()),
      ),
    ).toBe("cancelado");
  });

  test("a named person's release still wins after the publication", () => {
    const line = satRunLines(mockRun().items)[0] as PaymentRunItem;
    const released: PaymentRunItem = {
      ...line,
      decision: {
        ...line.decision,
        action: "release",
        decidedBy: "Lupita Elizondo",
      },
    };

    expect(satLineState(released, definitiveSimulationSweep(mockSweep()))).toBe(
      "liberado",
    );
  });

  test("a later publication cannot un-send a payment", () => {
    const line = satRunLines(mockRun().items)[0] as PaymentRunItem;
    const sent: PaymentRunItem = { ...line, state: "enviado" };

    expect(satLineState(sent, definitiveSimulationSweep(mockSweep()))).toBe(
      "enviado",
    );
  });

  test("leaves an unrelated line unchanged", () => {
    const unrelated = mockRun().items.find(
      (item) =>
        !mockSweep().newlyListed.some(
          (entry) => entry.supplier.rfc === item.instruction.supplierRfc,
        ),
    ) as PaymentRunItem;
    const emptySweep: SweepResult = { ...mockSweep(), newlyListed: [] };

    expect(satLineState(unrelated, mockSweep())).toBe(
      satLineState(unrelated, emptySweep),
    );
  });
});

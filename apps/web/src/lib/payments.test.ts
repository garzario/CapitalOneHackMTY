/**
 * What the payments screen is allowed to send, and what it has to say about
 * everything else.
 *
 * Every test here is about a refusal rather than about a happy path, because the
 * happy path of this screen is visible on the projector and the refusals are not.
 * Two of them are the ones ADR-0008 says cost the most to get wrong: a held line
 * that quietly disappears out of a run somebody is answering for, and a bank layout
 * that carries a payment the controls stopped.
 *
 * Half of the cases run over the generated synthetic run rather than over literals,
 * so the rules are exercised against the same 92 lines the API answers with, and a
 * seed that moves cannot leave a test passing on data that no longer exists.
 */

import { describe, expect, test } from "bun:test";
import type {
  Decision,
  Finding,
  PaymentExecutionLine,
  PaymentInstruction,
  Supplier,
  VerificationState,
} from "@hackmty/core";
import { sumAmounts } from "@hackmty/core";
import type { PaymentRun, PaymentRunItem } from "./contract";
import { bankName, mockExecution, mockRun, mockVerification } from "./mock";
import {
  applyExecutionLine,
  dispersalLayoutCsv,
  dispersalLayoutFilename,
  emptyExecution,
  excludedRows,
  executionTotalsOf,
  isUnstarted,
  LAYOUT_COLUMNS,
  layoutAmount,
  layoutRows,
  orderPaymentRows,
  type PaymentRow,
  paymentRows,
  runOutlook,
  runRows,
} from "./payments";

const AT = "2026-09-10T16:30:00.000Z";

/* ------------------------------------------------------------------ fixtures */

function supplier(rfc: string, legalName: string): Supplier {
  return {
    rfc,
    legalName,
    knownAccounts: [],
    firstInvoiceAt: "2026-01-02",
    synthetic: true,
  };
}

function instruction(
  id: string,
  amount: number,
  clabe = "032180000118359719",
): PaymentInstruction {
  return {
    id,
    supplierRfc: "SYN010101T01",
    cfdiUuids: ["4ef2a1d6-0f1a-4b27-9f6a-6f2bd1f9ac11"],
    clabe,
    amount,
    source: "email",
    receivedAt: "2026-09-08T10:00:00.000Z",
    synthetic: true,
  };
}

function decision(
  action: Decision["action"],
  decidedBy?: string,
  findings: Finding[] = [],
): Decision {
  return {
    instructionId: "ignored",
    action,
    expectedLoss: 0,
    delayCostPerDay: 0,
    findings,
    decidedAt: AT,
    ...(decidedBy === undefined ? {} : { decidedBy }),
  };
}

function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: "F-1",
    detector: "clabe_forensics",
    severity: "critical",
    state: "comprobable",
    subject: { kind: "instruction", id: "INS-1" },
    amountAtRisk: 1000,
    explanation: "la cuenta no tiene historial de pagos detras.",
    evidence: {},
    createdAt: AT,
    ...over,
  };
}

function item(over: Partial<PaymentRunItem> = {}): PaymentRunItem {
  return {
    instruction: instruction("INS-1", 1000),
    supplier: supplier("SYN010101T01", "Fundicion Sintetica SA de CV"),
    decision: decision("release", "Lupita Elizondo"),
    findings: [],
    ...over,
  };
}

function runOf(items: PaymentRunItem[]): PaymentRun {
  return {
    id: "run-test",
    weekOf: "2026-09-07",
    totals: mockRun().totals,
    items,
  };
}

function rowsOf(
  items: PaymentRunItem[],
  lines: PaymentExecutionLine[] = [],
  verifications: Record<string, VerificationState> = {},
): PaymentRow[] {
  const execution = lines.reduce(
    (folded, line) => applyExecutionLine(folded, line, AT),
    emptyExecution("run-test", AT),
  );

  return paymentRows(
    runOf(items),
    execution,
    (id) => verifications[id] ?? null,
  );
}

/* ------------------------------------------------------------- the execution */

describe("emptyExecution", () => {
  test("is the answer for a run nobody has executed, not an absence", () => {
    /* The API answers 200 with no lines rather than a 404, because "nothing has
       been sent" is an answer. The screen opens on exactly this value. */
    const execution = emptyExecution("run-test", AT);

    expect(execution.lines).toEqual([]);
    expect(execution.totals.lines).toBe(0);
    expect(execution.totals.amount).toBe(0);
    expect(isUnstarted(execution)).toBe(true);
  });
});

describe("executionTotalsOf", () => {
  test("splits the pesos into five disjoint buckets that add up exactly", () => {
    const totals = executionTotalsOf([
      { instructionId: "A", state: "settled", amount: 1000.11 },
      { instructionId: "B", state: "sent", amount: 2000.22 },
      { instructionId: "C", state: "queued", amount: 3000.33 },
      { instructionId: "D", state: "failed", amount: 4000.44 },
      { instructionId: "E", state: "cancelled", amount: 5000.55 },
    ]);

    expect(totals.lines).toBe(5);
    expect(
      totals.queued +
        totals.sent +
        totals.settled +
        totals.failed +
        totals.cancelled,
    ).toBe(5);
    expect(
      sumAmounts([
        totals.queuedAmount,
        totals.sentAmount,
        totals.settledAmount,
        totals.failedAmount,
        totals.cancelledAmount,
      ]),
    ).toBe(totals.amount);
    expect(totals.amount).toBe(15001.65);
  });

  test("adds money in cents, so eighty lines do not drift", () => {
    /* A bare `+` over these three lands a fraction of a centavo away from the
       API, and a total that does not match the rows is a total nobody can check. */
    const totals = executionTotalsOf([
      { instructionId: "A", state: "settled", amount: 0.1 },
      { instructionId: "B", state: "settled", amount: 0.2 },
      { instructionId: "C", state: "settled", amount: 0.3 },
    ]);

    expect(totals.settledAmount).toBe(0.6);
  });
});

describe("applyExecutionLine", () => {
  test("replaces the line of an instruction instead of appending a second one", () => {
    /* The execute stream pushes a line and the ledger channel pushes the same
       payment as an event. A screen that appended would show 172 lines for 86
       payments and the total would double. */
    const first = applyExecutionLine(
      emptyExecution("run-test", AT),
      { instructionId: "A", state: "sent", amount: 500 },
      AT,
    );
    const second = applyExecutionLine(
      first,
      {
        instructionId: "A",
        state: "settled",
        amount: 500,
        receiptId: "REC-A",
      },
      AT,
    );

    expect(second.lines).toHaveLength(1);
    expect(second.lines[0]?.state).toBe("settled");
    expect(second.totals.settled).toBe(1);
    expect(second.totals.sent).toBe(0);
    expect(second.totals.amount).toBe(500);
  });

  test("leaves the execution it was given alone", () => {
    const before = emptyExecution("run-test", AT);

    applyExecutionLine(
      before,
      { instructionId: "A", state: "sent", amount: 1 },
      AT,
    );

    expect(before.lines).toEqual([]);
  });
});

/* ------------------------------------------------------------------ the rows */

describe("paymentRows", () => {
  test("sends a released line nothing stops, and nothing else", () => {
    const rows = rowsOf([
      item({ decision: decision("release", "Lupita Elizondo") }),
      item({
        instruction: instruction("INS-2", 2000),
        decision: decision("hold", "Lupita Elizondo"),
        findings: [finding()],
      }),
      item({
        instruction: instruction("INS-3", 3000),
        decision: decision("verify"),
        findings: [finding({ severity: "warning" })],
      }),
    ]);

    expect(rows.map((row) => row.inRun)).toEqual([true, false, false]);
    expect(rows.map((row) => row.payable)).toEqual([true, false, false]);
    expect(rows[0]?.state).toBe("liberado");
    expect(rows[1]?.state).toBe("rojo");
    expect(rows[2]?.state).toBe("rojo");
  });

  test("keeps a blocked beneficiary out, and says the CEP is why", () => {
    /* The line is released and the verification contradicts it, which ADR-0009
       reads as `cancelado`. The API refuses to send it, so the screen may not
       offer it either. */
    const rows = rowsOf(
      [item({ instruction: instruction("INS-9", 227819.37) })],
      [],
      {
        "INS-9": {
          instructionId: "INS-9",
          state: "blocked",
          updatedAt: AT,
        } as VerificationState,
      },
    );

    expect(rows[0]?.state).toBe("cancelado");
    expect(rows[0]?.inRun).toBe(true);
    expect(rows[0]?.payable).toBe(false);
    expect(rows[0]?.exclusion?.rule).toBe("verification_blocked");
    expect(rows[0]?.exclusion?.sentence).toContain("CEP");
  });

  test("keeps a definitively listed supplier out, and names the SAT", () => {
    const listed = finding({
      detector: "sat_69b",
      evidence: { status: "definitivo" },
    });
    const rows = rowsOf([
      item({
        decision: decision("release", "system", [listed]),
        findings: [listed],
      }),
    ]);

    expect(rows[0]?.state).toBe("cancelado");
    expect(rows[0]?.inRun).toBe(true);
    expect(rows[0]?.payable).toBe(false);
    expect(rows[0]?.exclusion?.rule).toBe("sat_definitive");
    expect(rows[0]?.exclusion?.sentence).toContain("SAT");
  });

  test("lets a person's signature beat the listing, which is ADR-0002", () => {
    /* A release signed by a named person with a reason overrides the listing and
       the line leaves. The engine's own `system` release does not, which is the
       case above. */
    const listed = finding({
      detector: "sat_69b",
      evidence: { status: "definitivo" },
    });
    const rows = rowsOf([
      item({
        decision: decision("release", "Lupita Elizondo", [listed]),
        findings: [listed],
      }),
    ]);

    expect(rows[0]?.state).toBe("liberado");
    expect(rows[0]?.payable).toBe(true);
    expect(rows[0]?.exclusion).toBeNull();
  });

  test("quotes the engine's own explanation on a held line", () => {
    /* The same sentence the run screen shows. Composing a second wording here is
       how one payment ends up with two reasons depending on the screen. */
    const stopped = finding({
      amountAtRisk: 90000,
      explanation: "la CLABE cambio de banco entre una factura y la siguiente.",
    });
    const rows = rowsOf([
      item({
        decision: decision("hold", "Lupita Elizondo"),
        findings: [finding({ id: "F-2", amountAtRisk: 10 }), stopped],
      }),
    ]);

    expect(rows[0]?.exclusion?.sentence).toContain(stopped.explanation);
  });

  test("reads the state the API derived rather than deriving a second one", () => {
    /* The run payload carries `confidence` and `state` per line. When they are
       there they are used, because the API computed them with the verification in
       hand and a screen that recomputed would be the fourth implementation
       ADR-0009 exists to remove. */
    const rows = rowsOf([item({ confidence: "alerta", state: "cancelado" })]);

    expect(rows[0]?.confidence).toBe("alerta");
    expect(rows[0]?.baseline).toBe("cancelado");
    expect(rows[0]?.payable).toBe(false);
  });

  test("turns enviado once the rail answered, and keeps the clave", () => {
    const rows = rowsOf(
      [item()],
      [
        {
          instructionId: "INS-1",
          state: "settled",
          amount: 1000,
          claveRastreo: "SYNRUNINS1",
          rail: "nessie",
          receiptId: "REC-1",
        },
      ],
    );

    expect(rows[0]?.state).toBe("enviado");
    expect(rows[0]?.line?.claveRastreo).toBe("SYNRUNINS1");
    expect(rows[0]?.exclusion).toBeNull();
  });

  test("never lets a list published later un-send a payment", () => {
    /* ADR-0009 rule 1. Money that left outranks everything, including a listing
       that lands afterwards, because a screen that read `cancelado` over a
       settled transfer would be lying about the one thing nobody can take back. */
    const listed = finding({
      detector: "sat_69b",
      evidence: { status: "definitivo" },
    });
    const rows = rowsOf(
      [
        item({
          decision: decision("release", "system", [listed]),
          findings: [listed],
        }),
      ],
      [{ instructionId: "INS-1", state: "settled", amount: 1000 }],
    );

    expect(rows[0]?.state).toBe("enviado");
  });

  test("shows the rail's own sentence on a cancelled or a failed line", () => {
    const rows = rowsOf(
      [item(), item({ instruction: instruction("INS-2", 2000) })],
      [
        {
          instructionId: "INS-1",
          state: "cancelled",
          amount: 1000,
          reason: "El CEP nombra a otra empresa.",
        },
        {
          instructionId: "INS-2",
          state: "failed",
          amount: 2000,
          reason: "El banco rechazo la cuenta.",
        },
      ],
    );

    expect(rows[0]?.exclusion).toEqual({
      rule: "execution_cancelled",
      sentence: "El CEP nombra a otra empresa.",
    });
    expect(rows[1]?.exclusion).toEqual({
      rule: "execution_failed",
      sentence: "El banco rechazo la cuenta.",
    });
  });

  test("says so when a failure arrived with no sentence against it", () => {
    /* A failure nobody can read is a line that quietly disappears from a run. The
       API is required to send a reason and this is what the screen does when one
       is missing anyway. */
    const rows = rowsOf(
      [item()],
      [{ instructionId: "INS-1", state: "failed", amount: 1000 }],
    );

    expect(rows[0]?.exclusion?.sentence).not.toBe("");
    expect(rows[0]?.exclusion?.rule).toBe("execution_failed");
  });
});

describe("orderPaymentRows", () => {
  test("puts what is leaving first, then the largest amount", () => {
    const rows = rowsOf([
      item({ instruction: instruction("INS-SMALL", 10) }),
      item({
        instruction: instruction("INS-HELD", 999_999),
        decision: decision("hold", "Lupita Elizondo"),
        findings: [finding()],
      }),
      item({ instruction: instruction("INS-BIG", 5000) }),
    ]);

    expect(
      orderPaymentRows(rows).map((row) => row.item.instruction.id),
    ).toEqual(["INS-BIG", "INS-SMALL", "INS-HELD"]);
  });
});

/* -------------------------------------------------------------- the headline */

describe("runOutlook", () => {
  test("counts lines and adds pesos, both, and no ratio anywhere", () => {
    const rows = rowsOf(
      [
        item(),
        item({ instruction: instruction("INS-2", 2000) }),
        item({
          instruction: instruction("INS-3", 3000),
          decision: decision("hold", "Lupita Elizondo"),
          findings: [finding()],
        }),
      ],
      [
        {
          instructionId: "INS-1",
          state: "settled",
          amount: 1000,
          receiptId: "REC-1",
        },
      ],
    );
    const outlook = runOutlook(rows);

    expect(outlook.inRun).toBe(2);
    expect(outlook.inRunAmount).toBe(3000);
    expect(outlook.stopped).toBe(0);
    expect(outlook.excluded).toBe(1);
    expect(outlook.excludedAmount).toBe(3000);
    expect(outlook.answered).toBe(1);
    expect(outlook.left).toBe(1);
    expect(outlook.leftAmount).toBe(1000);
    expect(outlook.settled).toBe(1);
    expect(outlook.receipts).toBe(1);
    expect(outlook.pending).toBe(1);
    expect(outlook.pendingAmount).toBe(2000);
  });

  test("reports nothing left to send once every released line is enviado", () => {
    const rows = rowsOf(
      [item()],
      [{ instructionId: "INS-1", state: "sent", amount: 1000 }],
    );

    expect(runOutlook(rows).pending).toBe(0);
  });
});

/* ---------------------------------------------------------- the bank layout */

describe("the dispersal layout", () => {
  test("carries only what may still be paid", () => {
    /* Two rules in one list. A held line in this file would be the control being
       bypassed by the export, and a line already on the rail would be a supplier
       paid twice. */
    const rows = rowsOf(
      [
        item(),
        item({ instruction: instruction("INS-SENT", 2000) }),
        item({
          instruction: instruction("INS-HELD", 3000),
          decision: decision("hold", "Lupita Elizondo"),
          findings: [finding()],
        }),
      ],
      [{ instructionId: "INS-SENT", state: "settled", amount: 2000 }],
    );

    expect(layoutRows(rows).map((row) => row.item.instruction.id)).toEqual([
      "INS-1",
    ]);
  });

  test("writes the header and one row per payment", () => {
    const rows = rowsOf([item()]);
    const csv = dispersalLayoutCsv(rows, () => "BANORTE");

    expect(csv.split("\n")[0]).toBe(LAYOUT_COLUMNS.join(","));
    expect(csv.split("\n")).toHaveLength(3);
    expect(csv.endsWith("\n")).toBe(true);
    expect(csv).toContain("INS-1,Fundicion Sintetica SA de CV,SYN010101T01");
  });

  test("writes the amount as a machine parses it and not as a person reads it", () => {
    /* `formatMoney` writes $1,234.56 in es-MX, which a bank portal reads as
       something else or refuses. A file is not a screen. */
    expect(layoutAmount(1234.5)).toBe("1234.50");
    expect(layoutAmount(100000)).toBe("100000.00");
    expect(dispersalLayoutCsv(rowsOf([item()]), () => "BANORTE")).toContain(
      ",1000.00,",
    );
  });

  test("quotes a legal name that carries a comma instead of splitting it", () => {
    /* A company whose name has a comma in it is not hypothetical here, and a file
       that splits one supplier across two columns pays the wrong row. */
    const rows = rowsOf([
      item({
        supplier: supplier("SYN010101T01", 'Aceros, Laminas y "Mas" SA de CV'),
      }),
    ]);
    const csv = dispersalLayoutCsv(rows, () => "BANORTE");

    expect(csv).toContain('"Aceros, Laminas y ""Mas"" SA de CV"');
    expect(csv.split("\n")).toHaveLength(3);
  });

  test("writes only the header when there is nothing left to pay", () => {
    const csv = dispersalLayoutCsv([], () => "BANORTE");

    expect(csv).toBe(`${LAYOUT_COLUMNS.join(",")}\n`);
  });

  test("names the file after the run, with nothing a filesystem rejects", () => {
    expect(dispersalLayoutFilename("run-2026-09-07")).toBe(
      "layout-dispersion-run-2026-09-07.csv",
    );
    expect(dispersalLayoutFilename("run/2026 09")).toBe(
      "layout-dispersion-run-2026-09.csv",
    );
  });
});

/* ------------------------------------------- over the generated synthetic run */

describe("the synthetic run of this company", () => {
  const run = mockRun();
  const verify = (id: string) => mockVerification(id);

  test("takes exactly the lines the generated execution carries", () => {
    /* The set `POST /run/:id/execute` hands the rail, read off both sides: the
       decisions of the run, and the lines the execution came back with. If these
       ever disagree, one of the two is wrong about a payment. */
    const rows = paymentRows(run, emptyExecution(run.id, AT), verify);
    const ids = (values: string[]) => [...values].sort();

    expect(rows).toHaveLength(run.items.length);
    expect(ids(runRows(rows).map((row) => row.item.instruction.id))).toEqual(
      ids(mockExecution().lines.map((line) => line.instructionId)),
    );
  });

  test("pays every line it takes except the ones a control stops", () => {
    /* The second question. One line of this run is released and its beneficiary
       came back blocked, so the run takes it and the rail cancels it, which is
       exactly the `cancelled` bucket of the generated execution. */
    const rows = paymentRows(run, emptyExecution(run.id, AT), verify);
    const outlook = runOutlook(rows);

    expect(outlook.stopped).toBe(mockExecution().totals.cancelled);
    expect(outlook.pending).toBe(outlook.inRun - outlook.stopped);
  });

  test("gives every line that is not going to be paid a sentence", () => {
    /* No exception, on either table. A line that stops with no words against it
       is a payment nobody can answer for. */
    const rows = paymentRows(run, emptyExecution(run.id, AT), verify);
    const silent = rows.filter(
      (row) =>
        !row.payable && (row.exclusion?.sentence ?? "").trim().length < 10,
    );

    expect(silent).toEqual([]);
  });

  test("never takes a line the engine stopped", () => {
    const rows = paymentRows(run, emptyExecution(run.id, AT), verify);

    for (const row of runRows(rows)) {
      expect(row.item.decision.action).toBe("release");
    }
    for (const row of excludedRows(rows)) {
      expect(row.item.decision.action).not.toBe("release");
    }
  });

  test("reads the generated execution back as the run it executed", () => {
    const execution = mockExecution();
    const rows = paymentRows(run, execution, verify);
    const outlook = runOutlook(rows);

    expect(outlook.answered).toBe(execution.totals.lines);
    expect(outlook.sent).toBe(execution.totals.sent);
    expect(outlook.settled).toBe(execution.totals.settled);
    expect(outlook.queued).toBe(execution.totals.queued);
    expect(outlook.cancelled).toBe(execution.totals.cancelled);
    expect(outlook.receipts).toBe(
      execution.totals.sent + execution.totals.settled,
    );
    expect(
      sumAmounts(
        rows
          .filter((row) => row.line !== undefined)
          .map((row) => row.item.instruction.amount),
      ),
    ).toBe(execution.totals.amount);
  });

  test("never says enviado over a line the rail never carried", () => {
    const rows = paymentRows(run, mockExecution(), verify);

    for (const row of rows) {
      if (row.state === "enviado") {
        expect(
          row.line?.state === "sent" || row.line?.state === "settled",
        ).toBe(true);
      }
    }
  });

  test("exports a layout of every line the run may pay, and no other", () => {
    const rows = paymentRows(run, emptyExecution(run.id, AT), verify);
    const csv = dispersalLayoutCsv(rows, bankName);
    const outlook = runOutlook(rows);

    expect(csv.trim().split("\n")).toHaveLength(outlook.pending + 1);

    for (const row of layoutRows(rows)) {
      expect(csv).toContain(row.item.instruction.clabe);
      expect(row.payable).toBe(true);
    }
  });

  test("exports nothing once the rail is holding every line", () => {
    /* The honest rule rather than a convenient one. Every line of the executed run
       has an execution line, including the one still `queued`, and a bank file that
       repeated any of them is how a supplier gets paid twice. */
    const rows = paymentRows(run, mockExecution(), verify);

    expect(layoutRows(rows)).toEqual([]);
  });

  test("says no probability and never the word ADR-0009 forbids", () => {
    /* The whole vocabulary of this screen in one assertion: every level is one of
       three words, and no sentence the screen composes carries a figure with a
       percent sign or the verdict nobody can give about a SPEI. */
    const rows = paymentRows(run, mockExecution(), verify);

    for (const row of rows) {
      expect(["confiable", "precaucion", "alerta"]).toContain(row.confidence);

      const sentence = row.exclusion?.sentence ?? "";

      expect(sentence).not.toMatch(/%/);
      expect(sentence.toLowerCase()).not.toContain("seguro");
    }
  });
});

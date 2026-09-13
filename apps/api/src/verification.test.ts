/**
 * The one-cent verification, end to end and with no network anywhere.
 *
 * The rail is `FakeRail`, the CEP comes out of a `staticCepInbox` built here, and
 * the findings and the action come from the real `@hackmty/engine` and
 * `@hackmty/core`. Nothing about the outcome is written in this file: the tests
 * assert that a matching holder releases a payment the CLABE control was holding
 * and that a holder who is somebody else blocks one, and both answers are the
 * engine's.
 *
 * The two seeded lines used here are from the hand-written fixture in
 * `src/synthetic.ts`. `ins-2026w37-01` pays an account one digit away from the one
 * this supplier has been paid on seven times, which is the case the demo opens on.
 * `ins-2026w37-02` pays the account it always pays, so nothing is holding it and
 * the CEP is the only thing that can stop it.
 */

import { describe, expect, it } from "bun:test";
import { type SyntheticCepFields, syntheticCepFor } from "@hackmty/cep";
import type { Cep, LedgerEvent } from "@hackmty/core";
import { SYSTEM_DECIDER } from "@hackmty/core";
import { FakeRail, NO_RAIL, RailSendError } from "@hackmty/rail";
import { staticCepInbox } from "./cep";
import type { Repository } from "./repo";
import { verificationStateSchema } from "./schemas";
import { createTestApp, createTestClock, TEST_NOW } from "./test-app";
import {
  foldVerification,
  verificationStateOf,
  verifyAccount,
} from "./verification";

/** One digit off the account it has been paid on. Held by the CLABE control. */
const CHANGED_ACCOUNT_ID = "ins-2026w37-01";
const CHANGED_ACCOUNT_CLABE = "058580000123456812";
const CHANGED_ACCOUNT_SUPPLIER = "Aceros y Perfiles del Norte SA de CV";

/** The ordinary line: the usual account, nothing holding it. */
const CLEAN_ID = "ins-2026w37-02";
const CLEAN_CLABE = "012580000987654320";

/** The clave the fake rail mints for the first probe of a process. */
const CLAVE = "SYNVER0000000001";

function cepFields(overrides: Partial<SyntheticCepFields> = {}) {
  return {
    claveRastreo: CLAVE,
    transferredAt: "2026-09-12T09:15:42.000-06:00",
    amount: 0.01,
    senderName: "Distribuidora Sintetica del Norte SA de CV",
    senderBank: "SinteticoDos",
    senderAccount: "012180000123456782",
    senderRfc: "SYN090615C01",
    beneficiaryName: CHANGED_ACCOUNT_SUPPLIER.toUpperCase(),
    beneficiaryBank: "SinteticoUno",
    beneficiaryAccount: CHANGED_ACCOUNT_CLABE,
    beneficiaryRfc: "SYN010101AAA",
    concepto: "Verificacion de cuenta",
    ...overrides,
  } satisfies SyntheticCepFields;
}

/**
 * A harness whose rail is the in-process one and whose CEP index holds exactly
 * what the test filed in it.
 */
function harness(ceps: readonly Cep[], mint?: (sequence: number) => string) {
  const rail = new FakeRail({
    now: () => TEST_NOW,
    ...(mint === undefined
      ? {}
      : { mint: (_request, sequence) => mint(sequence) }),
  });

  return {
    rail,
    ...createTestApp({
      rail: async () => ({ ok: true, rail }),
      cepInbox: staticCepInbox(ceps, "test CEP index"),
    }),
  };
}

/**
 * The verification events of one line, through the repository method the endpoint
 * uses. The fixture ledger already holds a `cep_verified` for a different account,
 * so filtering by hand here would quietly read somebody else's evidence.
 */
async function eventsOf(
  deps: { repo: Repository },
  id: string,
  clabe: string,
): Promise<LedgerEvent[]> {
  const events = await deps.repo.verificationEvents(id, clabe);
  return events.filter(
    (event) =>
      event.type !== "decision_made" ||
      event.decision.decidedBy === SYSTEM_DECIDER,
  );
}

describe("POST verify-account, the pipeline", () => {
  /**
   * The headline of issue #165: one call, no typing, and the large payment the
   * CLABE control was holding is released because Banxico says the account
   * belongs to the supplier on the invoice.
   */
  it("releases the held payment when the CEP names the supplier", async () => {
    const { deps } = harness([syntheticCepFor(cepFields())]);

    const outcome = await verifyAccount(deps, CHANGED_ACCOUNT_ID);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const state = verificationStateSchema.parse(outcome.state);
    expect(state.state).toBe("released");
    expect(state.rail).toBe("nessie");
    expect(state.claveRastreo).toBe(CLAVE);
    expect(state.holderName).toBe(CHANGED_ACCOUNT_SUPPLIER.toUpperCase());
    expect(state.legalName).toBe(CHANGED_ACCOUNT_SUPPLIER);
    expect(state.nameMatch).toBe("match");
    // The seal was never checked, because this server holds no certificate, and
    // the state says exactly that instead of claiming a validated signature.
    expect(state.sealState).toBe("not_checked");
    expect(state.decision?.action).toBe("release");
    expect(state.decision?.decidedBy).toBe(SYSTEM_DECIDER);
    expect(outcome.pending).toBeUndefined();
  });

  it("blocks the payment when the CEP names somebody else", async () => {
    const { deps } = harness([
      syntheticCepFor(
        cepFields({
          beneficiaryAccount: CLEAN_CLABE,
          beneficiaryName: "COMERCIALIZADORA VERTICE DEL GOLFO SA DE CV",
          beneficiaryRfc: "SYN020202BBB",
        }),
      ),
    ]);

    const outcome = await verifyAccount(deps, CLEAN_ID);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const state = outcome.state;
    expect(state.state).toBe("blocked");
    expect(state.nameMatch).toBe("mismatch");
    expect(state.decision?.action).not.toBe("release");
    const finding = state.decision?.findings.find(
      (row) => row.detector === "beneficiary_cep",
    );
    expect(finding?.severity).toBe("critical");
    // The engine authored that finding, not this endpoint: the explanation is the
    // one control 5 writes, in Spanish, naming both sides of the comparison.
    expect(finding?.explanation).toContain("COMERCIALIZADORA VERTICE");
  });

  it("appends cent_sent with the clave, the rail and four digits of the account", async () => {
    const { deps } = harness([syntheticCepFor(cepFields())]);

    await verifyAccount(deps, CHANGED_ACCOUNT_ID);
    const events = await eventsOf(
      deps,
      CHANGED_ACCOUNT_ID,
      CHANGED_ACCOUNT_CLABE,
    );
    const sent = events.find((event) => event.type === "cent_sent");

    expect(sent).toEqual({
      type: "cent_sent",
      at: TEST_NOW,
      instructionId: CHANGED_ACCOUNT_ID,
      rail: "nessie",
      claveRastreo: CLAVE,
      amount: 0.01,
      clabeLast4: "6812",
      simulated: true,
    });
    // The full CLABE is on the instruction already and does not need a second
    // home in the ledger, exactly like the verification call's clabeLast4.
    expect(JSON.stringify(sent)).not.toContain(CHANGED_ACCOUNT_CLABE);
  });

  it("appends the events in the order a replay has to read them", async () => {
    const { deps } = harness([syntheticCepFor(cepFields())]);

    await verifyAccount(deps, CHANGED_ACCOUNT_ID);
    const events = await eventsOf(
      deps,
      CHANGED_ACCOUNT_ID,
      CHANGED_ACCOUNT_CLABE,
    );

    expect(events.map((event) => event.type)).toEqual([
      "cent_sent",
      "cep_verified",
      "decision_made",
    ]);
  });

  it("arms control 5 by storing the registry row the CEP proves", async () => {
    const { deps } = harness([syntheticCepFor(cepFields())]);

    await verifyAccount(deps, CHANGED_ACCOUNT_ID);
    const rows = await deps.repo.beneficiaries();
    const row = rows.find((entry) => entry.clabe === CHANGED_ACCOUNT_CLABE);

    expect(row?.supplierRfc).toBe("SYN010101AAA");
    expect(row?.cep.claveRastreo).toBe(CLAVE);
    // And the account is now a known account established by a CEP, which is what
    // the CLABE control reads when it stops calling it a new account.
    const supplier = await deps.repo.findSupplier("SYN010101AAA");
    expect(
      supplier?.knownAccounts.find(
        (account) => account.clabe === CHANGED_ACCOUNT_CLABE,
      )?.establishedBy,
    ).toBe("cep");
  });

  it("waits on awaiting_cep when Banxico has published nothing yet", async () => {
    const { deps } = harness([]);

    const outcome = await verifyAccount(deps, CHANGED_ACCOUNT_ID);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.state.state).toBe("awaiting_cep");
    expect(outcome.state.claveRastreo).toBe(CLAVE);
    expect(outcome.state.cepAt).toBeNull();
    expect(outcome.state.decision).toBeNull();

    const awaited = (
      await eventsOf(deps, CHANGED_ACCOUNT_ID, CHANGED_ACCOUNT_CLABE)
    ).find((event) => event.type === "cep_awaited");
    expect(awaited?.type).toBe("cep_awaited");
    if (awaited?.type === "cep_awaited") {
      expect(awaited.attempts).toBe(1);
      expect(awaited.reason).toContain("no CEP");
    }
  });

  /**
   * The bounded retry, driven with an injected sleep rather than a fake timer: the
   * whole budget is spent in microseconds and the assertion is on the end of the
   * machine, not on a wall clock.
   */
  it("finishes the machine from the background poll once the CEP appears", async () => {
    const cep = syntheticCepFor(cepFields());
    let published = false;
    const { deps } = createTestApp({
      rail: async () => ({
        ok: true,
        rail: new FakeRail({ now: () => TEST_NOW }),
      }),
      cepInbox: {
        describe: "a CEP that appears on the second ask",
        byClave: async (clave) => {
          if (!published) {
            published = true;
            return undefined;
          }
          return clave === CLAVE ? cep : undefined;
        },
      },
      verification: {
        pollIntervalMs: 1,
        pollDeadlineMs: 10,
        sleep: async () => {},
      },
    });

    const outcome = await verifyAccount(deps, CHANGED_ACCOUNT_ID);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.state.state).toBe("awaiting_cep");

    await outcome.pending;

    const detail = await deps.repo.instructionDetail(CHANGED_ACCOUNT_ID);
    const state = await verificationStateOf(deps, detail ?? never());
    expect(state.state).toBe("released");
    expect(state.cepAt).toBe(TEST_NOW);
  });

  it("gives up at the deadline and records how long it waited", async () => {
    const { deps } = createTestApp({
      rail: async () => ({
        ok: true,
        rail: new FakeRail({ now: () => TEST_NOW }),
      }),
      cepInbox: staticCepInbox([], "empty"),
      verification: {
        pollIntervalMs: 2,
        pollDeadlineMs: 6,
        sleep: async () => {},
      },
    });

    const outcome = await verifyAccount(deps, CHANGED_ACCOUNT_ID);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    await outcome.pending;

    const awaited = (
      await eventsOf(deps, CHANGED_ACCOUNT_ID, CHANGED_ACCOUNT_CLABE)
    ).filter((event) => event.type === "cep_awaited");
    const last = awaited.at(-1);
    expect(last?.type).toBe("cep_awaited");
    if (last?.type === "cep_awaited") {
      expect(last.waitedMs).toBe(6);
      expect(last.attempts).toBe(4);
    }
  });

  it("answers not_found for an instruction nobody holds", async () => {
    const { deps } = harness([]);

    const outcome = await verifyAccount(deps, "ins-nope");

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure).toBe("not_found");
    }
  });

  it("refuses a second cent once the payment is resolved", async () => {
    const { deps } = harness([syntheticCepFor(cepFields())]);

    await verifyAccount(deps, CHANGED_ACCOUNT_ID);
    const again = await verifyAccount(deps, CHANGED_ACCOUNT_ID);

    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.failure).toBe("conflict");
      expect(again.state?.state).toBe("released");
      expect(again.message).toContain("already released");
    }
  });

  /**
   * A rail that refused is the same answer to the caller as having no rail, and the
   * ledger must not carry a `cent_sent` for a cent that never left.
   */
  it("appends nothing when the rail refuses the cent", async () => {
    const { deps } = createTestApp({
      rail: async () => ({
        ok: true,
        rail: {
          rail: "nessie",
          describe: "a rail that refuses",
          sendCent: async () => {
            throw new RailSendError(
              "nessie",
              "the cent was not recorded on the bank mirror",
            );
          },
          send: async () => {
            throw new RailSendError(
              "nessie",
              "this rail refuses everything, the payment included",
            );
          },
        },
      }),
    });

    const outcome = await verifyAccount(deps, CHANGED_ACCOUNT_ID);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure).toBe("rail_failed");
      expect(outcome.message).toContain("bank mirror");
    }
    const events = await eventsOf(
      deps,
      CHANGED_ACCOUNT_ID,
      CHANGED_ACCOUNT_CLABE,
    );
    expect(events.some((event) => event.type === "cent_sent")).toBe(false);
  });

  /** A server with no rail says which variables it wants, and sends nothing. */
  it("reports the missing rail instead of pretending to send a cent", async () => {
    const { deps } = createTestApp();

    const outcome = await verifyAccount(deps, CHANGED_ACCOUNT_ID);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure).toBe("no_rail");
      expect(outcome.message).toBe(NO_RAIL);
    }
    const events = await deps.repo.ledger({ limit: 1000 });
    expect(events.some((event) => event.type === "cent_sent")).toBe(false);
  });
});

describe("GET verification", () => {
  it("answers not_started before anything happened", async () => {
    const { deps } = harness([]);
    const detail = await deps.repo.instructionDetail(CHANGED_ACCOUNT_ID);

    const state = await verificationStateOf(deps, detail ?? never());

    expect(verificationStateSchema.parse(state)).toEqual({
      instructionId: CHANGED_ACCOUNT_ID,
      state: "not_started",
      rail: null,
      claveRastreo: null,
      centSentAt: null,
      cepAt: null,
      sealState: null,
      holderName: null,
      legalName: CHANGED_ACCOUNT_SUPPLIER,
      nameMatch: null,
      decision: null,
      updatedAt: TEST_NOW,
    });
  });
});

describe("foldVerification", () => {
  const instruction = {
    id: "INS-1",
    supplierRfc: "SYN010101AAA",
    cfdiUuids: [],
    clabe: CHANGED_ACCOUNT_CLABE,
    amount: 184_300,
    source: "whatsapp" as const,
    receivedAt: TEST_NOW,
    synthetic: true,
  };
  const supplier = {
    rfc: "SYN010101AAA",
    legalName: CHANGED_ACCOUNT_SUPPLIER,
    knownAccounts: [],
    firstInvoiceAt: TEST_NOW,
    synthetic: true,
  };

  function fold(events: LedgerEvent[]) {
    return foldVerification(instruction, supplier, events, TEST_NOW);
  }

  it("ignores events about another instruction and another account", () => {
    const state = fold([
      {
        type: "cent_sent",
        at: TEST_NOW,
        instructionId: "INS-OTHER",
        rail: "nessie",
        claveRastreo: CLAVE,
        amount: 0.01,
        clabeLast4: "6812",
        simulated: true,
      },
      {
        type: "cep_verified",
        at: TEST_NOW,
        supplierRfc: "SYN010101AAA",
        cep: syntheticCepFor(
          cepFields({ beneficiaryAccount: "072580000456123788" }),
        ),
      },
    ]);

    expect(state.state).toBe("not_started");
    expect(state.cepAt).toBeNull();
  });

  /**
   * A backdated event is legal in an append-only ledger, so the machine may never
   * be walked backwards by one: a `cep_awaited` stamped before a CEP that already
   * arrived must not erase it.
   */
  it("never walks the machine backwards", () => {
    const state = fold([
      {
        type: "cep_verified",
        at: "2026-09-12T04:00:00.000Z",
        supplierRfc: "SYN010101AAA",
        cep: syntheticCepFor(cepFields()),
      },
      {
        type: "cep_awaited",
        at: "2026-09-12T03:59:00.000Z",
        instructionId: "INS-1",
        claveRastreo: CLAVE,
        attempts: 2,
        waitedMs: 100,
        reason: "not yet",
      },
    ]);

    expect(state.state).toBe("cep_signed");
    expect(state.claveRastreo).toBe(CLAVE);
  });

  /**
   * A release a person signed is theirs and is recorded as theirs. Folding it in
   * here would let the verification take credit for somebody else's decision.
   */
  it("does not read a decision a person signed as a verification outcome", () => {
    const state = fold([
      {
        type: "cent_sent",
        at: TEST_NOW,
        instructionId: "INS-1",
        rail: "nessie",
        claveRastreo: CLAVE,
        amount: 0.01,
        clabeLast4: "6812",
        simulated: true,
      },
      {
        type: "cep_verified",
        at: TEST_NOW,
        supplierRfc: "SYN010101AAA",
        cep: syntheticCepFor(cepFields()),
      },
      {
        type: "decision_made",
        at: TEST_NOW,
        decision: {
          instructionId: "INS-1",
          action: "release",
          expectedLoss: 0,
          delayCostPerDay: 0,
          findings: [],
          decidedAt: TEST_NOW,
          decidedBy: "patricio",
        },
      },
    ]);

    expect(state.state).toBe("cep_signed");
    expect(state.decision).toBeNull();
  });

  it("reports the clock when no event has happened", () => {
    const clock = createTestClock("2026-09-13T00:00:00.000Z");

    expect(
      foldVerification(instruction, supplier, [], clock.now()).updatedAt,
    ).toBe("2026-09-13T00:00:00.000Z");
  });
});

/** A detail this fixture always has. Keeps the tests free of non-null assertions. */
function never(): never {
  throw new Error("the fixture instruction is missing");
}

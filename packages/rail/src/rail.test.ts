/**
 * The rules every rail is held to, and the in-process one.
 *
 * No network, no key, no `.env`: the rail resolution is driven with explicit
 * arguments, so a teammate holding a Nessie key and CI holding none get the same
 * result from the same test.
 */

import { describe, expect, it } from "bun:test";
import {
  assertClaveRastreo,
  assertNoIdentity,
  CENT_AMOUNT,
  CENT_DESCRIPTION,
  CLAVE_RASTREO_MAX_LENGTH,
  claveRastreoFrom,
  FakeRail,
  NO_RAIL,
  RailConfigError,
  railNameFrom,
  resolveRail,
  STP_NOT_CONFIGURED,
  syntheticClave,
  unknownRail,
} from "./index";

describe("the cent", () => {
  it("is one centavo and nothing else", () => {
    expect(CENT_AMOUNT).toBe(0.01);
  });

  it("travels with a description that names no supplier and no account", () => {
    expect(CENT_DESCRIPTION).not.toMatch(/\d{10,}/);
    expect(assertNoIdentity(CENT_DESCRIPTION)).toBe(CENT_DESCRIPTION);
  });

  /**
   * The guard is a guard and not a sanitiser: a CLABE in a description is a bug in
   * the caller, and stripping it silently would hide the bug and leave the next
   * caller to rediscover it.
   */
  it("refuses a description carrying a CLABE", () => {
    expect(() => assertNoIdentity("SPEI a 012180101391764613")).toThrow(
      RailConfigError,
    );
  });
});

describe("claveRastreoFrom", () => {
  it("keeps letters and digits, upper-cases them and prefixes the rail", () => {
    expect(claveRastreoFrom("NSS", "68c4-1f2a-9b")).toBe("NSS68C41F2A9B");
  });

  it("cuts at 30 characters, which is what the SPEI field holds", () => {
    const clave = claveRastreoFrom(
      "NSS",
      "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    );

    expect(clave).toHaveLength(CLAVE_RASTREO_MAX_LENGTH);
    expect(clave.startsWith("NSS3FA85F64")).toBe(true);
    expect(assertClaveRastreo(clave)).toBe(clave);
  });

  it("refuses an identifier with nothing alphanumeric in it", () => {
    expect(() => claveRastreoFrom("NSS", "---")).toThrow(RailConfigError);
  });

  it("refuses a clave with a character SPEI does not hold", () => {
    expect(() => assertClaveRastreo("NSS-68C4")).toThrow(RailConfigError);
    expect(() => assertClaveRastreo("nss68c4")).toThrow(RailConfigError);
    expect(() => assertClaveRastreo("")).toThrow(RailConfigError);
  });
});

describe("FakeRail", () => {
  it("answers a deterministic clave and says it sent nothing", async () => {
    const rail = new FakeRail({ now: () => "2026-09-12T03:00:00.000Z" });

    const sent = await rail.sendCent({
      instructionId: "INS-1",
      beneficiaryAccount: "012180101391764613",
    });

    expect(sent).toEqual({
      rail: "nessie",
      claveRastreo: syntheticClave(1),
      sentAt: "2026-09-12T03:00:00.000Z",
      amount: CENT_AMOUNT,
      simulated: true,
    });
    // The flag is the whole point of the class: nothing downstream may read a
    // simulated probe as a transfer that settled.
    expect(sent.simulated).toBe(true);
  });

  it("mints a different clave per probe and records what it was asked", async () => {
    const rail = new FakeRail();

    const first = await rail.sendCent({
      instructionId: "INS-1",
      beneficiaryAccount: "012180101391764613",
    });
    const second = await rail.sendCent({
      instructionId: "INS-2",
      beneficiaryAccount: "072180100000000007",
    });

    expect(first.claveRastreo).not.toBe(second.claveRastreo);
    expect(rail.sent.map((request) => request.instructionId)).toEqual([
      "INS-1",
      "INS-2",
    ]);
  });

  it("takes the clave from the caller, which is how the demo files a CEP", async () => {
    const rail = new FakeRail({
      mint: (request) => `SYN${request.instructionId.replace(/\W/g, "")}`,
    });

    const sent = await rail.sendCent({
      instructionId: "INS-7",
      beneficiaryAccount: "012180101391764613",
    });

    expect(sent.claveRastreo).toBe("SYNINS7");
  });
});

describe("railNameFrom", () => {
  it("defaults to the bank mirror when a Nessie key exists", () => {
    expect(railNameFrom(undefined, true)).toEqual({ rail: "nessie" });
  });

  it("names no rail at all with no key and no RAIL", () => {
    expect(railNameFrom(undefined, false)).toEqual({});
  });

  it("reads the two rails, whatever the casing", () => {
    expect(railNameFrom("stp", false)).toEqual({ rail: "stp" });
    expect(railNameFrom("Nessie", false)).toEqual({ rail: "nessie" });
  });

  /** A typo in a `.env` is not the same answer as no rail, and must not read as it. */
  it("reports a rail this build does not have", () => {
    expect(railNameFrom("spei", true)).toEqual({ unknown: "spei" });
  });
});

describe("resolveRail", () => {
  it("refuses with the sentence naming the variables when there is no rail", () => {
    const resolution = resolveRail({
      name: undefined,
      nessieConfigured: false,
    });

    expect(resolution).toEqual({ ok: false, message: NO_RAIL });
    expect(NO_RAIL).toContain("RAIL=nessie");
    expect(NO_RAIL).toContain("RAIL=stp");
  });

  it("names the rail it does not have", () => {
    expect(resolveRail({ name: "spei" })).toEqual({
      ok: false,
      message: unknownRail("spei"),
    });
  });

  /**
   * The production rail refuses rather than pretending, and this is the assertion
   * that keeps it honest: nothing in this repository holds an STP contract, so
   * `RAIL=stp` has to come back as a configuration answer on every machine.
   */
  it("refuses STP without its configuration, with the message that lists it", () => {
    const resolution = resolveRail({
      name: "stp",
      company: {
        legalName: "Distribuidora Sintetica SA de CV",
        rfc: "SYN090615C01",
      },
    });

    expect(resolution.ok).toBe(false);
    if (!resolution.ok) {
      expect(resolution.message).toBe(STP_NOT_CONFIGURED);
    }
  });
});

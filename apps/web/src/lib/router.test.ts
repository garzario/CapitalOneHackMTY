/**
 * The router is the one piece of infrastructure in this scaffold with no
 * dependency behind it, so it gets tests. A wrong parse means a judge scans the
 * QR code and lands on a blank page.
 */

import { describe, expect, test } from "bun:test";
import {
  cepPath,
  DEFAULT_PATH,
  href,
  instructionPath,
  parsePath,
  pathOf,
  queryOf,
  satPath,
  supplierPath,
  targetFromHash,
  verifyAccountPath,
  verifyCallPath,
} from "./router";

describe("parsePath", () => {
  test("maps each known path to its route", () => {
    expect(parsePath("/run")).toEqual({ name: "run" });
    expect(parsePath("/payments")).toEqual({ name: "payments" });
    expect(parsePath("/intake")).toEqual({ name: "intake" });
    expect(parsePath("/sat")).toEqual({ name: "sat" });
    expect(parsePath("/cep")).toEqual({ name: "cep" });
    expect(parsePath("/metrics")).toEqual({ name: "metrics" });
    expect(parsePath("/verify-call")).toEqual({ name: "verifyCall" });
  });

  test("reads the instruction id out of the path", () => {
    expect(parsePath("/instructions/ins-2026w37-002")).toEqual({
      name: "instruction",
      id: "ins-2026w37-002",
    });
  });

  test("reads the RFC out of the supplier path", () => {
    expect(parsePath("/suppliers/SYN990202S02")).toEqual({
      name: "supplier",
      rfc: "SYN990202S02",
    });
  });

  test("decodes an id that was encoded into the link", () => {
    const path = instructionPath("ins 2026w37/002");

    expect(parsePath(path)).toEqual({
      name: "instruction",
      id: "ins 2026w37/002",
    });
  });

  test("falls back to the run for an empty path", () => {
    expect(parsePath("")).toEqual({ name: "run" });
    expect(parsePath("/")).toEqual({ name: "run" });
  });

  test("reports anything else as not found, with the path it saw", () => {
    expect(parsePath("/nope")).toEqual({ name: "notFound", path: "/nope" });
    expect(parsePath("/instructions")).toEqual({
      name: "notFound",
      path: "/instructions",
    });
    expect(parsePath("/run/extra/deep")).toEqual({
      name: "notFound",
      path: "/run/extra/deep",
    });
  });

  test("ignores the query string when matching", () => {
    expect(parsePath("/intake?rfc=SYN010101AAA&amount=1000")).toEqual({
      name: "intake",
    });
  });
});

describe("supplierPath", () => {
  test("round trips the RFC the expediente is about", () => {
    expect(parsePath(supplierPath("SYN990202S02"))).toEqual({
      name: "supplier",
      rfc: "SYN990202S02",
    });
  });

  /* An RFC typed with spaces is exactly what arrives from a form, and a bare
     slash in the segment would parse as a third path segment and 404. */
  test("encodes a value a path segment could not carry", () => {
    expect(parsePath(supplierPath("SYN 990202/S02"))).toEqual({
      name: "supplier",
      rfc: "SYN 990202/S02",
    });
  });

  test("is not the instruction path", () => {
    expect(parsePath("/suppliers")).toEqual({
      name: "notFound",
      path: "/suppliers",
    });
  });
});

describe("verifyCallPath", () => {
  test("carries the instruction the call is about", () => {
    const path = verifyCallPath("ins-2026w37-01");

    expect(parsePath(path)).toEqual({ name: "verifyCall" });
    expect(queryOf(path).get("instruction")).toBe("ins-2026w37-01");
  });

  test("encodes an id that would otherwise break the query", () => {
    const path = verifyCallPath("ins 2026w37/01");

    expect(queryOf(path).get("instruction")).toBe("ins 2026w37/01");
  });
});

describe("satPath and cepPath", () => {
  test("carry the supplier the evidence link is about", () => {
    expect(parsePath(satPath("SYN010101AAA"))).toEqual({ name: "sat" });
    expect(queryOf(satPath("SYN010101AAA")).get("rfc")).toBe("SYN010101AAA");

    expect(parsePath(cepPath("SYN070707GGG"))).toEqual({ name: "cep" });
    expect(queryOf(cepPath("SYN070707GGG")).get("rfc")).toBe("SYN070707GGG");
  });

  /* A space is the character that would silently end the query, and a typed
     RFC is exactly where one arrives from. */
  test("encode a value with a space and round trip through queryOf", () => {
    expect(queryOf(satPath("SYN 010101 AAA")).get("rfc")).toBe(
      "SYN 010101 AAA",
    );
    expect(queryOf(cepPath("SYN 070707 GGG")).get("rfc")).toBe(
      "SYN 070707 GGG",
    );
  });
});

describe("verifyAccountPath", () => {
  test("lands on the CEP screen with the instruction selected", () => {
    const path = verifyAccountPath("ins-2026w37-002");

    expect(parsePath(path)).toEqual({ name: "cep" });
    expect(queryOf(path).get("instruction")).toBe("ins-2026w37-002");
  });

  test("encodes an id that would otherwise break the query", () => {
    const path = verifyAccountPath("ins 2026w37/02");

    expect(queryOf(path).get("instruction")).toBe("ins 2026w37/02");
  });
});

describe("pathOf and queryOf", () => {
  test("split a target into its path and its query", () => {
    expect(pathOf("/intake?rfc=SYN010101AAA")).toBe("/intake");
    expect(queryOf("/intake?rfc=SYN010101AAA").get("rfc")).toBe("SYN010101AAA");
  });

  test("return an empty query when there is none", () => {
    expect([...queryOf("/run").keys()]).toEqual([]);
  });

  test("add the leading slash a hand-written link forgot", () => {
    expect(pathOf("run")).toBe("/run");
  });
});

describe("targetFromHash", () => {
  test("strips the hash marker", () => {
    expect(targetFromHash("#/sat")).toBe("/sat");
  });

  test("defaults to the run when the address bar has no hash", () => {
    expect(targetFromHash("")).toBe(DEFAULT_PATH);
  });

  test("round trips with href", () => {
    const path = instructionPath("ins-2026w37-001");

    expect(targetFromHash(href(path))).toBe(path);
  });
});

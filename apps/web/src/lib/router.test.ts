/**
 * The router is the one piece of infrastructure in this scaffold with no
 * dependency behind it, so it gets tests. A wrong parse means a judge scans the
 * QR code and lands on a blank page.
 */

import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PATH,
  href,
  instructionPath,
  parsePath,
  pathOf,
  queryOf,
  targetFromHash,
} from "./router";

describe("parsePath", () => {
  test("maps each known path to its route", () => {
    expect(parsePath("/run")).toEqual({ name: "run" });
    expect(parsePath("/intake")).toEqual({ name: "intake" });
    expect(parsePath("/sat")).toEqual({ name: "sat" });
    expect(parsePath("/cep")).toEqual({ name: "cep" });
    expect(parsePath("/metrics")).toEqual({ name: "metrics" });
  });

  test("reads the instruction id out of the path", () => {
    expect(parsePath("/instructions/ins-2026w37-002")).toEqual({
      name: "instruction",
      id: "ins-2026w37-002",
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

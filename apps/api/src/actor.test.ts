/**
 * The `X-Actor` grammar, asserted case by case.
 *
 * It is four lines of parsing and it decides whether the ledger can answer "who", so
 * the three cases that would otherwise be discovered at 04:00 each have a test: a
 * name with a space in it is one value, a name with a semicolon in it is a refusal
 * rather than a truncation, and an unknown role is refused rather than defaulted.
 */

import { describe, expect, it } from "bun:test";
import { ACTOR_HEADER, ACTOR_NAME_MAX, parseActor } from "./actor";

describe("parseActor", () => {
  it("reads a role and a name, in either order, with the spaces in the name", () => {
    expect(parseActor("role=clerk; name=Lupita Elizondo")).toEqual({
      ok: true,
      actor: { name: "Lupita Elizondo", role: "clerk" },
    });
    expect(parseActor("name=Don Ramiro Trevino; role=owner")).toEqual({
      ok: true,
      actor: { name: "Don Ramiro Trevino", role: "owner" },
    });
  });

  it("does not care about the case of the keys or of the role", () => {
    expect(parseActor("Role=CLERK; Name=Lupita")).toEqual({
      ok: true,
      actor: { name: "Lupita", role: "clerk" },
    });
  });

  /**
   * Two keys separated by a semicolon is the grammar, so a name carrying one is
   * ambiguous. Half a name on a ledger entry is worse than a 400 that says so.
   */
  it("refuses a name with a semicolon in it rather than truncating it", () => {
    const result = parseActor("role=clerk; name=Elizondo; Lupita");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("not a key=value pair");
    }
  });

  it("refuses a missing header, a missing role, a missing name and an unknown role", () => {
    for (const raw of [
      undefined,
      null,
      "",
      "   ",
      "name=Lupita",
      "role=clerk",
      "role=clerk; name=",
      "role=auditor; name=Lupita",
      "role=clerk; name=Lupita; role=owner",
      "role=clerk; name=Lupita; name=Otra",
      "role=clerk; cuenta=1234",
      "clerk",
    ]) {
      const result = parseActor(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Every refusal names the header and shows the shape, because the caller is
        // a screen somebody is building at 03:00.
        expect(result.message).toContain(ACTOR_HEADER);
        expect(result.message).toContain("role=clerk");
      }
    }
  });

  it("refuses a name longer than the field", () => {
    const long = "a".repeat(ACTOR_NAME_MAX + 1);

    expect(parseActor(`role=clerk; name=${long}`).ok).toBe(false);
    expect(
      parseActor(`role=clerk; name=${"a".repeat(ACTOR_NAME_MAX)}`).ok,
    ).toBe(true);
  });
});

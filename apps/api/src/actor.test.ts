/**
 * The `X-Actor` grammar of docs/09-api.md, asserted pair by pair.
 *
 * Pure, so the rule is tested without an HTTP request, for the same reason
 * `foldVerification` takes a list of events instead of a repository.
 */

import { describe, expect, it } from "bun:test";
import { ACTOR_HEADER, ACTOR_NAME_MAX, parseActor } from "./actor";

describe("parseActor", () => {
  it("reads the documented header", () => {
    expect(parseActor("role=clerk; name=Lupita Elizondo")).toEqual({
      ok: true,
      actor: { role: "clerk", name: "Lupita Elizondo" },
    });
  });

  it("does not care about the order of the two keys", () => {
    expect(parseActor("name=Mariana Trevino; role=owner")).toEqual({
      ok: true,
      actor: { role: "owner", name: "Mariana Trevino" },
    });
  });

  it("keeps the spaces inside a real name, so nothing needs quoting", () => {
    const parsed = parseActor("role=owner; name=Maria de los Angeles Trevino");

    expect(parsed.ok && parsed.actor.name).toBe("Maria de los Angeles Trevino");
  });

  it("refuses a missing header and names it in the message", () => {
    const parsed = parseActor(undefined);

    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.message).toContain(ACTOR_HEADER);
  });

  it("refuses a role that does not exist rather than defaulting to clerk", () => {
    /* Defaulting would be the whole point of the header quietly lost: an
       unrecognised role must not become the one that can do less, it must be an
       answer the caller has to fix. */
    const parsed = parseActor("role=auditor; name=Lupita Elizondo");

    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.message).toContain("clerk u owner");
  });

  it("refuses an empty name, and a name longer than the contract allows", () => {
    expect(parseActor("role=clerk; name=").ok).toBe(false);
    expect(
      parseActor(`role=clerk; name=${"a".repeat(ACTOR_NAME_MAX + 1)}`).ok,
    ).toBe(false);
  });

  it("refuses a header with only one of the two keys", () => {
    expect(parseActor("role=owner").ok).toBe(false);
    expect(parseActor("name=Lupita Elizondo").ok).toBe(false);
  });

  it("refuses a pair with no equals sign, rather than guessing", () => {
    expect(parseActor("role=owner; Lupita Elizondo").ok).toBe(false);
  });

  it("refuses a key nobody documented", () => {
    expect(parseActor("role=owner; name=Mariana; rfc=SYN090615C01").ok).toBe(
      false,
    );
  });
});

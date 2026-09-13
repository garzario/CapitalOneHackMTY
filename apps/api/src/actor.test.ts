import { describe, expect, it } from "bun:test";
import { ACTOR_NAME_MAX, actorOf, parseActor } from "./actor";

describe("parseActor", () => {
  it("reads a role and a name with spaces in it", () => {
    expect(parseActor("role=clerk; name=Lupita Elizondo")).toEqual({
      name: "Lupita Elizondo",
      role: "clerk",
    });
  });

  it("does not care about order, case of the keys, or extra whitespace", () => {
    expect(parseActor("  NAME = Ana Maria Solis ;  Role=OWNER ")).toEqual({
      name: "Ana Maria Solis",
      role: "owner",
    });
  });

  it("refuses a name with a semicolon rather than truncating it", () => {
    /* Truncating would record a different person than the one who acted, which is
       the one thing the header exists to prevent. */
    expect(parseActor("role=clerk; name=Solis; Ana")).toBeUndefined();
  });

  it("refuses an unknown role, an empty name and a missing half", () => {
    expect(parseActor("role=auditor; name=Ana")).toBeUndefined();
    expect(parseActor("role=clerk; name=")).toBeUndefined();
    expect(parseActor("role=clerk")).toBeUndefined();
    expect(parseActor("name=Ana")).toBeUndefined();
  });

  it("refuses a typo in a key instead of reading it as a missing role", () => {
    /* `rol=owner` read as "no role" would be a typo that silently downgrades who
       the ledger says acted. */
    expect(parseActor("rol=owner; name=Ana")).toBeUndefined();
  });

  it("refuses a name longer than the contract allows", () => {
    const long = "a".repeat(ACTOR_NAME_MAX + 1);
    expect(parseActor(`role=clerk; name=${long}`)).toBeUndefined();
    expect(
      parseActor(`role=clerk; name=${"a".repeat(ACTOR_NAME_MAX)}`),
    ).toEqual({
      name: "a".repeat(ACTOR_NAME_MAX),
      role: "clerk",
    });
  });

  it("answers undefined for a missing header", () => {
    expect(parseActor(undefined)).toBeUndefined();
    expect(parseActor(null)).toBeUndefined();
  });
});

describe("actorOf", () => {
  it("reads the header off a request, case insensitively", () => {
    const headers = new Headers({ "X-Actor": "role=owner; name=Ana Solis" });
    expect(actorOf(headers)).toEqual({ name: "Ana Solis", role: "owner" });
  });
});

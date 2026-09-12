import { describe, expect, it } from "bun:test";
import { looksLikeUuid, stableUuid } from "./uuid";

describe("stableUuid", () => {
  it("is deterministic, which is the only promise it makes", () => {
    expect(stableUuid("nessie:purchase:56c66be5a73e4927415071a3")).toBe(
      stableUuid("nessie:purchase:56c66be5a73e4927415071a3"),
    );
  });

  it("produces a well-formed version 8 uuid", () => {
    const value = stableUuid("nessie:purchase:abc");

    expect(looksLikeUuid(value)).toBe(true);
    expect(value).toHaveLength(36);
    // Version nibble, first character of the third group.
    expect(value.split("-")[2].charAt(0)).toBe("8");
    // Variant nibble, first character of the fourth group.
    expect("89ab").toContain(value.split("-")[3].charAt(0));
  });

  it("separates entity kinds that share an id", () => {
    const id = "c1f7c5e8-0a3b-4f9d-8e21-5d6c7b8a9f01";

    expect(stableUuid(`nessie:purchase:${id}`)).not.toBe(
      stableUuid(`nessie:deposit:${id}`),
    );
  });

  it("handles both Nessie id shapes and an empty key", () => {
    expect(
      looksLikeUuid(stableUuid("nessie:purchase:56c66be5a73e4927415071a3")),
    ).toBe(true);
    expect(
      looksLikeUuid(
        stableUuid("nessie:purchase:d8c3de04-7f1a-4c2e-9a0b-1c6f5b2e4d31"),
      ),
    ).toBe(true);
    expect(looksLikeUuid(stableUuid(""))).toBe(true);
  });

  it("does not collide across a realistic import", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 5000; index += 1) {
      seen.add(stableUuid(`nessie:purchase:${index}`));
    }

    expect(seen.size).toBe(5000);
  });
});

describe("looksLikeUuid", () => {
  it("rejects a Mongo ObjectId, which is exactly why stableUuid exists", () => {
    expect(looksLikeUuid("56c66be5a73e4927415071a3")).toBe(false);
    expect(looksLikeUuid("")).toBe(false);
  });
});

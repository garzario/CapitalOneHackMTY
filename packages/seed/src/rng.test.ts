import { describe, expect, it } from "bun:test";
import { createRng, mulberry32 } from "./rng";

describe("mulberry32", () => {
  it("gives the same sequence for the same seed", () => {
    const left = mulberry32(86);
    const right = mulberry32(86);
    const first = Array.from({ length: 10 }, () => left());
    const second = Array.from({ length: 10 }, () => right());

    expect(first).toEqual(second);
  });

  it("gives a different sequence for a different seed", () => {
    expect(mulberry32(86)()).not.toBe(mulberry32(87)());
  });

  it("stays inside [0, 1)", () => {
    const next = mulberry32(86);
    for (let draw = 0; draw < 2000; draw += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("createRng", () => {
  it("refuses a seed that is not an integer", () => {
    expect(() => createRng(8.6)).toThrow(RangeError);
  });

  it("is reproducible across instances", () => {
    const draw = (): unknown[] => {
      const rng = createRng(86);
      return [
        rng.next(),
        rng.int(1, 100),
        rng.amount(50, 500),
        rng.uuid(),
        rng.bool(0.5),
      ];
    };

    expect(draw()).toEqual(draw());
  });

  describe("int", () => {
    it("includes both ends and never leaves the range", () => {
      const rng = createRng(86);
      const seen = new Set<number>();
      for (let draw = 0; draw < 500; draw += 1) {
        const value = rng.int(1, 6);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(6);
        seen.add(value);
      }

      expect(seen.size).toBe(6);
    });

    it("handles a single-value range and refuses an inverted one", () => {
      const rng = createRng(86);

      expect(rng.int(5, 5)).toBe(5);
      expect(() => rng.int(9, 1)).toThrow(RangeError);
    });
  });

  describe("pick and shuffle", () => {
    it("picks from the list and refuses an empty one", () => {
      const rng = createRng(86);
      const items = ["OXXO", "HEB", "Pemex"];

      expect(items).toContain(rng.pick(items));
      expect(() => rng.pick([])).toThrow(RangeError);
    });

    it("shuffles into a permutation without touching the input", () => {
      const rng = createRng(86);
      const items = [1, 2, 3, 4, 5, 6, 7, 8];
      const shuffled = rng.shuffle(items);

      expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect([...shuffled].sort((left, right) => left - right)).toEqual(items);
    });
  });

  describe("bool", () => {
    it("is certain at the extremes", () => {
      const rng = createRng(86);

      expect(rng.bool(1)).toBe(true);
      expect(rng.bool(0)).toBe(false);
    });
  });

  describe("amount", () => {
    it("stays in range and lands on whole cents", () => {
      const rng = createRng(86);
      for (let draw = 0; draw < 500; draw += 1) {
        const value = rng.amount(25, 180);
        expect(value).toBeGreaterThanOrEqual(25);
        expect(value).toBeLessThanOrEqual(180);
        // Asserted through cents rather than value * 100: 78.21 * 100 is
        // 7820.999999999999, which is the whole reason money lives in cents.
        expect(value).toBe(Math.round(value * 100) / 100);
      }
    });

    it("is lognormal, so the median sits below the midpoint of the range", () => {
      const rng = createRng(86);
      const draws = Array.from({ length: 1000 }, () =>
        rng.amount(100, 2000),
      ).sort((left, right) => left - right);
      const median = draws[Math.floor(draws.length / 2)];

      expect(median).toBeLessThan(1050);
    });

    it("refuses a range it cannot draw from", () => {
      const rng = createRng(86);

      expect(() => rng.amount(200, 100)).toThrow(RangeError);
      expect(() => rng.amount(0, 100)).toThrow(RangeError);
    });
  });

  describe("uuid", () => {
    it("is version 4 shaped and reproducible", () => {
      expect(createRng(86).uuid()).toBe(createRng(86).uuid());
      expect(createRng(86).uuid()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it("does not collide across a dataset-sized run", () => {
      const rng = createRng(86);
      const seen = new Set<string>();
      for (let draw = 0; draw < 3000; draw += 1) {
        seen.add(rng.uuid());
      }

      expect(seen.size).toBe(3000);
    });
  });
});

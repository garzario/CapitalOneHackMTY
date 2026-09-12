/**
 * Seeded randomness, so "random" data is reproducible.
 *
 * Every teammate running `bun run seed` with the same seed gets byte-identical
 * data, which means a bug in the engine is reproducible, a screenshot taken at
 * 02:00 still matches the database at 08:00, and the demo script can name an
 * account id that will actually exist.
 *
 * mulberry32 is the algorithm: 32 bits of state, one multiply and three shifts per
 * draw, no dependency, and the same sequence on every platform because every
 * operation is integer maths through Math.imul. Not cryptographic, and it does not
 * need to be: nothing here protects anything.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** True with the given probability. */
  bool(probability: number): boolean;
  /** One element, uniformly. Throws on an empty list. */
  pick<T>(items: readonly T[]): T;
  /** Normal draw via Box-Muller. */
  normal(mean?: number, sd?: number): number;
  /** Lognormal draw, the honest shape for a spending distribution. */
  lognormal(mu: number, sigma: number): number;
  /**
   * A money amount in [min, max], lognormal rather than uniform: most tickets sit
   * near the low end and the occasional big one stretches the tail, which is what
   * a real card statement looks like. Rounded to the cent.
   */
  amount(min: number, max: number): number;
  /** A shuffled copy. The input is never touched. */
  shuffle<T>(items: readonly T[]): T[];
  /** A version 4 shaped uuid drawn from this generator, so it is reproducible. */
  uuid(): string;
}

/** The raw generator, exported so a caller can hold the bare function. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let drawn = state;
    drawn = Math.imul(drawn ^ (drawn >>> 15), drawn | 1);
    drawn ^= drawn + Math.imul(drawn ^ (drawn >>> 7), drawn | 61);
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
  };
}

const LOGNORMAL_SIGMA = 0.45;

/**
 * Where the median of a ticket sits inside its range. Exported because the generator
 * uses the same figure to estimate what a month of spending will cost before it draws
 * any of it.
 */
export const AMOUNT_MEDIAN_POSITION = 0.35;

export function createRng(seed: number): Rng {
  if (!Number.isInteger(seed)) {
    throw new RangeError(`seed must be an integer: ${String(seed)}`);
  }
  const next = mulberry32(seed);

  const normal = (mean = 0, sd = 1): number => {
    // Box-Muller. The second draw is discarded rather than cached, so the
    // sequence depends only on how many times normal() was called.
    const first = Math.max(next(), Number.EPSILON);
    const second = next();
    return (
      mean +
      sd * Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second)
    );
  };

  return {
    next,
    int(min: number, max: number): number {
      if (max < min) {
        throw new RangeError(`empty range: ${min}..${max}`);
      }
      return min + Math.floor(next() * (max - min + 1));
    },
    bool(probability: number): boolean {
      return next() < probability;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError("cannot pick from an empty list");
      }
      return items[Math.floor(next() * items.length)] as T;
    },
    normal,
    lognormal(mu: number, sigma: number): number {
      return Math.exp(normal(mu, sigma));
    },
    amount(min: number, max: number): number {
      if (max < min || min <= 0) {
        throw new RangeError(`not a usable amount range: ${min}..${max}`);
      }
      const median = min + (max - min) * AMOUNT_MEDIAN_POSITION;
      const drawn = Math.exp(normal(Math.log(median), LOGNORMAL_SIGMA));
      const clamped = Math.min(max, Math.max(min, drawn));
      return Math.round(clamped * 100) / 100;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(next() * (index + 1));
        const held = copy[index] as T;
        copy[index] = copy[swap] as T;
        copy[swap] = held;
      }
      return copy;
    },
    uuid(): string {
      const bytes: number[] = [];
      for (let index = 0; index < 16; index += 1) {
        bytes.push(Math.floor(next() * 256));
      }
      bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
      bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
      const hex = bytes
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
      ].join("-");
    },
  };
}

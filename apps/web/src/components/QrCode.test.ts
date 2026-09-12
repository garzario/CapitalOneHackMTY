import { describe, expect, it } from "bun:test";
import { encode } from "uqr";
import { modulesPath, QUIET_ZONE } from "./QrCode";

/**
 * The QR itself is encoded by `uqr`, so these tests are not re-testing the
 * library's arithmetic. They assert the two things a broken upgrade would take
 * away and that nothing else in this repository would notice: a symbol whose
 * structure is still a QR code, and a path that actually covers its dark
 * modules. A judge finding out at the booth is the failure mode.
 */
const DEMO_URL = "https://sentryone.tech/#/intake";

function matrixOf(value: string): boolean[][] {
  return encode(value).data as unknown as boolean[][];
}

describe("the encoded symbol", () => {
  it("carries a finder pattern in three corners", () => {
    const matrix = matrixOf(DEMO_URL);
    // uqr returns the symbol with one module of border around it.
    const size = matrix.length - 2;
    const at = (x: number, y: number) => matrix[y + 1]?.[x + 1] === true;

    for (const [ox, oy] of [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ]) {
      for (let y = 0; y < 7; y += 1) {
        for (let x = 0; x < 7; x += 1) {
          const ring = x === 0 || x === 6 || y === 0 || y === 6;
          const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          expect(at((ox as number) + x, (oy as number) + y)).toBe(ring || core);
        }
      }
    }
  });

  it("alternates along the timing row and the timing column", () => {
    const matrix = matrixOf(DEMO_URL);
    const size = matrix.length - 2;
    const at = (x: number, y: number) => matrix[y + 1]?.[x + 1] === true;

    for (let i = 8; i < size - 8; i += 1) {
      expect(at(i, 6)).toBe(i % 2 === 0);
      expect(at(6, i)).toBe(i % 2 === 0);
    }
  });

  it("grows with the payload rather than truncating it", () => {
    const short = matrixOf("https://a.tech/#/intake").length;
    const long = matrixOf(
      `https://sentryone.tech/#/intake?rfc=SYN010101AAA&amount=184300&clabe=012180001234567899&nota=${"x".repeat(120)}`,
    ).length;

    expect(long).toBeGreaterThan(short);
  });
});

describe("modulesPath", () => {
  it("draws one run per horizontal stretch of dark modules", () => {
    const path = modulesPath([
      [true, true, false, true],
      [false, false, false, false],
    ]);

    expect(path).toBe("M0 0h2v1h-2zM3 0h1v1h-1z");
  });

  it("closes a run that reaches the right edge", () => {
    expect(modulesPath([[false, true, true]])).toBe("M1 0h2v1h-2z");
  });

  it("draws nothing for an empty matrix", () => {
    expect(modulesPath([])).toBe("");
  });

  it("covers every dark module of a real symbol", () => {
    const matrix = matrixOf(DEMO_URL);
    const dark = matrix.flat().filter(Boolean).length;
    const drawn = [...modulesPath(matrix).matchAll(/h(\d+)v1/g)].reduce(
      (total, match) => total + Number(match[1]),
      0,
    );

    expect(drawn).toBe(dark);
  });
});

describe("QUIET_ZONE", () => {
  it("is the four modules the specification asks for", () => {
    // Scanners are forgiving until the code is on a bright screen next to
    // other content, and then they are not.
    expect(QUIET_ZONE).toBe(4);
  });
});

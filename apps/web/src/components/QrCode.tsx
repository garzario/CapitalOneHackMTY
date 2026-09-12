/**
 * A QR code as inline SVG.
 *
 * The demo asks a judge to take out their own phone and scan the payment run
 * screen, so this has to work on a projector, at an angle, in a room with bad
 * light. Three things follow from that and they are the whole component.
 *
 * 1. **A four module quiet zone.** `uqr` returns the symbol with a single
 *    module of border and the specification asks for four. Scanners are
 *    forgiving until the code is on a bright screen next to other content, and
 *    then they are not. The border is added here rather than trusted.
 * 2. **SVG, drawn as one path.** It scales to whatever the panel gives it with
 *    no blur, and one path of rectangles is a fraction of the nodes that one
 *    element per module would be, on a screen that also renders a live payment
 *    run. No `dangerouslySetInnerHTML`: the markup is built by React from the
 *    matrix.
 * 3. **A fixed contrast direction, not the theme.** A QR needs dark modules on
 *    a light quiet zone whatever the page around it is doing. `--c-qr-module`
 *    and `--c-qr-quiet` are the one pair in `tokens.css` that is identical in
 *    both schemes, and the note there says why: inheriting the theme would
 *    invert the code in dark mode and hand the judge something their phone
 *    refuses to read.
 */

import { useMemo } from "react";
import { encode } from "uqr";

/** The specification's quiet zone. Fewer modules is where scanning gets flaky. */
export const QUIET_ZONE = 4;

export interface QrCodeProps {
  value: string;
  /** Rendered size in CSS pixels. The symbol scales to it. */
  size?: number;
  /** Announced to a screen reader, which cannot scan anything. */
  label: string;
  className?: string;
}

/** The `d` of one path covering every dark module, in matrix units. */
export function modulesPath(matrix: readonly (readonly boolean[])[]): string {
  const parts: string[] = [];

  matrix.forEach((row, y) => {
    let run = 0;
    row.forEach((dark, x) => {
      if (dark) {
        run += 1;
        return;
      }
      if (run > 0) {
        parts.push(`M${x - run} ${y}h${run}v1h-${run}z`);
        run = 0;
      }
    });
    if (run > 0) {
      parts.push(`M${row.length - run} ${y}h${run}v1h-${run}z`);
    }
  });

  return parts.join("");
}

export function QrCode({ value, size = 180, label, className }: QrCodeProps) {
  const { path, side } = useMemo(() => {
    const symbol = encode(value);
    const matrix = symbol.data as unknown as boolean[][];
    // uqr already carries one module of border, so only the difference is added.
    const pad = Math.max(0, QUIET_ZONE - 1);
    const width = matrix.length + pad * 2;
    const padded: boolean[][] = [];

    for (let y = 0; y < width; y += 1) {
      const row: boolean[] = [];
      for (let x = 0; x < width; x += 1) {
        row.push(matrix[y - pad]?.[x - pad] === true);
      }
      padded.push(row);
    }

    return { path: modulesPath(padded), side: width };
  }, [value]);

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${side} ${side}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={side} height={side} fill="var(--c-qr-quiet)" />
      <path d={path} fill="var(--c-qr-module)" />
    </svg>
  );
}

/**
 * The rail's icons, and nothing else.
 *
 * They are drawn here rather than pulled from an icon set because six icons is
 * not worth a dependency, and because a set would offer a thousand and the
 * temptation is then to put one next to every heading. An icon in this app
 * appears in exactly one place: the rail, where it is what you navigate by
 * once the labels are collapsed away.
 *
 * All six are one stroke weight on one 20-unit grid, `currentColor` so the rail
 * decides the colour, and `aria-hidden` because every one of them sits next to
 * its own label.
 */

import type { ReactNode } from "react";

type IconProps = { size?: number };

function Glyph({ size = 18, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** The run: rows of money waiting, which is literally what the screen is. */
export function IconRun(props: IconProps) {
  return (
    <Glyph {...props}>
      <g>
        <path d="M3 5h14M3 10h14M3 15h9" />
      </g>
    </Glyph>
  );
}

/** Intake: the QR the clerk points a phone at. */
export function IconIntake(props: IconProps) {
  return (
    <Glyph {...props}>
      <g>
        <rect x="3" y="3" width="5.5" height="5.5" rx="1" />
        <rect x="11.5" y="3" width="5.5" height="5.5" rx="1" />
        <rect x="3" y="11.5" width="5.5" height="5.5" rx="1" />
        <path d="M11.5 11.5h2.5M17 11.5v2.5M14 17h3" />
      </g>
    </Glyph>
  );
}

/** The 69-B list: a published document with a line struck through it. */
export function IconList(props: IconProps) {
  return (
    <Glyph {...props}>
      <g>
        <path d="M5 2.5h6.5L15 6v11.5H5z" />
        <path d="M11 2.5V6h4M7.5 10.5h5M7.5 13.5h3" />
      </g>
    </Glyph>
  );
}

/** The CEP: a seal. Banxico signs it, which is the whole point of the screen. */
export function IconSeal(props: IconProps) {
  return (
    <Glyph {...props}>
      <g>
        <circle cx="10" cy="8" r="5" />
        <path d="M7.5 12.5 6.5 18l3.5-2 3.5 2-1-5.5" />
      </g>
    </Glyph>
  );
}

/** The verification call: a handset. */
export function IconCall(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M6.5 3h-2A1.5 1.5 0 0 0 3 4.6C3 11.4 8.6 17 15.4 17a1.5 1.5 0 0 0 1.6-1.5v-2l-3.5-1.2-1.6 1.9a11.5 11.5 0 0 1-4.1-4.1l1.9-1.6z" />
    </Glyph>
  );
}

/** Metrics: the blind evaluation, scored per control. */
export function IconMetrics(props: IconProps) {
  return (
    <Glyph {...props}>
      <g>
        <path d="M3.5 16.5V11M8.5 16.5V4.5M13.5 16.5V8M17.5 16.5v-4" />
      </g>
    </Glyph>
  );
}

/** The rail's own collapse control. */
export function IconPanel(props: IconProps) {
  return (
    <Glyph {...props}>
      <g>
        <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
        <path d="M8 3.5v13" />
      </g>
    </Glyph>
  );
}

/**
 * The rail's icons, and nothing else.
 *
 * An icon in this app appears in exactly one place: the rail, where it is what
 * you navigate by once the labels are collapsed away. The handset is the single
 * exception and it is the same rule read twice, because it follows the
 * verification call onto the instruction screen, which is where the call lives
 * now that it is not a section. A set that offers a thousand glyphs is a
 * standing invitation to put one next to every heading, so no set is installed.
 *
 * The glyphs are Rune Icons (https://runeicons.com), Apache-2.0 licensed,
 * copyright Nexvyn, vendored here as path data rather than pulled in as a
 * package. Vendoring is what lets the app carry no icon dependency while the
 * drawing stays theirs, and this paragraph is the attribution that arrangement
 * owes them. It stays.
 *
 * All seven are one stroke weight on one 24-unit grid, `currentColor` so the
 * rail decides the colour, and `aria-hidden` because every one of them sits
 * next to its own label.
 */

type IconProps = {
  size?: number;
  /** Draw the stroke once on mount or when this flips to true. */
  draw?: boolean;
};

/*
 * `pathLength` restates every glyph as being one unit long, whatever it really
 * measures, so the draw in `primitives.css` can hold one pair of dash numbers
 * for all of them. The receipt is many times the length of the bar chart and
 * left alone the two would finish seconds apart.
 */
function Glyph({ size = 18, draw = false, d }: IconProps & { d: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={draw ? "icon-draw" : undefined}
    >
      <path d={d} pathLength={1} />
    </svg>
  );
}

/** The run: a receipt, because the run is the week's payments. */
export function IconRun(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M12 17V7M16 8H10C9.46957 8 8.96086 8.21071 8.58579 8.58579C8.21071 8.96086 8 9.46957 8 10C8 10.5304 8.21071 11.0391 8.58579 11.4142C8.96086 11.7893 9.46957 12 10 12H14C14.5304 12 15.0391 12.2107 15.4142 12.5858C15.7893 12.9609 16 13.4696 16 14C16 14.5304 15.7893 15.0391 15.4142 15.4142C15.0391 15.7893 14.5304 16 14 16H8M4 3.00016C4 2.73494 4.10536 2.48059 4.29289 2.29305C4.48043 2.10552 4.73478 2.00016 5 2.00016C5.24762 1.9988 5.49048 2.06819 5.7 2.20016L6.633 2.80016C6.84204 2.93374 7.08493 3.00472 7.333 3.00472C7.58107 3.00472 7.82396 2.93374 8.033 2.80016L8.967 2.20016C9.17604 2.06658 9.41893 1.99561 9.667 1.99561C9.91507 1.99561 10.158 2.06658 10.367 2.20016L11.3 2.80016C11.509 2.93374 11.7519 3.00472 12 3.00472C12.2481 3.00472 12.491 2.93374 12.7 2.80016L13.633 2.20016C13.842 2.06658 14.0849 1.99561 14.333 1.99561C14.5811 1.99561 14.824 2.06658 15.033 2.20016L15.967 2.80016C16.176 2.93374 16.4189 3.00472 16.667 3.00472C16.9151 3.00472 17.158 2.93374 17.367 2.80016L18.3 2.20016C18.5095 2.06819 18.7524 1.9988 19 2.00016C19.2652 2.00016 19.5196 2.10552 19.7071 2.29305C19.8946 2.48059 20 2.73494 20 3.00016V21.0002C20 21.2654 19.8946 21.5197 19.7071 21.7073C19.5196 21.8948 19.2652 22.0002 19 22.0002C18.7524 22.0015 18.5095 21.9321 18.3 21.8002L17.367 21.2002C17.158 21.0666 16.9151 20.9956 16.667 20.9956C16.4189 20.9956 16.176 21.0666 15.967 21.2002L15.033 21.8002C14.824 21.9337 14.5811 22.0047 14.333 22.0047C14.0849 22.0047 13.842 21.9337 13.633 21.8002L12.7 21.2002C12.491 21.0666 12.2481 20.9956 12 20.9956C11.7519 20.9956 11.509 21.0666 11.3 21.2002L10.367 21.8002C10.158 21.9337 9.91507 22.0047 9.667 22.0047C9.41893 22.0047 9.17604 21.9337 8.967 21.8002L8.033 21.2002C7.82396 21.0666 7.58107 20.9956 7.333 20.9956C7.08493 20.9956 6.84204 21.0666 6.633 21.2002L5.7 21.8002C5.49048 21.9321 5.24762 22.0015 5 22.0002C4.73478 22.0002 4.48043 21.8948 4.29289 21.7073C4.10536 21.5197 4 21.2654 4 21.0002V3.00016Z"
    />
  );
}

/** Intake: a file with a plus on it, which is a new instruction arriving. */
export function IconIntake(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M14 2H6C5.46957 2 4.96086 2.21072 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8M14 2C14.3166 1.99949 14.6301 2.06161 14.9225 2.18277C15.215 2.30394 15.4806 2.48176 15.704 2.706L19.292 6.294C19.5168 6.51751 19.6952 6.78335 19.8167 7.07616C19.9382 7.36898 20.0005 7.68297 20 8M14 2V7C14 7.26522 14.1054 7.51957 14.2929 7.70711C14.4804 7.89464 14.7348 8 15 8L20 8M9 15H15M12 18V12"
    />
  );
}

/** The 69-B list: a clipboard of names, which is what the list is. */
export function IconList(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M16 4H18C18.5304 4 19.0391 4.21071 19.4142 4.58579C19.7893 4.96086 20 5.46957 20 6V20C20 20.5304 19.7893 21.0391 19.4142 21.4142C19.0391 21.7893 18.5304 22 18 22H6C5.46957 22 4.96086 21.7893 4.58579 21.4142C4.21071 21.0391 4 20.5304 4 20V6C4 5.46957 4.21071 4.96086 4.58579 4.58579C4.96086 4.21071 5.46957 4 6 4H8M12 11H16M12 16H16M8 11H8.01M8 16H8.01M9 2H15C15.5523 2 16 2.44772 16 3V5C16 5.55228 15.5523 6 15 6H9C8.44772 6 8 5.55228 8 5V3C8 2.44772 8.44772 2 9 2Z"
    />
  );
}

/** The CEP: a shield with a tick, because Banxico is what signs it. */
export function IconSeal(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M9 12L11 14L15 10M20 13C20 18 16.5 20.5 12.34 21.95C12.1222 22.0238 11.8855 22.0202 11.67 21.94C7.5 20.5 4 18 4 13V5.99996C4 5.73474 4.10536 5.48039 4.29289 5.29285C4.48043 5.10532 4.73478 4.99996 5 4.99996C7 4.99996 9.5 3.79996 11.24 2.27996C11.4519 2.09896 11.7214 1.99951 12 1.99951C12.2786 1.99951 12.5481 2.09896 12.76 2.27996C14.51 3.80996 17 4.99996 19 4.99996C19.2652 4.99996 19.5196 5.10532 19.7071 5.29285C19.8946 5.48039 20 5.73474 20 5.99996V13Z"
    />
  );
}

/** The verification call: a handset going out, reserved for the instruction. */
export function IconCall(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M16 8L22 2M16 2H22V8M13.832 16.568C14.0385 16.6628 14.2712 16.6845 14.4917 16.6294C14.7122 16.5744 14.9073 16.4458 15.045 16.265L15.4 15.8C15.5863 15.5516 15.8279 15.35 16.1056 15.2111C16.3833 15.0723 16.6895 15 17 15H20C20.5304 15 21.0391 15.2107 21.4142 15.5858C21.7893 15.9609 22 16.4696 22 17V20C22 20.5304 21.7893 21.0391 21.4142 21.4142C21.0391 21.7893 20.5304 22 20 22C15.2261 22 10.6477 20.1036 7.27208 16.7279C3.89642 13.3523 2 8.7739 2 4C2 3.46957 2.21071 2.96086 2.58579 2.58579C2.96086 2.21071 3.46957 2 4 2H7C7.53043 2 8.03914 2.21071 8.41421 2.58579C8.78929 2.96086 9 3.46957 9 4V7C9 7.31049 8.92771 7.61672 8.78885 7.89443C8.65 8.17214 8.44839 8.41371 8.2 8.6L7.732 8.951C7.54842 9.09118 7.41902 9.29059 7.36579 9.51535C7.31256 9.74012 7.33878 9.97638 7.44 10.184C8.80668 12.9599 11.0544 15.2048 13.832 16.568Z"
    />
  );
}

/** Metrics: bars against an axis, the blind evaluation scored per control. */
export function IconMetrics(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M3 3V19C3 19.5304 3.21071 20.0391 3.58579 20.4142C3.96086 20.7893 4.46957 21 5 21H21M7 16H15M7 11H19M7 6H10"
    />
  );
}

/** The rail's own collapse control. */
export function IconPanel(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M9 3V21M5 3H19C20.1046 3 21 3.89543 21 5V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3Z"
    />
  );
}

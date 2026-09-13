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
 * for all of them. The wallet is many times the length of the plus and
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

/** The run: a wallet, the money that is about to leave the company. */
export function IconRun(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M21 16V20C21 20.2652 20.8946 20.5196 20.7071 20.7071C20.5196 20.8946 20.2652 21 20 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H18C18.2652 3 18.5196 3.10536 18.7071 3.29289C18.8946 3.48043 19 3.73478 19 4V7M3 5C3 5.53043 3.21071 6.03914 3.58579 6.41421C3.96086 6.78929 4.46957 7 5 7H20C20.2652 7 20.5196 7.10536 20.7071 7.29289C20.8946 7.48043 21 7.73478 21 8V12M21 12H18C17.4696 12 16.9609 12.2107 16.5858 12.5858C16.2107 12.9609 16 13.4696 16 14C16 14.5304 16.2107 15.0391 16.5858 15.4142C16.9609 15.7893 17.4696 16 18 16H21M21 12C21.2652 12 21.5196 12.1054 21.7071 12.2929C21.8946 12.4804 22 12.7348 22 13V15C22 15.2652 21.8946 15.5196 21.7071 15.7071C21.5196 15.8946 21.2652 16 21 16"
    />
  );
}

/** Intake: a plus, a new instruction arriving. */
export function IconIntake(props: IconProps) {
  return <Glyph {...props} d="M5 12H19M12 5V19" />;
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

/** The CEP: a tick in a circle, the beneficiary Banxico confirmed. */
export function IconSeal(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M9 12L11 14L15 10M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
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

/** Metrics: a pie, the blind evaluation scored per control. */
export function IconMetrics(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M21.21 15.8901C20.5739 17.3946 19.5788 18.7203 18.3119 19.7514C17.045 20.7825 15.5448 21.4875 13.9425 21.8049C12.3401 22.1222 10.6845 22.0422 9.12018 21.5719C7.55591 21.1015 6.13066 20.2551 4.96906 19.1067C3.80745 17.9583 2.94485 16.5428 2.45667 14.984C1.96849 13.4252 1.8696 11.7706 2.16863 10.1647C2.46767 8.55886 3.15553 7.05071 4.17208 5.77211C5.18863 4.49351 6.50292 3.4834 8.00004 2.83008M21 11.9999C21.552 11.9999 22.005 11.5509 21.95 11.0019C21.7195 8.70609 20.7021 6.56062 19.0703 4.92924C17.4386 3.29786 15.2929 2.28096 12.997 2.05092C12.447 1.99592 11.999 2.44892 11.999 3.00092V11.0009C11.999 11.2661 12.1044 11.5205 12.2919 11.708C12.4795 11.8956 12.7338 12.0009 12.999 12.0009L21 11.9999Z"
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

/**
 * The rail's icons, and nothing else.
 *
 * The rail is where most of them are, because that is what you navigate by once
 * the labels are collapsed away. The handset is one exception and it is the same
 * rule read twice, because it follows the verification call onto the instruction
 * screen, which is where the call lives now that it is not a section. The other
 * exception is the payment run, where a glyph sits in a round tile on each
 * metric and on each list row: there it is not decoration next to a heading but
 * the row's own channel -- the shape says where the instruction came from before
 * the words under it are read. A set that offers a thousand glyphs is a standing
 * invitation to put one next to every heading, so no set is installed and each
 * one that lands here has a job named in its comment.
 *
 * The glyphs are Rune Icons (https://runeicons.com), Apache-2.0 licensed,
 * copyright Nexvyn, vendored here as path data rather than pulled in as a
 * package. Vendoring is what lets the app carry no icon dependency while the
 * drawing stays theirs, and this paragraph is the attribution that arrangement
 * owes them. It stays.
 *
 * All of them are one stroke weight on one 24-unit grid, `currentColor` so the
 * thing around them decides the colour, and `aria-hidden` because every one of
 * them sits next to its own label.
 */

import type { SourceGlyph } from "../lib/labels";

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

/**
 * Entry: a person, because the screen it names is about which of the two people
 * of this company is acting.
 *
 * The one glyph here that is not a Rune drawing, and it says so rather than
 * borrowing their attribution: the vendored subset carries no person, so this is
 * a head and a pair of shoulders written by hand on the same 24-unit grid, at the
 * same stroke weight, as one path so the draw in `primitives.css` treats it like
 * every other one.
 */
export function IconPerson(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M12 4A3.6 3.6 0 1 0 12 11.2A3.6 3.6 0 0 0 12 4M5 20A7 7 0 0 1 19 20"
    />
  );
}

/**
 * The recorrido: a play triangle, on the one control that starts it.
 *
 * It is in the top bar next to the title, so it is furniture like the collapse
 * control beside it rather than a seventh section. A triangle and not a question
 * mark: this is not help, it is the product telling its own story, and the glyph
 * has to say "start" to somebody who has not read the label.
 *
 * Written by hand on the same 24-unit grid as the Rune drawings, because the
 * vendored subset carries no play shape, and as one path so the draw in
 * `primitives.css` treats it like every other one. It closes on itself, which is
 * what makes it read as solid at 17px even though every glyph here is a stroke.
 */
export function IconPlay(props: IconProps) {
  return <Glyph {...props} d="M9 7.5L17 12L9 16.5L9 7.5Z" />;
}

/**
 * The appearance: a sun for light, a moon for dark.
 *
 * The pair sits beside the recorrido in the top bar and each one is drawn on the
 * appearance the press will produce, not on the one you are in. A control that
 * shows the state it is in and a control that shows the state it offers are both
 * defensible and mixing them is not, so the word beside the glyph says the same
 * thing the glyph does: press the moon marked `Oscuro` and the page goes dark.
 *
 * Written by hand on the same 24-unit grid and at the same stroke weight as the
 * Rune drawings, because the vendored subset carries neither shape, and each as
 * one path so the draw in `primitives.css` treats them like every other one.
 */
export function IconSun(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M12 16A4 4 0 1 0 12 8A4 4 0 0 0 12 16M12 2V4M12 20V22M4.93 4.93L6.34 6.34M17.66 17.66L19.07 19.07M2 12H4M20 12H22M4.93 19.07L6.34 17.66M17.66 6.34L19.07 4.93"
    />
  );
}

/** The other appearance. A crescent, cut by the same circle that draws it. */
export function IconMoon(props: IconProps) {
  return (
    <Glyph {...props} d="M21 12.79A9 9 0 1 1 11.21 3A7 7 0 0 0 21 12.79Z" />
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

/* --------------------------------------------------------- the payment run */

/** Liberado: a shield with a tick, the money that cleared the six controls. */
export function IconShield(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M9 12L11 14L15 10M20 13C20 18 16.5 20.5 12.34 21.95C12.1222 22.0238 11.8855 22.0202 11.67 21.94C7.5 20.5 4 18 4 13V5.99996C4 5.73474 4.10536 5.48039 4.29289 5.29285C4.48043 5.10532 4.73478 4.99996 5 4.99996C7 4.99996 9.5 3.79996 11.24 2.27996C11.4519 2.09896 11.7214 1.99951 12 1.99951C12.2786 1.99951 12.5481 2.09896 12.76 2.27996C14.51 3.80996 17 4.99996 19 4.99996C19.2652 4.99996 19.5196 5.10532 19.7071 5.29285C19.8946 5.48039 20 5.73474 20 5.99996V13Z"
    />
  );
}

/** The total of the run: a receipt, every instruction in it added up. */
export function IconReceipt(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M12 17V7M16 8H10C9.46957 8 8.96086 8.21071 8.58579 8.58579C8.21071 8.96086 8 9.46957 8 10C8 10.5304 8.21071 11.0391 8.58579 11.4142C8.96086 11.7893 9.46957 12 10 12H14C14.5304 12 15.0391 12.2107 15.4142 12.5858C15.7893 12.9609 16 13.4696 16 14C16 14.5304 15.7893 15.0391 15.4142 15.4142C15.0391 15.7893 14.5304 16 14 16H8M4 3.00016C4 2.73494 4.10536 2.48059 4.29289 2.29305C4.48043 2.10552 4.73478 2.00016 5 2.00016C5.24762 1.9988 5.49048 2.06819 5.7 2.20016L6.633 2.80016C6.84204 2.93374 7.08493 3.00472 7.333 3.00472C7.58107 3.00472 7.82396 2.93374 8.033 2.80016L8.967 2.20016C9.17604 2.06658 9.41893 1.99561 9.667 1.99561C9.91507 1.99561 10.158 2.06658 10.367 2.20016L11.3 2.80016C11.509 2.93374 11.7519 3.00472 12 3.00472C12.2481 3.00472 12.491 2.93374 12.7 2.80016L13.633 2.20016C13.842 2.06658 14.0849 1.99561 14.333 1.99561C14.5811 1.99561 14.824 2.06658 15.033 2.20016L15.967 2.80016C16.176 2.93374 16.4189 3.00472 16.667 3.00472C16.9151 3.00472 17.158 2.93374 17.367 2.80016L18.3 2.20016C18.5095 2.06819 18.7524 1.9988 19 2.00016C19.2652 2.00016 19.5196 2.10552 19.7071 2.29305C19.8946 2.48059 20 2.73494 20 3.00016V21.0002C20 21.2654 19.8946 21.5197 19.7071 21.7073C19.5196 21.8948 19.2652 22.0002 19 22.0002C18.7524 22.0015 18.5095 21.9321 18.3 21.8002L17.367 21.2002C17.158 21.0666 16.9151 20.9956 16.667 20.9956C16.4189 20.9956 16.176 21.0666 15.967 21.2002L15.033 21.8002C14.824 21.9337 14.5811 22.0047 14.333 22.0047C14.0849 22.0047 13.842 21.9337 13.633 21.8002L12.7 21.2002C12.491 21.0666 12.2481 20.9956 12 20.9956C11.7519 20.9956 11.509 21.0666 11.3 21.2002L10.367 21.8002C10.158 21.9337 9.91507 22.0047 9.667 22.0047C9.41893 22.0047 9.17604 21.9337 8.967 21.8002L8.033 21.2002C7.82396 21.0666 7.58107 20.9956 7.333 20.9956C7.08493 20.9956 6.84204 21.0666 6.633 21.2002L5.7 21.8002C5.49048 21.9321 5.24762 22.0015 5 22.0002C4.73478 22.0002 4.48043 21.8948 4.29289 21.7073C4.10536 21.5197 4 21.2654 4 21.0002V3.00016Z"
    />
  );
}

/* ------------------------------------------------- where an instruction came from */

/** Correo. */
export function IconMail(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M22 7L13.009 12.727C12.7039 12.9042 12.3573 12.9976 12.0045 12.9976C11.6517 12.9976 11.3051 12.9042 11 12.727L2 7M4 4H20C21.1046 4 22 4.89543 22 6V18C22 19.1046 21.1046 20 20 20H4C2.89543 20 2 19.1046 2 18V6C2 4.89543 2.89543 4 4 4Z"
    />
  );
}

/** WhatsApp: a message bubble, not the vendor's own mark. */
export function IconMessage(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M2.99206 16.342C3.1391 16.7129 3.17183 17.1193 3.08606 17.509L2.02106 20.799C1.98674 20.9658 1.99561 21.1387 2.04683 21.3011C2.09805 21.4636 2.18992 21.6103 2.31372 21.7273C2.43753 21.8443 2.58917 21.9277 2.75426 21.9697C2.91935 22.0116 3.09242 22.0107 3.25706 21.967L6.67006 20.969C7.03777 20.8961 7.41859 20.9279 7.76906 21.061C9.90444 22.0582 12.3234 22.2692 14.5992 21.6567C16.875 21.0442 18.8613 19.6477 20.2078 17.7134C21.5542 15.7791 22.1742 13.4314 21.9584 11.0845C21.7425 8.73769 20.7048 6.54247 19.0281 4.88619C17.3515 3.22992 15.1438 2.21904 12.7944 2.0319C10.4451 1.84475 8.10519 2.49338 6.1875 3.86334C4.26981 5.23329 2.89759 7.23654 2.31295 9.51964C1.72831 11.8027 1.96883 14.219 2.99206 16.342Z"
    />
  );
}

/** PDF: a document with lines of text in it. */
export function IconFileText(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M14 2H6C5.46957 2 4.96086 2.21072 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8M14 2C14.3166 1.99949 14.6301 2.06161 14.9225 2.18277C15.215 2.30394 15.4806 2.48176 15.704 2.706L19.292 6.294C19.5168 6.51751 19.6952 6.78335 19.8167 7.07616C19.9382 7.36898 20.0005 7.68297 20 8M14 2V7C14 7.26522 14.1054 7.51957 14.2929 7.70711C14.4804 7.89464 14.7348 8 15 8L20 8M10 9H8M16 13H8M16 17H8"
    />
  );
}

/** Portal: a globe, an instruction that arrived over the web. */
export function IconGlobe(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M22 12C22 17.5228 17.5228 22 12 22M22 12C22 6.47715 17.5228 2 12 2M22 12H2M12 22C6.47715 22 2 17.5228 2 12M12 22C9.43223 19.3038 8 15.7233 8 12C8 8.27674 9.43223 4.69615 12 2M12 22C14.5678 19.3038 16 15.7233 16 12C16 8.27674 14.5678 4.69615 12 2M2 12C2 6.47715 6.47715 2 12 2"
    />
  );
}

/** Captura manual: a pencil, the clerk typed it in herself. */
export function IconPencil(props: IconProps) {
  return (
    <Glyph
      {...props}
      d="M15 5L19 9M21.1739 6.81189C21.7026 6.28332 21.9997 5.56636 21.9998 4.81875C21.9999 4.07113 21.703 3.3541 21.1744 2.82539C20.6459 2.29668 19.9289 1.99961 19.1813 1.99951C18.4337 1.99942 17.7166 2.29632 17.1879 2.82489L3.84193 16.1739C3.60975 16.4054 3.43805 16.6904 3.34193 17.0039L2.02093 21.3559C1.99509 21.4424 1.99314 21.5342 2.01529 21.6217C2.03743 21.7092 2.08285 21.7891 2.14673 21.8529C2.21061 21.9167 2.29055 21.962 2.37809 21.984C2.46563 22.006 2.55749 22.0039 2.64393 21.9779L6.99693 20.6579C7.3101 20.5626 7.59511 20.392 7.82693 20.1609L21.1739 6.81189Z"
    />
  );
}

/**
 * The glyph for a channel, resolved from the key `labels.ts` maps the source
 * to. The map is a dictionary of words and stays free of JSX, so the lookup
 * from key to drawing happens here, where the drawings are.
 */
export function SourceIcon({
  glyph,
  ...props
}: IconProps & { glyph: SourceGlyph }) {
  switch (glyph) {
    case "mail":
      return <IconMail {...props} />;
    case "message":
      return <IconMessage {...props} />;
    case "file-text":
      return <IconFileText {...props} />;
    case "globe":
      return <IconGlobe {...props} />;
    case "pencil":
      return <IconPencil {...props} />;
  }
}

/**
 * The frame every screen sits in: a collapsible rail on the left, the screen on
 * the right.
 *
 * Three decisions worth their reasons.
 *
 * The rail replaced a row of tabs. The five sections are not peers: the payment
 * run is the product and the other four are evidence you open from it. A tab
 * row says they are equal and spends the run's own header saying it. The rail
 * says it twice over, because the two evidence sections sit under their own
 * label and the run does not.
 *
 * The verification call used to be a sixth entry here and is now a link on the
 * instruction. A call is a step inside one decision about one payment, not a
 * place you go; parked in the rail it invited someone to open it with no
 * instruction behind it, and the screen had nothing to say. The rail keeps
 * "Corrida" lit while you are on it, because that is where you came from.
 *
 * The rail's icons are Rune Icons, and the one belonging to the section you
 * arrive at draws itself once, on arrival and on nothing else.
 *
 * The rail collapses, and the choice is remembered. The run is a wide financial
 * table whose last column decides whether money leaves; on a 13-inch laptop
 * that column is the one that falls off. Collapsing is a preference and not a
 * breakpoint, so it is stored rather than inferred.
 *
 * The control that changes the frame sits in the top bar and not in the rail,
 * because what it changes is the frame: below 60rem it opens the rail as an
 * overlay, above it collapses the rail to icons, and the top bar is the one
 * piece of furniture on screen at every width. A control parked inside the
 * thing it hides cannot bring that thing back.
 *
 * The header above the screen holds one line: where you are. Everything the old
 * header carried -- the tagline, the data-source line, the synthetic mark --
 * either moved into the rail's foot, where it is available and quiet, or was
 * cut. A judge reads the tagline once, in the pitch, not on every screen.
 *
 * One banner sits above the screen and only in one case: the API was asked and
 * did not answer. That belongs to the frame for the same reason the synthetic
 * mark does, because it is true of the whole page load rather than of the screen
 * you happen to be on, and the screens underneath each report their own fallback
 * without ever being able to say that first.
 */

import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { SYNTHETIC_LABEL } from "../lib/labels";
import { dataMode } from "../lib/resource";
import { href, PATHS, type Route, type RouteName } from "../lib/router";
import {
  otherTheme,
  THEME_LABEL,
  THEME_TOGGLE_LABEL,
  toggleTheme,
  useTheme,
} from "../lib/theme";
import { openTour } from "../lib/tour-store";
import {
  IconIntake,
  IconList,
  IconMetrics,
  IconMoon,
  IconPanel,
  IconPerson,
  IconPlay,
  IconReceipt,
  IconRun,
  IconSeal,
  IconSun,
} from "./Icons";
import { OfflineBanner } from "./OfflineBanner";
import { ToastProvider } from "./Toast";

type NavItem = {
  to: string;
  label: string;
  match: RouteName[];
  Icon: (props: { size?: number; draw?: boolean }) => ReactNode;
};

/**
 * The rail in three groups. The first is the run and the way things enter it,
 * the middle is the evidence you open from a finding, and the last is the
 * scoreboard. A group with no label is a group that needs no explaining.
 */
const NAV_GROUPS: Array<{ label: string | null; items: NavItem[] }> = [
  {
    label: null,
    items: [
      {
        to: PATHS.run,
        label: "Corrida",
        /* The verification call lights this one: it is an action on an
           instruction of the run, and the rail should not go dark under it. The
           supplier profile is the same argument, one step further out: the
           expediente is opened from a line of the run, so "Corrida" is still
           where you came from. */
        match: ["run", "instruction", "supplier", "verifyCall"],
        Icon: IconRun,
      },
      {
        /* The run is where the money is decided and this is where it leaves, so
           they are one group and this one sits directly under it. */
        to: PATHS.payments,
        label: "Pagos",
        match: ["payments"],
        Icon: IconReceipt,
      },
      { to: PATHS.intake, label: "Alta", match: ["intake"], Icon: IconIntake },
    ],
  },
  {
    label: "Evidencia",
    items: [
      { to: PATHS.sat, label: "Lista 69-B", match: ["sat"], Icon: IconList },
      { to: PATHS.cep, label: "CEP", match: ["cep"], Icon: IconSeal },
    ],
  },
  {
    label: null,
    items: [
      {
        to: PATHS.metrics,
        label: "Metricas",
        match: ["metrics"],
        Icon: IconMetrics,
      },
    ],
  },
  {
    /* Last, and in its own group, because it is not a section of the run: it is
       who is acting and what this instance was configured with. A settings-like
       entry at the foot of the rail is where a person looks for both. */
    label: null,
    items: [
      {
        to: PATHS.entry,
        label: "Entrada",
        match: ["entry"],
        Icon: IconPerson,
      },
    ],
  },
];

const DATA_MODE_LABEL: Record<string, string> = {
  auto: "API con respaldo sintetico",
  api: "Solo API",
  mock: "Solo datos sinteticos",
};

const COLLAPSED_KEY = "sentryone:rail-collapsed";

/* Read once, synchronously, so the rail never renders expanded and then snaps
   shut on the first paint. */
function storedCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppShell({
  route,
  title,
  children,
}: {
  route: Route;
  title: string;
  children: ReactNode;
}) {
  const mode = dataMode();
  const theme = useTheme();
  const [collapsed, setCollapsed] = useState(storedCollapsed);
  const [open, setOpen] = useState(false);

  /* The appearance the press produces, which is what the button says and draws.
     The store owns the switch; the shell only has to know which of the two words
     to print. */
  const nextTheme = otherTheme(theme);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((was) => {
      const next = !was;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* A private window is allowed to forget. */
      }
      return next;
    });
  }, []);

  /* One control, two meanings, because the frame has two shapes. The width is
     read at the click instead of being kept in state: the answer only matters
     in the instant the button is pressed, and state would have to be
     subscribed, torn down and kept honest across every resize in between. */
  const toggleFrame = useCallback(() => {
    if (window.matchMedia("(max-width: 60rem)").matches) setOpen(true);
    else toggleCollapsed();
  }, [toggleCollapsed]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /* The toast provider wraps the frame rather than a screen, for two reasons:
     the live region has to exist in the document before the first message lands
     or a screen reader does not reliably announce it, and a confirmation has to
     survive the navigation that follows the write that produced it. */
  return (
    <ToastProvider>
      <div className="shell">
        <a className="skip-link" href="#main">
          Ir al contenido
        </a>

        {open ? (
          <button
            type="button"
            className="scrim"
            aria-label="Cerrar el menu"
            onClick={() => setOpen(false)}
          />
        ) : null}

        <nav
          className="rail"
          aria-label="Secciones"
          data-collapsed={collapsed ? "true" : "false"}
          data-open={open ? "true" : "false"}
        >
          <div className="rail-top">
            <a
              href={href(PATHS.run)}
              className="no-underline rail-brand"
              aria-label="SentryOne, ir a la corrida"
            >
              {collapsed ? (
                <img
                  src="/sentryone-icon-dark.svg"
                  alt=""
                  width={26}
                  height={26}
                  style={{ display: "block", flex: "none" }}
                />
              ) : (
                <img
                  src="/sentryone-lockup-dark.svg"
                  alt=""
                  style={{ display: "block", width: "100%", height: "auto" }}
                />
              )}
            </a>
          </div>

          {/* The group labels are furniture and not links, so they are hidden
            from the accessibility tree and the name they carry is put on the
            list instead. Keyboard order is the order of the links, unchanged. */}
          <div className="rail-groups">
            {NAV_GROUPS.map((group, index) => (
              <Fragment key={group.label ?? `group-${index}`}>
                {index > 0 ? <hr className="rail-rule" /> : null}
                {group.label ? (
                  <span className="rail-group-label" aria-hidden="true">
                    {group.label}
                  </span>
                ) : null}
                <ul className="rail-nav" aria-label={group.label ?? undefined}>
                  {group.items.map(({ to, label, match, Icon }) => {
                    const isCurrent = match.includes(route.name);

                    return (
                      <li key={to}>
                        <a
                          href={href(to)}
                          className="rail-item"
                          aria-current={isCurrent ? "page" : undefined}
                          title={collapsed ? label : undefined}
                          /* On a phone the rail is an overlay, and an overlay
                           that survives navigation covers the screen you just
                           asked for. */
                          onClick={() => setOpen(false)}
                        >
                          {/* The draw is `isCurrent` and nothing more. A CSS
                            animation runs when its `animation` property goes
                            from none to set, which happens exactly when the
                            class lands on the icon you arrived at -- so the
                            section change is the trigger, for free, and
                            collapsing, opening the overlay or re-rendering
                            never touch the class and never restart it. */}
                          <Icon size={18} draw={isCurrent} />
                          <span className="rail-label">{label}</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </Fragment>
            ))}
          </div>

          <div className="rail-spacer" />

          <div className="rail-foot">
            {/* Attribution, not co-branding. See the note on `.co-mark`. */}
            {/* The reverse lockup in both themes: the rail is navy on either
              ground, and their navy wordmark on their navy is nothing. */}
            <span className="co-mark">
              <img
                src="/brand/capital-one-reverse.svg"
                alt="Capital One"
                width={84}
                height={30}
              />
            </span>
            <span className="rail-foot-detail subtle t-xs">
              Reto HackMTY 2026 · {DATA_MODE_LABEL[mode] ?? mode}
            </span>
          </div>
        </nav>

        <div className="flex min-w-0 flex-col">
          <header className="topbar">
            <button
              type="button"
              className="topbar-toggle"
              onClick={toggleFrame}
              /* Above 60rem this is a two-state control and says so. Below it,
               it opens an overlay, which is not a toggle -- but the width is
               not in state, so the attribute is rendered at both widths and
               the overlay simply does not read it. */
              aria-pressed={collapsed}
              title={collapsed ? "Expandir el menu" : "Contraer el menu"}
            >
              <IconPanel size={17} />
              {/* The name follows the width, and the width is CSS's to know:
                one of these two is display:none on each side of 60rem, and a
                span that is not displayed is not in the accessibility tree. */}
              <span className="sr-only topbar-toggle-narrow">
                Abrir el menu
              </span>
              <span className="sr-only topbar-toggle-wide">
                {collapsed ? "Expandir el menu" : "Contraer el menu"}
              </span>
            </button>
            <h1 className="topbar-title">{title}</h1>

            {/* The recorrido, beside the title and on every screen.

                It is here rather than on a floating launcher of its own because a
              judge who walks up to an unattended stand is looking at the top of
              the page, and because the one corner a fixed control could have
              taken is already spent twice over: the assistant dock is bottom
              right and the toasts stack above it. A button in the strip that is
              on screen at every width cannot be covered by either. */}
            <button
              type="button"
              className="btn btn-sm topbar-tour"
              /* Named on the button and not only by the word inside it: the word
                 is hidden below 48rem, where the title and the synthetic mark
                 need the room, and a control whose name is a span that is not
                 displayed is a control with no name. */
              aria-label="Abrir el recorrido"
              onClick={openTour}
            >
              <IconPlay size={15} />
              <span className="tour-label">Recorrido</span>
            </button>

            {/* The appearance, next to the recorrido and in the same strip, for
              the same reason: it is furniture that belongs to the whole app and
              this is the one row on screen at every width.

                The app opens light on every machine, deliberately, and this is
              the control that says so out loud -- a judge who prefers dark has
              one press to get there and it is remembered, and a projector that
              somebody else set to dark mode cannot decide the first frame of a
              demo. The word and the glyph both name the appearance the press
              will produce rather than the one you are in, so the button reads
              the same way to somebody who sees only the moon. */}
            <button
              type="button"
              className="btn btn-sm topbar-theme"
              /* Named on the button, like the recorrido beside it: the word is
                 hidden below 48rem where the title needs the room, and a control
                 whose name is a span that is not displayed has no name. */
              aria-label={THEME_TOGGLE_LABEL}
              title={THEME_TOGGLE_LABEL}
              onClick={() => {
                toggleTheme();
              }}
            >
              {nextTheme === "dark" ? (
                <IconMoon size={15} />
              ) : (
                <IconSun size={15} />
              )}
              <span className="theme-label">{THEME_LABEL[nextTheme]}</span>
            </button>

            {/* ADR-0002: anything generated carries a visible marker. It is a
              standing fact about the whole app rather than a property of the
              screen you happen to be on, so it belongs to the frame and appears
              exactly once -- here, in the one strip that is always on screen at
              full width. It used to sit in the rail, which the user can
              collapse to 60px, where the word does not fit. */}
            <span className="topbar-mark watermark">{SYNTHETIC_LABEL}</span>
          </header>

          <main id="main" className="screen">
            {/* One line, above whatever screen you are on, when the API was
                asked and did not answer. It is in the frame because it is a
                fact about the page load rather than about a screen: each screen
                reports its own fallback, and none of them can say first that
                the server is not there at all. It renders nothing when the API
                answers and nothing under `?data=mock`, where nothing was
                asked. */}
            <OfflineBanner />

            {children}

            {/* The disclaimer is not decoration and it is not optional: this is a
              prototype that renders tax exposure in pesos, and it says so on
              every screen rather than once in a README nobody opens at the
              table. The second line is the frame, in words rather than in
              somebody else's logo: SentryOne is built for Capital One's track
              and borrows their palette and their typography, which is a
              different claim from being them. */}
            <footer className="shell-foot">
              <p className="subtle m-0 t-xs">
                Prototipo sobre datos sinteticos. No es una institucion
                financiera y no es asesoria fiscal. Los RFC reales solo aparecen
                en la consulta de la lista oficial.
              </p>
            </footer>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}

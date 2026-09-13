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
 * The rail collapses, and the choice is remembered. The run is a wide financial
 * table whose last column decides whether money leaves; on a 13-inch laptop
 * that column is the one that falls off. Collapsing is a preference and not a
 * breakpoint, so it is stored rather than inferred.
 *
 * The header above the screen holds one line: where you are. Everything the old
 * header carried -- the tagline, the data-source line, the synthetic mark --
 * either moved into the rail's foot, where it is available and quiet, or was
 * cut. A judge reads the tagline once, in the pitch, not on every screen.
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
  IconIntake,
  IconList,
  IconMetrics,
  IconPanel,
  IconRun,
  IconSeal,
} from "./Icons";

type NavItem = {
  to: string;
  label: string;
  match: RouteName[];
  Icon: (props: { size?: number }) => ReactNode;
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
           instruction of the run, and the rail should not go dark under it. */
        match: ["run", "instruction", "verifyCall"],
        Icon: IconRun,
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
  const [collapsed, setCollapsed] = useState(storedCollapsed);
  const [open, setOpen] = useState(false);

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

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
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
          <button
            type="button"
            className="rail-toggle"
            onClick={toggleCollapsed}
            aria-pressed={collapsed}
            title={collapsed ? "Expandir el menu" : "Contraer el menu"}
          >
            <IconPanel size={17} />
            <span className="sr-only">
              {collapsed ? "Expandir el menu" : "Contraer el menu"}
            </span>
          </button>
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
                        <Icon size={18} />
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
            className="rail-open"
            onClick={() => setOpen(true)}
            aria-label="Abrir el menu"
          >
            <IconPanel size={17} />
          </button>
          <h1 className="topbar-title">{title}</h1>

          {/* ADR-0002: anything generated carries a visible marker. It is a
              standing fact about the whole app rather than a property of the
              screen you happen to be on, so it belongs to the frame and appears
              exactly once -- here, in the one strip that is always on screen at
              full width. It used to sit in the rail, which the user can
              collapse to 60px, where the word does not fit. */}
          <span className="topbar-mark watermark">{SYNTHETIC_LABEL}</span>
        </header>

        <main id="main" className="screen">
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
              Prototipo sobre datos sinteticos. No es una institucion financiera
              y no es asesoria fiscal. Los RFC reales solo aparecen en la
              consulta de la lista oficial.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}

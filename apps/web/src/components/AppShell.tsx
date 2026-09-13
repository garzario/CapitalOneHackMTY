/**
 * The frame every screen sits in: skip link, product header, the six routes,
 * the toast region and the footer that says what this is.
 *
 * The header is deliberately small. The screen a judge is looking at is the
 * payment run, not our logo.
 *
 * The toast provider is mounted here rather than per screen for two reasons: the
 * live region has to exist in the document before the first message lands, or a
 * screen reader does not reliably announce it, and a confirmation must survive
 * the navigation that follows the write that produced it.
 */

import type { ReactNode } from "react";
import { SYNTHETIC_LABEL } from "../lib/labels";
import { dataMode } from "../lib/resource";
import { href, PATHS, type Route, type RouteName } from "../lib/router";
import { ToastProvider } from "./Toast";
import { Wordmark } from "./Wordmark";

const NAV: Array<{ to: string; label: string; match: RouteName[] }> = [
  { to: PATHS.run, label: "Corrida", match: ["run", "instruction"] },
  { to: PATHS.intake, label: "Alta por QR", match: ["intake"] },
  { to: PATHS.sat, label: "Lista 69-B", match: ["sat"] },
  { to: PATHS.cep, label: "CEP", match: ["cep"] },
  { to: PATHS.verifyCall, label: "Llamada", match: ["verifyCall"] },
  { to: PATHS.metrics, label: "Metricas", match: ["metrics"] },
];

/** One line, not a paragraph. ADR-0002 fixes the hook as fiscal and final. */
const TAGLINE =
  "Revisa la corrida de pagos antes de que el SPEI salga, porque un SPEI no regresa y una factura de un proveedor en la lista 69-B no se deduce.";

const DATA_MODE_LABEL: Record<string, string> = {
  auto: "API con respaldo sintetico",
  api: "solo API",
  mock: "solo datos sinteticos",
};

export function AppShell({
  route,
  children,
}: {
  route: Route;
  children: ReactNode;
}) {
  const mode = dataMode();

  return (
    <ToastProvider>
      <div className="min-h-svh">
        <a className="skip-link" href="#main">
          Ir al contenido
        </a>

        <header className="app-bar">
          <div className="app-width flex flex-col gap-4 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <a href={href(PATHS.run)} className="app-brand">
                  <Wordmark />
                </a>
                <p className="muted max-w-prose t-sm">{TAGLINE}</p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <span className="watermark">{SYNTHETIC_LABEL}</span>
                <span className="subtle t-xs">
                  Datos: {DATA_MODE_LABEL[mode] ?? mode}
                </span>
              </div>
            </div>

            <nav aria-label="Secciones">
              <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
                {NAV.map((item) => {
                  const isCurrent = item.match.includes(route.name);

                  return (
                    <li key={item.to}>
                      {/* The current item is selected in CSS off its own ARIA
                        attribute, so what a screen reader announces and what an
                        eye sees cannot drift apart. */}
                      <a
                        href={href(item.to)}
                        aria-current={isCurrent ? "page" : undefined}
                        className="nav-link"
                      >
                        {item.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </header>

        <main
          id="main"
          className="app-width flex flex-col gap-6 px-4 py-6 sm:px-6"
        >
          {children}
        </main>

        <footer className="app-width px-4 py-8 sm:px-6">
          <p className="subtle t-xs">
            Prototipo sobre datos sinteticos. No es una institucion financiera y
            no es asesoria fiscal. Los RFC reales solo aparecen en la consulta
            de la lista oficial.
          </p>
        </footer>
      </div>
    </ToastProvider>
  );
}

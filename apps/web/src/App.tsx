/**
 * Route table. One screen per route, and nothing else in this file: the shell
 * draws the frame, the screens own their own data.
 */

import { useEffect } from "react";
import { AppShell } from "./components/AppShell";
import { AssistantDock } from "./components/AssistantDock";
import { EmptyBlock } from "./components/States";
import { Tour } from "./components/Tour";
import { TokenSheet } from "./design/TokenSheet";
import {
  DEFAULT_PATH,
  href,
  PATHS,
  type Route,
  useRoute,
  useRouteQuery,
} from "./lib/router";
import { openTour, openTourOnFirstVisit } from "./lib/tour-store";
import { CepScreen } from "./screens/CepScreen";
import { EntryScreen } from "./screens/EntryScreen";
import { InstructionScreen } from "./screens/InstructionScreen";
import { IntakeScreen } from "./screens/IntakeScreen";
import { MetricsScreen } from "./screens/MetricsScreen";
import { PaymentsScreen } from "./screens/PaymentsScreen";
import { RunScreen } from "./screens/RunScreen";
import { SatScreen } from "./screens/SatScreen";
import { SupplierScreen } from "./screens/SupplierScreen";
import { VerifyCallScreen } from "./screens/VerifyCallScreen";

const TITLES: Record<Route["name"], string> = {
  entry: "Entrada y ajustes",
  run: "Corrida de pagos",
  payments: "Salida de la corrida",
  instruction: "Instruccion de pago",
  supplier: "Expediente del proveedor",
  intake: "Alta de una instruccion",
  sat: "Lista del articulo 69-B",
  cep: "Comprobante Electronico de Pago",
  verifyCall: "Llamada de verificacion",
  metrics: "Evaluacion ciega",
  design: "Sistema de diseno",
  notFound: "Pagina no encontrada",
};

function screenFor(route: Route) {
  switch (route.name) {
    case "entry":
      return <EntryScreen />;
    case "run":
      return <RunScreen />;
    case "payments":
      return <PaymentsScreen />;
    case "instruction":
      return <InstructionScreen id={route.id} />;
    case "supplier":
      return <SupplierScreen rfc={route.rfc} />;
    case "intake":
      return <IntakeScreen />;
    case "sat":
      return <SatScreen />;
    case "cep":
      return <CepScreen />;
    case "verifyCall":
      return <VerifyCallScreen />;
    case "metrics":
      return <MetricsScreen />;
    /* The token sheet. It is a reference rather than a screen, so it lives in
       `design/` with the stylesheet it documents and not in `screens/`. */
    case "design":
      return <TokenSheet />;
    case "notFound":
      return (
        <div className="panel">
          <EmptyBlock
            title="Esa pagina no existe"
            description={`No hay nada en ${route.path}.`}
            action={
              <a className="btn" href={href(PATHS.run)}>
                Ir a la corrida
              </a>
            }
          />
        </div>
      );
  }
}

export default function App() {
  const route = useRoute();
  const query = useRouteQuery();

  /* The tab title follows the route, so a judge with six tabs open can tell
     them apart, and the history entry is readable. */
  useEffect(() => {
    document.title = `${TITLES[route.name]} | SentryOne`;
  }, [route.name]);

  /* `#/run?tour=1` opens the recorrido on arrival, so the link on a printed card
     or in a message lands somebody inside the story rather than on a table they
     have to interpret. It is the route's own query and not the page's, which is
     what keeps it out of `?data=`: one is what this build reads its data from and
     the other is where in the app you are. */
  useEffect(() => {
    if (query.get("tour") === "1") {
      openTour();
    }
  }, [query]);

  /* The first load of this browser opens the recorrido by itself, and no load
     after it does. The product opens on ninety-two rows of pesos and a judge who
     walks up while nobody is presenting has no way to know which of them is the
     product, so the one thing this app does without being asked is introduce
     itself, once, with `Saltar` and `Ver despues` on the card. It replaced a
     banner on `#/entrada`, which is a screen a visitor landing on the run never
     opened. `lib/tour-store.ts` holds the remembering and every read of it is
     wrapped, so a browser that refuses storage is greeted every time rather than
     left with an unexplained table. */
  useEffect(() => {
    openTourOnFirstVisit();
  }, []);

  /* A bare URL lands on the payment run with a real hash, so every link on the
     page is shareable from the first paint. */
  useEffect(() => {
    if (window.location.hash === "") {
      window.history.replaceState(null, "", href(DEFAULT_PATH));
    }
  }, []);

  /* The assistant is mounted beside the shell and not inside a route, because it
     reads the line the clerk is already looking at: opening it must not replace
     the screen underneath, or the question loses its subject.

     The recorrido is beside both for a stronger version of the same reason: it
     navigates the app underneath itself, stop by stop, so it cannot live inside
     the thing it is driving. */
  return (
    <>
      <AppShell route={route} title={TITLES[route.name]}>
        {screenFor(route)}
      </AppShell>
      <AssistantDock />
      <Tour />
    </>
  );
}

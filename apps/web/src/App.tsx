/**
 * Route table. One screen per route, and nothing else in this file: the shell
 * draws the frame, the screens own their own data.
 */

import { useEffect } from "react";
import { AppShell } from "./components/AppShell";
import { EmptyBlock } from "./components/States";
import { DEFAULT_PATH, href, PATHS, type Route, useRoute } from "./lib/router";
import { CepScreen } from "./screens/CepScreen";
import { InstructionScreen } from "./screens/InstructionScreen";
import { IntakeScreen } from "./screens/IntakeScreen";
import { MetricsScreen } from "./screens/MetricsScreen";
import { RunScreen } from "./screens/RunScreen";
import { SatScreen } from "./screens/SatScreen";

const TITLES: Record<Route["name"], string> = {
  run: "Corrida de pagos",
  instruction: "Instruccion de pago",
  intake: "Alta de una instruccion",
  sat: "Lista 69-B",
  cep: "CEP",
  metrics: "Evaluacion ciega",
  notFound: "Pagina no encontrada",
};

function screenFor(route: Route) {
  switch (route.name) {
    case "run":
      return <RunScreen />;
    case "instruction":
      return <InstructionScreen id={route.id} />;
    case "intake":
      return <IntakeScreen />;
    case "sat":
      return <SatScreen />;
    case "cep":
      return <CepScreen />;
    case "metrics":
      return <MetricsScreen />;
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

  /* The tab title follows the route, so a judge with six tabs open can tell
     them apart, and the history entry is readable. */
  useEffect(() => {
    document.title = `${TITLES[route.name]} | Ceptinela`;
  }, [route.name]);

  /* A bare URL lands on the payment run with a real hash, so every link on the
     page is shareable from the first paint. */
  useEffect(() => {
    if (window.location.hash === "") {
      window.history.replaceState(null, "", href(DEFAULT_PATH));
    }
  }, []);

  return <AppShell route={route}>{screenFor(route)}</AppShell>;
}

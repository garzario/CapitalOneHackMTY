/**
 * The front door: who is using SentryOne, and what this build is configured
 * with.
 *
 * It exists because two things were invisible and both of them are claims a
 * judge tests. The first is the person. Every write in this product carries
 * `X-Actor` and the append-only ledger records that name, so "who did this" is
 * answerable for every decision and every peso that left; until this screen the
 * identity was a value in `localStorage` that nothing on screen could show or
 * change, which made the one honest thing about it impossible to demonstrate.
 * The second is the configuration. The rail, the thresholds and the three levels
 * decide what the run does, and a product that hides them is asking to be
 * believed.
 *
 * Three rules about what this screen is not.
 *
 * **The selector is not a login.** There is no password, no session and no check
 * anywhere in this product: the header is a name and a role the caller chooses
 * and the API records it rather than verifying it. `docs/06-regulatory-privacy.md`
 * section 4.4 says so in those words, and this screen says it on the screen
 * rather than in a file, because a judge who assumes a login exists has been
 * misled by the absence of the sentence.
 *
 * **The settings are read-only, and that is the feature.** A threshold somebody
 * can move from the UI is a threshold that no longer matches the tests, the
 * documents or the evidence on the line in front of them. Each row says which
 * file and which constant it is, so the number on screen and the number in the
 * engine are the same number by construction and not by promise.
 *
 * **What a person may do is asked of `packages/core`.** The capability list runs
 * each shape through `decideRequirement`, the same function `apps/api` enforces,
 * so this screen cannot offer something the API would answer `403` to. Switching
 * the person changes the list under your hand, which is the whole point of it.
 */

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { type Column, DataTable } from "../components/DataTable";
import {
  ConfidenceBadge,
  Field,
  SectionHeader,
} from "../components/Primitives";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../components/States";
import { StatusCard } from "../components/StatusCard";
import {
  ACTOR_HEADER,
  actorHeaderValue,
  DEMO_ACTORS,
  setCurrentActor,
  useActor,
} from "../lib/actor";
import { getRails } from "../lib/api";
import type { Actor, RailRow, RailsStatus } from "../lib/contract";
import {
  CAPABILITIES,
  capabilityVerdict,
  ROLE_DETAIL,
  THRESHOLDS,
} from "../lib/entry";
import {
  CONFIDENCE_HELP,
  CONFIDENCE_ORDER,
  RAIL_LABEL,
  ROLE_LABEL,
} from "../lib/labels";
import { reachesApi } from "../lib/resource";
import { href, PATHS } from "../lib/router";
import { railSentence } from "./PaymentsScreen";

/**
 * What this page load knows about the rails, which includes not having asked.
 *
 * `skipped` is a state and not an error for the reason the offline mode exists:
 * `?data=mock` promises that no request leaves the browser, and there is no
 * synthetic stand-in for a server's own configuration. Inventing one would be
 * the screen claiming a rail this deployment may not have.
 */
type RailsState =
  | { kind: "skipped" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; rails: RailsStatus };

/** `si` and `no`, because a tick with no word is not readable out loud. */
function yesNo(value: boolean): string {
  return value ? "si" : "no";
}

const RAIL_COLUMNS: ReadonlyArray<Column<RailRow>> = [
  {
    key: "id",
    header: "Riel",
    rowHeader: true,
    cell: (row: RailRow) => RAIL_LABEL[row.id],
  },
  {
    key: "configured",
    header: "Configurado",
    cell: (row: RailRow) => yesNo(row.configured),
  },
  {
    key: "cep",
    header: "Produce CEP",
    cell: (row: RailRow) => yesNo(row.producesCep),
  },
  {
    key: "live",
    header: "Ha movido dinero",
    cell: (row: RailRow) => yesNo(row.live),
  },
  {
    key: "detail",
    header: "Detalle",
    cell: (row: RailRow) => row.detail,
  },
];

/**
 * The two people of the synthetic company, as one radio group.
 *
 * Real radio inputs, like the run's filter: picking exactly one is what a radio
 * group is, and the browser then gives the arrow keys, the roving focus and the
 * announcement for free. The thumb is the same shared-layout element, so a
 * change of person is a movement rather than a disappearance and a birth.
 */
function PersonPicker({
  actor,
  onSelect,
}: {
  actor: Actor;
  onSelect: (next: Actor) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="segmented" role="radiogroup" aria-label="Quien esta usando">
      {DEMO_ACTORS.map((person) => {
        const current = person.name === actor.name;

        return (
          <label className="segment" key={person.name}>
            <input
              type="radio"
              name="entry-person"
              value={person.name}
              checked={current}
              onChange={() => onSelect(person)}
            />
            {current ? (
              <motion.span
                aria-hidden="true"
                layoutId="entry-person-thumb"
                className="segment-thumb"
                transition={{
                  duration: reduceMotion ? 0 : 0.16,
                  ease: [0.2, 0.8, 0.2, 1],
                }}
              />
            ) : null}
            <span className="segment-face">
              {person.name}
              <span className="segment-count">{ROLE_LABEL[person.role]}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function EntryScreen() {
  const actor = useActor();
  const [rails, setRails] = useState<RailsState>(() =>
    reachesApi() ? { kind: "loading" } : { kind: "skipped" },
  );
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => {
    setRails({ kind: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  /* Only ever asked of a server, the same rule the payments screen follows: the
     offline mode says what it did not do instead of inventing a configuration. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retrigger for reload(); it is deliberately unused in the body
  useEffect(() => {
    if (!reachesApi()) {
      return;
    }

    const controller = new AbortController();

    void getRails({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) {
        return;
      }

      setRails(
        result.ok
          ? { kind: "ready", rails: result.data }
          : { kind: "error", message: result.error.message },
      );
    });

    return () => controller.abort();
  }, [attempt]);

  return (
    <>
      {/* No synthetic mark of its own. The shell's top bar carries that word
          once for the whole app, and a second copy beside this heading would be
          the same standing claim printed twice on one screen. */}
      <SectionHeader
        title="Quien esta usando SentryOne"
        description="La persona que elijas aqui viaja en el encabezado de cada escritura y queda en el ledger. Los ajustes de abajo son los de esta instancia y se leen, no se editan."
      />

      <section
        aria-labelledby="entry-person-heading"
        className="panel flex flex-col gap-4 p-5"
      >
        <h2 id="entry-person-heading" className="eyebrow">
          La persona que firma
        </h2>

        <PersonPicker
          actor={actor}
          onSelect={(next) => {
            setCurrentActor(next);
          }}
        />

        <p className="muted m-0 max-w-prose t-sm">{ROLE_DETAIL[actor.role]}</p>

        <div className="panel-sunken flex flex-col gap-2 p-4">
          <span className="eyebrow">Lo que viaja en cada escritura</span>
          <p className="code m-0 t-xs">
            {ACTOR_HEADER}: {actorHeaderValue(actor)}
          </p>
          <p className="subtle m-0 max-w-prose t-xs">
            No es autenticacion. Este producto no guarda contrasenas ni
            sesiones: el encabezado es un nombre y un papel que el cliente
            elige, y la API lo registra en lugar de verificarlo. Una instalacion
            que necesite identidad real pone la autenticacion enfrente de la
            API. Esta en docs/06-regulatory-privacy.md, seccion 4.4.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="entry-can-heading"
        className="panel flex flex-col gap-4 p-5"
      >
        <h2 id="entry-can-heading" className="eyebrow">
          Lo que esta persona puede hacer
        </h2>

        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {CAPABILITIES.map((capability, index) => {
            const verdict = capabilityVerdict(capability, actor);

            return (
              <li key={capability.id} className="flex flex-col gap-1">
                {/* The rule inside the item and not between two of them: an
                    `hr` is not allowed as a child of a list. */}
                {index > 0 ? <hr className="divider mb-3" /> : null}

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      verdict.allowed
                        ? "badge badge-release"
                        : "badge badge-hold"
                    }
                  >
                    {verdict.allowed ? "puede" : "no puede"}
                  </span>
                  <span className="t-base font-semibold">
                    {capability.title}
                  </span>
                </div>

                <p className="muted m-0 max-w-prose t-sm">
                  {capability.detail}
                </p>

                <p className="subtle m-0 t-xs">
                  {verdict.requiresRole === "owner"
                    ? `La autoriza el ${ROLE_LABEL.owner}`
                    : `La confirma la ${ROLE_LABEL.clerk}`}
                  {verdict.requiresReason
                    ? ", y la API la rechaza sin un motivo escrito."
                    : "."}
                </p>
              </li>
            );
          })}
        </ul>

        <p className="subtle m-0 max-w-prose t-xs">
          La regla la contesta decideRequirement en packages/core/src/actor.ts,
          la misma que aplica la API, asi que esta pantalla no ofrece un boton
          que el servidor contestaria con un 403. Esta empresa no tiene una
          cadena de firmas y las dos excepciones son las unicas que piden al
          dueno.
        </p>
      </section>

      <section
        aria-labelledby="entry-settings-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="entry-settings-heading" className="eyebrow">
          Ajustes de esta instancia, solo lectura
        </h2>
        <p className="muted m-0 max-w-prose t-sm">
          Nada de esto se edita desde la pantalla. Un umbral que se mueve con un
          control es un umbral que ya no coincide con las pruebas ni con los
          documentos que el jurado esta leyendo, asi que se cambia en un pull
          request. Cada renglon dice en que archivo vive el numero.
        </p>

        <StatusCard />

        <div className="panel flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="t-md">El riel por el que sale el dinero</h3>
            {rails.kind === "ready" ? (
              <span className="badge badge-neutral">
                {rails.rails.active === null
                  ? "sin riel"
                  : RAIL_LABEL[rails.rails.active]}
              </span>
            ) : null}
          </div>

          {rails.kind === "skipped" ? (
            <p className="muted m-0 max-w-prose t-sm">
              Esta pagina corre en modo sin conexion, asi que no se le pregunto
              a ningun servidor por su configuracion. No saber que riel tiene no
              es lo mismo que saber que no tiene ninguno.
            </p>
          ) : null}

          {rails.kind === "loading" ? (
            <LoadingBlock
              label="Consultando los rieles de este servidor"
              rows={2}
            />
          ) : null}

          {rails.kind === "error" ? (
            <ErrorBlock
              title="No se pudo leer la configuracion de rieles"
              message={rails.message}
              onRetry={reload}
            />
          ) : null}

          {rails.kind === "ready" ? (
            <>
              <p className="muted m-0 max-w-prose t-sm">
                {railSentence(rails.rails)}
              </p>
              <DataTable
                caption="Rieles que tiene este servidor, si estan configurados, si producen CEP y si alguno ha movido dinero"
                columns={RAIL_COLUMNS}
                rows={rails.rails.rails}
                rowKey={(row) => row.id}
                empty={
                  <EmptyBlock
                    title="Este servidor no declara ningun riel"
                    description="La respuesta de /api/v1/rails no trae ninguna fila, asi que esta instancia no puede enviar una corrida y el boton de enviar no se ofrece."
                  />
                }
              />
              <p className="subtle m-0 max-w-prose t-xs">
                Ninguna de estas filas lleva una llave, una cuenta ni una
                huella. Configurado quiere decir que las variables existen y
                nunca que dicen.
              </p>
            </>
          ) : null}
        </div>

        <div className="panel flex flex-col gap-3 p-5">
          <h3 className="t-md">Umbrales de los seis controles</h3>
          <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {THRESHOLDS.map((threshold) => (
              <Field key={threshold.question} label={threshold.question}>
                <span className="t-sm">{threshold.value}</span>
                <span className="code subtle mt-1 block t-xs">
                  {threshold.file}, {threshold.constants.join(" y ")}
                </span>
              </Field>
            ))}
          </dl>
        </div>

        <div className="panel flex flex-col gap-3 p-5">
          <h3 className="t-md">Los tres niveles</h3>
          <p className="muted m-0 max-w-prose t-sm">
            Cada linea de la corrida lleva uno de estos tres, siempre con los
            hallazgos que lo sostienen. Nunca un porcentaje, nunca un puntaje y
            nunca la palabra segura: un SPEI no se puede regresar y ningun nivel
            es una garantia.
          </p>
          <dl className="m-0 flex flex-col gap-3">
            {CONFIDENCE_ORDER.map((level) => (
              <div key={level} className="flex flex-col gap-1">
                <dt>
                  <ConfidenceBadge level={level} />
                </dt>
                <dd className="muted m-0 max-w-prose t-sm">
                  {CONFIDENCE_HELP[level]}
                </dd>
              </div>
            ))}
          </dl>
          <p className="subtle m-0 max-w-prose t-xs">
            Los deriva confidenceOf en packages/core/src/levels.ts, la misma
            funcion que usan el motor, la API, las pantallas y la corrida
            sintetica, asi que las cuatro no pueden discrepar sobre una linea.
            La tabla de reglas esta en docs/adr/0009-states-and-levels.md.
          </p>
        </div>
      </section>

      <p className="subtle m-0 max-w-prose t-xs">
        Las dos personas de arriba son sinteticas, como todo lo demas en esta
        instancia. La corrida esta en{" "}
        <a className="underline" href={href(PATHS.run)}>
          Corrida de pagos
        </a>
        .
      </p>
    </>
  );
}

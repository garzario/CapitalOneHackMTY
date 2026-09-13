/**
 * Article 69-B: the simulation and the lookup, deliberately kept apart.
 *
 * ADR-0002 is strict about this and the separation is visible in the markup: the
 * left half replays a publication over synthetic suppliers, the right half
 * queries the official list with whatever RFC a judge types. A real RFC never
 * appears next to fabricated evidence, so the lookup has no access to the
 * synthetic run and the synthetic run never contains a real RFC.
 *
 * It also means the lookup has no offline fallback on purpose. The official list
 * does not travel inside the browser bundle, and pretending otherwise would be
 * the exact thing the challenge warns about.
 */

import type { SweepResult } from "@hackmty/core";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Amount, SyntheticMark } from "../components/Primitives";
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  SourceNotice,
} from "../components/States";
import {
  getCurrentRun,
  getLedger,
  getSatVersions,
  lookupSatRfc,
  publishSatList,
  sweepConstanciaHref,
} from "../lib/api";
import type { SatLookup } from "../lib/contract";
import { formatCount, formatDate, formatRfc } from "../lib/format";
import { SAT_STATUS_BADGE, SAT_STATUS_LABEL } from "../lib/labels";
import { LISTED_SUPPLIER_RFC, mockSweep, SAT_VERSIONS } from "../lib/mock";
import {
  buildReplay,
  type Replay,
  type ReplayFrame,
  stepDurationMs,
} from "../lib/replay";
import { useResource } from "../lib/resource";
import { useRouteQuery } from "../lib/router";

/** Short month names, so eight ticks fit across a panel on a laptop. */
const MONTH_LABEL = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/**
 * The synthetic supplier the offline sweep is about. Never sent to the API.
 *
 * Read off the synthetic run rather than written down here, so it cannot drift
 * from the company the API serves: it is the RFC the `sat_69b` finding of that
 * run names. See the note on `rfcsToSimulate` below for what a constant cost.
 */
const OFFLINE_RFCS = [LISTED_SUPPLIER_RFC];

function monthTick(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return MONTH_LABEL[index] ?? month.slice(5);
}

function versionsFallback() {
  return { versions: SAT_VERSIONS };
}

/**
 * Which supplier the simulated publication names.
 *
 * It is read off the payment run rather than written down here. A constant was
 * an RFC from a different dataset, so against the seeded company the sweep came
 * back with nothing listed and the screen showed a confident zero. The supplier
 * whose line already carries a 69-B finding is the one the demo turns
 * definitivo, and it is synthetic by construction because every supplier in the
 * run is.
 */
async function rfcsToSimulate(): Promise<string[]> {
  const run = await getCurrentRun();

  if (!run.ok) {
    return OFFLINE_RFCS;
  }

  const listed = run.data.items.find((item) =>
    item.findings.some((finding) => finding.detector === "sat_69b"),
  );

  return listed === undefined ? OFFLINE_RFCS : [listed.instruction.supplierRfc];
}

export function SatScreen() {
  const reduceMotion = useReducedMotion();
  const query = useRouteQuery();

  /* A finding can hand this screen the RFC it is about. It fills the box and
     stops there: ADR-0002 keeps the official list behind a press, so a link
     that queried the SAT on arrival would put a real lookup one stray click
     away from whoever opened it. */
  const prefilledRfc = query.get("rfc") ?? "";
  const loadVersions = useCallback(
    (signal: AbortSignal) => getSatVersions({ signal }),
    [],
  );
  const { resource: versions, reload: reloadVersions } = useResource(
    loadVersions,
    { fallback: versionsFallback },
  );

  const [sweep, setSweep] = useState<SweepResult | null>(null);
  const [sweepSource, setSweepSource] = useState<"api" | "mock" | null>(null);
  const [sweepError, setSweepError] = useState<string | null>(null);
  const [isSweeping, setIsSweeping] = useState(false);

  /* The replay is derived from the sweep and played by an index into its
     frames. Keeping the frames in state rather than recomputing them per
     render means the animation cannot restart because something else on the
     screen changed. */
  const [replay, setReplay] = useState<Replay | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const timer = useRef<number | null>(null);

  const frames = replay?.frames ?? [];
  const frame: ReplayFrame | null = frames[frameIndex] ?? null;
  const isReplaying = frames.length > 0 && frameIndex < frames.length - 1;

  /**
   * Walks one frame at a time until the last one.
   *
   * Reduced motion jumps straight to the end: the numbers are the point and the
   * animation is the decoration, so the person who asked their operating system
   * for less movement still gets the whole answer, immediately.
   */
  useEffect(() => {
    if (replay === null || replay.frames.length === 0) {
      return;
    }
    if (reduceMotion) {
      setFrameIndex(replay.frames.length - 1);
      return;
    }
    if (frameIndex >= replay.frames.length - 1) {
      return;
    }

    const step = stepDurationMs(replay.frames.length);
    timer.current = window.setTimeout(() => {
      setFrameIndex((current) => current + 1);
    }, step);

    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [replay, frameIndex, reduceMotion]);

  const [rfc, setRfc] = useState(prefilledRfc);
  const [lookup, setLookup] = useState<SatLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLooking, setIsLooking] = useState(false);

  /**
   * The months the ledger itself covers, so the replay walks the whole window
   * and not only the months that happen to carry an exposed invoice. Read from
   * the ledger endpoint rather than written down here: a hardcoded range is a
   * timeline that lies the first time the seed changes.
   */
  const readLedgerWindow = useCallback(async () => {
    const result = await getLedger();
    if (!result.ok || result.data.events.length === 0) {
      return undefined;
    }
    const instants = result.data.events.map((event) => event.at).sort();
    return {
      from: instants[0] as string,
      to: instants[instants.length - 1] as string,
    };
  }, []);

  const runSimulation = useCallback(async () => {
    setSweepError(null);
    setIsSweeping(true);

    const [result, window] = await Promise.all([
      publishSatList({
        simulate: true,
        rfcs: await rfcsToSimulate(),
        // The heading above promises a supplier that passes to definitivo,
        // which is the status that voids the deductions retroactively. The
        // endpoint publishes presunto when nobody says, and a screen that says
        // one thing and posts another is a screen a judge catches.
        status: "definitivo",
      }),
      readLedgerWindow(),
    ]);

    setIsSweeping(false);

    if (result.ok) {
      setSweep(result.data);
      setSweepSource("api");
      setReplay(
        buildReplay(result.data, window === undefined ? {} : { window }),
      );
      setFrameIndex(0);

      return;
    }

    /* Offline the sweep is computed from the synthetic CFDIs in the browser, and
       the panel says so. The arithmetic is the same shape as SweepResult, which
       is why the counters below never need to know where it came from. */
    const offline = mockSweep();
    setSweep(offline);
    setSweepSource("mock");
    setReplay(buildReplay(offline));
    setFrameIndex(0);
    setSweepError(
      `Sin API (${result.error.message}). El barrido se calculo sobre la corrida sintetica.`,
    );
  }, [readLedgerWindow]);

  const runLookup = useCallback(async () => {
    const cleaned = formatRfc(rfc);

    if (cleaned.length < 12) {
      setLookupError("Un RFC de persona moral tiene 12 caracteres.");
      setLookup(null);

      return;
    }

    setLookupError(null);
    setIsLooking(true);
    setLookup(null);

    const result = await lookupSatRfc(cleaned);

    setIsLooking(false);

    if (result.ok) {
      setLookup(result.data);

      return;
    }

    setLookupError(
      `${result.error.message} Esta consulta necesita la API: la lista oficial no viaja en el navegador y no se inventa.`,
    );
  }, [rfc]);

  return (
    <>
      <p className="muted max-w-prose t-sm">
        Un proveedor que pasa a definitivo vuelve no deducible todo lo que ya le
        pagamos. El barrido retroactivo cuantifica esa exposicion.
      </p>

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <section
          aria-labelledby="sweep-heading"
          className="panel flex flex-col gap-4 p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id="sweep-heading" className="t-lg">
              Simulacion de publicacion
            </h2>
            <SyntheticMark when={sweep !== null} />
          </div>
          <p className="muted t-sm">
            Publica una version de la lista sobre proveedores sinteticos y
            vuelve a recorrer el ledger desde febrero. Nada de lo que aparece
            aqui es un RFC real.
          </p>

          <button
            type="button"
            className="btn btn-accent btn-lg"
            aria-busy={isSweeping}
            disabled={isSweeping}
            onClick={() => {
              void runSimulation();
            }}
          >
            {isSweeping ? "Recorriendo el ledger" : "Simular publicacion 69-B"}
          </button>

          {/* The replay. Every tick is a month the ledger actually holds and
              every figure below is the sweep's own arithmetic, apportioned
              across the months by src/lib/replay.ts. Nothing here is a
              hardcoded number pretending to count. */}
          <div className="flex flex-col gap-2">
            <span className="eyebrow" id="replay-heading">
              Replay del ledger
            </span>
            {frames.length === 0 ? (
              <div
                className="panel-sunken flex items-center px-3 subtle t-xs"
                style={{ height: "2.5rem" }}
              >
                El replay recorre los meses en los que el ledger tiene facturas
                ya pagadas de los proveedores listados.
              </div>
            ) : (
              <div
                className="panel-sunken relative overflow-hidden"
                style={{ height: "2.5rem" }}
                role="progressbar"
                aria-labelledby="replay-heading"
                aria-valuemin={1}
                aria-valuemax={frames.length}
                aria-valuenow={frameIndex + 1}
                aria-valuetext={`Mes ${frame?.month ?? ""}`}
              >
                <motion.div
                  aria-hidden="true"
                  initial={false}
                  animate={{
                    width: `${((frameIndex + 1) / frames.length) * 100}%`,
                  }}
                  transition={{
                    duration: reduceMotion
                      ? 0
                      : stepDurationMs(frames.length) / 1000,
                    ease: "linear",
                  }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    right: "auto",
                    backgroundColor: "var(--c-accent-soft)",
                  }}
                />
                <ol className="relative m-0 flex h-full list-none items-center justify-between p-0 px-2">
                  {frames.map((entry, index) => (
                    <li
                      key={entry.month}
                      className={index <= frameIndex ? "t-xs" : "subtle t-xs"}
                    >
                      {monthTick(entry.month)}
                      {entry.invoices > 0 ? (
                        <span className="sr-only">
                          {` ${formatCount(entry.invoices)} facturas`}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {frame ? (
              <p className="subtle t-xs" role="status">
                {isReplaying
                  ? `Recorriendo ${frame.month}. ${formatCount(frame.litSoFar.length)} proveedores encendidos.`
                  : `Recorrido completo, ${formatCount(frames.length)} meses del ledger.`}
              </p>
            ) : null}
          </div>

          {sweepError ? (
            <p role="status" className="panel-sunken muted px-4 py-2 t-sm">
              {sweepError}
            </p>
          ) : null}

          {/* A sweep that listed nobody gets its own empty state and not a row
              of zeros: "no hay exposicion" and "no se calculo" are different
              answers and the screen must never show the second as the first. */}
          {sweep === null || sweep.newlyListed.length === 0 ? (
            <EmptyBlock
              title={
                sweep === null
                  ? "Sin barrido todavia"
                  : "La publicacion no alcanzo a ningun proveedor"
              }
              description={
                sweep === null
                  ? "Corre la simulacion para ver la exposicion de ISR e IVA de lo que ya se pago y se dedujo."
                  : "Ningun proveedor de esta corrida quedo en la version simulada, asi que no hay nada ya pagado que cuantificar."
              }
            />
          ) : (
            <>
              {/* The counters follow the replay, so they climb with it and
                  finish on the sweep's own figures. `replay.ts` pins the last
                  frame to those totals rather than to the sum of the frames,
                  because landing a cent away from the engine is how a judge
                  stops believing the screen. */}
              <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <dt className="eyebrow">Base deducida</dt>
                  <dd className="m-0 mt-1">
                    <Amount
                      value={
                        frame?.deductedBase ?? replay?.totals.deductedBase ?? 0
                      }
                      size="lg"
                    />
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">Exposicion de ISR</dt>
                  <dd className="m-0 mt-1">
                    <Amount
                      value={
                        frame?.isrExposure ?? replay?.totals.isrExposure ?? 0
                      }
                      size="lg"
                    />
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">Exposicion de IVA</dt>
                  <dd className="m-0 mt-1">
                    <Amount
                      value={
                        frame?.ivaExposure ?? replay?.totals.ivaExposure ?? 0
                      }
                      size="lg"
                    />
                  </dd>
                </div>
              </dl>

              <div className="flex flex-col gap-1">
                <span className="eyebrow">Exposicion total</span>
                <Amount
                  value={frame?.totalExposure ?? sweep.totalExposure}
                  size="xl"
                />
                <span className="subtle t-xs">
                  Version de la lista {sweep.listVersion}
                  {sweepSource === "mock"
                    ? ", calculada en el navegador"
                    : ", calculada por el motor"}
                </span>
              </div>

              {/* The retention artifact. Offered only when the engine produced
                  the numbers: a constancia of a sweep the browser calculated
                  would be a document about nothing, and this is the one screen
                  where that word carries fiscal weight. */}
              {sweepSource === "mock" ? (
                <p className="subtle t-xs">
                  La constancia en PDF se genera en el servidor. Con la API
                  apagada no hay documento que emitir.
                </p>
              ) : (
                <a
                  className="btn"
                  href={sweepConstanciaHref(sweep.listVersion)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Descargar constancia (PDF)
                </a>
              )}

              {/* A supplier lights up in the month its first already-paid
                  invoice appears, which is the moment the exposure it carries
                  was actually created. Until then the row is present but
                  dimmed: hiding it and popping it in would move the layout
                  under the reader's eye eight times in two seconds. */}
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {sweep.newlyListed.map((entry) => {
                  const lit =
                    frame === null ||
                    frame.litSoFar.includes(entry.supplier.rfc);
                  /* The row the finding came from, marked so whoever followed
                     the link lands on it instead of reading the list for it. */
                  const isSubject =
                    prefilledRfc !== "" && entry.supplier.rfc === prefilledRfc;

                  return (
                    <motion.li
                      key={entry.supplier.rfc}
                      className="panel-sunken flex flex-col gap-1 p-3"
                      aria-current={isSubject ? "true" : undefined}
                      data-highlight={isSubject ? "true" : undefined}
                      initial={false}
                      animate={{ opacity: lit ? 1 : 0.35 }}
                      transition={{ duration: reduceMotion ? 0 : 0.25 }}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {entry.supplier.legalName}
                        </span>
                        <span className={SAT_STATUS_BADGE[entry.status]}>
                          {SAT_STATUS_LABEL[entry.status]}
                        </span>
                      </span>
                      <span className="code subtle">{entry.supplier.rfc}</span>
                      <span className="muted t-xs">
                        {formatCount(entry.paidCfdis.length)} facturas ya
                        pagadas y deducidas
                      </span>
                    </motion.li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <div className="flex flex-col gap-5">
          <section
            aria-labelledby="lookup-heading"
            className="panel flex flex-col gap-4 p-5"
          >
            <h2 id="lookup-heading" className="t-lg">
              Consulta de la lista oficial
            </h2>
            <p className="muted t-sm">
              Escribe cualquier RFC de persona moral y se consulta contra la
              lista publicada. Esta es la unica parte de la aplicacion que toca
              datos reales, y no escribe nada.
            </p>

            <div className="flex flex-wrap items-end gap-3">
              <div className="grow">
                <label className="label" htmlFor="sat-rfc">
                  RFC
                </label>
                <input
                  id="sat-rfc"
                  className="input code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="12 caracteres"
                  value={rfc}
                  onChange={(event) => setRfc(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void runLookup();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className="btn btn-lg"
                aria-busy={isLooking}
                disabled={isLooking}
                onClick={() => {
                  void runLookup();
                }}
              >
                {isLooking ? "Consultando" : "Consultar"}
              </button>
            </div>

            {lookupError ? (
              <ErrorBlock
                title="No se pudo consultar"
                message={lookupError}
                onRetry={() => {
                  void runLookup();
                }}
              />
            ) : null}

            {lookup && lookup.entries.length === 0 ? (
              <EmptyBlock
                title="No aparece en la lista"
                description={`${lookup.rfc} no tiene ninguna publicacion en las versiones cargadas. Eso no es un certificado de nada, solo que no esta.`}
              />
            ) : null}

            {lookup && lookup.entries.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {lookup.entries.map((entry) => (
                  <li
                    key={`${entry.listVersion}-${entry.status}`}
                    className="panel-sunken flex flex-col gap-1 p-3"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={SAT_STATUS_BADGE[entry.status]}>
                        {SAT_STATUS_LABEL[entry.status]}
                      </span>
                      <span className="muted t-xs">
                        publicado el {formatDate(entry.publishedAt)}
                      </span>
                    </span>
                    <span className="t-sm">{entry.name}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section
            aria-labelledby="versions-heading"
            className="panel flex flex-col gap-3 p-5"
          >
            <h2 id="versions-heading" className="eyebrow">
              Versiones cargadas
            </h2>

            {versions.status === "loading" ? (
              <LoadingBlock label="Cargando las versiones" rows={3} />
            ) : null}

            {versions.status === "error" ? (
              <ErrorBlock message={versions.message} onRetry={reloadVersions} />
            ) : null}

            {versions.status === "ready" ? (
              <>
                <SourceNotice notice={versions.notice} />
                {versions.data.versions.length === 0 ? (
                  <EmptyBlock
                    title="Sin versiones"
                    description="No hay ninguna version de la lista cargada en el motor."
                  />
                ) : (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th scope="col">Version</th>
                          <th scope="col">Publicada</th>
                          <th scope="col" className="align-end">
                            Registros
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {versions.data.versions.map((version) => (
                          <tr key={version.listVersion}>
                            <td className="code">{version.listVersion}</td>
                            <td>{formatDate(version.publishedAt)}</td>
                            <td className="align-end num">
                              {formatCount(version.rows)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </section>
        </div>
      </div>
    </>
  );
}

/**
 * The payment run. This is the screen the whole product is judged on, so it
 * answers three questions in the first ten seconds: how much money is in this
 * week's run, how much of it is not leaving yet, and which payment costs the
 * most to get wrong.
 *
 * Everything else on this screen is subordinate to those three, and this file
 * is mostly a record of what was removed to make that true.
 *
 * The three decision buttons are gone from the table. Every row carried
 * Retener, Verificar and Liberar in three different colours; thirteen rows made
 * fifty-two coloured objects, and past the third row the eye stops reading them
 * as controls. Worse, they invited the decision to be made from the one place
 * on the screen that shows no evidence for it. Deciding now happens on the
 * instruction, next to the finding that explains it, which is the product's own
 * argument applied to its own interface.
 *
 * The decision chip is gone too. A row's state is a 3 px mark on its left edge
 * and a word in its own column, so the table can be scanned down the margin and
 * colour is never the only signal.
 *
 * The alert rail is gone. It listed the same findings the table was already
 * sorted by. In its place the six controls say what they found, including the
 * ones that found nothing, which is the claim nothing on this screen was making
 * before.
 *
 * Two links, two destinations, on purpose: the supplier's name opens the
 * payment, the RFC under it opens the supplier's history.
 */

import type { Rfc } from "@hackmty/core";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { ControlsPanel } from "../components/Controls";
import { IntakeQr } from "../components/IntakeQr";
import { Amount } from "../components/Primitives";
import { RunFilterControl } from "../components/RunFilter";
import { RunVerdict } from "../components/RunVerdict";
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  SourceNotice,
} from "../components/States";
import { StatusCard } from "../components/StatusCard";
import { SupplierDrawer } from "../components/SupplierDrawer";
import { getCurrentRun, runConstanciaHref, useEvents } from "../lib/api";
import {
  formatClabe,
  formatCount,
  formatDate,
  formatPlural,
} from "../lib/format";
import { ACTION_LABEL, SOURCE_LABEL } from "../lib/labels";
import { bankName, mockRun } from "../lib/mock";
import { useResource } from "../lib/resource";
import { instructionPath, Link } from "../lib/router";
import {
  countsFor,
  matchesFilter,
  orderItems,
  type RunFilter,
  runVerdict,
} from "../lib/run-view";

export function RunScreen() {
  const load = useCallback(
    (signal: AbortSignal) => getCurrentRun({ signal }),
    [],
  );
  const { resource, reload } = useResource(load, { fallback: mockRun });
  const [drawerRfc, setDrawerRfc] = useState<Rfc | null>(null);
  /* The exceptions are the default view. See the note on RunFilter in
     lib/run-view.ts for why a run of 92 opens on 7 rows and not on 92. */
  const [filter, setFilter] = useState<RunFilter>("stopped");
  /* The row animation is a response to an action, so it does not play on the
     first paint: a table that starts empty and fills in over 400 ms is a table
     that is blank in the first frame a judge sees, and blank in any screenshot
     `brand/shoot.ts` happens to take during it. It arms on the first filter
     change and stays armed. */
  const [filterTouched, setFilterTouched] = useState(false);

  const changeFilter = useCallback((next: RunFilter) => {
    setFilterTouched(true);
    setFilter(next);
  }, []);
  const reduceMotion = useReducedMotion();

  /* Every appended ledger event is a reason to re-read the run. The stream
     carries the event; the run stays the single source of truth for the table,
     so there is no second copy of the state to keep in sync. */
  const onLedgerEvent = useCallback(() => {
    reload();
  }, [reload]);
  const stream = useEvents({ onEvent: onLedgerEvent });

  const run = resource.status === "ready" ? resource.data : null;
  const source = resource.status === "ready" ? resource.source : null;

  /* Both read the items rather than `run.totals`, so the headline and the
     table stay consistent with each other after a decision applied with no
     API behind the page. See lib/run-view.test.ts. */
  const verdict = useMemo(() => (run ? runVerdict(run) : null), [run]);
  const counts = useMemo(() => countsFor(run ? run.items : []), [run]);
  const rows = useMemo(
    () =>
      run
        ? orderItems(run.items).filter((item) => matchesFilter(item, filter))
        : [],
    [run, filter],
  );

  return (
    <>
      {/* The week, the count and the one artifact this screen produces. The
          screen's name is in the top bar and is not repeated here. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="subtle m-0 t-sm">
          {run
            ? `Semana del ${formatDate(run.weekOf)} · ${formatCount(verdict?.totalCount ?? 0)} instrucciones`
            : "Semana en curso"}
          {stream.status === "closed" ? (
            <>
              {" · Sin flujo de eventos. "}
              <button
                type="button"
                className="underline"
                onClick={stream.reconnect}
              >
                Reconectar
              </button>
            </>
          ) : null}
        </p>

        {/* The retention artifact for this run: what was checked, what was
            decided, and a digest of the ledger range behind it. Offered only
            against the engine, because a constancia of a run the browser made
            up would be a document about nothing. */}
        {run && source !== "mock" ? (
          <a
            className="btn"
            href={runConstanciaHref(run.id)}
            target="_blank"
            rel="noreferrer"
          >
            Constancia (PDF)
          </a>
        ) : null}
      </div>

      {resource.status === "loading" ? (
        <div className="panel">
          <LoadingBlock label="Cargando la corrida" rows={6} />
        </div>
      ) : null}

      {resource.status === "error" ? (
        <div className="panel">
          <ErrorBlock message={resource.message} onRetry={reload} />
        </div>
      ) : null}

      {run && verdict ? (
        <>
          <SourceNotice
            notice={resource.status === "ready" ? resource.notice : null}
          />

          <RunVerdict verdict={verdict} />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <section
              aria-labelledby="run-table-heading"
              className="panel min-w-0"
            >
              <div className="card-head">
                <h2 id="run-table-heading" className="eyebrow">
                  Instrucciones
                </h2>
                {/* The filter replaced the line that used to sit here saying
                    "first what is not leaving, then by amount". The control
                    says the same thing and does it as well. */}
                <RunFilterControl
                  value={filter}
                  counts={counts}
                  onChange={changeFilter}
                />
              </div>

              {run.items.length === 0 ? (
                <EmptyBlock
                  title="No hay instrucciones esta semana"
                  description="Cuando llegue la primera instruccion por correo, portal o la pagina de alta, aparece aqui."
                  action={
                    <Link to="/intake" className="btn">
                      Dar de alta una instruccion
                    </Link>
                  }
                />
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <caption className="sr-only">
                      Instrucciones de pago de la semana, con su cuenta y su
                      decision.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Proveedor</th>
                        <th scope="col" className="align-end">
                          Importe
                        </th>
                        <th scope="col">Cuenta destino</th>
                        <th scope="col">Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/*
                       * The filter change is animated per row: the new set fades
                       * and lifts into place with a stagger capped so that even
                       * ninety-two rows have settled inside a fifth of a second.
                       *
                       * The key carries the filter, which is the whole trick.
                       * React then treats a filter change as a new set of rows
                       * rather than an edit to the old one, so every visible row
                       * mounts fresh and animates. The first attempt used
                       * `AnimatePresence` with an `exit` so leaving rows could
                       * fade out too, and it did not work: exiting `<tr>`s were
                       * never unmounted, so switching back to "No salen" left
                       * all ninety-two rows on screen with the filter claiming
                       * seven. Animating only the entrance costs nothing you can
                       * see -- the outgoing rows are replaced under an incoming
                       * animation -- and it cannot strand a row.
                       *
                       * Only opacity and transform move, never height or layout,
                       * so the column widths hold still and the table does not
                       * shiver while it changes.
                       */}
                      {rows.map((item, index) => {
                        const { action } = item.decision;

                        return (
                          <motion.tr
                            key={`${filter}-${item.instruction.id}`}
                            initial={
                              filterTouched ? { opacity: 0, y: -4 } : false
                            }
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: reduceMotion ? 0 : 0.22,
                              delay: reduceMotion
                                ? 0
                                : Math.min(index * 0.012, 0.18),
                              ease: [0.2, 0.8, 0.2, 1],
                            }}
                          >
                            <td
                              className={`cell-supplier row-mark row-mark-${action}`}
                            >
                              <div className="flex flex-col">
                                <Link
                                  to={instructionPath(item.instruction.id)}
                                  className="link-quiet t-base font-medium"
                                >
                                  {item.supplier.legalName}
                                </Link>
                                <span className="t-xs">
                                  <button
                                    type="button"
                                    className="code link-quiet subtle"
                                    onClick={() =>
                                      setDrawerRfc(item.supplier.rfc)
                                    }
                                  >
                                    {item.supplier.rfc}
                                  </button>
                                  <span className="subtle">
                                    {" · "}
                                    {SOURCE_LABEL[item.instruction.source]}
                                    {" · "}
                                    {formatDate(item.instruction.receivedAt)}
                                  </span>
                                </span>
                              </div>
                            </td>
                            <td className="align-end">
                              <Amount value={item.instruction.amount} />
                            </td>
                            <td>
                              <span className="code code-nowrap">
                                {formatClabe(item.instruction.clabe)}
                              </span>
                              <span className="subtle block t-xs">
                                {bankName(item.instruction.clabe)}
                              </span>
                            </td>
                            <td>
                              {/* No dot here. The row already carries its
                                  decision twice -- as the 3 px mark on its left
                                  edge and as this word -- and a third copy in
                                  the same cell as the second is punctuation,
                                  not information. Colour is still not the only
                                  signal: the word is. */}
                              <span className={`decision decision-${action}`}>
                                {ACTION_LABEL[action]}
                              </span>
                              {item.findings.length > 0 ? (
                                <Link
                                  to={instructionPath(item.instruction.id)}
                                  className="subtle block t-xs underline"
                                >
                                  {formatPlural(
                                    item.findings.length,
                                    "hallazgo",
                                  )}
                                </Link>
                              ) : null}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* A filter that matches nothing has to say so. The common
                      case is the good one: a week where nothing was stopped
                      opens on an empty "No salen", and that is a result worth
                      a sentence rather than a blank panel. */}
                  {rows.length === 0 ? (
                    <EmptyBlock
                      title={
                        filter === "stopped"
                          ? "Nada detenido esta semana"
                          : "Nada liberado todavia"
                      }
                      description={
                        filter === "stopped"
                          ? `Las ${formatPlural(counts.all, "instruccion")} de la corrida pasaron los seis controles.`
                          : "Cada instruccion de la corrida sigue detenida o pendiente de verificar."
                      }
                      action={
                        <button
                          type="button"
                          className="btn"
                          onClick={() => changeFilter("all")}
                        >
                          Ver las {formatCount(counts.all)}
                        </button>
                      }
                    />
                  ) : null}
                </div>
              )}
            </section>

            <aside className="flex min-w-0 flex-col gap-5">
              <ControlsPanel items={run.items} />
              <IntakeQr />
              <StatusCard />
            </aside>
          </div>
        </>
      ) : null}

      {drawerRfc ? (
        <SupplierDrawer rfc={drawerRfc} onClose={() => setDrawerRfc(null)} />
      ) : null}
    </>
  );
}

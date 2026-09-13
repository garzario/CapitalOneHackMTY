/**
 * The payment run. This is the screen the whole product is judged on, so it
 * answers three questions in the first ten seconds: how much money is in this
 * week's run, how much of it is not leaving yet, and which payment costs the
 * most to get wrong.
 *
 * Everything else on this screen is subordinate to those three, and this file
 * is mostly a record of what was removed to make that true.
 *
 * The bordered panels are gone and what replaced them is not a border. Every
 * block is a well -- a pale warm container one step below the page -- and where
 * the content is dense enough to need a ground of its own, a white panel sits
 * inside the well with a smaller, concentric radius. Nothing on this screen
 * stands on bare white and nothing casts a hard shadow. The hierarchy is
 * carried by the one dark card at the top, by size, and by which surface a
 * thing is standing on, which is the kind that survives a screenshot.
 *
 * The three decision buttons are gone from the table. Every row carried
 * Retener, Verificar and Liberar in three different colours; thirteen rows made
 * fifty-two coloured objects, and past the third row the eye stops reading them
 * as controls. Worse, they invited the decision to be made from the one place
 * on the screen that shows no evidence for it. Deciding now happens on the
 * instruction, next to the finding that explains it, which is the product's own
 * argument applied to its own interface.
 *
 * The 3 px mark the row used to carry on its left edge is gone: a stripe in the
 * margin of a row is a line used as decoration, and this screen has none. A
 * row's state is the round tile at its head, tinted by the decision, and the
 * soft chip in its own column, so colour is never the only signal.
 *
 * The alert rail is gone. It listed the same findings the table was already
 * sorted by. In its place the six controls say what they found, including the
 * ones that found nothing, which is the claim nothing on this screen was making
 * before.
 *
 * Two links, two destinations, on purpose: the supplier's name opens the
 * payment, the RFC under it opens the supplier's history.
 *
 * What the screen gained with issue 208 is the vocabulary of ADR-0009 and the
 * fact that the table moves on its own. Every line carries its level and its
 * state as words, both from `lineLevels`, which reads the field the API attaches
 * and falls back to the same two functions in `packages/core` rather than to a
 * guess of its own. The three facets filter by those two and by the control that
 * fired, and they live in the route query so a filtered table is a link. And a
 * ledger event no longer reloads the screen: it re-reads the run in place, so the
 * counters count up instead of the whole page dropping back to its skeleton
 * while a judge is looking at it.
 */

import { motion, useReducedMotion } from "motion/react";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ControlsPanel } from "../components/Controls";
import { SourceIcon } from "../components/Icons";
import { IntakeQr } from "../components/IntakeQr";
import {
  Amount,
  ConfidenceBadge,
  TransactionStateBadge,
} from "../components/Primitives";
import { RunDonut } from "../components/RunDonut";
import { RunFilterControl } from "../components/RunFilter";
import { RunVerdict } from "../components/RunVerdict";
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  SourceNotice,
  StreamStatus,
} from "../components/States";
import { StatusCard } from "../components/StatusCard";
import {
  type EventsStatus,
  getCurrentRun,
  runConstanciaHref,
  useEvents,
} from "../lib/api";
import {
  formatClabe,
  formatCount,
  formatDate,
  formatMoney,
  formatPlural,
} from "../lib/format";
import { nextRowIndex } from "../lib/keyboard";
import {
  ACTION_BADGE,
  ACTION_LABEL,
  CONFIDENCE_LABEL,
  CONFIDENCE_ORDER,
  DETECTOR_LABEL,
  DETECTOR_ORDER,
  SOURCE_ICON,
  SOURCE_LABEL,
  STATE_LABEL,
  STATE_ORDER,
} from "../lib/labels";
import { bankName, mockRun } from "../lib/mock";
import { reachesApi, useResource } from "../lib/resource";
import {
  instructionPath,
  Link,
  navigate,
  runPath,
  supplierPath,
  useRouteQuery,
} from "../lib/router";
import {
  countsFor,
  diffRuns,
  levelCounts,
  lineLevels,
  matchesFacets,
  matchesFilter,
  NO_CONTROL,
  orderItems,
  parseRunFacets,
  type RunFacets,
  type RunFilter,
  runChangeSentence,
  runFacetsQuery,
  runVerdict,
  verdictDelta,
} from "../lib/run-view";
import { useToken } from "../lib/tokens";
import { LEDGER_NUDGE } from "../lib/tour-call";

/**
 * How long the screen waits before re-reading the run after a ledger event.
 *
 * A publication is not one event. `POST /api/v1/sat/publish` appends
 * `sat_list_published` and then one `decision_made` per re-scored line, in the
 * same request, and every one of them arrives on the stream inside a few
 * milliseconds. Fetching the run once per event would be a dozen requests for
 * one answer, and the last one to come back would win whatever order they
 * returned in. One timer, restarted by nothing and cleared when it fires, turns
 * the burst into a single read.
 */
const REFRESH_COALESCE_MS = 250;

/**
 * How long a moved row stays marked, as the multiple of `--motion-slow` the
 * `row-moved` keyframe in `primitives.css` fades over. The class has to come
 * off when the tint is gone, and the two have to agree on when that is.
 */
const HIGHLIGHT_SLOW_MULTIPLE = 3;

/** What the last refresh moved: the sentence to say and the rows to mark. */
type LastChange = { sentence: string; ids: readonly string[] };

const NOTHING_CHANGED: LastChange = { sentence: "", ids: [] };

/**
 * What the screen says about the event stream, in one place.
 *
 * A stream nobody opened is not a stream that closed. Under `?data=mock` the
 * page promises no request leaves the browser, so `useEvents` is never enabled
 * and reports `closed`, and a header that read that as "sin flujo de eventos"
 * with a Reconectar button beside it offered a judge with no API a control whose
 * only possible outcome was a failure the mode had already ruled out. `allowed`
 * is the fact that separates the two, and `StreamStatus` takes it.
 */
export function streamLabel(allowed: boolean, status: EventsStatus): string {
  if (!allowed) {
    return "Sin conexion: el flujo de eventos no se abre";
  }

  if (status === "open") {
    return "Flujo de eventos conectado";
  }

  return status === "connecting"
    ? "Conectando al flujo de eventos"
    : "Flujo de eventos cerrado";
}

/** Whether the reconnect affordance means anything right now. */
export function canReconnectStream(
  allowed: boolean,
  status: EventsStatus,
): boolean {
  return allowed && status === "closed";
}

export function RunScreen() {
  const load = useCallback(
    (signal: AbortSignal) => getCurrentRun({ signal }),
    [],
  );
  const { resource, reload, replace } = useResource(load, {
    fallback: mockRun,
  });
  /* The exceptions are the default view. See the note on RunFilter in
     lib/run-view.ts for why a run of 92 opens on 7 rows and not on 92. */
  const [filter, setFilter] = useState<RunFilter>("stopped");
  /* The row animation is a response to an action, so it does not play on the
     first paint: a table that starts empty and fills in over 400 ms is a table
     that is blank in the first frame a judge sees, and blank in any screenshot
     `brand/shoot.ts` happens to take during it. It arms on the first filter
     change and stays armed. */
  const [filterTouched, setFilterTouched] = useState(false);
  const [change, setChange] = useState<LastChange>(NOTHING_CHANGED);

  const changeFilter = useCallback((next: RunFilter) => {
    setFilterTouched(true);
    setFilter(next);
  }, []);
  const reduceMotion = useReducedMotion();

  const run = resource.status === "ready" ? resource.data : null;
  const source = resource.status === "ready" ? resource.source : null;

  /* The run as it was before the last refresh, which is the only way to say
     what moved. A ref and not state: nothing renders it, and putting it in
     state would render the screen twice per event. */
  const previousRun = useRef(run);

  useEffect(() => {
    previousRun.current = run;
  }, [run]);

  /** The fetch a refresh has in flight, so the next one and the unmount stop it. */
  const inFlight = useRef<AbortController | null>(null);

  /**
   * Re-read the run in place.
   *
   * `replace` and never `reload`: `reload` puts the resource back into
   * `loading`, which unmounts this whole screen into the skeleton for as long as
   * the request takes. On the beat this exists for, a judge is watching the
   * figures, and a page that blinks white and comes back with new numbers has
   * shown them nothing. A failed refresh keeps what is on screen for the same
   * reason: the answer already rendered is still the best one we have.
   *
   * The controller in the ref is what keeps a late answer from talking to a
   * screen that is gone. A refresh is started by an event and not by a render,
   * so nothing else cancels it: an answer that arrives after the clerk pressed
   * a row would call `replace` and `setChange` on an unmounted component, and
   * two overlapping refreshes would land in whatever order the network chose.
   * Aborting the previous one on both edges makes the last request the only one
   * that can write.
   */
  const refresh = useCallback(() => {
    inFlight.current?.abort();

    const controller = new AbortController();
    inFlight.current = controller;

    void getCurrentRun({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted || !result.ok) {
        return;
      }

      const before = previousRun.current;
      const next = result.data;

      previousRun.current = next;
      replace(next);

      if (before === null) {
        return;
      }

      const changes = diffRuns(before, next);
      const sentence = runChangeSentence(
        verdictDelta(runVerdict(before), runVerdict(next)),
        changes,
        new Date(),
      );

      if (sentence === "") {
        return;
      }

      setChange({
        sentence,
        ids: changes.map((line) => line.instructionId),
      });
    });
  }, [replace]);

  const coalesce = useRef<number | null>(null);

  /* Every appended ledger event is a reason to re-read the run, and a
     publication appends a dozen of them at once. The stream carries the event;
     the run stays the single source of truth for the table, so there is no
     second copy of the state to keep in sync. */
  const onLedgerEvent = useCallback(() => {
    if (coalesce.current !== null) {
      return;
    }

    coalesce.current = window.setTimeout(() => {
      coalesce.current = null;
      refresh();
    }, REFRESH_COALESCE_MS);
  }, [refresh]);

  /* The other way in, for the one case the stream does not cover: the tour's
     call can be settled by its own poll before the event reaches this stream,
     or with the stream closed behind a proxy that dropped it, and then the row
     the visitor was just told about would sit unchanged behind the card. It is
     the same coalesced re-read and not a second path through the data. */
  useEffect(() => {
    window.addEventListener(LEDGER_NUDGE, onLedgerEvent);

    return () => window.removeEventListener(LEDGER_NUDGE, onLedgerEvent);
  }, [onLedgerEvent]);

  useEffect(
    () => () => {
      if (coalesce.current !== null) {
        window.clearTimeout(coalesce.current);
      }

      inFlight.current?.abort();
    },
    [],
  );

  /* The tint on a moved row is a moment, not a property of the row, so the ids
     are dropped once it has faded.

     Two failures come from leaving them: the key of every row carries the
     filter and the facets, so a row still holding `row-moved` remounts on the
     next segmented or facet click and the browser starts the keyframe over,
     which flashes a line that moved during the publication minutes later on an
     unrelated click; and a line that moves twice in a row keeps the same class
     on the same element and never animates the second time, which is the one
     case the mark exists for. Clearing fixes both, because the class then goes
     off and comes back. */
  const highlightMs = useToken("--motion-slow", 360) * HIGHLIGHT_SLOW_MULTIPLE;

  useEffect(() => {
    if (change.ids.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setChange((current) => ({ ...current, ids: [] }));
    }, highlightMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [change.ids, highlightMs]);

  /* `?data=mock` promises that no request leaves the browser, and the stream is
     a request. Held closed there rather than opened and reported, which is what
     it used to do: the screen said "solo datos sinteticos" and "flujo de eventos
     conectado" at the same time. */
  const streamAllowed = reachesApi();
  const stream = useEvents({ enabled: streamAllowed, onEvent: onLedgerEvent });

  /* The facets are the route's, not the screen's: a filtered table is a link
     somebody can send, and a reload lands on the same rows. */
  const query = useRouteQuery();
  const facets = useMemo(() => parseRunFacets(query), [query]);
  const facetsQuery = runFacetsQuery(facets);
  const anyFacet = facetsQuery !== "";

  const changeFacets = useCallback((next: RunFacets) => {
    setFilterTouched(true);
    navigate(runPath(next), { replace: true });
  }, []);

  /* What a select just produced, read through the same parser the URL goes
     through instead of through a cast: one function decides what these three
     strings may be, and an empty option clears the facet because it parses to
     nothing. */
  const pickState = useCallback(
    (value: string) =>
      changeFacets({
        ...facets,
        state: parseRunFacets(new URLSearchParams([["state", value]])).state,
      }),
    [facets, changeFacets],
  );
  const pickLevel = useCallback(
    (value: string) =>
      changeFacets({
        ...facets,
        level: parseRunFacets(new URLSearchParams([["level", value]])).level,
      }),
    [facets, changeFacets],
  );
  const pickControl = useCallback(
    (value: string) =>
      changeFacets({
        ...facets,
        control: parseRunFacets(new URLSearchParams([["control", value]]))
          .control,
      }),
    [facets, changeFacets],
  );

  /* Both read the items rather than `run.totals`, so the headline and the
     table stay consistent with each other after a decision applied with no
     API behind the page. See lib/run-view.test.ts. */
  const verdict = useMemo(() => (run ? runVerdict(run) : null), [run]);
  const counts = useMemo(() => countsFor(run ? run.items : []), [run]);
  /* The lines the segmented control is showing, before the facets narrow them
     further. The facet counts are taken over these and not over the whole run:
     the number beside an option has to be the number of rows picking it
     produces, and a count over the run promised 86 lines on a slice that by
     construction holds none of them. */
  const sliced = useMemo(
    () => (run ? run.items.filter((item) => matchesFilter(item, filter)) : []),
    [run, filter],
  );
  const perLevel = useMemo(() => levelCounts(sliced), [sliced]);
  const rows = useMemo(
    () =>
      run
        ? orderItems(run.items)
            .filter((item) => matchesFilter(item, filter))
            .filter((item) => matchesFacets(item, facets))
        : [],
    [run, filter, facets],
  );

  /* The same facets over the whole run. It is what tells the empty block which
     of the two controls emptied the table: a link that arrives with a facet the
     current slice cannot hold leaves rows behind, and telling that clerk to
     clear the facets sends them away from the lines they came for. */
  const facetMatchesInRun = useMemo(
    () =>
      run ? run.items.filter((item) => matchesFacets(item, facets)).length : 0,
    [run, facets],
  );

  /* One entry per visible row, so a key press can move focus to the next one
     without the table knowing anything about the DOM. */
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const onRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>, index: number) => {
      if (event.key === "Enter") {
        /* Only when the row itself has focus. Enter on the supplier link inside
           it is the link's, and swallowing it would break the one navigation a
           keyboard user expects to work. */
        if (event.target !== event.currentTarget) {
          return;
        }

        const id = rows[index]?.instruction.id;

        if (id !== undefined) {
          event.preventDefault();
          navigate(instructionPath(id));
        }

        return;
      }

      const next = nextRowIndex(event.key, index, rows.length);

      if (next === null) {
        return;
      }

      event.preventDefault();
      rowRefs.current[next]?.focus();
    },
    [rows],
  );

  return (
    <>
      {resource.status === "loading" ? (
        <LoadingBlock label="Cargando la corrida" rows={6} />
      ) : null}

      {resource.status === "error" ? (
        <ErrorBlock message={resource.message} onRetry={reload} />
      ) : null}

      {run && verdict ? (
        /* One column: the greeting, the five figures, the two charts, the
           list, and the two asides. Every one of them after the greeting is a
           well, so the grouping is drawn rather than implied, and 24px of air
           is enough between containers that already have edges. */
        <div className="run-stack">
          <header className="run-hero">
            <div>
              {/* An h2: the top bar keeps the page's one h1. "Corrida del
                  jueves" is the ritual and not the date -- the persona runs
                  the payment run on Thursdays -- and the week it covers is the
                  first clause of the line underneath. */}
              <h2 className="run-hero-title">Corrida del jueves</h2>
              <p className="run-hero-sub">
                {`Semana del ${formatDate(run.weekOf)} · ${formatCount(verdict.totalCount)} instrucciones · ${formatCount(verdict.stoppedCount)} no salen todavia`}
              </p>
            </div>

            <div className="run-hero-aside">
              <SourceNotice
                notice={resource.status === "ready" ? resource.notice : null}
                compact
              />
              <StreamStatus
                status={stream.status}
                allowed={streamAllowed}
                onReconnect={stream.reconnect}
              />

              {/* The retention artifact for this run: what was checked, what
                  was decided, and a digest of the ledger range behind it.
                  Offered only against the engine, because a constancia of a
                  run the browser made up would be a document about
                  nothing. */}
              {source !== "mock" ? (
                <a
                  className="btn btn-pill"
                  href={runConstanciaHref(run.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Constancia (PDF)
                </a>
              ) : null}
            </div>
          </header>

          <RunVerdict verdict={verdict} change={change.sentence} />

          {/* The two charts. The donut gets the wider column because its
              legend is four columns of text; the controls get the narrower one
              because six bars only need to be longer than each other. They
              stack under 80rem, where neither of them is a chart any more. */}
          {/* Two equal columns, not three-to-two: the controls chart has a floor
              of 28rem and a narrower column pushed its longest label out of
              view between 1280 and 1570 wide. */}
          <div className="grid gap-4 xl:grid-cols-2">
            <section
              aria-labelledby="composition-heading"
              className="well min-w-0"
            >
              <div className="well-head">
                <h2 id="composition-heading" className="t-lg">
                  Composicion de la corrida
                </h2>
              </div>

              <div className="well-panel min-w-0">
                <RunDonut verdict={verdict} />
              </div>
            </section>

            <section
              aria-labelledby="controls-heading"
              className="well min-w-0"
            >
              <div className="well-head">
                <h2 id="controls-heading" className="t-lg">
                  Controles
                </h2>
                <span className="subtle t-sm">
                  {formatPlural(run.items.length, "instruccion")} revisadas
                </span>
              </div>

              <div className="well-panel min-w-0">
                <ControlsPanel items={run.items} />
              </div>
            </section>
          </div>

          <section aria-labelledby="run-table-heading" className="well min-w-0">
            <div className="well-head">
              <div className="flex min-w-0 flex-col gap-1">
                <h2 id="run-table-heading" className="t-lg">
                  Instrucciones
                </h2>
                {/* The keyboard is not discoverable by looking, so it is
                    written down where the table starts. */}
                <span className="subtle t-xs">
                  Flechas para moverse entre lineas, Enter para abrir
                </span>
              </div>

              {/* The filter replaced the line that used to sit here saying
                  "first what is not leaving, then by amount". The control
                  says the same thing and does it as well. */}
              <RunFilterControl
                value={filter}
                counts={counts}
                onChange={changeFilter}
              />
            </div>

            {/* The three facets, under the slice they narrow. They are selects
                and not more segmented controls because a segmented control is
                for two or three options a person picks between and these are
                five, three and seven, most of which are empty on any given
                week. */}
            <div className="run-facets">
              <div className="run-facet">
                <label className="label" htmlFor="run-facet-state">
                  Estado
                </label>
                <select
                  id="run-facet-state"
                  className="input input-inline"
                  value={facets.state ?? ""}
                  onChange={(event) => pickState(event.target.value)}
                >
                  <option value="">Todos</option>
                  {STATE_ORDER.map((state) => (
                    <option
                      key={state}
                      value={state}
                      /* An option worth zero rows in this slice is not an
                         option. The one it is still worth offering is the one
                         already selected, which a link can set before the slice
                         is narrowed: hiding it from the control that holds it
                         would leave the select displaying "Todos" over a
                         filtered table. */
                      disabled={perLevel[state] === 0 && facets.state !== state}
                    >
                      {`${STATE_LABEL[state]} · ${formatCount(perLevel[state])}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="run-facet">
                <label className="label" htmlFor="run-facet-level">
                  Nivel
                </label>
                <select
                  id="run-facet-level"
                  className="input input-inline"
                  value={facets.level ?? ""}
                  onChange={(event) => pickLevel(event.target.value)}
                >
                  <option value="">Todos</option>
                  {CONFIDENCE_ORDER.map((level) => (
                    <option
                      key={level}
                      value={level}
                      disabled={perLevel[level] === 0 && facets.level !== level}
                    >
                      {`${CONFIDENCE_LABEL[level]} · ${formatCount(perLevel[level])}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="run-facet">
                <label className="label" htmlFor="run-facet-control">
                  Control
                </label>
                <select
                  id="run-facet-control"
                  className="input input-inline"
                  value={facets.control ?? ""}
                  onChange={(event) => pickControl(event.target.value)}
                >
                  <option value="">Todos</option>
                  {DETECTOR_ORDER.map((detector) => (
                    <option key={detector} value={detector}>
                      {DETECTOR_LABEL[detector]}
                    </option>
                  ))}
                  <option value={NO_CONTROL}>Sin hallazgos</option>
                </select>
              </div>

              <button
                type="button"
                className="btn btn-pill btn-sm"
                onClick={() => changeFacets({})}
                disabled={!anyFacet}
              >
                Limpiar
              </button>

              <span className="subtle t-xs">
                {`${formatCount(rows.length)} de ${formatPlural(counts.all, "linea")}`}
              </span>
            </div>

            {run.items.length === 0 ? (
              <div className="well-panel">
                <EmptyBlock
                  title="No hay instrucciones esta semana"
                  description="Cuando llegue la primera instruccion por correo, portal o la pagina de alta, aparece aqui."
                  action={
                    <Link to="/intake" className="btn btn-pill">
                      Dar de alta una instruccion
                    </Link>
                  }
                />
              </div>
            ) : (
              /* The panel is the ground and the box inside it is what
                 scrolls: a scroll container that is also the padded surface
                 drops its own trailing padding the moment the content
                 overflows it. */
              <div className="well-panel well-panel-table">
                <div className="table-scroll">
                  <table className="data-table">
                    <caption className="sr-only">
                      Instrucciones de pago de la semana, con su nivel, su
                      estado, su cuenta y su decision.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Proveedor</th>
                        <th scope="col" className="align-end">
                          Importe
                        </th>
                        <th scope="col">Cuenta destino</th>
                        <th scope="col">Nivel</th>
                        <th scope="col">Estado</th>
                        <th scope="col">Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/*
                       * The filter change is animated per row: the new set fades
                       * and lifts into place with a stagger capped so that even
                       * ninety-two rows have settled inside a fifth of a second.
                       *
                       * The key carries the filter and the facets, which is the
                       * whole trick. React then treats a change of either as a
                       * new set of rows rather than an edit to the old one, so
                       * every visible row mounts fresh and animates. The first
                       * attempt used `AnimatePresence` with an `exit` so leaving
                       * rows could fade out too, and it did not work: exiting
                       * `<tr>`s were never unmounted, so switching back to "No
                       * salen" left all ninety-two rows on screen with the filter
                       * claiming seven. Animating only the entrance costs nothing
                       * you can see -- the outgoing rows are replaced under an
                       * incoming animation -- and it cannot strand a row.
                       *
                       * Only opacity and transform move, never height or layout,
                       * so the column widths hold still and the table does not
                       * shiver while it changes.
                       */}
                      {rows.map((item, index) => {
                        const { action } = item.decision;
                        const levels = lineLevels(item);
                        const moved = change.ids.includes(item.instruction.id);

                        return (
                          <motion.tr
                            key={`${filter}-${facetsQuery}-${item.instruction.id}`}
                            /* Focusable, so the arrows have somewhere to land,
                               and named, because a row a screen reader reaches
                               is six cells of context otherwise. */
                            tabIndex={0}
                            aria-label={`${item.supplier.legalName}, ${formatMoney(item.instruction.amount)}, nivel ${CONFIDENCE_LABEL[levels.confidence]}, estado ${STATE_LABEL[levels.state]}`}
                            ref={(element) => {
                              rowRefs.current[index] = element;
                            }}
                            onKeyDown={(event) => onRowKeyDown(event, index)}
                            /* The row the last refresh moved, lit for as long
                               as the fade takes. The colour and the duration are
                               tokens and the fade is a keyframe in
                               primitives.css, so reduced motion switches it off
                               where every other duration in the app is switched
                               off. */
                            className={moved ? "row-moved" : undefined}
                            /* The worst line of the run, named for the
                               recorrido: the copy of one stop points at it, and
                               a hook on the row beats teaching the tour what a
                               table row of this app looks like. */
                            data-tour={
                              index === 0 ? "run-first-row" : undefined
                            }
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
                            <td className="cell-supplier">
                              <div className="row-lead">
                                {/* Two facts in one object: the tint is the
                                  decision and the glyph is the channel the
                                  instruction arrived by. Neither is the only
                                  place either fact appears -- the word is in
                                  the last column and the channel is spelled
                                  out under the name. */}
                                <span className={`row-tile row-tile-${action}`}>
                                  <SourceIcon
                                    glyph={SOURCE_ICON[item.instruction.source]}
                                    size={18}
                                  />
                                </span>
                                <span className="flex min-w-0 flex-col">
                                  <Link
                                    to={instructionPath(item.instruction.id)}
                                    className="link-quiet t-base font-medium"
                                  >
                                    {item.supplier.legalName}
                                  </Link>
                                  <span className="t-xs">
                                    {/* The RFC opens the expediente. It used to
                                      open a drawer over this table, which had
                                      room for the invoices and for nothing
                                      else; the profile is a route, so it is
                                      linkable, it survives a reload, and a
                                      middle click still opens it beside the
                                      run. */}
                                    <Link
                                      to={supplierPath(item.supplier.rfc)}
                                      className="code link-quiet subtle"
                                    >
                                      {item.supplier.rfc}
                                    </Link>
                                    <span className="subtle">
                                      {" · "}
                                      {SOURCE_LABEL[item.instruction.source]}
                                      {" · "}
                                      {formatDate(item.instruction.receivedAt)}
                                    </span>
                                  </span>
                                </span>
                              </div>
                            </td>
                            <td className="align-end">
                              {/* The amount carries the same weight as the
                                legal name above it. The name is the link;
                                the amount is what the clerk is deciding
                                about, and it should not be the lighter of
                                the two things in the row. */}
                              <Amount
                                value={item.instruction.amount}
                                className="font-medium"
                              />
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
                              {/* The level and the state, both derived and
                                never stored, both from `lineLevels`. Two
                                columns and not one, because they answer
                                different questions: how much the evidence
                                supports this line, and where the line
                                stands. ADR-0009. */}
                              <ConfidenceBadge level={levels.confidence} />
                            </td>
                            <td>
                              <TransactionStateBadge state={levels.state} />
                            </td>
                            <td>
                              {/* The soft chip the rest of the app uses for a
                                decision. On a white panel a tinted pill is
                                legible at a glance where a 7px dot beside a
                                word was a detail you had to look for, and it
                                is the same object a judge just saw on the
                                instruction screen. */}
                              <span className={ACTION_BADGE[action]}>
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
                </div>

                {/* A filter that matches nothing has to say so, and it has to
                    name the right filter. The common case is the good one: a
                    week where nothing was stopped opens on an empty "No salen",
                    and that is a result worth a sentence rather than a blank
                    panel. When a facet is set there are two cases and they have
                    opposite exits: the facets match nothing anywhere, and the
                    way out is to drop them; or they match lines the segmented
                    control is not showing, and the way out is to widen the
                    slice. Saying "ninguna instruccion tiene ese estado" over a
                    run where 86 of them do is the one thing this block must not
                    do. */}
                {rows.length === 0 && anyFacet && facetMatchesInRun > 0 ? (
                  <EmptyBlock
                    title="Ese filtro no cae en este corte"
                    description={`El filtro alcanza a ${formatPlural(facetMatchesInRun, "instruccion")} de la corrida, pero ninguna esta en el corte que muestra el control de arriba.`}
                    action={
                      <button
                        type="button"
                        className="btn btn-pill"
                        onClick={() => changeFilter("all")}
                      >
                        Ver las {formatCount(facetMatchesInRun)}
                      </button>
                    }
                  />
                ) : null}

                {rows.length === 0 && anyFacet && facetMatchesInRun === 0 ? (
                  <EmptyBlock
                    title="Ninguna linea con ese filtro"
                    description="Ninguna instruccion de esta corrida tiene a la vez el estado, el nivel y el control que estan seleccionados."
                    action={
                      <button
                        type="button"
                        className="btn btn-pill"
                        onClick={() => changeFacets({})}
                      >
                        Limpiar los filtros
                      </button>
                    }
                  />
                ) : null}

                {rows.length === 0 && !anyFacet ? (
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
                        className="btn btn-pill"
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

          {/* The two asides: the QR the judge scans and the API's health.
              Neither is the run -- both are furniture the clerk uses once --
              so they are wells with no panel inside them, side by side under
              everything that is. */}
          <div className="grid gap-4 md:grid-cols-2">
            <IntakeQr />
            <StatusCard />
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * How the payment run is read, as pure functions over the contract types.
 *
 * This is view logic, not domain logic, so it lives here and not in
 * `packages/core`: nothing below decides anything about money, it decides what
 * a person sees first. The reason it is a module with tests rather than a few
 * expressions inside the component is that both answers are load-bearing for
 * the ten-second read, and a sort that quietly changes between renders is the
 * kind of bug you only find in front of a judge.
 *
 * One rule runs through all of it: read the items, never the totals. The
 * totals come from the API and go stale the moment a decision is applied
 * locally, which is exactly what happens on the offline demo path.
 *
 * The one thing this module never does is decide. The level and the state of a
 * line come from `confidenceOf` and `transactionStateOf` in `@hackmty/core`,
 * the pesos of the run from `runMoney` in the same package, and what is here is
 * the reading around them: which lines to show, in what order, and what changed
 * since the last time the screen looked.
 */

import {
  type Action,
  type Confidence,
  confidenceOf,
  type Detector,
  type Finding,
  type RunLevels,
  runMoney,
  type TransactionState,
  transactionStateOf,
} from "@hackmty/core";
import type { PaymentRun, PaymentRunItem } from "./contract";
import { formatMoney, formatTime } from "./format";
import {
  ACTION_LABEL,
  CONFIDENCE_LABEL,
  DETECTOR_LABEL,
  STATE_LABEL,
} from "./labels";

/** The two words one line is read with: how much it is trusted, and where it stands. */
export interface LineLevels {
  confidence: Confidence;
  state: TransactionState;
}

/**
 * The level and the state of one line, from the payload when it carries them and
 * from the same two core functions when it does not.
 *
 * The API attaches both to every item (`apps/api/src/levels.ts`, issue 204), so
 * on that path this reads the field and adds nothing. The fallback is for the two
 * payloads that have no field: an API that predates it, because the server half of
 * this shipped separately, and the offline run, where there is no server to ask.
 * It is not a second implementation, and that distinction is the whole of ADR-0009:
 * `confidenceOf` and `transactionStateOf` are the same functions the API itself
 * calls, so the two paths cannot disagree about a line. The day the field is on
 * every payload, the `??` goes and nothing else changes.
 *
 * The state is derived over the LINE's findings rather than over the ones the
 * stored decision remembers weighing, because a publication adds findings to a
 * line whose decision was signed before it: `transactionStateOf` reads
 * `decision.findings` and the fresh evidence is on the item.
 *
 * No verification and no execution line is passed, because the run payload
 * carries neither, and that is the one place the fallback is narrower than the
 * API's own answer: a line whose beneficiary came back blocked reads `cancelado`
 * on the server and reads whatever its decision says here. The definitive SAT
 * listing does reach it, because that rule reads the findings and the findings
 * are on the line: a hold over a definitively listed supplier answers
 * `cancelado`, and a hold with no such row answers `rojo`. The payments screen,
 * which does hold the verifications, passes them.
 */
export function lineLevels(item: PaymentRunItem): LineLevels {
  return {
    confidence: item.confidence ?? confidenceOf(item.findings, item.decision),
    state:
      item.state ??
      transactionStateOf({ ...item.decision, findings: item.findings }),
  };
}

/**
 * Reading order for the table. What is stopped comes before what is leaving,
 * because the clerk's job this Thursday is the exceptions and the releases are
 * already handled.
 */
const ACTION_RANK: Record<Action, number> = {
  hold: 0,
  verify: 1,
  release: 2,
};

/** Actions where the money has not left yet. */
const NOT_LEAVING: readonly Action[] = ["hold", "verify"];

/**
 * Which slice of the run the table is showing.
 *
 * The run is ninety-two instructions and eighty-five of them are releases.
 * Ordered exceptions-first the table was correct and still unusable: the work
 * was the top seven rows and the rest said "this one is fine", eighty-five
 * times, over twelve screens. Eighty-five rows that all say the same thing are
 * not a list, they are a number, and that number is already on the card above
 * the table.
 */
export type RunFilter = "stopped" | "released" | "all";

export function matchesFilter(
  item: PaymentRunItem,
  filter: RunFilter,
): boolean {
  switch (filter) {
    case "stopped":
      return NOT_LEAVING.includes(item.decision.action);
    case "released":
      return !NOT_LEAVING.includes(item.decision.action);
    case "all":
      return true;
  }
}

export interface RunCounts {
  stopped: number;
  released: number;
  all: number;
}

/** The size of each bucket, so the filter can say what it is hiding. */
export function countsFor(items: readonly PaymentRunItem[]): RunCounts {
  let stopped = 0;

  for (const item of items) {
    if (NOT_LEAVING.includes(item.decision.action)) stopped += 1;
  }

  return { stopped, released: items.length - stopped, all: items.length };
}

/**
 * Exceptions first, and inside a state the largest amount first. Returns a new
 * array: the run object belongs to the resource cache and sorting it in place
 * would reorder somebody else's copy.
 */
export function orderItems(items: readonly PaymentRunItem[]): PaymentRunItem[] {
  return [...items].sort((left, right) => {
    const byAction =
      ACTION_RANK[left.decision.action] - ACTION_RANK[right.decision.action];

    if (byAction !== 0) {
      return byAction;
    }

    return right.instruction.amount - left.instruction.amount;
  });
}

/** The single finding that costs the most to get wrong, with its row. */
export interface WorstRisk {
  finding: Finding;
  instructionId: string;
}

/** What the top of the screen says before anyone reads the table. */
export interface RunVerdict {
  /** Instructions whose money has not left: held plus awaiting verification. */
  stoppedCount: number;
  stoppedAmount: number;
  heldCount: number;
  /* The stopped figure split by reason. The bar under the figure needs the
     two halves separately, and a bar that recomputed them from the items
     would be a second definition of "held" living next to this one. */
  heldAmount: number;
  toVerifyCount: number;
  toVerifyAmount: number;
  releasedCount: number;
  releasedAmount: number;
  totalCount: number;
  totalAmount: number;
  worst: WorstRisk | null;
  /**
   * The largest single amount at risk on each line, added across lines, and the
   * retroactive pair the Article 69-B findings of this run carry.
   *
   * All three come from `runMoney` in `@hackmty/core`, which is the arithmetic
   * `totals` on `GET /api/v1/run/current` is built from and the arithmetic the
   * constancia prices, so the tile and the totals cannot disagree. It is read
   * over the ITEMS rather than off `totals` for the reason the rest of this
   * verdict is: an offline decision rewrites an item and leaves the totals
   * where they were.
   */
  amountAtRisk: number;
  /** Subtotal already deducted to the suppliers a 69-B finding of this run names. */
  retroactive69bBase: number;
  /** ISR plus IVA that reverses on that subtotal. No fraud is needed for it. */
  retroactive69bExposure: number;
}

/**
 * The verdict, computed from the items so it stays true after a decision is
 * applied without the API.
 */
export function runVerdict(run: PaymentRun): RunVerdict {
  const money = runMoney(run.items);
  const verdict: RunVerdict = {
    stoppedCount: 0,
    stoppedAmount: 0,
    heldCount: 0,
    heldAmount: 0,
    toVerifyCount: 0,
    toVerifyAmount: 0,
    releasedCount: 0,
    releasedAmount: 0,
    totalCount: run.items.length,
    totalAmount: 0,
    worst: null,
    amountAtRisk: money.amountAtRisk,
    retroactive69bBase: money.retroactive69bBase,
    retroactive69bExposure: money.retroactive69bExposure,
  };

  for (const item of run.items) {
    const { action } = item.decision;
    const { amount } = item.instruction;

    verdict.totalAmount += amount;

    if (NOT_LEAVING.includes(action)) {
      verdict.stoppedCount += 1;
      verdict.stoppedAmount += amount;
    }

    if (action === "hold") {
      verdict.heldCount += 1;
      verdict.heldAmount += amount;
    }

    if (action === "verify") {
      verdict.toVerifyCount += 1;
      verdict.toVerifyAmount += amount;
    }

    if (action === "release") {
      verdict.releasedCount += 1;
      verdict.releasedAmount += amount;
    }

    for (const finding of item.findings) {
      /* Strictly greater, so the first of two equal findings wins and the
         sentence at the top of the screen does not change between renders. */
      if (
        verdict.worst === null ||
        finding.amountAtRisk > verdict.worst.finding.amountAtRisk
      ) {
        verdict.worst = { finding, instructionId: item.instruction.id };
      }
    }
  }

  return verdict;
}

/* --------------------------------------------------- the level and the state */

/**
 * How many lines sit at each level and in each state. Counts, never an average.
 *
 * `RunLevels` from `@hackmty/core` rather than eight names written again, which
 * is the same shape `PaymentRunTotals` carries, so a ninth state added to
 * ADR-0009 cannot reach the totals and miss the screen.
 */
export type LevelCounts = RunLevels;

/**
 * The eight counts, read through `lineLevels` so they cannot disagree with the
 * badge on the row they count.
 *
 * Counts and not an average, for the reason `runMoney` gives for never adding
 * two amounts at risk inside one line: three levels averaged into a number is
 * the score ADR-0009 forbids, arrived at by arithmetic instead of by a claim.
 *
 * Not `runLevels` from the same package, and the difference is one rule rather
 * than an oversight. `runLevels` re-derives every line, which is right for a
 * producer assembling the payload; this screen has to count what it is showing,
 * and what it shows comes from `lineLevels`, which takes the level the API
 * attached whenever the payload carries one. A tally that re-derived instead
 * could offer `Alerta 3` beside a table holding four. There is still one
 * derivation under both, because the fallback in `lineLevels` is the same two
 * core functions and nothing else.
 */
export function levelCounts(items: readonly PaymentRunItem[]): LevelCounts {
  const counts: LevelCounts = {
    confiable: 0,
    precaucion: 0,
    alerta: 0,
    rojo: 0,
    cancelado: 0,
    enviado: 0,
    pendiente: 0,
    liberado: 0,
  };

  for (const item of items) {
    const { confidence, state } = lineLevels(item);

    counts[confidence] += 1;
    counts[state] += 1;
  }

  return counts;
}

/* ---------------------------------------------------------------- the facets */

/**
 * The three facets the run's table filters by, on top of the slice the
 * segmented control picks.
 *
 * They live in the route query rather than in component state so the filtered
 * view is a link: a clerk who found the three lines that matter can send that
 * URL, and a judge who reloads is looking at the same table. Undefined is "not
 * filtered by this", which is why every field is optional rather than carrying
 * an "all" member: an absent key and a key meaning nothing are two ways to say
 * one thing.
 */
export interface RunFacets {
  state?: TransactionState;
  level?: Confidence;
  /** A detector, or `none` for the lines no control raised anything on. */
  control?: Detector | "none";
}

/** The control facet value that means "no finding at all", which is not a detector. */
export const NO_CONTROL = "none";

/**
 * Whether a string is one of the values the domain has, asked of the label
 * dictionary rather than of a list written here.
 *
 * The dictionaries in `labels.ts` are `Record<T, string>` over the domain
 * unions, so TypeScript already fails when one of them misses a member. Reading
 * membership off them is what keeps a new state from needing a second list here
 * that somebody has to remember to update.
 *
 * `Object.hasOwn` and not `in`: `in` walks the prototype chain, so `toString`,
 * `constructor`, `valueOf` and the rest of `Object.prototype` would answer yes
 * and land in the facets as if they were domain values. `#/run?state=toString`
 * then hides every row while the select still reads "Todos", which is the exact
 * empty table this parser exists to prevent.
 */
function isState(value: string): value is TransactionState {
  return Object.hasOwn(STATE_LABEL, value);
}

function isLevel(value: string): value is Confidence {
  return Object.hasOwn(CONFIDENCE_LABEL, value);
}

function isControl(value: string): value is Detector {
  return Object.hasOwn(DETECTOR_LABEL, value);
}

/**
 * The facets carried by a route query. Anything unknown is ignored rather than
 * rendered as an empty table: a hand-edited URL or a link from an older build
 * should show the run, not nothing.
 */
export function parseRunFacets(query: URLSearchParams): RunFacets {
  const facets: RunFacets = {};
  const state = query.get("state") ?? "";
  const level = query.get("level") ?? "";
  const control = query.get("control") ?? "";

  if (isState(state)) {
    facets.state = state;
  }
  if (isLevel(level)) {
    facets.level = level;
  }
  if (control === NO_CONTROL || isControl(control)) {
    facets.control = control;
  }

  return facets;
}

/**
 * The facets as a query string, with no leading `?` and empty when nothing is
 * set, so the caller decides whether there is a `?` to write at all.
 *
 * The order is fixed and is the order of the three controls on screen, so one
 * set of facets is always one URL and the address bar does not shuffle while a
 * clerk changes them.
 */
export function runFacetsQuery(facets: RunFacets): string {
  const query = new URLSearchParams();

  if (facets.state !== undefined) {
    query.set("state", facets.state);
  }
  if (facets.level !== undefined) {
    query.set("level", facets.level);
  }
  if (facets.control !== undefined) {
    query.set("control", facets.control);
  }

  return query.toString();
}

/** Whether one line passes every facet that is set. Unset facets match everything. */
export function matchesFacets(
  item: PaymentRunItem,
  facets: RunFacets,
): boolean {
  if (facets.state !== undefined || facets.level !== undefined) {
    const levels = lineLevels(item);

    if (facets.state !== undefined && levels.state !== facets.state) {
      return false;
    }
    if (facets.level !== undefined && levels.confidence !== facets.level) {
      return false;
    }
  }

  if (facets.control === undefined) {
    return true;
  }

  return facets.control === NO_CONTROL
    ? item.findings.length === 0
    : item.findings.some((finding) => finding.detector === facets.control);
}

/* ------------------------------------------------------- what just changed */

/** One line the last refresh moved, with both sides of the move. */
export interface RunLineChange {
  instructionId: string;
  legalName: string;
  /** Null for a line the previous run did not have, which is intake. */
  before: { action: Action; state: TransactionState } | null;
  after: { action: Action; state: TransactionState };
}

/**
 * The lines whose action or state moved between two reads of the run.
 *
 * This is what makes a publication legible instead of merely live. The screen
 * re-reads the run when the ledger says something happened, and without a diff
 * the only visible result is a table that is subtly different from the one the
 * clerk was reading a second ago. The amount is deliberately not compared: a
 * corrected amount is not a line that moved, and reporting it would put a
 * sentence on the screen about a change nobody has to act on.
 *
 * In the order of `next`, so the sentence is stable between renders.
 */
export function diffRuns(
  previous: PaymentRun,
  next: PaymentRun,
): RunLineChange[] {
  const before = new Map(
    previous.items.map((item) => [item.instruction.id, item]),
  );

  return next.items.flatMap((item): RunLineChange[] => {
    const after = {
      action: item.decision.action,
      state: lineLevels(item).state,
    };
    const previousItem = before.get(item.instruction.id);

    if (previousItem === undefined) {
      return [
        {
          instructionId: item.instruction.id,
          legalName: item.supplier.legalName,
          before: null,
          after,
        },
      ];
    }

    const was = {
      action: previousItem.decision.action,
      state: lineLevels(previousItem).state,
    };

    return was.action === after.action && was.state === after.state
      ? []
      : [
          {
            instructionId: item.instruction.id,
            legalName: item.supplier.legalName,
            before: was,
            after,
          },
        ];
  });
}

/** What moved in the four figures the live sentence talks about. */
export interface VerdictDelta {
  retroactive69bExposure: number;
  amountAtRisk: number;
  heldCount: number;
  toVerifyCount: number;
}

/**
 * The change between two verdicts, for the sentence under the figures.
 *
 * Four fields and not the whole verdict, because these are the four a
 * publication moves and the sentence is one line: the retroactive exposure it
 * priced, the pesos at risk that climbed with it, and the two counts that trade
 * places when a line goes from `verify` to `hold`.
 */
export function verdictDelta(
  previous: RunVerdict,
  next: RunVerdict,
): VerdictDelta {
  return {
    retroactive69bExposure:
      next.retroactive69bExposure - previous.retroactive69bExposure,
    amountAtRisk: next.amountAtRisk - previous.amountAtRisk,
    heldCount: next.heldCount - previous.heldCount,
    toVerifyCount: next.toVerifyCount - previous.toVerifyCount,
  };
}

/** How many moved lines the live sentence names before it starts counting them. */
const NAMED_CHANGES = 3;

/**
 * What the screen says out loud after a refresh moved something.
 *
 * It exists because the run screen updates itself: the SAT publishes, the engine
 * re-scores the lines it named in the same request, and the table under the
 * clerk's cursor changes without anybody clicking. A figure that climbs is
 * visible to whoever was looking at it and invisible to everybody else, so the
 * same fact is written as a sentence and put in a live region.
 *
 * Empty when nothing moved, which is what keeps the region silent on an event
 * that changed no line. The instant is the browser's own clock at the refresh
 * rather than an event timestamp, because it is the answer to "when did this
 * screen learn it" and not to "when was it appended".
 */
export function runChangeSentence(
  delta: VerdictDelta,
  changes: readonly RunLineChange[],
  at: Date | string,
): string {
  const parts: string[] = [];

  if (delta.retroactive69bExposure !== 0) {
    const verb = delta.retroactive69bExposure > 0 ? "subio" : "bajo";

    parts.push(
      `La exposicion retroactiva ${verb} ${formatMoney(Math.abs(delta.retroactive69bExposure))} con la publicacion de las ${formatTime(at)}`,
    );
  }

  if (delta.amountAtRisk !== 0) {
    const verb = delta.amountAtRisk > 0 ? "subieron" : "bajaron";

    parts.push(
      `Los pesos en riesgo ${verb} ${formatMoney(Math.abs(delta.amountAtRisk))}`,
    );
  }

  for (const change of changes.slice(0, NAMED_CHANGES)) {
    parts.push(lineSentence(change));
  }

  if (changes.length > NAMED_CHANGES) {
    parts.push(`y ${changes.length - NAMED_CHANGES} lineas mas`);
  }

  return parts.join(" · ");
}

function lineSentence(change: RunLineChange): string {
  const { instructionId, before, after } = change;

  if (before === null) {
    return `${instructionId} entro a la corrida en ${ACTION_LABEL[after.action]}`;
  }

  /* The action is what a person acts on, so it is what the sentence names when
     it moved. A line whose action held still and whose state did not is the
     publication cancelling a payment nobody re-decided, and that is the other
     half of the same beat. */
  return before.action === after.action
    ? `${instructionId} paso a ${STATE_LABEL[after.state]}`
    : `${instructionId} paso de ${ACTION_LABEL[before.action]} a ${ACTION_LABEL[after.action]}`;
}

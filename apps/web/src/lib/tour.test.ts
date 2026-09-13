/**
 * The recorrido is the one screen of this app that is mostly prose, so the tests
 * over it are about the prose and about the six ways this particular screen goes
 * wrong.
 *
 * **There can be too much of it.** The first version was three dense paragraphs
 * and two bullets per stop, which is a wall of text in front of the product the
 * tour is supposed to be pointing at. A stop is a title, at most two short
 * sentences and one imperative line now, and every one of those lengths is a test
 * rather than an intention.
 *
 * **It can say what without saying where.** Every stop that lights something up
 * carries one line that tells the visitor what to look at, in its own field so the
 * card can print it in its own style. A stop with a spotlight and no such line is
 * a caption over a screen with no caption on the thing it is about.
 *
 * **It can point nowhere.** Two stops carry a folio and every stop but two carries
 * a route, and a route this app's own router reads as `notFound` is a tour that
 * navigates a judge to an empty page in front of them. So every route is parsed
 * with `parsePath`, which is the same function the address bar goes through.
 *
 * **It can point at an element that no longer exists.** The spotlight finds its
 * target by a `data-tour` attribute, and an attribute removed in a refactor fails
 * silently: the veil covers the whole viewport and the step still reads fine. So
 * every name in `TOUR_TARGETS` is looked for in the sources.
 *
 * **The card can cover the thing the card is about.** `placeCard` is the rule and
 * it is geometry, so it is tested as geometry: a spotlight in the corner the card
 * defaults to has to move the card, on either axis, and the rectangle it chooses
 * has to miss the hole whenever a corner is free.
 *
 * **It can say something this product may not say.** ADR-0009 forbids the word
 * "seguro", a percentage and a probability on any screen, and this file is nine
 * screens of copy that no dictionary test covers, because `labels.test.ts` reads
 * `labels.ts`. So `forbiddenVerdict`, the same function the assistant's frames go
 * through, is run over every string the card can render.
 *
 * The first-visit rule is at the foot of the file, because it is the one thing in
 * this app that happens without being asked for.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { forbiddenVerdict } from "./assistant";
import { formatDecimal } from "./format";
import { mockRun } from "./mock";
import { parsePath, queryOf } from "./router";
import {
  CARD_GAP,
  CARD_TOP_GAP,
  cardRectOf,
  DEFAULT_REVERT_MS,
  heroOf,
  linksOf,
  mockTourConfig,
  placeCard,
  SPOT_PAD,
  spotlightHole,
  stepLabel,
  TOUR_LENGTH_NOTE,
  TOUR_MINUTES,
  TOUR_STEP_COUNT,
  TOUR_TARGETS,
  type TourBox,
  type TourPlace,
  tourSteps,
} from "./tour";
import {
  closeTour,
  isTourOpen,
  openTourOnFirstVisit,
  TOUR_SEEN_KEY,
} from "./tour-store";

const SRC_DIR = join(import.meta.dir, "..");

const LINKS = {
  heroInstructionId: "INS-2026-09-07-029",
  heroAmount: 537960.97,
  cepInstructionId: "INS-2026-09-07-047",
};

const steps = tourSteps(LINKS);

/** Every string a step can put on screen, with where it came from. */
function everyLine(): Array<{ where: string; text: string }> {
  return steps.flatMap((step) => [
    { where: `${step.id}.title`, text: step.title },
    ...step.body.map((text, index) => ({
      where: `${step.id}.body[${index}]`,
      text,
    })),
    ...(step.look === undefined
      ? []
      : [{ where: `${step.id}.look`, text: step.look }]),
  ]);
}

/** How long a stop may be, in the unit a person reads in. */
const WORD_LIMIT = 28;

/**
 * The one stop that may say more, and the reason it may.
 *
 * The welcome card sets the hour, the person, the two losses and where the
 * product lives, and none of that is on the screen behind it yet. Every other
 * stop is a caption over something the visitor is already looking at.
 */
const SCENE_WORD_LIMIT = 45;

/**
 * And the line that says where to look is shorter than either.
 *
 * It is an instruction read while the eye is already moving to the thing it names,
 * so it has to be readable in one glance. Anything longer than this is a third
 * sentence wearing a different style.
 */
const LOOK_WORD_LIMIT = 12;

function wordsIn(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word !== "").length;
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (entry.name.includes(".test.")) continue;
    if (/\.(ts|tsx)$/.test(entry.name)) found.push(full);
  }

  return found.sort();
}

describe("the steps", () => {
  test("there are nine of them, in one order, with no repeated id", () => {
    expect(steps).toHaveLength(9);
    expect(TOUR_STEP_COUNT).toBe(9);
    expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length);
  });

  test("every step has a title and something to say", () => {
    for (const step of steps) {
      expect([step.id, step.title.length > 6]).toEqual([step.id, true]);
      /* One to three lines. The floor is one because the last stop is a
         sentence over a form, and the ceiling is three because that is the
         welcome, which is the only card whose screen is not the explanation. */
      const inRange = step.body.length >= 1 && step.body.length <= 3;

      expect([step.id, inRange]).toEqual([step.id, true]);
    }
  });

  test("a stop says under twenty-eight words, and the welcome under forty-five", () => {
    /* The rule this file was rewritten to: a tour that has to be read instead
       of walked is a tour a visitor abandons on stop three, and the screen
       underneath is what the stop is about. The count is over the body, because
       the title is the one line that is allowed to be a label. */
    const overrun = steps
      .map((step) => ({
        id: step.id,
        count: wordsIn(step.body.join(" ")),
        limit: step.kind === "welcome" ? SCENE_WORD_LIMIT : WORD_LIMIT,
      }))
      .filter((step) => step.count >= step.limit)
      .map((step) => `${step.id}: ${step.count} words`);

    expect(overrun).toEqual([]);
  });

  test("the first stop is the welcome card, and it is the only one", () => {
    const welcome = steps[0];

    expect(welcome?.id).toBe("why");
    expect(welcome?.kind).toBe("welcome");
    expect(steps.filter((step) => step.kind === "welcome")).toHaveLength(1);
    /* Nothing to navigate to and nothing to point at: the card is the lockup,
       the headline and the scene, over whatever screen the visitor landed on. */
    expect(welcome?.route).toBeUndefined();
    expect(welcome?.target).toBeUndefined();
    expect(welcome?.look).toBeUndefined();
    /* The headline is the whole argument of the product, and it is the one line
       the card sets large. */
    expect(welcome?.title).toBe(
      "El último control antes de que un pago sea irrevocable",
    );
    expect(welcome?.body).toHaveLength(3);
  });

  test("it says how long it is before anybody starts", () => {
    /* A tour that does not say how long it is, is a tour a person declines
       rather than risks. The count is read off the list and never typed twice. */
    expect(TOUR_LENGTH_NOTE).toBe(
      `${TOUR_STEP_COUNT} pasos, ${TOUR_MINUTES} minutos`,
    );
    expect(TOUR_LENGTH_NOTE).toBe("9 pasos, 2 minutos");
  });

  test("the eyebrow of a card says where the visitor is", () => {
    expect(stepLabel(0, 9)).toBe("Paso 1 de 9");
    expect(stepLabel(8, 9)).toBe("Paso 9 de 9");
  });

  test("every stop with a spotlight says what to look at, in one short line", () => {
    /* The point of the whole overlay: the ring says where and this line says
       what. A stop that lights something up and does not name it leaves the
       visitor reading two sentences about a screen with a red rectangle on it. */
    const missing = steps
      .filter(
        (step) =>
          step.target !== undefined &&
          step.kind === undefined &&
          step.look === undefined,
      )
      .map((step) => step.id);

    expect(missing).toEqual([]);

    const overrun = steps
      .filter((step) => step.look !== undefined)
      .map((step) => ({ id: step.id, count: wordsIn(step.look as string) }))
      .filter((step) => step.count > LOOK_WORD_LIMIT)
      .map((step) => `${step.id}: ${step.count} words`);

    expect(overrun).toEqual([]);
  });

  test("it is one instruction and never a list of them", () => {
    /* One line, one sentence, one thing to do. A `look` with two sentences in it
       is the bullet list this file was rewritten to get rid of, wearing the one
       style on the card that a visitor cannot skip. */
    for (const step of steps) {
      if (step.look === undefined) continue;

      const sentences = step.look
        .split(".")
        .filter((part) => part.trim() !== "");

      expect([step.id, sentences.length]).toEqual([step.id, 1]);
    }
  });

  test("the last stop is one sentence over the form and says it once", () => {
    /* It used to say what the call is in the step body and again in the card
       underneath, which is how the telephone field ended up below the fold of
       its own corner. The card carries the field, the box and the button, and
       this is the only place the sentence lives. */
    const call = steps.at(-1);

    expect(call?.body).toHaveLength(1);
    expect(call?.body.join(" ")).toContain("Contesta con tu voz");
    expect(call?.kind).toBe("call");
    expect(steps.filter((step) => step.kind === "call")).toHaveLength(1);
  });

  test("exactly one stop opens the assistant drawer", () => {
    const opens = steps.filter((step) => step.opensAssistant === true);

    expect(opens).toHaveLength(1);
    expect(opens[0]?.id).toBe("intake");
    /* And it is the one that points at the drawer, because a step that opens a
       panel and spotlights something else is a step that dims what it opened. */
    expect(opens[0]?.target).toBe(TOUR_TARGETS.assistantPanel);
  });
});

describe("where the steps point", () => {
  test("every route this app's own router can read", () => {
    const routed = steps.filter((step) => step.route !== undefined);

    /* A guard on the guard: if the list ever loses its routes, every assertion
       below passes over nothing. */
    expect(routed.length).toBeGreaterThan(5);

    for (const step of routed) {
      const route = parsePath(step.route as string);

      expect([step.id, route.name]).not.toEqual([step.id, "notFound"]);
    }
  });

  test("the two folios travel into the routes that carry them", () => {
    const instruction = steps.find((step) => step.id === "instruction");
    const cep = steps.find((step) => step.id === "cep");

    expect(parsePath(instruction?.route ?? "")).toEqual({
      name: "instruction",
      id: LINKS.heroInstructionId,
    });

    /* The CEP stop carries its folio in the query, which `parsePath` ignores by
       design, so both halves are checked: the screen and the instruction it
       opens on. */
    expect(parsePath(cep?.route ?? "").name).toBe("cep");
    expect(queryOf(cep?.route ?? "").get("instruction")).toBe(
      LINKS.cepInstructionId,
    );
  });

  test("every spotlight target is a data-tour attribute in the sources", () => {
    const sources = sourceFiles(SRC_DIR).map((file) =>
      readFileSync(file, "utf8"),
    );
    const missing: string[] = [];

    for (const [name, value] of Object.entries(TOUR_TARGETS)) {
      const attribute = `data-tour="${value}"`;
      const inline = `? "${value}"`;

      if (
        !sources.some(
          (code) => code.includes(attribute) || code.includes(inline),
        )
      ) {
        missing.push(`${name} (${value})`);
      }
    }

    /* The edge case: a screen is restyled, the attribute goes with the element
       it was on, and the tour keeps pointing at a name nothing answers to. The
       spotlight then covers the whole viewport and says nothing about why. */
    expect(missing).toEqual([]);
  });

  test("every target a step names is one of the declared hooks", () => {
    const declared = new Set<string>(Object.values(TOUR_TARGETS));

    for (const step of steps) {
      if (step.target === undefined) continue;

      expect([step.id, declared.has(step.target)]).toEqual([step.id, true]);
    }
  });
});

describe("what the steps may say", () => {
  const lines = everyLine();

  test("there is copy to check", () => {
    expect(lines.length).toBeGreaterThan(25);
  });

  test("nothing promises a payment is safe, and nothing carries a probability", () => {
    const offenders = lines
      .map((line) => ({ line, found: forbiddenVerdict(line.text) }))
      .filter((entry) => entry.found !== null)
      .map((entry) => `${entry.line.where}: ${entry.found}`);

    expect(offenders).toEqual([]);
  });

  test("no percentage sign and no score anywhere in the tour", () => {
    /* The peso figures stay: `537,960.97` is an amount on an invoice and not a
       score. What may not appear is a rate presented as a number about a
       payment, which is what ADR-0009 forbids. */
    const offenders = lines
      .filter(
        (line) =>
          line.text.includes("%") ||
          /\b(porcentaje|puntaje|score|probabilidad)\b/i.test(line.text),
      )
      .map((line) => line.where);

    expect(offenders).toEqual([]);
  });

  test("the copy is written in Spanish, with its accents and its enye", () => {
    /* The rest of the interface is labels: single words on buttons and column
       heads. The tour is the one place in this app that is prose a visitor
       reads as prose, and prose without accents reads as a typo rather than as
       a convention, which is what a judge saw on the stand. Every stop that
       needs one carries it, so the check is that the copy as a whole is
       accented rather than that each line is. */
    const everything = lines.map((line) => line.text).join(" ");

    expect(/[áéíóúñ]/i.test(everything)).toBe(true);

    /* And the words this copy used to spell without them are spelled with
       them, which is the half a single regex over the whole would not catch. */
    const stale = lines
      .filter((line) =>
        /\b(ultimo|deduccion|linea|razon|abrio|boton|bitacora|unico|dueno|digitos|quien decide|confirmacion|exposicion|publicacion)\b/i.test(
          line.text,
        ),
      )
      .map((line) => line.where);

    expect(stale).toEqual([]);
  });

  test("the welcome card carries both losses, in two clauses instead of two paragraphs", () => {
    const why = steps[0]?.body.join(" ") ?? "";

    /* The two losses are the argument of the whole product and they are both
       irreversible, so neither may be dropped in the name of saying less: the
       transfer that does not come back, and the deduction that goes with a SAT
       publication. The cited rates that used to be here are in
       `docs/04-market.md` and `docs/05-business-model.md`, where a judge can
       check them, rather than in the first paragraph of a tour card. */
    expect(why).toContain("no regresan");
    expect(why).toContain("SAT");
    expect(why).toContain("deducción");
  });

  test("the peso figure of the welcome card is the line the tour is about", () => {
    /* It was typed into the copy, which is the same class of bug as a folio
       written down: one reseed and the paragraph a judge reads first is about a
       payment that is not on the screen behind it. It travels now, and this is
       the test that says it is the derived hero's own amount and not a figure
       that happens to match today. */
    const hero = heroOf(mockRun());
    const config = mockTourConfig();
    const links = linksOf(config as NonNullable<typeof config>);

    expect(links.heroAmount).toBe(hero?.amount ?? -1);
    expect(tourSteps(links)[0]?.body.join(" ")).toContain(
      `${formatDecimal(hero?.amount ?? 0)} pesos`,
    );
    /* And it is read off the links rather than fixed: a different run puts a
       different figure in the same sentence. */
    expect(
      tourSteps({ ...links, heroAmount: 1234.5 })[0]?.body.join(" "),
    ).toContain("1,234.5 pesos");
  });
});

/**
 * The geometry of the overlay, which is the half of it a screenshot cannot check
 * twice: a card that covers its own spotlight looks fine in whichever frame it
 * was taken in and wrong on the step nobody captured.
 */
describe("where the card stands", () => {
  const view = { width: 1440, height: 900 };
  const card = { width: 400, height: 320 };

  /** Whether two rectangles touch at all, which is the whole contract. */
  function overlaps(a: TourBox, b: TourBox): boolean {
    return (
      Math.min(a.left + a.width, b.left + b.width) > Math.max(a.left, b.left) &&
      Math.min(a.top + a.height, b.top + b.height) > Math.max(a.top, b.top)
    );
  }

  const corners: Array<{ where: string; hole: TourBox }> = [
    {
      where: "bottom left",
      hole: { top: 600, left: 40, width: 420, height: 220 },
    },
    {
      where: "bottom right",
      hole: { top: 600, left: 980, width: 420, height: 220 },
    },
    { where: "top left", hole: { top: 60, left: 40, width: 420, height: 220 } },
    {
      where: "the whole foot",
      hole: { top: 700, left: 0, width: 1440, height: 160 },
    },
    {
      where: "a tall column",
      hole: { top: 80, left: 980, width: 420, height: 760 },
    },
  ];

  test("with nothing lit it takes the corner nothing else in this app uses", () => {
    expect(placeCard(null, card, view)).toEqual({
      side: "left",
      vert: "bottom",
    });
  });

  test("it never covers the thing the step is about", () => {
    /* The rule, stated as the rule: whatever corner it picks, the rectangle the
       stylesheet draws there misses the hole. Every case here has at least one
       free corner, which is what makes the assertion absolute. */
    const covered = corners
      .filter(({ hole }) =>
        overlaps(cardRectOf(placeCard(hole, card, view), card, view), hole),
      )
      .map(({ where }) => where);

    expect(covered).toEqual([]);
  });

  test("a target at the foot of the screen sends the card to the top", () => {
    /* The bug the second axis exists for. The button that sends the run is at
       the foot of a wide screen, so both bottom corners are on top of it and a
       left-or-right flip had nowhere good to go. */
    const foot = { top: 700, left: 0, width: 1440, height: 160 };

    expect(placeCard(foot, card, view).vert).toBe("top");
  });

  test("a card sent to the top stands under the top bar, not on it", () => {
    /* The bar carries the title and the two controls that belong to the whole
       app, and a card standing on them reads as a card that landed wrong. The
       stylesheet writes the same distance as calc(var(--topbar-h) + var(--space-3)),
       and this is the half of that pair the placement is measured against. */
    const top = cardRectOf({ side: "left", vert: "top" }, card, view).top;

    expect(top).toBe(CARD_TOP_GAP);
    expect(top).toBeGreaterThan(CARD_GAP);
  });

  test("a target in the default corner moves the card out of it", () => {
    const here = { top: 600, left: 40, width: 420, height: 220 };

    expect(placeCard(here, card, view)).not.toEqual({
      side: "left",
      vert: "bottom",
    });
  });

  test("a spotlight over the whole screen still puts the card somewhere", () => {
    /* The findings block and the person picker are nearly the width of the
       screen, and then every corner overlaps. The card has to stand on something
       rather than not be rendered. */
    const everything = { top: 0, left: 0, width: 1440, height: 900 };
    const place: TourPlace = placeCard(everything, card, view);

    expect(["left", "right"]).toContain(place.side);
    expect(["top", "bottom"]).toContain(place.vert);
  });
});

describe("the hole the veils leave", () => {
  const view = { width: 1440, height: 900 };

  test("it is the element with air around it", () => {
    const hole = spotlightHole(
      { top: 100, left: 200, width: 300, height: 120 },
      view,
    );

    expect(hole).toEqual({
      top: 100 - SPOT_PAD,
      left: 200 - SPOT_PAD,
      width: 300 + SPOT_PAD * 2,
      height: 120 + SPOT_PAD * 2,
    });
  });

  test("nothing it returns is negative, whatever the rect it was given", () => {
    /* A veil with a negative width is a veil the browser drops, which is a hole
       in the dimming rather than a hole in the right place. An element scrolled
       half off the top of the viewport is the case that produces it. */
    for (const box of [
      { top: -400, left: -300, width: 200, height: 100 },
      { top: 880, left: 1420, width: 600, height: 600 },
      { top: 0, left: 0, width: 0, height: 0 },
    ]) {
      const hole = spotlightHole(box, view);

      expect(hole.top).toBeGreaterThanOrEqual(0);
      expect(hole.left).toBeGreaterThanOrEqual(0);
      expect(hole.width).toBeGreaterThanOrEqual(0);
      expect(hole.height).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("the line the tour is about", () => {
  test("it is the largest held amount carrying a CLABE finding", () => {
    const run = mockRun();
    const hero = heroOf(run);

    expect(hero).not.toBeNull();

    const item = run.items.find(
      (line) => line.instruction.id === hero?.instructionId,
    );

    expect(item?.decision.action).toBe("hold");
    expect(
      item?.findings.some((finding) => finding.detector === "clabe_forensics"),
    ).toBe(true);

    /* Nothing held on that control is larger, which is the rule the API applies
       to the seeded run and the reason no folio is written down anywhere. */
    const heldWithClabe = run.items.filter(
      (line) =>
        line.decision.action === "hold" &&
        line.findings.some((finding) => finding.detector === "clabe_forensics"),
    );

    for (const line of heldWithClabe) {
      expect(line.instruction.amount).toBeLessThanOrEqual(hero?.amount ?? 0);
    }
  });

  test("the two plazas are the shape the API answers with", () => {
    /* One field, one shape. `plazasOf` in `apps/api/src/routes/tour.ts` answers
       plain place names because the telephone call reads them out loud, and this
       used to answer "580 APODACA" for the same line: a code the agent would
       have spoken as digits. The usual one used to be read off
       `previousPlazaPlaces`, which only a `plaza_changed` finding carries, so
       offline it was always empty and the two sides told two stories about one
       payment. */
    const hero = heroOf(mockRun());

    expect(hero?.plazaNew).toMatch(/^[A-Z ]+$/);
    expect(hero?.plazaUsual).toMatch(/^[A-Z ]+$/);

    const item = mockRun().items.find(
      (line) => line.instruction.id === hero?.instructionId,
    );

    /* The hero of this run was opened where the supplier has always been paid,
       because its finding is a check digit and not a plaza that moved. */
    expect(hero?.plazaNew).toBe(hero?.plazaUsual ?? "");
    expect(item?.findings[0]?.evidence.previousPlazaPlaces).toBeUndefined();
  });

  test("the hero carries four digits of the account and never the whole one", () => {
    const hero = heroOf(mockRun());
    const item = mockRun().items.find(
      (line) => line.instruction.id === hero?.instructionId,
    );

    expect(hero?.accountLast4).toHaveLength(4);
    expect(item?.instruction.clabe.endsWith(hero?.accountLast4 ?? "")).toBe(
      true,
    );
    expect(hero?.accountLast4).not.toBe(item?.instruction.clabe);
  });

  test("the offline config answers every link the steps need", () => {
    const config = mockTourConfig();

    expect(config).not.toBeNull();
    /* A browser with no server cannot ring a telephone, and saying so is the
       honest answer rather than a limitation to hide. */
    expect(config?.callsEnabled).toBe(false);
    expect(config?.revertAfterMs).toBe(DEFAULT_REVERT_MS);

    const links = linksOf(config as NonNullable<typeof config>);
    const ids = new Set(mockRun().items.map((line) => line.instruction.id));

    expect(ids.has(links.heroInstructionId)).toBe(true);
    expect(ids.has(links.cepInstructionId)).toBe(true);
    /* The two stops are about two different lines: the CEP one is the cent that
       came back blocked, which is the ending that draws the whole machine. */
    expect(links.cepInstructionId).not.toBe(links.heroInstructionId);
  });

  test("the revert the contract documents is ten minutes", () => {
    expect(DEFAULT_REVERT_MS).toBe(600_000);
  });
});

/**
 * The first visit, which is the one thing this app does without being asked.
 *
 * `window` is stubbed rather than mocked away, because the rule being tested is
 * exactly what happens at the storage boundary: a browser that answers, and a
 * browser that refuses. Both are real cases at a stand, where half the laptops
 * are in a private window.
 */
describe("the first visit", () => {
  const globals = globalThis as { window?: unknown };
  const original = globals.window;

  function storageThat(store: Map<string, string> | null) {
    globals.window = {
      localStorage:
        store === null
          ? {
              getItem() {
                throw new Error("storage is blocked");
              },
              setItem() {
                throw new Error("storage is blocked");
              },
            }
          : {
              getItem: (key: string) => store.get(key) ?? null,
              setItem: (key: string, value: string) => {
                store.set(key, value);
              },
            },
    };
  }

  afterEach(() => {
    closeTour();
    globals.window = original;
  });

  test("it opens itself once, and the second load is left alone", () => {
    const store = new Map<string, string>();
    storageThat(store);

    expect(openTourOnFirstVisit()).toBe(true);
    expect(isTourOpen()).toBe(true);
    /* Remembered on opening and not on closing, so a visitor who reloads in the
       middle of it is not greeted again from the beginning. */
    expect(store.get(TOUR_SEEN_KEY)).toBe("1");

    closeTour();

    expect(openTourOnFirstVisit()).toBe(false);
    expect(isTourOpen()).toBe(false);
  });

  test("the key is namespaced, because the origin is shared", () => {
    expect(TOUR_SEEN_KEY).toBe("sentryone:tour-seen");
  });

  test("a browser that refuses storage is greeted every time", () => {
    /* The failure worth having. A private window forgets, and the choice is
       between repeating an invitation and leaving a judge in front of an
       unexplained table of pesos. Neither read nor write may throw. */
    storageThat(null);

    expect(openTourOnFirstVisit()).toBe(true);

    closeTour();

    expect(openTourOnFirstVisit()).toBe(true);
  });
});

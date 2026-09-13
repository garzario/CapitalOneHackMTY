/**
 * The recorrido is the one screen of this app that is mostly prose, so the tests
 * over it are about the prose and about the four ways prose goes wrong here.
 *
 * **There can be too much of it.** The first version was three dense paragraphs
 * and two bullets per stop, which is a wall of text in front of the product the
 * tour is supposed to be pointing at. A stop is a title and at most two short
 * sentences now, and the word count is a test rather than an intention.
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
 * **It can say something this product may not say.** ADR-0009 forbids the word
 * "seguro", a percentage and a probability on any screen, and this file is nine
 * screens of copy that no dictionary test covers, because `labels.test.ts` reads
 * `labels.ts`. So `forbiddenVerdict`, the same function the assistant's frames go
 * through, is run over every string the card can render.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { forbiddenVerdict } from "./assistant";
import { formatDecimal } from "./format";
import { mockRun } from "./mock";
import { parsePath, queryOf } from "./router";
import {
  DEFAULT_REVERT_MS,
  heroOf,
  linksOf,
  mockTourConfig,
  TOUR_STEP_COUNT,
  TOUR_TARGETS,
  tourSteps,
} from "./tour";

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
    { where: `${step.id}.eyebrow`, text: step.eyebrow },
    { where: `${step.id}.title`, text: step.title },
    ...step.body.map((text, index) => ({
      where: `${step.id}.body[${index}]`,
      text,
    })),
  ]);
}

/** How long a stop may be, in the unit a person reads in. */
const WORD_LIMIT = 28;

/**
 * The one stop that may say more, and the reason it may.
 *
 * The opening sets the hour, the person, the two losses and where the product
 * lives, and none of that is on the screen behind it yet. Every other stop is a
 * caption over something the visitor is already looking at.
 */
const SCENE_WORD_LIMIT = 45;

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

  test("every step has an eyebrow, a title and something to say", () => {
    for (const step of steps) {
      expect([step.id, step.eyebrow.length > 2]).toEqual([step.id, true]);
      expect([step.id, step.title.length > 6]).toEqual([step.id, true]);
      /* One to three lines. The floor is one because the last stop is a
         sentence over a form, and the ceiling is three because that is the
         opening, which is the only stop whose screen is not the explanation. */
      const inRange = step.body.length >= 1 && step.body.length <= 3;

      expect([step.id, inRange]).toEqual([step.id, true]);
    }
  });

  test("a stop says under twenty-eight words, and the opening under forty-five", () => {
    /* The rule this file was rewritten to: a tour that has to be read instead
       of walked is a tour a visitor abandons on stop three, and the screen
       underneath is what the stop is about. The count is over the body, because
       the title is the one line that is allowed to be a label. */
    const overrun = steps
      .map((step) => ({
        id: step.id,
        count: wordsIn(step.body.join(" ")),
        limit: step.id === "why" ? SCENE_WORD_LIMIT : WORD_LIMIT,
      }))
      .filter((step) => step.count >= step.limit)
      .map((step) => `${step.id}: ${step.count} words`);

    expect(overrun).toEqual([]);
  });

  test("the last stop is one sentence over the form and says it once", () => {
    /* It used to say what the call is in the step body and again in the card
       underneath, which is how the telephone field ended up below the fold of
       its own corner. The card carries the field, the box and the button, and
       this is the only place the sentence lives. */
    const call = steps.at(-1);

    expect(call?.body).toHaveLength(1);
    expect(call?.body.join(" ")).toContain("Contesta con tu voz");
  });

  test("the first stop is the problem and the last one is the call", () => {
    /* The order is the argument: nobody understands the run before they know
       what the two losses are, and nobody wants the telephone call before they
       have seen what it is about. */
    expect(steps[0]?.id).toBe("why");
    expect(steps[0]?.route).toBeUndefined();
    expect(steps.at(-1)?.kind).toBe("call");
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
    expect(lines.length).toBeGreaterThan(30);
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
       payment, which is what ADR-0009 forbids and what the two loss figures in
       the first stop are written as "de cada 100 pesos" to avoid. */
    const offenders = lines
      .filter(
        (line) =>
          line.text.includes("%") ||
          /\b(porcentaje|puntaje|score|probabilidad)\b/i.test(line.text),
      )
      .map((line) => line.where);

    expect(offenders).toEqual([]);
  });

  test("the copy is written in the same ASCII Spanish as the rest of the app", () => {
    /* `labels.ts` writes "Metricas" and "Exposicion" without accents and every
       screen follows it, so a paragraph with an accent in it would be the one
       place in the interface that is typeset differently. */
    const offenders = lines
      .filter((line) => /[^\x20-\x7E]/.test(line.text))
      .map((line) => line.where);

    expect(offenders).toEqual([]);
  });

  test("the first stop carries both losses, in two clauses instead of two paragraphs", () => {
    const why = steps[0]?.body.join(" ") ?? "";

    /* The two losses are the argument of the whole product and they are both
       irreversible, so neither may be dropped in the name of saying less: the
       transfer that does not come back, and the deduction that goes with a SAT
       publication. The cited rates that used to be here are in
       `docs/04-market.md` and `docs/05-business-model.md`, where a judge can
       check them, rather than in the first paragraph of a tour card. */
    expect(why).toContain("no regresan");
    expect(why).toContain("SAT");
    expect(why).toContain("deduccion");
  });

  test("the peso figure of the first stop is the line the tour is about", () => {
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

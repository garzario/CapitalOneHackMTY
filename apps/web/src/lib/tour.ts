/**
 * The recorrido: nine stops that explain this product to somebody who arrived
 * with no context at all.
 *
 * It exists because the app opens on a dense financial table. A judge who walks
 * up to the stand while nobody is presenting sees ninety-two rows of pesos and
 * has no way to know which of them is the product. The demo script in
 * `docs/10-demo-script.md` is the answer when a person is talking; this is the
 * answer when nobody is.
 *
 * Three rules hold the copy in this file.
 *
 * **A stop is a title and at most two short sentences.** Under twenty-eight words
 * of body, no bullet list and nothing to look at underneath, and `lib/tour.test.ts`
 * counts the words. The first version of this file was three dense paragraphs and
 * two bullets per stop, nine times over: a wall of prose in front of the product,
 * which is the opposite of what a tour over the running screens is for. The
 * screen underneath is the explanation and the card is the caption on it, so when
 * a sentence and the screen say the same thing, the sentence goes.
 *
 * **Every number in it is this repository's.** The ninety-two transfers and the
 * peso figure come from the seeded company of `packages/seed`
 * (`docs/02-persona.md`). Nothing here is rounded up to sound better, and nothing
 * here is a probability: ADR-0009 forbids one on any screen of this product and
 * `lib/tour.test.ts` reads this file for it.
 *
 * **The folios are data, not constants.** Two stops navigate to one instruction
 * each, and both ids arrive from `GET /api/v1/tour` or, with no API, from the
 * generated offline run. A folio written into this file is a tour that opens on a
 * not-found page the day the seed moves, which is the same reason
 * `brand/shoot.ts` reads its paths off the mock.
 *
 * The steps are data and the overlay that renders them is `components/Tour.tsx`.
 * The call of the last stop is `components/TourCall.tsx` and `lib/tour-call.ts`.
 */

import { type Detector, lookupPlaza } from "@hackmty/core";
import type {
  PaymentRun,
  PaymentRunItem,
  TourConfig,
  TourHero,
} from "./contract";
import { formatDecimal } from "./format";
import { LISTED_SUPPLIER_RFC, mockRun, VERIFICATIONS } from "./mock";
import { instructionPath, PATHS, verifyAccountPath } from "./router";

/**
 * The hooks a step can point the spotlight at.
 *
 * They are `data-tour` attributes on the real elements of the real screens, which
 * is the whole mechanism: the tour does not draw a copy of the run, it dims the
 * run and cuts a hole over the thing it is talking about. The names are here so a
 * screen and a step cannot disagree about one, and `lib/tour.test.ts` fails when a
 * name in this map is not on any element in `src/`.
 *
 * Three of them are hooks rather than current targets -- the first row of the run,
 * the carta button and the exposure figures -- because the step that talks about
 * each one spotlights something else and names it in words instead. They are
 * attributes for the same reason the run's rows are focusable: the thing the copy
 * points at has to be findable, by the next step somebody adds and by the capture
 * script, without hunting for a class name that belongs to the design system.
 */
export const TOUR_TARGETS = {
  /** The dark card of the payment run: the pesos that are not leaving. */
  runHero: "run-hero",
  /** The worst line of the run, which is the first row of the table. */
  runFirstRow: "run-first-row",
  /** The assistant drawer, once the step has opened it. */
  assistantPanel: "assistant-panel",
  /** The findings of one instruction, with the evidence under each one. */
  instructionFindings: "instruction-findings",
  /** The one-page evidence letter, which the server writes from the ledger. */
  instructionCarta: "instruction-carta",
  /** The holder Banxico reports against the name on the invoice. */
  cepNames: "cep-names",
  /** The button that publishes a simulated list and replays the ledger. */
  satSimulate: "sat-simulate",
  /** Base, ISR and IVA: what a publication costs over what was already paid. */
  satExposure: "sat-exposure",
  /** The button that sends the run, which is the only one that moves money. */
  paymentsSend: "payments-send",
  /** Which of the two people of the company is acting. */
  entryPerson: "entry-person",
} as const;

export type TourTarget = (typeof TOUR_TARGETS)[keyof typeof TOUR_TARGETS];

export type TourStep = {
  /** Stable id, for a key and for a test. */
  id: string;
  /** Two or three words above the title: what kind of stop this is. */
  eyebrow: string;
  title: string;
  /** The whole of what the stop says: two short sentences, one per entry. */
  body: readonly string[];
  /** Where the app goes when this step opens. Absent leaves it where it is. */
  route?: string;
  /** The element the spotlight cuts to, when this step has one. */
  target?: TourTarget;
  /** Opens the assistant drawer, for the stop that is about the drawer. */
  opensAssistant?: boolean;
  /** The last stop renders the call instead of a body of its own. */
  kind?: "call";
};

/** What the steps need from the data to point anywhere. */
export type TourLinks = {
  heroInstructionId: string;
  /**
   * What that line is worth, because the first stop says it in prose.
   *
   * Data for the same reason the folio is: a figure typed into the copy is a
   * figure that goes stale on the next reseed, silently and in the paragraph a
   * judge reads first. It arrives from `GET /api/v1/tour` or, offline, from the
   * same hero `heroOf` derives.
   */
  heroAmount: number;
  cepInstructionId: string;
};

/**
 * The nine stops, in order.
 *
 * A function and not a constant because three things in it belong to whichever
 * run this page is reading: two folios and the amount of the line the first stop
 * is about. Everything else about a step is fixed: the copy does not change with
 * the data, so a figure on screen and a sentence in this file can never
 * contradict each other by accident.
 */
export function tourSteps(links: TourLinks): TourStep[] {
  return [
    {
      id: "why",
      eyebrow: "El problema",
      title: "Por que existe SentryOne",
      /* Three lines and the only stop with three, because it is the one that has
         to land before anything else means anything: the hour, the person, the
         two losses and where the product sits. */
      body: [
        "Es jueves, 4:00 pm. Lupita tiene 92 pagos y un WhatsApp con una CLABE nueva.",
        `Un clic y ${formatDecimal(links.heroAmount)} pesos no regresan. Y si el SAT publica al proveedor, tampoco la deduccion.`,
        "SentryOne vive en el minuto antes de enviar.",
      ],
    },
    {
      id: "run",
      eyebrow: "La corrida",
      title: "La corrida del jueves",
      body: [
        "La cifra grande no es el total de la semana: son los pesos que no salen.",
        "Cada linea trae su nivel, su estado y la razon detras.",
      ],
      route: PATHS.run,
      target: TOUR_TARGETS.runHero,
    },
    {
      id: "intake",
      eyebrow: "Como entra un pago",
      title: "La captura de WhatsApp, al chat",
      body: [
        "Asi llega un pago real: una foto. El asistente lee la cuenta y propone.",
        "Ejecuta una persona, y su nombre queda en el evento.",
      ],
      opensAssistant: true,
      target: TOUR_TARGETS.assistantPanel,
    },
    {
      id: "instruction",
      eyebrow: "El hallazgo",
      title: "La cuenta y su plaza",
      body: [
        "El control compara la cuenta que llego contra las que ya se le pagaron.",
        "Tres digitos de la cuenta dicen en que ciudad se abrio.",
      ],
      route: instructionPath(links.heroInstructionId),
      target: TOUR_TARGETS.instructionFindings,
    },
    {
      id: "cep",
      eyebrow: "La cuenta, comprobada",
      title: "El centavo y el comprobante de Banxico",
      body: [
        "Antes del dinero va un centavo, y Banxico dice de quien es la cuenta.",
        "Si el titular no es el proveedor, la linea se bloquea.",
      ],
      route: verifyAccountPath(links.cepInstructionId),
      target: TOUR_TARGETS.cepNames,
    },
    {
      id: "sat",
      eyebrow: "El riesgo fiscal",
      title: "El SAT publica",
      body: [
        "Cuando el SAT publica a un proveedor, tus deducciones sobre sus facturas se caen.",
        "El boton lo simula y recorre la bitacora para ponerlo en pesos.",
      ],
      route: PATHS.sat,
      target: TOUR_TARGETS.satSimulate,
    },
    {
      id: "payments",
      eyebrow: "La salida",
      title: "La corrida sale",
      body: [
        "Esta es la unica pantalla que mueve dinero, y pide una segunda confirmacion.",
        "Cada linea sale con su clave de rastreo, o se queda con su razon.",
      ],
      route: PATHS.payments,
      target: TOUR_TARGETS.paymentsSend,
    },
    {
      id: "who",
      eyebrow: "Quien firma",
      title: "Quien decide",
      body: [
        "Cada escritura lleva un nombre y un papel, y la bitacora los guarda.",
        "Liberar lo que no es confiable es del dueno.",
      ],
      route: PATHS.entry,
      target: TOUR_TARGETS.entryPerson,
    },
    {
      id: "call",
      eyebrow: "Tu turno",
      title: "Ahora te llamamos a ti",
      /* One sentence, and the card underneath is the field, the box and the
         button. Everything this stop used to say twice, once here and once in
         `TourCall.tsx`, is said once. */
      body: [
        "Vas a recibir la llamada que recibiria el dueno cuando hay un pago en riesgo. Contesta con tu voz: retenerlo o liberarlo.",
      ],
      route: PATHS.run,
      /* The figure and not the row. A released line leaves the slice the table is
         showing, so the row the owner decided can walk out from under the
         spotlight; the figure on the dark card is always there to move. */
      target: TOUR_TARGETS.runHero,
      kind: "call",
    },
  ];
}

/** Nine, and the card says so. Read off the list rather than typed twice. */
export const TOUR_STEP_COUNT: number = tourSteps({
  heroInstructionId: "x",
  heroAmount: 0,
  cepInstructionId: "x",
}).length;

/* ------------------------------------------------------- the line it is about */

const CLABE_FORENSICS: Detector = "clabe_forensics";

function hasClabeFinding(item: PaymentRunItem): boolean {
  return item.findings.some((finding) => finding.detector === CLABE_FORENSICS);
}

/** A string off a finding's evidence, or an empty string. Never a guess. */
function evidenceText(item: PaymentRunItem, key: string): string {
  for (const finding of item.findings) {
    if (finding.detector !== CLABE_FORENSICS) {
      continue;
    }

    const value = finding.evidence[key];

    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return "";
}

/**
 * The three digits a CLABE encodes the plaza in, as the place a person says.
 *
 * The same slice and the same table as `plazaCityOf` in
 * `apps/api/src/routes/tour.ts`, because the two have to answer one shape for
 * one field. A code the committed snapshot does not carry yields nothing, which
 * is the rule `packages/core/src/snapshot/README.md` states in its first
 * paragraph: that catalogue may put a name on three digits and nothing else.
 */
function plazaCityOf(clabe: string): string {
  const digits = clabe.replace(/\D/g, "");

  return digits.length < 6 ? "" : (lookupPlaza(digits.slice(3, 6))?.city ?? "");
}

/** Where this supplier has actually been paid, as places and never as codes. */
function usualPlazaOf(item: PaymentRunItem): string {
  const places = new Set<string>();

  for (const account of item.supplier.knownAccounts) {
    const city = plazaCityOf(account.clabe);

    if (city !== "") {
      places.add(city);
    }
  }

  return [...places].sort().join(" y ");
}

function largest(items: readonly PaymentRunItem[]): PaymentRunItem | null {
  return items.reduce<PaymentRunItem | null>(
    (worst, item) =>
      worst === null || item.instruction.amount > worst.instruction.amount
        ? item
        : worst,
    null,
  );
}

/**
 * The line the tour is about, read off a run.
 *
 * The rule is the API's rule, written here for the offline copy so the two cannot
 * disagree: the largest held amount that carries a CLABE forensics finding. The two
 * fallbacks underneath are for a run where nothing is held on that control, which
 * is a run the tour still has to be able to open: a line waiting on a verification
 * first, then the largest line carrying any finding at all.
 *
 * The two plazas are the API's shape too, and the shape is load-bearing rather
 * than cosmetic: `plazasOf` answers plain place names because the telephone call
 * says them out loud, so "580 APODACA" would be read to the owner as a code. The
 * new one comes off the finding's own evidence when the engine named it and off
 * the account's own digits when it did not; the usual one is computed from the
 * accounts this supplier has actually been paid on, and not off
 * `previousPlazaPlaces`, which only a `plaza_changed` finding carries. Reading
 * that key was one field with two shapes and two different stories: the hero of
 * the seeded run moved no plaza, so offline the sentence said there was no
 * history at all while the API's script said the account had moved.
 */
export function heroOf(run: PaymentRun): TourHero | null {
  const withClabe = run.items.filter(hasClabeFinding);
  const item =
    largest(withClabe.filter((line) => line.decision.action === "hold")) ??
    largest(withClabe.filter((line) => line.decision.action === "verify")) ??
    largest(run.items.filter((line) => line.findings.length > 0));

  if (item === null) {
    return null;
  }

  const named = evidenceText(item, "plazaCity");

  return {
    instructionId: item.instruction.id,
    supplierRfc: item.supplier.rfc,
    supplierName: item.supplier.legalName,
    amount: item.instruction.amount,
    accountLast4: item.instruction.clabe.slice(-4),
    plazaNew: named === "" ? plazaCityOf(item.instruction.clabe) : named,
    plazaUsual: usualPlazaOf(item),
  };
}

/**
 * The tour with no API behind it.
 *
 * `callsEnabled` is false and that is the honest answer rather than a limitation:
 * a browser with no server cannot ring a telephone, so the last stop prints the
 * script the agent would read and offers the two answers as a simulation that says
 * on screen that it is one.
 *
 * The CEP stop needs an instruction whose cent actually ran, and the offline run
 * carries one per state by construction, so the blocked one is read off it for the
 * same reason `brand/shoot.ts` does: it is the ending that draws the whole machine.
 */
export function mockTourConfig(): TourConfig | null {
  const run = mockRun();
  const hero = heroOf(run);

  if (hero === null) {
    return null;
  }

  const blocked = Object.values(VERIFICATIONS).find(
    (verification) => verification.state === "blocked",
  );

  return {
    callsEnabled: false,
    hero,
    listedSupplierRfc: LISTED_SUPPLIER_RFC,
    cepInstructionId: blocked?.instructionId ?? hero.instructionId,
    revertAfterMs: DEFAULT_REVERT_MS,
  };
}

/**
 * What the contract calls `revertAfterMs` when nobody configured it: ten minutes.
 *
 * It is here as well as on the payload because the offline config has to answer it
 * too, and because the sentence the card prints is computed from the number rather
 * than written out in words. A tour that says ten minutes over a server configured
 * for two is a tour that lies about the one promise it makes.
 */
export const DEFAULT_REVERT_MS = 600_000;

/** The links the steps need, out of a config. */
export function linksOf(config: TourConfig): TourLinks {
  return {
    heroInstructionId: config.hero.instructionId,
    heroAmount: config.hero.amount,
    cepInstructionId: config.cepInstructionId,
  };
}

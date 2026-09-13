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
 * **It explains rather than labels.** Every stop says what the screen underneath
 * is for, in the words a person who has never seen a CFDI would use, and the one
 * piece of jargon each step needs is explained inside the sentence that uses it.
 * A tour that reads like a menu is a tour nobody finishes.
 *
 * **Every number in it is this repository's.** The ninety-two transfers and the
 * peso figure come from the seeded company of `packages/seed`
 * (`docs/02-persona.md`), the twenty-four pesos returned out of a hundred claimed
 * come from the El Universal report cited in `docs/04-market.md`, and the
 * forty-six out of a hundred that reverse as ISR and IVA come from
 * `docs/05-business-model.md`. Nothing here is rounded up to sound better, and
 * nothing here is a probability: ADR-0009 forbids one on any screen of this
 * product and `lib/tour.test.ts` reads this file for it.
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

import type { Detector } from "@hackmty/core";
import type {
  PaymentRun,
  PaymentRunItem,
  TourConfig,
  TourHero,
} from "./contract";
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
  /** The explanation, one paragraph per entry. */
  body: readonly string[];
  /** What to look at on the screen underneath. Two lines at most. */
  look?: readonly string[];
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
  cepInstructionId: string;
};

/**
 * The nine stops, in order.
 *
 * A function and not a constant because two of them carry a folio, and the folio
 * belongs to whichever run this page is reading. Everything else about a step is
 * fixed: the copy does not change with the data, so a figure on screen and a
 * sentence in this file can never contradict each other by accident.
 */
export function tourSteps(links: TourLinks): TourStep[] {
  return [
    {
      id: "why",
      eyebrow: "El problema",
      title: "Por que existe SentryOne",
      body: [
        "Es jueves. Lupita Elizondo es la unica persona de administracion de un taller de veintiocho empleados en Apodaca, y arriba de ella no hay tesoreria. Tiene 92 transferencias que mandar antes del corte.",
        "Entre ellas llega una foto de WhatsApp con una cuenta nueva, y con ella 537,960.97 pesos que se irian a un numero que nadie comparo con el de siempre.",
        "Hay dos perdidas y ninguna se deshace. La transferencia que ya salio no regresa: de cada 100 pesos reclamados por fraude, los bancos devolvieron 24 en el primer trimestre de 2026. Y si el SAT publica al proveedor como facturador de operaciones inexistentes, las facturas que ya pagaste dejan de ser deducibles y ese impuesto se cobra de vuelta: de cada 100 pesos de subtotal que el SAT desconoce, 46 regresan como ISR e IVA.",
        "SentryOne vive en el minuto entre aprobar un pago y enviarlo. Lee las facturas que la empresa ya tiene, mira la cuenta destino y las dos listas del SAT, y dice cual retener, cual verificar y cual liberar. La decision la firma una persona, siempre.",
      ],
      look: [
        "Ninguna de las dos perdidas se arregla despues: las dos se evitan antes de mandar",
        "Nada de esto necesita que alguien te defraude, basta una publicacion del SAT",
      ],
    },
    {
      id: "run",
      eyebrow: "La corrida",
      title: "La corrida del jueves",
      body: [
        "Esta es la pantalla con la que abre el jueves. La cifra grande de la tarjeta oscura no es el total de la semana: son los pesos que no van a salir todavia.",
        "Cada linea trae su nivel, que es que tan bien sostienen los documentos a ese pago: confiable, precaucion o alerta. Trae su estado, que es donde esta el dinero: pendiente, en rojo, cancelado, liberado o enviado. Y trae debajo la razon, porque un pago detenido se explica.",
        "La tabla abre en las excepciones y no en las 92 lineas, ordenadas por los pesos en riesgo de cada una. Tres palabras y nunca un numero: el producto no califica a nadie, muestra la evidencia.",
      ],
      look: [
        "La cifra de la tarjeta oscura: lo que este jueves no sale",
        "El nivel y el estado de cada linea, con el hallazgo que los sostiene",
      ],
      route: PATHS.run,
      target: TOUR_TARGETS.runHero,
    },
    {
      id: "intake",
      eyebrow: "Como entra un pago",
      title: "La captura de WhatsApp, al chat",
      body: [
        "Asi llega un pago en la vida real: una foto. Se arrastra al chat del asistente y el asistente lee la cuenta que trae escrita la imagen.",
        "Ese es el unico modelo de lenguaje del producto y solo transcribe. Las herramientas que tiene son de lectura, y cada turno termina en una propuesta que imprime el metodo, la ruta y el cuerpo exacto de la peticion que se haria, con un boton.",
        "El asistente lee y propone. Ejecuta una persona, y su nombre queda en el evento. Nada se manda al llegar, ni por un temporizador, ni al pasar el cursor.",
      ],
      look: [
        "Las tarjetas de lectura arriba de la respuesta: con que datos se armo",
        "La propuesta no se manda sola, y el boton lleva tu nombre",
      ],
      opensAssistant: true,
      target: TOUR_TARGETS.assistantPanel,
    },
    {
      id: "instruction",
      eyebrow: "El hallazgo",
      title: "La cuenta y su plaza",
      body: [
        "Esta es la instruccion completa con el hallazgo que la detuvo. El control compara la cuenta que llego contra las cuentas que esta empresa ya le pago a este proveedor, y dice exactamente que cambio y en cuantos digitos.",
        "Dentro de la cuenta viajan tres digitos que son la plaza: la ciudad donde se abrio. Una cuenta del mismo banco abierta en otra ciudad no prueba nada por si sola, y por eso la pantalla la pone junto al domicilio de la factura en vez de decidir en tu lugar.",
        "Con eso se arma la carta de una pagina: lo que se reviso, lo que se encontro, el nivel, la decision y quien la firmo. Es lo que se le manda al proveedor que pregunta por su pago, y lo que se lleva el contador.",
      ],
      look: [
        "Los digitos que el hallazgo marca, y la plaza debajo",
        "El boton de la carta: la emite el servidor desde la bitacora",
      ],
      route: instructionPath(links.heroInstructionId),
      target: TOUR_TARGETS.instructionFindings,
    },
    {
      id: "cep",
      eyebrow: "La cuenta, comprobada",
      title: "El centavo y el comprobante de Banxico",
      body: [
        "Mexico no tiene una consulta que diga de quien es una cuenta. El unico documento que lo dice lo firma el banco central, y lo emite por cada transferencia que ocurre.",
        "Asi que antes del dinero viaja un centavo. Del riel regresa una clave de rastreo, y con esa clave se pide el comprobante: ahi viene el nombre del titular de la cuenta que recibio.",
        "Si el titular es el proveedor, el pago sigue su camino. Si es otra empresa, la linea queda bloqueada y el importe completo no sale. El centavo viaja dentro de la corrida, no en una prueba aparte.",
      ],
      look: [
        "El nombre del titular contra el nombre de la factura",
        "El sello dice no verificado cuando falta el certificado de Banxico, y nunca invalido",
      ],
      route: verifyAccountPath(links.cepInstructionId),
      target: TOUR_TARGETS.cepNames,
    },
    {
      id: "sat",
      eyebrow: "El riesgo fiscal",
      title: "El SAT publica",
      body: [
        "El articulo 69-B es una lista que publica el SAT: contribuyentes a los que no les encontro con que respaldar lo que facturaron. Cuando uno aparece, las deducciones que ya tomaste sobre sus facturas se anulan hacia atras y hay treinta dias para responder.",
        "Desde enero el articulo 49 Bis arranca ese mismo reloj contra el comprador. Esa segunda lista el SAT la publica un oficio a la vez y sin archivo que se pueda leer, asi que la pantalla dice que no la pudo consultar en lugar de inventar una respuesta.",
        "El boton publica una version simulada sobre proveedores sinteticos y vuelve a recorrer la bitacora desde su primer evento, para poner en pesos lo que ya se pago y se dedujo. Mientras ves esta pantalla, una linea de la corrida se cancela sola.",
      ],
      look: [
        "La exposicion en pesos: base deducida, ISR e IVA",
        "La caja de consulta queda libre: la lista oficial es real y la puedes teclear",
      ],
      route: PATHS.sat,
      target: TOUR_TARGETS.satSimulate,
    },
    {
      id: "payments",
      eyebrow: "La salida",
      title: "La corrida sale",
      body: [
        "Hasta aqui no ha salido un peso. Esta es la pantalla donde sale, y es la unica del producto que mueve dinero.",
        "El boton pide una segunda confirmacion y el nombre de quien manda la corrida. Despues las lineas se van de una en una: 86 con su clave de rastreo y su recibo, y las detenidas se quedan fuera con su razon escrita, porque un pago que desaparece en silencio es un pago que alguien cree que hizo.",
        "No custodiamos fondos: la orden se da al participante de la propia empresa. La constancia de la corrida la emite el servidor con una huella del rango de eventos que hay detras.",
      ],
      look: [
        "Las lineas que salen y las que no, cada una con su razon",
        "El recibo trae cuatro digitos de la cuenta, nunca los dieciocho",
      ],
      route: PATHS.payments,
      target: TOUR_TARGETS.paymentsSend,
    },
    {
      id: "who",
      eyebrow: "Quien firma",
      title: "Quien decide",
      body: [
        "Cada escritura de este producto lleva un papel y un nombre, y la bitacora los guarda. Aqui se elige quien esta usando SentryOne.",
        "Cambiar de persona cambia lo que la pantalla ofrece: liberar una linea que no es confiable, o tocar una que la corrida cancelo, son dos cosas del dueno. La funcion que contesta eso vive en el motor y es la misma que la API aplica, asi que la pantalla no puede ofrecer un boton que el servidor rechazaria.",
        "No es autenticacion, y la pantalla lo dice donde se lee: no hay contrasena ni sesion. La inteligencia artificial lee y propone; retener, verificar o liberar lo firma una persona.",
      ],
      look: [
        "El encabezado que viaja en cada escritura, tal cual",
        "Las filas que esta persona no puede hacer, con la regla que lo decide",
      ],
      route: PATHS.entry,
      target: TOUR_TARGETS.entryPerson,
    },
    {
      id: "call",
      eyebrow: "Tu turno",
      title: "Ahora te llamamos a ti",
      /* Two paragraphs and not three, and the missing one is deliberate: the
         call block underneath says what the visitor is about to hear, in its
         own words, and a card that said it twice pushed the telephone field
         below the fold of its own corner. */
      body: [
        "Falta la parte que no cabe en una pantalla. Cuando un pago grande queda detenido, el dueno de la empresa no abre un tablero: contesta el telefono.",
        "Lo que contestes se aplica sobre esta linea a nombre del dueno y queda en la bitacora, con la frase de la que se leyo. Despues se revierte solo.",
      ],
      look: [
        "La cifra de la tarjeta oscura se mueve mientras hablas",
        "Ninguna llamada libera un pago sola: la decision lleva nombre",
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

  const plazaCity = evidenceText(item, "plazaCity");
  const plazaCode = evidenceText(item, "plazaCode");

  return {
    instructionId: item.instruction.id,
    supplierRfc: item.supplier.rfc,
    supplierName: item.supplier.legalName,
    amount: item.instruction.amount,
    accountLast4: item.instruction.clabe.slice(-4),
    plazaNew:
      plazaCity === ""
        ? ""
        : plazaCode === ""
          ? plazaCity
          : `${plazaCode} ${plazaCity}`,
    plazaUsual: evidenceText(item, "previousPlazaPlaces"),
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
    cepInstructionId: config.cepInstructionId,
  };
}

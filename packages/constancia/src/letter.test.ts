/**
 * The evidence letter, asserted on the four promises its file comment makes: one
 * page, no silent control, no number about the risk, and the article named when a
 * definitive listing cancelled the line.
 *
 * The assertions read the rendered bytes as latin1 and look for the text operator,
 * the same way `document.test.ts` does, because that is what a person opening the
 * PDF sees and a test over the input object would prove nothing about the page.
 */

import { describe, expect, it } from "bun:test";
import type {
  Decision,
  Finding,
  LedgerEvent,
  PaymentInstruction,
  SatListEntry,
  Supplier,
} from "@hackmty/core";
import { assessLine } from "@hackmty/core";
import { constanciaFilename } from "./document";
import { type EvidenceLetterInput, evidenceLetter } from "./letter";

const ISSUED_AT = "2026-09-12T15:00:00.000Z";
const RFC = "SYN080910HI8";

const COMPANY = {
  rfc: "SYN090615C01",
  legalName: "Distribuidora Sintetica del Norte SA de CV",
};

const LEDGER: LedgerEvent[] = [
  {
    type: "instruction_received",
    at: "2026-09-08T15:00:00.000Z",
    instruction: instruction(),
  },
];

function instruction(
  overrides: Partial<PaymentInstruction> = {},
): PaymentInstruction {
  return {
    id: "INS-2026-09-07-047",
    supplierRfc: RFC,
    cfdiUuids: ["11111111-2222-3333-4444-555555555555"],
    clabe: "012180101391764613",
    amount: 318_420.55,
    source: "whatsapp",
    receivedAt: "2026-09-08T15:00:00.000Z",
    synthetic: true,
    ...overrides,
  };
}

function supplier(): Supplier {
  return {
    rfc: RFC,
    legalName: "Fundiciones Sinteticas de Apodaca SA de CV",
    knownAccounts: [],
    firstInvoiceAt: "2024-01-01T15:00:00.000Z",
    synthetic: true,
  };
}

/** A definitive 69-B finding in the shape `sat69bAdapter` writes it. */
function definitiveFinding(): Finding {
  return {
    id: `sat69b:${RFC}:2026-09-12:definitivo`,
    detector: "sat_69b",
    severity: "critical",
    state: "comprobable",
    subject: { kind: "supplier", id: RFC },
    amountAtRisk: 318_420.55,
    explanation: `El RFC ${RFC} esta en la lista definitiva del articulo 69-B desde el 2026-09-12: sus comprobantes no tienen efecto fiscal, de forma retroactiva.`,
    evidence: {
      rfc: RFC,
      status: "definitivo",
      listVersion: "2026-09-12",
      publishedAt: "2026-09-12",
      listedNow: true,
    },
    createdAt: ISSUED_AT,
  };
}

function satEntry(): SatListEntry {
  return {
    rfc: RFC,
    name: supplier().legalName,
    status: "definitivo",
    publishedAt: "2026-09-12",
    listVersion: "2026-09-12",
  };
}

/** What the engine proposes on a line nobody has signed yet. */
function enginePropose(): Decision {
  return {
    instructionId: instruction().id,
    action: "hold",
    expectedLoss: 95_526.17,
    delayCostPerDay: 412.9,
    findings: [definitiveFinding()],
    decidedAt: ISSUED_AT,
  };
}

function letterInput(
  overrides: Partial<EvidenceLetterInput> = {},
): EvidenceLetterInput {
  const findings = overrides.findings ?? [definitiveFinding()];
  const decision =
    "decision" in overrides ? overrides.decision : enginePropose();
  const assessed = assessLine({ findings, decision });

  return {
    company: COMPANY,
    issuedAt: ISSUED_AT,
    ledger: LEDGER,
    synthetic: true,
    instruction: instruction(),
    supplier: supplier(),
    findings,
    ...(decision === undefined ? {} : { decision }),
    confidence: assessed.confidence,
    state: assessed.state.state,
    sat69b: [satEntry()],
    sat49Bis: {
      answered: false,
      detail:
        "El SAT publica las resoluciones del articulo 49 Bis oficio por oficio en el DOF y no entrega un listado descargable.",
    },
    account: {
      bank: "BBVA Mexico",
      plazaCode: "180",
      last4: "4613",
      knownAccounts: 2,
      known: false,
    },
    documents: { image: true, audio: false, text: false },
    ...overrides,
  };
}

function text(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

function pageCount(bytes: Uint8Array): number {
  return Number(/\/Type \/Pages \/Count (\d+)/.exec(text(bytes))?.[1]);
}

/**
 * Only what is drawn on the page, with the PDF scaffolding dropped.
 *
 * The file header is `%PDF-1.4`, so a test that searched the whole document for a
 * percent sign would fail on the format rather than on the copy. This reads the
 * text operators, which is what a person actually sees.
 */
function drawn(bytes: Uint8Array): string {
  return [...text(bytes).matchAll(/\((.*?)\) Tj/g)]
    .map((match) => match[1])
    .join(" ");
}

describe("evidenceLetter", () => {
  it("fits on one page, which is the whole point of the document", () => {
    expect(pageCount(evidenceLetter(letterInput()))).toBe(1);
  });

  it("stays on one page with every signal answered and three findings", () => {
    const long = letterInput({
      findings: [
        definitiveFinding(),
        {
          ...definitiveFinding(),
          id: "clabe-1",
          detector: "clabe_forensics",
          severity: "warning",
          state: "requiere_verificacion",
          explanation:
            "La cuenta de esta instruccion cambia dos digitos respecto de la ultima que pagamos a este proveedor, y el digito verificador si existe.",
        },
        {
          ...definitiveFinding(),
          id: "dup-1",
          detector: "duplicate_invoice",
          severity: "info",
          explanation:
            "Ya hay un complemento de pago que liquida este CFDI, por el mismo importe y en la misma semana.",
        },
      ],
      decision: {
        instructionId: instruction().id,
        action: "hold",
        expectedLoss: 1000,
        delayCostPerDay: 100,
        findings: [],
        decidedAt: ISSUED_AT,
        decidedBy: "Lupita Elizondo",
        reason: "Pedi el acuse al proveedor antes de pagar.",
      },
      verification: {
        state: "blocked",
        sealState: "not_checked",
        holderName: "COMERCIALIZADORA VERTICE DEL GOLFO SA DE CV",
        nameMatch: "mismatch",
        cepAt: ISSUED_AT,
      },
      call: {
        outcome: "denied",
        at: ISSUED_AT,
        clabeLast4: "4613",
        evidence: "Esa cuenta no es nuestra.",
        manual: true,
      },
      documents: { image: true, audio: true, text: true },
    });

    expect(pageCount(evidenceLetter(long))).toBe(1);
  });

  it("names the level, the state and the rule behind the level", () => {
    const pdf = text(evidenceLetter(letterInput()));

    expect(pdf).toContain("(Nivel) Tj");
    expect(pdf).toContain("Alerta, porque el proveedor esta en una lista");
    expect(pdf).toContain("Cancelado. No sale con esta evidencia");
  });

  it("names the article that cancelled the line", () => {
    const pdf = text(evidenceLetter(letterInput()));

    expect(pdf).toContain("articulo 69-B");
    expect(pdf).toContain("Definitivo desde el 2026-09-12, version 2026-09-12");
    expect(pdf).toContain("lista definitiva del articulo 69-B");
  });

  it("says the 49 Bis listing could not be consulted, and why", () => {
    const pdf = text(evidenceLetter(letterInput()));

    expect(pdf).toContain("No se pudo cotejar");
    expect(pdf).toContain("resoluciones del articulo 49 Bis oficio");
  });

  it("says no CEP was read rather than leaving the control blank", () => {
    const pdf = text(evidenceLetter(letterInput()));

    expect(pdf).toContain("no se envio el centavo de verificacion");
    expect(pdf).toContain("no se registro ninguna llamada");
  });

  it("prints four digits of the account and never the other fourteen", () => {
    const pdf = text(evidenceLetter(letterInput()));

    expect(pdf).toContain("terminada en 4613");
    expect(pdf).not.toContain("012180101391764613");
  });

  it("never prints a probability, a percentage or the word this product bans", () => {
    const page = drawn(evidenceLetter(letterInput()));

    expect(page.toLowerCase()).not.toContain("seguro");
    expect(page).not.toContain("%");
    /* The expected loss and the cost of a day of delay are on the decision this
       page is about, and neither reaches it: they are the engine's arithmetic and
       a figure next to a supplier's name is a precision nobody earned. */
    expect(page).not.toContain("95,526.17");
    expect(page).not.toContain("412.90");
    expect(page).toContain("No es una probabilidad ni una calificacion");
  });

  it("carries the synthetic band, because these figures are generated", () => {
    expect(text(evidenceLetter(letterInput()))).toContain("DATOS SINTETICOS");
  });

  it("drops the band for a real company", () => {
    const real = evidenceLetter(letterInput({ synthetic: false }));

    expect(text(real)).not.toContain("DATOS SINTETICOS");
  });

  it("prints the huella and calls it a huella, never a firma", () => {
    const pdf = text(evidenceLetter(letterInput()));

    expect(pdf).toContain("Huella \\(sha256\\)");
    expect(pdf).toContain("no es una firma electronica");
  });

  it("names who signed and the reason they wrote", () => {
    const pdf = text(
      evidenceLetter(
        letterInput({
          decision: {
            instructionId: instruction().id,
            action: "release",
            expectedLoss: 0,
            delayCostPerDay: 0,
            findings: [],
            decidedAt: ISSUED_AT,
            decidedBy: "Mariana Trevino",
            reason: "El proveedor impugno la resolucion y entrego el acuse.",
          },
        }),
      ),
    );

    expect(pdf).toContain("Mariana Trevino");
    expect(pdf).toContain("impugno la resolucion");
    expect(pdf).toContain("Liberar el pago");
  });

  it("says nobody has resolved it when nothing has", () => {
    const pdf = text(
      evidenceLetter(letterInput({ decision: undefined, findings: [] })),
    );

    expect(pdf).toContain("Nadie ha resuelto este pago todavia");
    expect(pdf).toContain("ninguno encontro algo que reportar");
  });

  it("produces the same bytes twice, which is what the huella rests on", () => {
    expect(evidenceLetter(letterInput())).toEqual(
      evidenceLetter(letterInput()),
    );
  });

  it("names the file so a browser saves something findable", () => {
    expect(constanciaFilename("carta", "INS-2026-09-07-047")).toBe(
      "carta-INS-2026-09-07-047.pdf",
    );
  });
});

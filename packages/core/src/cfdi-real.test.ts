/**
 * The parser, run against every real document we were given.
 *
 * `fixtures/real/` holds redacted copies of documents a PAC actually stamped,
 * produced by `scripts/import-real-cfdi.ts`. They are the answer to the one
 * question a judge always asks about a parser written in a hackathon: yes, it has
 * seen a real CFDI, and here are the files. Three received invoices were imported
 * on 2026-09-12, from three different issuers and stamped by two different PACs,
 * and they are deliberately unlike each other: one carries no serie and no folio
 * and is written with CRLF line endings, one carries both and is written on a
 * single line with no indentation at all, and one withholds IVA and ISR and opens
 * with a byte order mark.
 *
 * Three properties this suite has to keep.
 *
 * 1. **The documents are named.** An empty folder used to skip with a message,
 *    which was right while nothing had been imported and is wrong now: a deleted
 *    fixture would turn the suite green by skipping everything it was written to
 *    check. The three imported documents are listed below and their absence is a
 *    failure.
 * 2. **It re-checks the redaction.** The importer already refuses to write a file
 *    that leaks, but the file is what gets committed, so the guarantee is asserted
 *    here too, over the bytes in the repository: every RFC is synthetic and no
 *    stamp or certificate is long enough to be a real one.
 * 3. **It proves the happy path was the path taken.** Reading a real document is
 *    only evidence if the parser read it the way it reads a document in
 *    production. Every tolerance in `cfdi.ts` that could have carried a fixture
 *    past a missing value is asserted to have been unnecessary, so none of these
 *    three passes on a fallback.
 */

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  attribute,
  CFDI_NAMESPACE,
  childNamed,
  childrenNamed,
  parseCfdi,
  parsePaymentComplement,
  parseSatAmount,
  parseXml,
  TFD_NAMESPACE,
  type XmlElement,
} from "./cfdi";
import type { Cfdi } from "./domain";
import { SYNTHETIC_PARSE_OPTIONS } from "./fixtures";
import { toCents } from "./money";

const DIRECTORY = fileURLToPath(new URL("./fixtures/real/", import.meta.url));
const SUFFIX = ".redacted.xml";
const SYNTHETIC_RFC_PREFIX = "SYN";
/** A real sello is 344 base64 characters. Anything this short is a placeholder. */
const MAX_STAMP_LENGTH = 64;
const STAMP_ATTRIBUTES = ["Sello", "SelloCFD", "SelloSAT", "Certificado"];
/** The notice `scripts/import-real-cfdi.ts` writes above the comprobante. */
const REDACTION_NOTICE = "Redacted copy of a real CFDI 4.0";
/**
 * Every constructed legal name carries this word. An RFC is the identifier a
 * detector reads, but a legal name is what a judge reads off a screenshot, so it
 * is checked here too and not only inside the importer.
 */
const SYNTHETIC_NAME_MARKER = "DEMO";

/**
 * The documents imported on 2026-09-12 for issue #68. Named rather than counted,
 * so that adding a fourth is free and losing one of these three is a failure.
 */
const IMPORTED = ["ingreso-1", "ingreso-2", "ingreso-3"];

/** An RFC: three letters for a company, four for a person, a date, a homoclave. */
const RFC_PATTERN = /^[A-Z&Ñ]{3,4}\d{6}[A-Z\d]{3}$/;
/** The parser uppercases a UUID, so the record is compared against upper hex. */
const UUID_PATTERN =
  /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
/** How far the arithmetic of an issuing PAC is allowed to be off, in cents. */
const ROUNDING_TOLERANCE_CENTS = 1;
/** IVA is tax code 002 in the SAT catalogue. IEPS is 003 and is not IVA. */
const IVA_TAX_CODE = "002";

function listRealFixtures(): string[] {
  try {
    return readdirSync(DIRECTORY)
      .filter((entry) => entry.endsWith(SUFFIX))
      .sort();
  } catch {
    return [];
  }
}

function everyElement(root: XmlElement): XmlElement[] {
  return [root, ...root.children.flatMap(everyElement)];
}

function rootOf(source: string): XmlElement {
  const document = parseXml(source);
  if (!document.ok) {
    throw new Error(`the document did not parse: ${document.error.code}`);
  }
  return document.value;
}

function invoiceOf(source: string): Cfdi {
  const parsed = parseCfdi(source, SYNTHETIC_PARSE_OPTIONS);
  if (!parsed.ok) {
    throw new Error(`the invoice did not parse: ${parsed.error.code}`);
  }
  return parsed.value;
}

/** `TipoDeComprobante`, or undefined when it is not a kind this parser reads. */
function kindOf(source: string): "I" | "P" | undefined {
  const document = parseXml(source);
  if (!document.ok) {
    return undefined;
  }
  const kind = attribute(document.value, "TipoDeComprobante");
  return kind === "I" || kind === "P" ? kind : undefined;
}

/**
 * A SAT amount, or zero when the attribute is absent.
 *
 * Zero is the right reading for the three this is used on. `Descuento`,
 * `TotalImpuestosTrasladados` and `TotalImpuestosRetenidos` are all omitted
 * rather than written as 0.00 by a document that has none of them.
 */
function amountOf(element: XmlElement | undefined, name: string): number {
  return parseSatAmount(attribute(element, name)) ?? 0;
}

/** Document level `cfdi:Impuestos`, never the per concept block of the same name. */
function documentTaxes(root: XmlElement): XmlElement | undefined {
  return childNamed(root, "Impuestos", CFDI_NAMESPACE);
}

function transferredLines(root: XmlElement): XmlElement[] {
  const traslados = childNamed(
    documentTaxes(root),
    "Traslados",
    CFDI_NAMESPACE,
  );
  return traslados === undefined
    ? []
    : childrenNamed(traslados, "Traslado", CFDI_NAMESPACE);
}

const fixtures = listRealFixtures();

describe("redacted real CFDI fixtures", () => {
  it("still holds the three documents imported on 2026-09-12", () => {
    for (const name of IMPORTED) {
      expect(fixtures).toContain(`${name}${SUFFIX}`);
    }
  });

  for (const fixture of fixtures) {
    describe(fixture, () => {
      const source = readFileSync(`${DIRECTORY}${fixture}`, "utf8");
      const kind = kindOf(source);

      it("is a stamped comprobante of a kind the parser reads", () => {
        expect(kind).toBeDefined();
      });

      if (kind === "I") {
        it("parses as an invoice, watermarked as generated data", () => {
          const invoice = invoiceOf(source);
          expect(invoice.synthetic).toBe(true);
          expect(invoice.subtotal).toBeGreaterThan(0);
          expect(invoice.total).toBeGreaterThan(0);
          // The document's own value is the receiver, so the comparison stays
          // typed against the union the record narrows `MetodoPago` to.
          expect(attribute(rootOf(source), "MetodoPago")).toBe(
            invoice.paymentMethod,
          );
        });

        it("adds up: Total is SubTotal less the discount, plus the transferred taxes, less the withheld ones", () => {
          const root = rootOf(source);
          const invoice = invoiceOf(source);
          const taxes = documentTaxes(root);
          const expected =
            toCents(invoice.subtotal) -
            toCents(amountOf(root, "Descuento")) +
            toCents(amountOf(taxes, "TotalImpuestosTrasladados")) -
            toCents(amountOf(taxes, "TotalImpuestosRetenidos"));
          expect(
            Math.abs(toCents(invoice.total) - expected),
          ).toBeLessThanOrEqual(ROUNDING_TOLERANCE_CENTS);
        });

        it("reads the IVA the document transferred, and not the total of every transferred tax", () => {
          const root = rootOf(source);
          const invoice = invoiceOf(source);
          const lines = transferredLines(root);
          const iva = lines
            .filter((line) => attribute(line, "Impuesto") === IVA_TAX_CODE)
            .reduce(
              (total, line) => total + toCents(amountOf(line, "Importe")),
              0,
            );
          expect(toCents(invoice.iva)).toBe(iva);
          // On a document whose only transferred tax is IVA the sum and the
          // document's own total agree, and that is the figure a reader checks by
          // eye against the committed file. A future fixture carrying IEPS would
          // skip this half rather than fail it, because there the two differ by
          // design and that difference is the reason `sumTransferredIva` exists.
          if (
            lines.every((line) => attribute(line, "Impuesto") === IVA_TAX_CODE)
          ) {
            expect(toCents(invoice.iva)).toBe(
              toCents(
                amountOf(documentTaxes(root), "TotalImpuestosTrasladados"),
              ),
            );
          }
        });

        it("carries a UUID and two RFCs shaped the way SAT writes them", () => {
          const invoice = invoiceOf(source);
          expect(invoice.uuid).toMatch(UUID_PATTERN);
          expect(invoice.issuerRfc).toMatch(RFC_PATTERN);
          expect(invoice.receiverRfc).toMatch(RFC_PATTERN);
          expect(invoice.issuerRfc.startsWith(SYNTHETIC_RFC_PREFIX)).toBe(true);
          expect(invoice.receiverRfc.startsWith(SYNTHETIC_RFC_PREFIX)).toBe(
            true,
          );
          expect(invoice.issuedAt).toBe(
            new Date(invoice.issuedAt).toISOString(),
          );
        });

        it("needed none of the parser's tolerances to be read", () => {
          const root = rootOf(source);
          const invoice = invoiceOf(source);

          // `matches` treats an element that resolved no namespace as matching
          // whichever one was asked for, which is a tolerance for XML a human
          // typed. A PAC declares every namespace it uses, so on these documents
          // every lookup went through the namespaced path.
          for (const element of everyElement(root)) {
            expect([CFDI_NAMESPACE, TFD_NAMESPACE]).toContain(
              element.namespace,
            );
          }

          // `issuerName` is `Nombre ?? ""`. An empty name would have been read as
          // a successful parse of a document naming nobody.
          expect(
            attribute(childNamed(root, "Emisor", CFDI_NAMESPACE), "Nombre"),
          ).toBeDefined();
          expect(invoice.issuerName.length).toBeGreaterThan(0);

          // `sumTransferredIva` returns zero when the document level Traslados
          // block is missing, so an IVA of zero is indistinguishable from an IVA
          // that was never found. Here the block is present and the sum is real.
          expect(transferredLines(root).length).toBeGreaterThan(0);
          expect(invoice.iva).toBeGreaterThan(0);

          // The timbre is a direct child of `cfdi:Complemento`, so the depth
          // first search in `descendantNamed` found it where the contract says it
          // lives rather than somewhere deeper.
          const complemento = childNamed(root, "Complemento", CFDI_NAMESPACE);
          expect(
            childNamed(complemento, "TimbreFiscalDigital", TFD_NAMESPACE),
          ).toBeDefined();

          // Optional attributes are read, never dropped and never invented: what
          // the document carries reaches the record, and what it omits stays
          // absent. One of these three has a serie and a folio, two have neither.
          expect(invoice.serie).toBe(attribute(root, "Serie"));
          expect(invoice.folio).toBe(attribute(root, "Folio"));
          expect(invoice.paymentForm).toBe(attribute(root, "FormaPago"));
        });
      }

      if (kind === "P") {
        it("parses as a payment complement, watermarked as generated data", () => {
          const parsed = parsePaymentComplement(
            source,
            SYNTHETIC_PARSE_OPTIONS,
          );
          if (!parsed.ok) {
            throw new Error(
              `the complement did not parse: ${parsed.error.code}`,
            );
          }
          expect(parsed.value.length).toBeGreaterThan(0);
          for (const row of parsed.value) {
            expect(row.paidAmount).toBeGreaterThan(0);
            expect(row.synthetic).toBe(true);
            expect(row.uuid).toMatch(UUID_PATTERN);
            expect(row.relatedCfdiUuid).toMatch(UUID_PATTERN);
          }
        });
      }

      it("carries no real taxpayer and no real stamp", () => {
        expect(source).toContain(REDACTION_NOTICE);
        for (const element of everyElement(rootOf(source))) {
          for (const [name, value] of Object.entries(element.attributes)) {
            if (name.includes("Rfc")) {
              expect(value.toUpperCase().startsWith(SYNTHETIC_RFC_PREFIX)).toBe(
                true,
              );
            }
            if (name === "Nombre") {
              expect(value.toUpperCase()).toContain(SYNTHETIC_NAME_MARKER);
            }
            if (STAMP_ATTRIBUTES.includes(name)) {
              expect(value.length).toBeLessThan(MAX_STAMP_LENGTH);
            }
          }
        }
      });
    });
  }
});

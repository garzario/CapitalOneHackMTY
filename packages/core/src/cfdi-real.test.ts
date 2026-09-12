/**
 * The parser, run against every real document we were given.
 *
 * `fixtures/real/` holds redacted copies of documents a PAC actually stamped,
 * produced by `scripts/import-real-cfdi.ts`. They are the answer to the one
 * question a judge always asks about a parser written in a hackathon: yes, it
 * has seen a real CFDI, and here is the file.
 *
 * Two properties this suite has to keep.
 *
 * 1. **It is green with no fixtures.** Until the first document arrives the
 *    folder is empty, and an empty folder skips with a message that says what to
 *    run. A suite that failed for the absence of a file nobody has yet would be
 *    deleted by the second person who hit it at 03:00.
 * 2. **It re-checks the redaction.** The importer already refuses to write a
 *    file that leaks, but the file is what gets committed, so the guarantee is
 *    asserted here too, over the bytes in the repository: every RFC is synthetic
 *    and no stamp or certificate is long enough to be a real one.
 */

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  attribute,
  parseCfdi,
  parsePaymentComplement,
  parseXml,
  type XmlElement,
} from "./cfdi";
import { SYNTHETIC_PARSE_OPTIONS } from "./fixtures";

const DIRECTORY = fileURLToPath(new URL("./fixtures/real/", import.meta.url));
const SUFFIX = ".redacted.xml";
const SYNTHETIC_RFC_PREFIX = "SYN";
/** A real sello is 344 base64 characters. Anything this short is a placeholder. */
const MAX_STAMP_LENGTH = 64;
const STAMP_ATTRIBUTES = ["Sello", "SelloCFD", "SelloSAT", "Certificado"];

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

const fixtures = listRealFixtures();

describe("redacted real CFDI fixtures", () => {
  if (fixtures.length === 0) {
    it.skip("no real document has been imported yet, add one with scripts/import-real-cfdi.ts", () => {
      expect(fixtures).toHaveLength(0);
    });
    return;
  }

  for (const fixture of fixtures) {
    describe(fixture, () => {
      const source = readFileSync(`${DIRECTORY}${fixture}`, "utf8");

      it("parses as the kind of document it says it is", () => {
        const document = parseXml(source);
        if (!document.ok) {
          throw new Error(`the document did not parse: ${document.error.code}`);
        }
        const kind = attribute(document.value, "TipoDeComprobante") ?? "";
        expect(["I", "P"]).toContain(kind);

        if (kind === "I") {
          const parsed = parseCfdi(source, SYNTHETIC_PARSE_OPTIONS);
          if (!parsed.ok) {
            throw new Error(`the invoice did not parse: ${parsed.error.code}`);
          }
          expect(parsed.value.total).toBeGreaterThan(0);
          expect(parsed.value.synthetic).toBe(true);
          return;
        }

        const parsed = parsePaymentComplement(source, SYNTHETIC_PARSE_OPTIONS);
        if (!parsed.ok) {
          throw new Error(`the complement did not parse: ${parsed.error.code}`);
        }
        expect(parsed.value.length).toBeGreaterThan(0);
        for (const row of parsed.value) {
          expect(row.paidAmount).toBeGreaterThan(0);
          expect(row.synthetic).toBe(true);
        }
      });

      it("carries no real taxpayer and no real stamp", () => {
        const document = parseXml(source);
        if (!document.ok) {
          throw new Error(`the document did not parse: ${document.error.code}`);
        }
        for (const element of everyElement(document.value)) {
          for (const [name, value] of Object.entries(element.attributes)) {
            if (name.includes("Rfc")) {
              expect(value.toUpperCase().startsWith(SYNTHETIC_RFC_PREFIX)).toBe(
                true,
              );
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

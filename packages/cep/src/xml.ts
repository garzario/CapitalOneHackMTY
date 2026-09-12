/**
 * A deliberately tiny XML reader for one document shape: the Banxico CEP.
 *
 * A CEP is a single root element with attributes and two empty children. It is
 * not a document tree, it is a record with a pointy syntax, so a general parser
 * would be a dependency we cannot justify under the zero-dependency rule in
 * AGENTS.md. What this file does have to get right is the part people get wrong:
 * entity decoding, both quote styles, namespace-prefixed attributes, CRLF, a BOM
 * and self-closing tags. Mexican legal names carry accents and ampersands, so a
 * reader that skips entity decoding silently corrupts the name comparison that
 * the whole beneficiary control depends on.
 *
 * This is NOT a general XML parser and must never be used as one. It has no
 * concept of text content, nesting, CDATA, DTDs or entity definitions, and it
 * rejects nothing that a real parser would reject. Everything it reads is treated
 * as untrusted input and only ever ends up in strings.
 */

/**
 * Attributes of one element, keyed by the attribute name as written.
 *
 * The value type includes `undefined` on purpose. Without it TypeScript would
 * promise a string for every key anyone types, which is exactly the promise that
 * turns a missing CEP attribute into a runtime surprise.
 */
export type XmlAttributes = Readonly<Record<string, string | undefined>>;

const BOM = "\ufeff";

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

/**
 * Decodes the five predefined XML entities plus numeric character references.
 *
 * An unknown entity is left exactly as it arrived rather than dropped, because
 * silently deleting part of a beneficiary name is worse than showing it oddly.
 */
export function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (match, body: string) => {
      if (body.startsWith("#")) {
        const isHex = body[1] === "x" || body[1] === "X";
        const digits = isHex ? body.slice(2) : body.slice(1);
        const code = Number.parseInt(digits, isHex ? 16 : 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
          return match;
        }
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return NAMED_ENTITIES[body] ?? match;
    },
  );
}

/** Matches `name="value"` and `name='value'`, including `ns:name`. */
const ATTRIBUTE_PATTERN = /([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;

/** Reads the attributes out of the inside of a start tag. */
function readAttributes(tagBody: string): XmlAttributes {
  const attributes: Record<string, string> = {};
  ATTRIBUTE_PATTERN.lastIndex = 0;
  let match = ATTRIBUTE_PATTERN.exec(tagBody);
  while (match !== null) {
    const name = match[1] as string;
    const raw = (match[3] ?? match[4] ?? "") as string;
    attributes[name] = decodeXmlEntities(raw);
    match = ATTRIBUTE_PATTERN.exec(tagBody);
  }
  return attributes;
}

/** Strips the BOM, the XML declaration and any leading whitespace or comments. */
function stripProlog(xml: string): string {
  let rest = xml.startsWith(BOM) ? xml.slice(BOM.length) : xml;
  rest = rest.replace(/^\s+/, "");
  while (rest.startsWith("<?") || rest.startsWith("<!")) {
    const close = rest.startsWith("<?")
      ? rest.indexOf("?>")
      : rest.indexOf(">");
    if (close === -1) {
      return "";
    }
    rest = rest
      .slice(close + (rest.startsWith("<?") ? 2 : 1))
      .replace(/^\s+/, "");
  }
  return rest;
}

/**
 * Name and attributes of the document's root element, or undefined when the
 * input does not open one.
 */
export function readRootElement(
  xml: string,
): { name: string; attributes: XmlAttributes } | undefined {
  const body = stripProlog(xml);
  const match = /^<([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(
    body,
  );
  if (match === null) {
    return undefined;
  }
  const name = match[1] as string;
  return { name, attributes: readAttributes(match[2] ?? "") };
}

/**
 * Attributes of the first element with this tag name, searched anywhere in the
 * document.
 *
 * Position is deliberately ignored. The SAT sample orders the CEP children
 * Ordenante then Beneficiario, and the production Banxico service emits them
 * Beneficiario then Ordenante, so any reader that indexes children by position
 * silently swaps the sender and the beneficiary on real data.
 */
export function readElementAttributes(
  xml: string,
  tagName: string,
): XmlAttributes | undefined {
  const pattern = new RegExp(
    `<${tagName}((?:[^>"']|"[^"]*"|'[^']*')*)/?>`,
    "s",
  );
  const match = pattern.exec(xml);
  if (match === null) {
    return undefined;
  }
  return readAttributes(match[1] ?? "");
}

/**
 * bun run scripts/extract-demo.ts <file>
 *
 * Runs `@hackmty/extract` over one photograph or one voice note and prints what
 * came back, so the intake path can be shown at the table without the API, the
 * database or the browser being involved.
 *
 * Flags:
 *   --fixture[=name]  replay a recorded fixture instead of calling the model.
 *                     No key and no network, which is what the rehearsal uses
 *                     when the venue wifi is gone.
 *   --image, --audio  force the path instead of taking it from the file bytes
 *   --json            print the result as JSON instead of the report
 *   --list            list the fixture names and exit
 *
 * What it prints is deliberately the whole story and not just the digits: the
 * account number, whether the 3-7-1 check digit closes, which Banxico
 * participant the first three digits name, the confidence and every factor that
 * lowered it. That is the boundary made visible. The model produced characters;
 * everything under "verification" was computed here, by pure functions, after
 * the answer came back.
 *
 * Exit code: 0 when something was read, 1 otherwise.
 */

import { validateClabe } from "../packages/core/src/index.ts";
import {
  AUDIO_VOICE_NOTE,
  fixtureResponse,
  IMAGE_CHECK_DIGIT_FAILS,
  IMAGE_HANDWRITTEN,
  IMAGE_ILLEGIBLE,
  oggHeaderBytes,
  pngHeaderBytes,
} from "../packages/extract/src/fixtures.ts";
import {
  AUDIO_MIME_TYPES,
  type AudioExtraction,
  extractFromAudio,
  extractFromImage,
  type HttpLike,
  hasApiKey,
  IMAGE_MIME_TYPES,
  type ImageExtraction,
  sniffMediaType,
} from "../packages/extract/src/index.ts";

const FIXTURES: Record<string, { name: string; kind: "image" | "audio" }> = {
  handwritten: { name: IMAGE_HANDWRITTEN, kind: "image" },
  "check-digit": { name: IMAGE_CHECK_DIGIT_FAILS, kind: "image" },
  illegible: { name: IMAGE_ILLEGIBLE, kind: "image" },
  "voice-note": { name: AUDIO_VOICE_NOTE, kind: "audio" },
};

const args = Bun.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const options = new Map(
  args
    .filter((arg) => arg.startsWith("--") && arg.includes("="))
    .map((arg) => {
      const at = arg.indexOf("=");
      return [arg.slice(0, at), arg.slice(at + 1)] as const;
    }),
);
const positional = args.filter((arg) => !arg.startsWith("--"));

if (flags.has("--help")) {
  console.log(
    [
      "bun run scripts/extract-demo.ts <file> [--image|--audio] [--json]",
      "bun run scripts/extract-demo.ts --fixture[=<name>] [--json]",
      "",
      "Reads a CLABE, an amount and a payee off a photograph, or transcribes a",
      "voice note. Extraction only: nothing here decides anything.",
      "",
      `Fixture names: ${Object.keys(FIXTURES).join(", ")}`,
    ].join("\n"),
  );
  process.exit(0);
}

if (flags.has("--list")) {
  for (const [key, fixture] of Object.entries(FIXTURES)) {
    console.log(`${key.padEnd(12)} ${fixture.kind.padEnd(6)} ${fixture.name}`);
  }
  process.exit(0);
}

const useFixture = [...flags].some((flag) => flag.startsWith("--fixture"));
const asJson = flags.has("--json");

type Kind = "image" | "audio";

/** Forced by a flag, then taken from the bytes, then refused. */
function kindOf(mime: string | undefined): Kind | undefined {
  if (flags.has("--image")) return "image";
  if (flags.has("--audio")) return "audio";
  if (mime === undefined) return undefined;
  if (IMAGE_MIME_TYPES.includes(mime)) return "image";
  if (AUDIO_MIME_TYPES.includes(mime)) return "audio";
  return undefined;
}

/** "0585 8000 0723 4567 75", which is how a person reads eighteen digits. */
function grouped(clabe: string): string {
  return (clabe.match(/.{1,4}/g) ?? [clabe]).join(" ");
}

function report(kind: Kind, result: ImageExtraction | AudioExtraction): void {
  const { reading } = result;
  const text =
    kind === "image"
      ? (result as ImageExtraction).rawText
      : (result as AudioExtraction).transcript;

  console.log("");
  console.log(kind === "image" ? "What the photo says" : "What the note says");
  console.log("-".repeat(60));
  console.log(text.trim() === "" ? "(nothing legible)" : text.trim());
  console.log("");
  console.log("Verification, computed here and not by the model");
  console.log("-".repeat(60));

  if (reading.clabe === undefined) {
    console.log("CLABE            none found");
  } else {
    const validation = validateClabe(reading.clabe);
    console.log(`CLABE            ${grouped(reading.clabe)}`);
    console.log(`  source         ${reading.source}`);
    console.log(
      `  check digit    ${validation.valid ? "closes" : `fails, the first 17 digits demand ${validation.expectedCheckDigit}`}`,
    );
    console.log(
      `  institution    ${validation.institution?.name ?? `${validation.parts?.institution ?? "?"} not in the catalogue`}`,
    );
    console.log(`  plaza          ${validation.parts?.plaza ?? "?"}`);
    console.log(`  candidates     ${reading.candidates.length}`);
  }

  const amount = result.amount;
  console.log(
    `amount           ${amount === undefined ? "none stated" : amount.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}`,
  );
  if (kind === "image") {
    console.log(
      `payee            ${(result as ImageExtraction).supplierHint ?? "none stated"}`,
    );
  }
  console.log("");
  console.log(`confidence       ${result.confidence}`);
  console.log(`  self-report    ${reading.clarity}`);
  console.log(
    `  penalties      ${reading.penalties.length === 0 ? "none" : reading.penalties.join(", ")}`,
  );
  console.log("");
  console.log(
    "Nothing above is a decision. The hold, verify or release is computed by",
  );
  console.log(
    "packages/core from findings, and no detector reads the transcript.",
  );
}

async function main(): Promise<number> {
  if (useFixture) {
    const key = options.get("--fixture") ?? "handwritten";
    const fixture = FIXTURES[key];
    if (fixture === undefined) {
      console.error(
        `Unknown fixture "${key}". Known: ${Object.keys(FIXTURES).join(", ")}.`,
      );
      return 1;
    }

    // The same code path as a real call, with the socket replaced. The fixture
    // is a response envelope, so the reader, the scanner and the confidence
    // arithmetic all run exactly as they do against the provider.
    const http: HttpLike = async () => fixtureResponse(fixture.name);
    const replay = { apiKey: "fixture-run-no-key-needed", http };

    console.log(`Replaying fixture ${fixture.name}. No key, no network.`);
    const result =
      fixture.kind === "image"
        ? await extractFromImage(pngHeaderBytes(), "image/png", replay)
        : await extractFromAudio(oggHeaderBytes(), "audio/ogg", replay);

    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    report(fixture.kind, result);
    return 0;
  }

  const path = positional[0];
  if (path === undefined) {
    console.error(
      "Give a file to read, or --fixture to replay a recorded answer. --help for the rest.",
    );
    return 1;
  }

  const file = Bun.file(path);
  if (!(await file.exists())) {
    console.error(`No file at ${path}.`);
    return 1;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMediaType(bytes);
  const kind = kindOf(mime);
  if (kind === undefined) {
    console.error(
      `Cannot tell what ${path} is (${bytes.byteLength} bytes). Force it with --image or --audio.`,
    );
    return 1;
  }
  if (!hasApiKey()) {
    console.error(
      "GEMINI_API_KEY is not set. Set it, or run with --fixture to replay a recorded answer.",
    );
    return 1;
  }

  const sent = mime ?? (kind === "image" ? "image/png" : "audio/ogg");
  console.log(
    `Sending ${bytes.byteLength} bytes of ${sent} and nothing else. No supplier, no history, no ledger.`,
  );
  const result =
    kind === "image"
      ? await extractFromImage(bytes, sent)
      : await extractFromAudio(bytes, sent);

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  report(kind, result);
  return result.clabe === undefined ? 1 : 0;
}

try {
  process.exit(await main());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

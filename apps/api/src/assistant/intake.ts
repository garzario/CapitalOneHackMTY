/**
 * A screenshot dropped into the chat, turned into a payment instruction.
 *
 * This is the reason the panel exists at all. Lupita already receives the account
 * she is supposed to pay as a photograph on WhatsApp or as a screenshot in an
 * email; every product that asks her to retype eighteen digits into a form has
 * already lost, and retyping is also where a transposed digit comes from. So she
 * drops the image into the conversation and the six controls run on what came out
 * of it.
 *
 * Where the boundary sits, precisely, because this is the file most able to blur
 * it:
 *
 * - **The model transcribes and nothing else.** `packages/extract` gets the bytes
 *   and answers characters, a number and a confidence, against a fixed schema with
 *   no field a judgment could be written into. ADR-0004 and docs/06 section 6.2.1
 *   hold that rule and `packages/extract/src/boundary.test.ts` enforces it.
 * - **The assistant model never sees the image.** ADR-0007 allows it to; this
 *   implementation does not send it, because the only thing the turn needs from the
 *   picture is the digits the extractor already read, and a second copy of the
 *   screenshot leaving the perimeter would buy nothing. The transfer is therefore
 *   strictly narrower than the ADR permits, which is the direction it is allowed to
 *   be narrower in.
 * - **The transcription happens twice and it is priced.** Once here, to read the
 *   payee and attribute the supplier, and once inside `POST /api/v1/instructions`,
 *   which is what puts `imageRef` and `ocrConfidence` on the instruction and arms
 *   the `ocrChannel` evidence on the CLABE control. The alternative was to post the
 *   account as text, which produces an instruction that looks typed and quietly
 *   weakens a control, or to build a second intake path, which is the thing this
 *   file exists not to do. docs/06 section 6.4 carries the arithmetic.
 * - **The attribution is deterministic.** Which supplier this pays is decided by
 *   matching the transcribed account against the accounts the company has paid
 *   before, and then by comparing the payee as written against the legal names of
 *   the suppliers in the run with `nameMatch` from `@hackmty/cep`, which knows what
 *   "SA de CV" and a bank-truncated corporate name mean in Mexico. No model is
 *   asked who this is. When neither match answers, nothing is created: the turn ends
 *   with an `intake` proposal and a person names the supplier.
 * - **The write is the ordinary one.** The instruction is created through
 *   `POST /api/v1/instructions`, in process, the same handler the QR page posts to,
 *   so the controls that run are the controls that run, the `decision_made` the
 *   engine signs is the one it always signs, and the panel is a second front door
 *   rather than a second pipeline. The clerk dropping the file is the person whose
 *   action this is, and `intake_image` carries her name.
 */

import { nameMatch } from "@hackmty/cep";
import type { Actor } from "@hackmty/core";
import type { IntakeExtractor } from "../extraction";
import type { ApiCaller } from "./tools";

/** What one image gave up, before anything was done with it. */
export interface ImageReading {
  clabe?: string;
  amount?: number;
  supplierHint?: string;
  confidence: number;
}

/** Why an image did not become an instruction, in the clerk's terms. */
export type IntakeGap =
  | "unreadable"
  | "no_clabe"
  | "no_amount"
  | "unknown_supplier"
  | "refused";

export type ChatIntakeOutcome =
  | {
      ok: true;
      instructionId: string;
      reading: ImageReading;
      supplierRfc: string;
      /** How the supplier was attributed, which is evidence and not a guess. */
      matchedBy: "known_account" | "legal_name";
    }
  | {
      ok: false;
      gap: IntakeGap;
      /** One sentence for the clerk. Never the provider's body. */
      message: string;
      /** What was read, so the proposal can carry it. Absent when nothing was. */
      reading?: ImageReading;
    };

export interface ChatIntakeDeps {
  extractor: IntakeExtractor;
  api: ApiCaller;
  actor: Actor;
}

interface RunSuppliersPayload {
  items: Array<{
    instruction: { supplierRfc: string };
    supplier: {
      rfc: string;
      legalName: string;
      knownAccounts: Array<{ clabe: string }>;
    };
  }>;
}

interface IntakeResponsePayload {
  instruction: { id: string };
}

/** The source an instruction that arrived as a chat screenshot is recorded under. */
export const CHAT_INTAKE_SOURCE = "whatsapp";

/**
 * Reads one image and, when it can be attributed, creates the instruction.
 *
 * Every early return is a gap rather than an error, because a photograph that
 * cannot be read is an ordinary Thursday and the panel has to say what is missing
 * instead of failing. The caller turns a gap into an `intake` proposal.
 */
export async function runChatIntake(
  deps: ChatIntakeDeps,
  image: string,
): Promise<ChatIntakeOutcome> {
  if (!deps.extractor.available) {
    return {
      ok: false,
      gap: "refused",
      message:
        "Este servidor no tiene llave para leer imágenes, así que la cuenta hay que escribirla a mano.",
    };
  }

  const read = await deps.extractor.image(image);
  if (!read.ok) {
    return { ok: false, gap: "unreadable", message: read.message };
  }

  const reading: ImageReading = { confidence: read.value.confidence };
  if (read.value.clabe !== undefined) {
    reading.clabe = read.value.clabe;
  }
  if (read.value.amount !== undefined) {
    reading.amount = read.value.amount;
  }
  if (read.value.supplierHint !== undefined) {
    reading.supplierHint = read.value.supplierHint;
  }

  if (reading.clabe === undefined) {
    return {
      ok: false,
      gap: "no_clabe",
      message:
        "La imagen no dejó una CLABE de 18 dígitos legible, así que hay que escribirla.",
      reading,
    };
  }
  if (reading.amount === undefined) {
    return {
      ok: false,
      gap: "no_amount",
      message:
        "La imagen dejó la cuenta pero no un importe, y sin importe no se puede registrar el pago.",
      reading,
    };
  }

  const attributed = await attribute(deps.api, reading);
  if (attributed === undefined) {
    return {
      ok: false,
      gap: "unknown_supplier",
      message:
        "La cuenta y el nombre de la imagen no coinciden con ningún proveedor de la corrida, así que falta que una persona diga a quién se le paga.",
      reading,
    };
  }

  /* The image goes with it, and the CLABE deliberately does not.
     `runIntake` then reads the account itself, which is what sets `imageRef` and
     `ocrConfidence` on the instruction, and those two are what arm `ocrChannel` on
     the CLABE control: a clerk looking at the finding has to be able to see that
     these digits came off a photograph. Posting the account as text would have
     produced an instruction that looks typed, which is a control quietly weakened.
     The price is a second transcription of the same screenshot, one to attribute the
     supplier and one inside the ordinary endpoint, and docs/06 section 6.4 prices it
     rather than hiding it. The alternative is a second intake pipeline, and one
     screenshot costing two fifths of a centavo is cheaper than that. */
  const response = await deps.api("/api/v1/instructions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      supplierRfc: attributed.rfc,
      amount: reading.amount,
      source: CHAT_INTAKE_SOURCE,
      image,
    }),
  });

  if (!response.ok) {
    let message =
      "La instrucción no se pudo registrar con lo que traía la imagen.";
    try {
      const envelope = (await response.json()) as {
        error?: { message?: string };
      };
      if (envelope.error?.message !== undefined) {
        message = envelope.error.message;
      }
    } catch {
      /* A body that is not our envelope is not worth echoing to a clerk. */
    }
    return { ok: false, gap: "refused", message, reading };
  }

  const created = (await response.json()) as IntakeResponsePayload;
  return {
    ok: true,
    instructionId: created.instruction.id,
    reading,
    supplierRfc: attributed.rfc,
    matchedBy: attributed.matchedBy,
  };
}

/**
 * Which supplier this image pays, from the accounts the company already holds.
 *
 * The account wins over the name: an eighteen-digit match against an account this
 * company has paid before is a fact, and a name on a screenshot is what somebody
 * typed into WhatsApp. When the account is new, which is the case the product exists
 * for, the name decides, and only an exact `nameMatch` counts: a `partial` is what
 * "GRUPO INDUSTRIAL" would score against four different suppliers, and attributing a
 * payment on a partial would be the product guessing who is being paid.
 */
async function attribute(
  api: ApiCaller,
  reading: ImageReading,
): Promise<
  { rfc: string; matchedBy: "known_account" | "legal_name" } | undefined
> {
  const response = await api("/api/v1/run/current", { method: "GET" });
  if (!response.ok) {
    return undefined;
  }
  const run = (await response.json()) as RunSuppliersPayload;

  const suppliers = new Map<
    string,
    { legalName: string; accounts: Set<string> }
  >();
  for (const item of run.items) {
    const existing = suppliers.get(item.supplier.rfc) ?? {
      legalName: item.supplier.legalName,
      accounts: new Set<string>(),
    };
    for (const account of item.supplier.knownAccounts) {
      existing.accounts.add(account.clabe);
    }
    suppliers.set(item.supplier.rfc, existing);
  }

  if (reading.clabe !== undefined) {
    for (const [rfc, supplier] of suppliers) {
      if (supplier.accounts.has(reading.clabe)) {
        return { rfc, matchedBy: "known_account" };
      }
    }
  }

  const hint = reading.supplierHint;
  if (hint === undefined || hint.trim() === "") {
    return undefined;
  }
  const exact: string[] = [];
  for (const [rfc, supplier] of suppliers) {
    if (nameMatch(hint, supplier.legalName) === "match") {
      exact.push(rfc);
    }
  }
  /* Exactly one, or none. Two suppliers whose legal names both match the payee on
     a screenshot is a question for a person, not a coin toss over money. */
  return exact.length === 1 && exact[0] !== undefined
    ? { rfc: exact[0], matchedBy: "legal_name" }
    : undefined;
}

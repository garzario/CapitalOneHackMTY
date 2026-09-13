/**
 * `GET /api/v1/instructions/:id/carta`, the one-page evidence letter.
 *
 * It is the page a clerk attaches to an email when the supplier rings to ask why
 * the transfer has not arrived, which is why it is one page and not a constancia:
 * the constancia is the whole week for the accountant's file, and this is one
 * payment for somebody outside the company.
 *
 * This file gathers the seven signals and sets the headers. It composes nothing
 * and it decides nothing: the bytes come from `evidenceLetter` in
 * `@hackmty/constancia`, which is pure, and the level and the state come from
 * `assessLine` in `@hackmty/core`, which is the only place either is derived. A
 * document that computed its own level would be the fifth implementation ADR-0009
 * exists to remove.
 *
 * Two rules it inherits from the constancias next door and one it adds.
 *
 * - The issue instant comes from `deps.clock`, so a test gets byte-identical
 *   output and the huella printed on the page is worth checking.
 * - An instruction this instance never held is a `404`. A letter about a payment
 *   that does not exist would be a fabricated document, and this is the one place
 *   in the product where that word has legal weight.
 * - **No signal is ever blank.** A CEP nobody asked for prints "no se envio el
 *   centavo", the Article 49 Bis listing prints the reason it could not be
 *   consulted, and a control with nothing to say says so. A blank next to a
 *   control reads as a control that passed, which is the failure
 *   `CompositionReport` exists to prevent inside the engine and the same failure
 *   a letter can commit on paper.
 */

import type {
  AccountSignal,
  CallSignal,
  DocumentSignal,
  EvidenceLetterInput,
  Sat49BisAnswer,
  VerificationSignal,
} from "@hackmty/constancia";
import { constanciaFilename, evidenceLetter } from "@hackmty/constancia";
import type {
  LedgerEvent,
  PaymentInstruction,
  SatListEntry,
  Supplier,
} from "@hackmty/core";
import { assessLine, lookupInstitution, parseClabeParts } from "@hackmty/core";
import { ART_49BIS_LABEL, matchRfc, official49BisListing } from "@hackmty/sat";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { notFound, rejectInvalid } from "../http";
import { pdfResponse } from "../pdf";
import { idParamSchema } from "../schemas";
import { foldVerification } from "../verification";

export function cartaRoutes(deps: ApiDeps) {
  return new Hono().get(
    "/:id/carta",
    zValidator("param", idParamSchema, rejectInvalid),
    async (c) => {
      const { id } = c.req.valid("param");
      const detail = await deps.repo.instructionDetail(id);

      if (detail === undefined) {
        return notFound(c, `No existe la instruccion ${id}.`);
      }

      const { instruction, supplier } = detail;
      const company = await deps.repo.company();
      const events = await deps.repo.verificationEvents(id, instruction.clabe);
      const assessed = assessLine({
        findings: detail.findings,
        decision: detail.decision,
      });

      const input: EvidenceLetterInput = {
        company,
        issuedAt: deps.clock.now(),
        ledger: await deps.repo.ledger({}),
        synthetic: company.synthetic,
        instruction,
        ...(supplier === null ? {} : { supplier }),
        ...(detail.decision === null ? {} : { decision: detail.decision }),
        findings: detail.findings,
        confidence: assessed.confidence,
        state: assessed.state.state,
        sat69b: await sat69bRows(deps, instruction.supplierRfc),
        sat49Bis: answer49Bis(),
        account: accountSignal(instruction, supplier),
        ...verificationOf(instruction, supplier, events, deps.clock.now()),
        ...callOf(events, id),
        documents: documentsOf(instruction),
      };

      return pdfResponse(
        c,
        evidenceLetter(input),
        constanciaFilename("carta", instruction.id),
      );
    },
  );
}

/**
 * The Article 69-B rows this instance holds for one supplier, newest publication
 * first.
 *
 * Both sources, exactly like `GET /api/v1/sat/lookup`: the versions this instance
 * was posted and the committed download of the real list, merged and ordered by
 * `matchRfc`. A letter that read only one of them would know less than the lookup
 * box on the next screen.
 */
async function sat69bRows(
  deps: ApiDeps,
  rfc: string,
): Promise<readonly SatListEntry[]> {
  const official = await deps.satList();
  const stored = await deps.repo.satLookup(rfc);
  return matchRfc([...stored, ...official.lookup(rfc)], rfc).entries;
}

/**
 * What the Article 49 Bis arm can say today, which is why it could not answer.
 *
 * `not_published_machine_readable` is the honest arm and the counts come off the
 * survey in `@hackmty/sat`: a letter that printed "no esta listado" for a list
 * nobody loaded would be claiming a check nobody ran.
 */
function answer49Bis(): Sat49BisAnswer {
  const listing = official49BisListing();

  if (listing.coverage === "loaded") {
    return {
      answered: true,
      detail: `Cotejado contra la version ${listing.listVersion}, obtenida el ${listing.retrievedAt}`,
    };
  }

  return {
    answered: false,
    detail:
      `El SAT publica el listado del articulo ${ART_49BIS_LABEL} un oficio a la vez en el DOF y no lo ` +
      `distribuye en formato descargable. Al ${listing.surveyedAt} habia ${listing.oficiosPublished} oficios.`,
  };
}

/**
 * The account, as a document that leaves the building may name it: the
 * participant, the plaza and four digits.
 *
 * The plaza is digits 4 to 6 and it is a code and never a city. `Plaza.city` is
 * filled only from a dated Banxico snapshot this build does not hold, and a city
 * invented next to a real account number is exactly what ADR-0002 forbids. Issue
 * #203 is where the plaza becomes a signal in control 2; here it is printed.
 */
function accountSignal(
  instruction: PaymentInstruction,
  supplier: Supplier | null,
): AccountSignal {
  const parts = parseClabeParts(instruction.clabe);
  const known = supplier?.knownAccounts ?? [];

  return {
    bank:
      lookupInstitution(parts.institution)?.name ?? "institucion no publicada",
    plazaCode: parts.plaza,
    last4: instruction.clabe.slice(-4),
    knownAccounts: known.length,
    known: known.some((account) => account.clabe === instruction.clabe),
  };
}

/**
 * Where the one-cent verification stands, through the same fold the verification
 * endpoint answers with.
 *
 * `not_started` is left off the letter input entirely rather than passed as a
 * state, because the generator already prints the right sentence for an absent
 * verification and two ways to say "nobody asked" is one too many.
 */
function verificationOf(
  instruction: PaymentInstruction,
  supplier: Supplier | null,
  events: readonly LedgerEvent[],
  now: string,
): { verification?: VerificationSignal } {
  const state = foldVerification(
    instruction,
    supplier ?? undefined,
    events,
    now,
  );
  if (state.state === "not_started") {
    return {};
  }

  return {
    verification: {
      state: state.state,
      sealState: state.sealState,
      holderName: state.holderName,
      nameMatch: state.nameMatch,
      cepAt: state.cepAt,
    },
  };
}

/** The newest verification call about this payment, when one was placed. */
function callOf(
  events: readonly LedgerEvent[],
  instructionId: string,
): { call?: CallSignal } {
  const calls = events.filter(
    (event) =>
      event.type === "verification_call" &&
      event.instructionId === instructionId,
  );
  const newest = calls[calls.length - 1];
  if (newest === undefined || newest.type !== "verification_call") {
    return {};
  }

  return {
    call: {
      outcome: newest.outcome,
      at: newest.at,
      clabeLast4: newest.clabeLast4,
      ...(newest.evidence === undefined ? {} : { evidence: newest.evidence }),
      manual: newest.manual,
    },
  };
}

/**
 * What the clerk uploaded, as a fact about the intake and never as content.
 *
 * The references and not the bytes, and no transcription confidence: the letter
 * states that a photo exists, which is what a supplier asking about their payment
 * can act on, and `ocrConfidence` is a number about a model rather than about the
 * payment.
 */
function documentsOf(instruction: PaymentInstruction): DocumentSignal {
  return {
    image: instruction.imageRef !== undefined,
    audio: instruction.audioRef !== undefined,
    text: instruction.text !== undefined,
  };
}

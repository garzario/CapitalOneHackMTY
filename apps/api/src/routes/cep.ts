import type { Cep, Finding } from "@hackmty/core";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import type { Read } from "../extraction";
import { fail, notFound, rejectInvalid } from "../http";
import { actorOf, requireActor } from "../middleware/actor";
import { compareBeneficiaryName, runControlsFor } from "../pipeline";
import { type CepVerifyBody, cepVerifyBodySchema } from "../schemas";

/**
 * Beneficiary verification against the CEP that Banxico signs for every SPEI.
 *
 * The flow is not automatic and must not look automatic: a person sends a
 * one-cent SPEI from the company's own bank, and this endpoint retrieves or
 * accepts the CEP for that transfer, checks the seal as far as this server can,
 * compares the account holder with the legal name on the CFDI, and stores the
 * result in the registry of verified beneficiaries. We never move the cent
 * ourselves.
 *
 * Four pieces, and none of them lives here. `packages/cep` retrieves, parses and
 * checks the seal, behind `src/cep.ts`; `nameMatch` in the same package does the
 * comparison; `packages/engine` authors the finding. This file decides which of
 * the three ways to a CEP applies and in what order, and nothing else.
 *
 * The order for the `claveRastreo` form is registry first, portal second, and it
 * is deliberate. An account that has already been probed is answered from what we
 * hold rather than by consulting a public government service again, which keeps
 * the demo independent of whether banxico.org.mx is up. The `xml` form never
 * consults the registry: a person pasting a document is handing us evidence, not
 * asking what we already know.
 *
 * What this endpoint will not do is claim a seal it has not checked.
 * `signatureValid` is set from `verifySignature` when a certificate is
 * configured, and otherwise keeps the `not_checked` that `parseCep` wrote. See
 * `src/cep.ts`.
 */
export function cepRoutes(deps: ApiDeps) {
  return new Hono().post(
    "/verify",
    requireActor,
    zValidator("json", cepVerifyBodySchema, rejectInvalid),
    async (c) => {
      const actor = actorOf(c);
      const body = c.req.valid("json");

      const supplier = await deps.repo.findSupplier(body.supplierRfc);
      if (supplier === undefined) {
        return notFound(c, `No supplier with RFC ${body.supplierRfc}.`);
      }

      const found = await resolveCep(deps, body);
      if (!found.ok) {
        return fail(c, 422, "unprocessable", found.message);
      }
      const cep = found.value;

      const nameMatch = compareBeneficiaryName(
        cep.beneficiaryName,
        supplier.legalName,
      );
      const verifiedAt = deps.clock.now();

      await deps.repo.saveVerifiedBeneficiary({
        supplierRfc: supplier.rfc,
        clabe: cep.beneficiaryAccount,
        cep,
        verifiedAt,
      });
      /* Whose document it is. The primary path here is a person pasting a CEP
         they downloaded themselves, so the ledger records whose download the
         evidence came from. */
      await deps.emit({
        type: "cep_verified",
        at: verifiedAt,
        cep,
        supplierRfc: supplier.rfc,
        actor,
      });

      return c.json({
        cep,
        nameMatch,
        finding: await beneficiaryFinding(deps, supplier.rfc, cep, verifiedAt),
      });
    },
  );
}

/**
 * The `beneficiary_cep` finding for the payment this CEP is evidence about.
 *
 * It is the engine's finding and not one this file wrote: control 5 lives in
 * `beneficiaryCepAdapter`, the severity ladder and the Spanish explanation are
 * its own, and an API that authored a second version of them would be a second
 * product. The registry row is saved before this runs, which is what arms the
 * control: `composeInputFor` offers the control the CEP verified for the account
 * the instruction actually pays to, and no other.
 *
 * Null when no pending instruction pays this account. A finding is a statement
 * about pesos at risk in this payment run, and a verification done ahead of any
 * instruction puts nothing at risk yet. The registry row is the lasting record
 * either way, and the finding appears on the line the day one is raised.
 *
 * The official 69-B snapshot is deliberately not passed in. Only the CEP finding
 * is read out of the report, and a snapshot that failed to parse must not be able
 * to fail a CEP verification that never needed it.
 */
async function beneficiaryFinding(
  deps: ApiDeps,
  supplierRfc: string,
  cep: Cep,
  now: string,
): Promise<Finding | null> {
  const run = await deps.repo.currentRun();
  const line = run.items.find(
    (item) =>
      item.instruction.supplierRfc === supplierRfc &&
      digitsOf(item.instruction.clabe) === digitsOf(cep.beneficiaryAccount),
  );
  if (line === undefined) {
    return null;
  }

  /* The consortium is passed through so the finding this endpoint returns carries
     the same network evidence the payment-run screen shows. A CEP verification
     that reported no network next to a finding that did would be two answers to
     one question. */
  const report = await runControlsFor(
    deps.repo,
    line.instruction,
    now,
    undefined,
    deps.consortium,
  );

  return (
    report.findings.find((finding) => finding.detector === "beneficiary_cep") ??
    null
  );
}

/** Digits only, so a CLABE stored with spaces still compares. */
function digitsOf(value: string): string {
  return value.replace(/\D+/g, "");
}

/**
 * Finds a CEP we can stand behind, by the three ways docs/09-api.md allows.
 *
 * Nothing is synthesised. A document that cannot be parsed, a transfer Banxico
 * does not know about and a portal this server may not call all come back as a
 * sentence the route answers with 422.
 */
async function resolveCep(
  deps: ApiDeps,
  body: CepVerifyBody,
): Promise<Read<Cep>> {
  if ("xml" in body) {
    return deps.cep.accept(body.xml);
  }

  const stored = await storedCep(deps, body);
  if (stored !== undefined) {
    return { ok: true, value: stored };
  }

  return deps.cep.retrieve({
    claveRastreo: body.claveRastreo,
    date: body.date,
    amount: body.amount,
    senderBank: body.senderBank,
    /* The contract names this by what it is to the clerk, the beneficiary's
       bank. The portal names it by what it does, the receiving participant. */
    receiverBank: body.beneficiaryBank,
    beneficiaryAccount: body.beneficiaryAccount,
  });
}

/**
 * A CEP already in the registry for this supplier and this account.
 *
 * Matched on the clave de rastreo when it agrees, and on the account alone
 * otherwise: the account is what the control is about, and a second probe to the
 * same account carries a different clave. The seal is not re-checked, because the
 * stored row already carries the state it was verified with.
 */
async function storedCep(
  deps: ApiDeps,
  body: Extract<CepVerifyBody, { claveRastreo: string }>,
): Promise<Cep | undefined> {
  const rows = await deps.repo.beneficiaries();
  const mine = rows.filter((row) => row.supplierRfc === body.supplierRfc);

  return (
    mine.find(
      (row) =>
        row.clabe === body.beneficiaryAccount &&
        row.cep.claveRastreo === body.claveRastreo,
    )?.cep ?? mine.find((row) => row.clabe === body.beneficiaryAccount)?.cep
  );
}

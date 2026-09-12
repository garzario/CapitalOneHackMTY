import type { Cep } from "@hackmty/core";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { fail, notFound, rejectInvalid } from "../http";
import { compareBeneficiaryName } from "../pipeline";
import { type CepVerifyBody, cepVerifyBodySchema } from "../schemas";

/**
 * Beneficiary verification against the CEP that Banxico signs for every SPEI.
 *
 * The flow is not automatic and must not look automatic: a person sends a
 * one-cent SPEI from the company's own bank, and this endpoint fetches the CEP
 * for that transfer, validates the signature, compares the account holder with
 * the legal name on the CFDI, and stores the result in the registry of verified
 * beneficiaries. We never move the cent ourselves.
 *
 * TODO(garzario): issue #37, `packages/cep` does the fetch and the XMLDSig check
 * against the Banxico certificate. Until it exists this endpoint answers from
 * the registry, so the CEP viewer can be built, and refuses anything it cannot
 * actually prove. A `signatureValid: true` that nobody verified would be the
 * single most expensive lie in this repo.
 */
export function cepRoutes(deps: ApiDeps) {
  return new Hono().post(
    "/verify",
    zValidator("json", cepVerifyBodySchema, rejectInvalid),
    async (c) => {
      const body = c.req.valid("json");

      const supplier = await deps.repo.findSupplier(body.supplierRfc);
      if (supplier === undefined) {
        return notFound(c, `No supplier with RFC ${body.supplierRfc}.`);
      }

      const cep = await resolveCep(deps, body);
      if (cep === undefined) {
        return fail(
          c,
          422,
          "unprocessable",
          "No signed CEP is available for this transfer yet. Banxico retrieval and signature validation are not wired in (packages/cep).",
        );
      }

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
      await deps.emit({
        type: "cep_verified",
        at: verifiedAt,
        cep,
        supplierRfc: supplier.rfc,
      });

      // TODO(garzario): the beneficiary_cep finding comes from composeFindings
      // once the detectors land. The API must not author a finding itself.
      return c.json({ cep, nameMatch, finding: null });
    },
  );
}

/**
 * Finds a CEP we can stand behind. Today that means one already in the registry,
 * matched on the account or on the clave de rastreo. Nothing is synthesised: if
 * Banxico has not signed it, this returns undefined and the caller gets a 422.
 */
async function resolveCep(
  deps: ApiDeps,
  body: CepVerifyBody,
): Promise<Cep | undefined> {
  const rows = await deps.repo.beneficiaries();
  const mine = rows.filter((row) => row.supplierRfc === body.supplierRfc);

  if ("xml" in body) {
    // TODO(garzario): issue #37, parse the XML and validate the signature. Matching
    // on a substring is not validation, so an unknown XML is refused.
    return mine.find((row) => row.cep.xml === body.xml)?.cep;
  }

  return (
    mine.find(
      (row) =>
        row.clabe === body.beneficiaryAccount &&
        row.cep.claveRastreo === body.claveRastreo,
    )?.cep ?? mine.find((row) => row.clabe === body.beneficiaryAccount)?.cep
  );
}

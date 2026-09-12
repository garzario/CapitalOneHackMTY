import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiDeps } from "../deps";
import { notFound, rejectInvalid } from "../http";
import { rfcParamSchema } from "../schemas";

/**
 * The supplier drawer: every document we hold from one RFC, the findings that
 * touch it, and the accounts we have proof of. This is the screen that answers
 * "why do you think this account is wrong", so it ships the evidence and not a
 * score.
 */
export function supplierRoutes(deps: ApiDeps) {
  return new Hono().get(
    "/:rfc",
    zValidator("param", rfcParamSchema, rejectInvalid),
    async (c) => {
      const { rfc } = c.req.valid("param");
      const detail = await deps.repo.supplierDetail(rfc);

      if (detail === undefined) {
        return notFound(c, `No supplier with RFC ${rfc}.`);
      }

      return c.json(detail);
    },
  );
}

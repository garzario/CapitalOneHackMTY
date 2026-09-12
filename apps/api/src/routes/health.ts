import { Hono } from "hono";

export const SERVICE_NAME = "api";

/**
 * Bumped by hand. The API has no build step, so there is no generated version
 * to read and nothing to drift out of sync.
 */
export const SERVICE_VERSION = "0.1.0";

export type HealthPayload = {
  ok: true;
  service: typeof SERVICE_NAME;
  version: string;
};

/**
 * Liveness only. It must never touch the database or Nessie: a health check
 * that depends on the network is a health check that lies at 04:00.
 */
export const health = new Hono().get("/", (c) => {
  const payload: HealthPayload = {
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
  };

  return c.json(payload);
});

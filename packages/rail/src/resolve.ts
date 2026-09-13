/**
 * Which rail this process sends the cent on, decided once from the environment.
 *
 * `RAIL=nessie|stp` names it. With `RAIL` unset the answer is the Nessie mirror
 * when a key exists, because that is the rail a teammate who followed the README
 * already has, and nothing at all when it does not: a server with no rail says so
 * with a `503` that names the variables, which is the honest answer and is also
 * what stops a demo from quietly doing nothing.
 *
 * The result is a resolution rather than a throw, because "this server cannot send
 * a cent" is a state the API has to be able to report on a request, and a message a
 * clerk can act on is worth more than a stack trace nobody sees.
 */

import type { RailId } from "@hackmty/core";
import { NessieRail } from "./nessie";
import { type PaymentRail, RailConfigError } from "./rail";
import { readStpConfig, STP_NOT_CONFIGURED, StpRail } from "./stp";

export type RailResolution =
  | { ok: true; rail: PaymentRail }
  | { ok: false; message: string };

/** The company, as much of it as an STP ordenante needs. */
export interface RailCompany {
  legalName: string;
  rfc: string;
}

export interface ResolveRailOptions {
  /** Defaults to `RAIL`. */
  name?: string | undefined;
  /** Defaults to `NESSIE_API_KEY` being present. */
  nessieConfigured?: boolean;
  /** The ordenante of an STP order. Absent means STP cannot be built. */
  company?: RailCompany;
}

function readEnv(name: string): string | undefined {
  const holder = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  const value = holder.process?.env?.[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

/** What a caller is told when no rail is configured at all. */
export const NO_RAIL =
  "This server has no payment rail, so the one-cent verification cannot be sent from here. Set RAIL=nessie with NESSIE_API_KEY for the bank mirror, or RAIL=stp with the STP_* variables for the production path. See .env.example.";

/** What a caller is told when RAIL names something this build does not have. */
export function unknownRail(name: string): string {
  return `RAIL=${name} is not a rail this build has. It is nessie (the company bank mirror on Nessie) or stp (the SPEI participant). See packages/rail/README.md.`;
}

/**
 * The rail named by `RAIL`, or the default.
 *
 * Undefined means "no rail", which is a different answer from "a rail this build
 * does not know": the second one is a typo in a `.env` and has to be reported as
 * one rather than silently falling back to the mirror.
 */
export function railNameFrom(
  name = readEnv("RAIL"),
  nessieConfigured = readEnv("NESSIE_API_KEY") !== undefined,
): { rail?: RailId; unknown?: string } {
  if (name === undefined) {
    return nessieConfigured ? { rail: "nessie" } : {};
  }
  const normalized = name.trim().toLowerCase();
  if (normalized === "nessie" || normalized === "stp") {
    return { rail: normalized };
  }
  return { unknown: name };
}

export function resolveRail(options: ResolveRailOptions = {}): RailResolution {
  const named = railNameFrom(
    options.name === undefined ? readEnv("RAIL") : options.name,
    options.nessieConfigured ?? readEnv("NESSIE_API_KEY") !== undefined,
  );
  if (named.unknown !== undefined) {
    return { ok: false, message: unknownRail(named.unknown) };
  }
  if (named.rail === undefined) {
    return { ok: false, message: NO_RAIL };
  }

  try {
    return named.rail === "stp"
      ? { ok: true, rail: stpRail(options.company) }
      : { ok: true, rail: new NessieRail() };
  } catch (cause) {
    /* A rail that cannot be built is a configuration answer and not a crash. The
       message is the adapter's own, because it is the one that knows what is
       missing; anything else becomes the generic sentence. */
    return {
      ok: false,
      message:
        cause instanceof RailConfigError
          ? cause.message
          : `${NO_RAIL} (${cause instanceof Error ? cause.message : String(cause)})`,
    };
  }
}

function stpRail(company: RailCompany | undefined): PaymentRail {
  const config = readStpConfig(company);
  if (config === undefined) {
    throw new RailConfigError(STP_NOT_CONFIGURED);
  }
  return new StpRail({ config });
}

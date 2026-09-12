/**
 * The in-process rail: no network, no bank, no pesos.
 *
 * It exists for the suite and for `bun run demo`, which have to drive the whole
 * pipeline from the cent to the decision on a laptop with no key and no socket. It
 * is the only rail that answers `simulated: true`, and that flag is the point of
 * the class: it travels onto the `cent_sent` ledger event, so a probe that nothing
 * sent can never be read later as a transfer that settled. The demo prints it.
 *
 * `rail` is a constructor argument rather than a fourth member of `RailId`, and
 * that is deliberate. The domain has two rails, Nessie for the mirror and STP for
 * production, and adding a third name to the type would put a fake into every
 * exhaustive switch in the product. A caller says which rail it is standing in for
 * and the honesty lives in `simulated`.
 */

import type { RailId } from "@hackmty/core";
import {
  assertClaveRastreo,
  CENT_AMOUNT,
  type CentRequest,
  type CentSent,
  type PaymentRail,
} from "./rail";

export interface FakeRailOptions {
  /** Which rail this one stands in for. Defaults to the demo rail. */
  rail?: RailId;
  /**
   * The clave de rastreo to answer with, from the request. Deterministic on
   * purpose: the demo files a synthetic CEP under exactly this clave, which is how
   * one call reaches `cep_signed` without a network.
   */
  mint?: (request: CentRequest, sequence: number) => string;
  now?: () => string;
}

/** The default clave: SYN, so nothing reads it as a clave anybody filed at Banxico. */
export function syntheticClave(sequence: number): string {
  return `SYNVER${String(sequence).padStart(10, "0")}`;
}

export class FakeRail implements PaymentRail {
  readonly rail: RailId;
  readonly describe = "in-process rail, nothing is sent (simulated)";

  /** Every request it was given, in order, so a test asserts what was asked. */
  readonly sent: CentRequest[] = [];

  private readonly mint: (request: CentRequest, sequence: number) => string;
  private readonly now: () => string;
  private sequence = 0;

  constructor(options: FakeRailOptions = {}) {
    this.rail = options.rail ?? "nessie";
    this.mint =
      options.mint ?? ((_request, sequence) => syntheticClave(sequence));
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async sendCent(request: CentRequest): Promise<CentSent> {
    this.sequence += 1;
    this.sent.push(request);

    return {
      rail: this.rail,
      claveRastreo: assertClaveRastreo(this.mint(request, this.sequence)),
      sentAt: this.now(),
      amount: CENT_AMOUNT,
      simulated: true,
    };
  }
}

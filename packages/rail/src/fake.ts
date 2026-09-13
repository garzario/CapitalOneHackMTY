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
  assertPaymentAmount,
  CENT_AMOUNT,
  type CentRequest,
  type CentSent,
  type PaymentConfirmation,
  type PaymentOrder,
  type PaymentRail,
  type PaymentSent,
  RailSendError,
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
  /** The clave for a payment of the run. Same reason, same shape. */
  mintPayment?: (order: PaymentOrder, sequence: number) => string;
  now?: () => string;
  /**
   * Instruction ids this rail refuses, with the sentence it refuses them with.
   *
   * It exists so the suite can drive the `failed` branch of an execution, which is
   * the branch where nothing is appended except a `payment_failed` carrying a
   * reason. A demo never sets it.
   */
  refuse?: Readonly<Record<string, string>>;
}

/** The default clave: SYN, so nothing reads it as a clave anybody filed at Banxico. */
export function syntheticClave(sequence: number): string {
  return `SYNVER${String(sequence).padStart(10, "0")}`;
}

/** The default clave of a payment. `SYNPAY`, for the same reason. */
export function syntheticPaymentClave(sequence: number): string {
  return `SYNPAY${String(sequence).padStart(10, "0")}`;
}

export class FakeRail implements PaymentRail {
  readonly rail: RailId;
  readonly describe = "in-process rail, nothing is sent (simulated)";

  /** Every request it was given, in order, so a test asserts what was asked. */
  readonly sent: CentRequest[] = [];
  /** Every payment order it was given, in order, for the same reason. */
  readonly dispersed: PaymentOrder[] = [];

  private readonly mint: (request: CentRequest, sequence: number) => string;
  private readonly mintPayment: (
    order: PaymentOrder,
    sequence: number,
  ) => string;
  private readonly refuse: Readonly<Record<string, string>>;
  private readonly now: () => string;
  private sequence = 0;
  private payments = 0;

  constructor(options: FakeRailOptions = {}) {
    this.rail = options.rail ?? "nessie";
    this.mint =
      options.mint ?? ((_request, sequence) => syntheticClave(sequence));
    this.mintPayment =
      options.mintPayment ??
      ((_order, sequence) => syntheticPaymentClave(sequence));
    this.refuse = options.refuse ?? {};
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

  /**
   * One line of the run, in process.
   *
   * `settled` and not `sent`, which is the one place this rail is allowed to claim
   * more than the Nessie one: there is no wire, so there is nothing left to wait on,
   * and the honesty lives where it always does in this class, in `simulated: true`
   * travelling onto every event. Nothing downstream may read a simulated settlement
   * as a transfer that posted, and that flag is what makes it impossible.
   */
  async send(order: PaymentOrder): Promise<PaymentSent> {
    const refusal = this.refuse[order.instructionId];
    if (refusal !== undefined) {
      throw new RailSendError(this.rail, refusal);
    }

    this.payments += 1;
    this.dispersed.push(order);

    return {
      rail: this.rail,
      state: "settled",
      claveRastreo: assertClaveRastreo(this.mintPayment(order, this.payments)),
      sentAt: this.now(),
      amount: assertPaymentAmount(order.amount),
      instructionId: order.instructionId,
      simulated: true,
    };
  }

  /** Already settled on the way out, so the answer restates it and adds nothing. */
  async confirm(sent: readonly PaymentSent[]): Promise<PaymentConfirmation[]> {
    const at = this.now();
    return sent.map((line) => ({
      instructionId: line.instructionId,
      state: "settled" as const,
      at,
      detail: "riel en proceso: nada salio y el movimiento es simulado",
    }));
  }
}

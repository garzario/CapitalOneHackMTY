/**
 * The production rail: STP, the SPEI participant an SMB can actually contract.
 *
 * This is the adapter that would make the one-cent probe a real SPEI transfer, so
 * that the CEP the pipeline then reads is a document Banxico signed. It is written
 * out in full, and it is written so that it cannot pretend: the constructor
 * refuses without `STP_*` configuration, there is no default host, no default
 * `empresa` and no default key, and nothing in this repository holds an STP
 * contract, so on every machine this code has ever run the constructor has thrown.
 *
 * Why STP and not a bank. SPEI is closed to anybody who is not a participant, and
 * the participants that sell API access to a small company are the electronic
 * payment institutions rather than the retail banks: STP (Sistema de Transferencias
 * y Pagos) is the one with a documented `registraOrden` endpoint, a sandbox, and a
 * price a SMB can sign. The product's regulatory position does not change with it:
 * the company keeps ordering its own transfers from its own account, and SentryOne
 * still decides nothing about the money it moves.
 *
 * ## What `registraOrden` is
 *
 * One JSON POST that registers a payment order. Signed per order: the fields are
 * concatenated into a pipe-delimited cadena original, the cadena is signed RSA with
 * SHA-256 using the private key of the certificate STP registered for the
 * `empresa`, and the base64 of that signature travels as `firma`. The response
 * carries the order `id` when it was accepted and a negative `id` with a
 * `descripcionError` when it was not.
 *
 * ## The honesty note, which belongs in the code and not only in a chat
 *
 * The field order of `CADENA_ORIGINAL_FIELDS`, the host in `STP_SANDBOX_BASE_URL`
 * and the response shape below are transcribed from STP's integration
 * documentation for `registraOrden`. NONE of it has been verified against a live
 * STP account from this repository, because we hold no `empresa` contract, and
 * this file says so rather than implying a test that never ran. What IS verified is
 * everything on our side of the wire: the cadena original is assembled and signed
 * in `stp.test.ts` against a key that test generates, byte for byte, and the
 * constructor's refusal is asserted there too.
 *
 * TODO(garzario): when an STP sandbox `empresa` exists, run one 0.01 order against
 * `STP_SANDBOX_BASE_URL`, paste the accepted `id` and the CEP's clave de rastreo
 * into the issue, and replace this note with the date it was verified.
 */

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ClabeInstitution, RailId } from "@hackmty/core";
import { BANXICO_INSTITUTION_SNAPSHOT, lookupInstitution } from "@hackmty/core";
import {
  assertClaveRastreo,
  assertNoIdentity,
  assertPaymentAmount,
  CENT_AMOUNT,
  CENT_DESCRIPTION,
  type CentRequest,
  type CentSent,
  claveRastreoFrom,
  PAYMENT_DESCRIPTION,
  type PaymentOrder,
  type PaymentRail,
  type PaymentSent,
  RailConfigError,
  RailSendError,
} from "./rail";

/**
 * STP's sandbox host, from its integration documentation. There is deliberately
 * no default: `STP_BASE_URL` has to be set, so nobody ever points a run at a host
 * this file guessed.
 */
export const STP_SANDBOX_BASE_URL = "https://demo.stpmex.com:7024/speiws/rest";

/** Path of the order registration, appended to the configured base URL. */
export const STP_REGISTRA_PATH = "/ordenPago/registra";

/** Clave SPEI of STP as a participant, which is what a CEP names as the bank. */
export const STP_SPEI_KEY = "90646";

/** Prefix of a clave de rastreo this rail mints. See `NESSIE_CLAVE_PREFIX`. */
export const STP_CLAVE_PREFIX = "STP";

/** `tipoCuenta` 40 is a CLABE. 3 is a debit card, 10 a telephone number. */
export const STP_ACCOUNT_TYPE_CLABE = 40;

/**
 * `tipoPago` 1 is a third-party transfer, which is what a supplier payment is.
 *
 * The probe is the same kind of movement as the payment it verifies. Sending the
 * cent as anything else would verify a different operation from the one that
 * follows it.
 */
export const STP_PAYMENT_TYPE_THIRD_PARTY = 1;

/**
 * The fields of the cadena original, in the order STP concatenates them.
 *
 * The string is `||` plus the values joined by `|` plus `||`, with an empty string
 * for every field the order does not carry. The order is the contract: a field in
 * the wrong place produces a signature STP rejects with no useful message, which is
 * why this is one named constant rather than a template literal inside a function.
 */
export const CADENA_ORIGINAL_FIELDS = [
  "institucionContraparte",
  "empresa",
  "fechaOperacion",
  "folioOrigen",
  "claveRastreo",
  "institucionOperante",
  "monto",
  "tipoPago",
  "tipoCuentaOrdenante",
  "nombreOrdenante",
  "cuentaOrdenante",
  "rfcCurpOrdenante",
  "tipoCuentaBeneficiario",
  "nombreBeneficiario",
  "cuentaBeneficiario",
  "rfcCurpBeneficiario",
  "emailBeneficiario",
  "tipoCuentaBeneficiario2",
  "nombreBeneficiario2",
  "cuentaBeneficiario2",
  "rfcCurpBeneficiario2",
  "conceptoPago",
  "conceptoPago2",
  "claveCatUsuario1",
  "claveCatUsuario2",
  "clavePago",
  "referenciaCobranza",
  "referenciaNumerica",
  "tipoOperacion",
  "topologia",
  "usuario",
  "medioEntrega",
  "prioridad",
  "iva",
] as const;

export type CadenaField = (typeof CADENA_ORIGINAL_FIELDS)[number];

/** The `registraOrden` body, as the fields this rail actually sends. */
export type StpOrder = Partial<Record<CadenaField, string | number>> & {
  claveRastreo: string;
  cuentaBeneficiario: string;
  monto: number;
  firma?: string;
};

/** What the endpoint answers. A negative `id` is a refusal, never an exception. */
export interface StpRegistraResponse {
  /** Order id when accepted. STP answers a negative number on a refusal. */
  id?: number | string;
  descripcionError?: string;
}

/** Everything this rail needs before it may exist. All of it, or none of it. */
export interface StpConfig {
  /** `STP_BASE_URL`, for example `STP_SANDBOX_BASE_URL`. No default. */
  baseUrl: string;
  /** `STP_EMPRESA`, the contracted name STP signs orders for. */
  empresa: string;
  /** `STP_CLABE_ORDENANTE`, the company's own CLABE at STP. */
  clabeOrdenante: string;
  /** PEM of the private key of the certificate STP registered for `empresa`. */
  privateKeyPem: string;
  /** Legal name of the company as the ordenante. */
  nombreOrdenante: string;
  /** RFC of the company. */
  rfcOrdenante: string;
}

export interface StpRailOptions {
  config: StpConfig;
  /** Defaults to the global `fetch`. A test passes a stub and stays offline. */
  http?: (input: string, init?: RequestInit) => Promise<Response>;
  now?: () => string;
  /**
   * The `referenciaNumerica`, up to seven digits, unique per day per empresa. It
   * is injected so a test asserts an exact cadena original instead of matching a
   * random number.
   */
  reference?: () => number;
}

function readEnv(name: string): string | undefined {
  const holder = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  const value = holder.process?.env?.[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

/**
 * The STP configuration out of the environment, or a sentence naming what is
 * missing.
 *
 * All of it or none of it, like `readVoiceConfig` next door: a base URL with no
 * `empresa`, or an `empresa` with no key, cannot sign an order, and reporting that
 * as a partial configuration sends somebody looking for a bug instead of for a
 * `.env`. The key is read off disk here so a server that cannot read it fails at
 * boot rather than on the first cent.
 */
export function readStpConfig(company?: {
  legalName: string;
  rfc: string;
}): StpConfig | undefined {
  const baseUrl = readEnv("STP_BASE_URL");
  const empresa = readEnv("STP_EMPRESA");
  const clabeOrdenante = readEnv("STP_CLABE_ORDENANTE");
  const keyPath = readEnv("STP_PRIVATE_KEY_PATH");

  if (
    baseUrl === undefined ||
    empresa === undefined ||
    clabeOrdenante === undefined ||
    keyPath === undefined ||
    company === undefined
  ) {
    return undefined;
  }

  return {
    baseUrl,
    empresa,
    clabeOrdenante,
    privateKeyPem: readFileSync(keyPath, "utf8"),
    nombreOrdenante: company.legalName,
    rfcOrdenante: company.rfc,
  };
}

/** What a caller is told when STP is asked for and not configured. */
export const STP_NOT_CONFIGURED =
  "RAIL=stp needs STP_BASE_URL, STP_EMPRESA, STP_CLABE_ORDENANTE and STP_PRIVATE_KEY_PATH, and a company record to name as the ordenante. See .env.example and packages/rail/README.md; nothing in this repository holds an STP contract, so this rail has never run live.";

export class StpRail implements PaymentRail {
  readonly rail: RailId = "stp";
  readonly describe = "STP, SPEI participant 90646 (production path)";

  private readonly config: StpConfig;
  private readonly http: (
    input: string,
    init?: RequestInit,
  ) => Promise<Response>;
  private readonly now: () => string;
  private readonly reference: () => number;

  /**
   * Refuses without configuration, which is the whole point of the class.
   *
   * A rail that constructed itself and then failed on the first cent would be a
   * rail the demo could accidentally select, and a `503` at that moment reads to a
   * judge as the feature not working rather than as the feature not being bought.
   */
  constructor(options: StpRailOptions) {
    const { config } = options;
    if (
      config === undefined ||
      config.baseUrl.trim() === "" ||
      config.empresa.trim() === "" ||
      config.clabeOrdenante.trim() === "" ||
      config.privateKeyPem.trim() === ""
    ) {
      throw new RailConfigError(STP_NOT_CONFIGURED);
    }

    this.config = config;
    this.http = options.http ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => new Date().toISOString());
    this.reference = options.reference ?? defaultReference;
  }

  async sendCent(request: CentRequest): Promise<CentSent> {
    const sentAt = this.now();
    const order = this.orderFor(request, sentAt);
    const id = await this.register(order);

    return {
      rail: "stp",
      claveRastreo: order.claveRastreo,
      sentAt,
      amount: CENT_AMOUNT,
      reference: id,
      senderSpeiKey: STP_SPEI_KEY,
      simulated: false,
    };
  }

  /**
   * One line of the payment run, as the same `registraOrden` with the
   * instruction's own amount.
   *
   * `sent` and never `settled`, and there is no `confirm` on this class. An order
   * STP accepted is an order STP accepted: the proof that the transfer happened is
   * the CEP Banxico publishes for its clave de rastreo, which the pipeline already
   * resolves through `packages/cep`, and asking STP to restate its own acceptance
   * would be the same claim twice wearing a different name. This is the rail that
   * produces a real CEP and that is where its settlement comes from.
   */
  async send(order: PaymentOrder): Promise<PaymentSent> {
    const sentAt = this.now();
    const amount = assertPaymentAmount(order.amount);
    const built = this.orderForPayment(order, sentAt, amount);
    const id = await this.register(built);

    return {
      rail: "stp",
      state: "sent",
      claveRastreo: built.claveRastreo,
      sentAt,
      amount,
      instructionId: order.instructionId,
      reference: id,
      senderSpeiKey: STP_SPEI_KEY,
      simulated: false,
    };
  }

  /** Signs the order, posts it, and answers the id STP accepted it under. */
  private async register(order: StpOrder): Promise<string> {
    const signed: StpOrder = { ...order, firma: this.sign(order) };

    const response = await this.http(
      `${this.config.baseUrl}${STP_REGISTRA_PATH}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(signed),
      },
    ).catch((cause: unknown) => {
      throw new RailSendError(
        "stp",
        `STP could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    });

    const body = (await response
      .json()
      .catch(() => null)) as StpRegistraResponse | null;
    const id = body?.id;
    const accepted =
      response.ok &&
      id !== undefined &&
      Number(id) > 0 &&
      Number.isFinite(Number(id));

    if (!accepted) {
      throw new RailSendError(
        "stp",
        `STP did not register the order (${String(id ?? response.status)}): ${body?.descripcionError ?? "no description"}`,
      );
    }

    return String(id);
  }

  /**
   * The order, field by field.
   *
   * The beneficiary name is deliberately empty. STP allows it and SPEI does not
   * validate it, and the whole reason this probe exists is that we do NOT know who
   * holds the account: sending the supplier's legal name in a field the receiving
   * bank ignores would put the answer we are asking for into the question.
   */
  orderFor(
    request: CentRequest,
    sentAt: string,
  ): StpOrder & { firma?: string } {
    const reference = this.reference();
    const clave = claveRastreoFrom(
      STP_CLAVE_PREFIX,
      `${request.instructionId}${reference}`,
    );

    return {
      institucionContraparte: speiKeyOfClabe(request.beneficiaryAccount),
      empresa: this.config.empresa,
      fechaOperacion: sentAt.slice(0, 10).replace(/-/g, ""),
      claveRastreo: assertClaveRastreo(clave),
      institucionOperante: STP_SPEI_KEY,
      monto: CENT_AMOUNT,
      tipoPago: STP_PAYMENT_TYPE_THIRD_PARTY,
      tipoCuentaOrdenante: STP_ACCOUNT_TYPE_CLABE,
      nombreOrdenante: this.config.nombreOrdenante,
      cuentaOrdenante: this.config.clabeOrdenante,
      rfcCurpOrdenante: this.config.rfcOrdenante,
      tipoCuentaBeneficiario: STP_ACCOUNT_TYPE_CLABE,
      nombreBeneficiario: "",
      cuentaBeneficiario: request.beneficiaryAccount,
      rfcCurpBeneficiario: "ND",
      conceptoPago: assertNoIdentity(CENT_DESCRIPTION),
      referenciaNumerica: reference,
    };
  }

  /**
   * The order of one payment of the run, field for field.
   *
   * Identical to the probe's except for `monto`, and that is ADR-0008 in one method:
   * the rail sends the amount the instruction carries to the account the instruction
   * names, and there is no field here a caller could use to say anything else.
   *
   * `nombreBeneficiario` stays empty for the payment too, and that is deliberate
   * rather than inherited. SPEI does not validate it and the receiving bank ignores
   * it; what ends up on the CEP is the holder the receiving bank knows, which is the
   * answer control 5 exists to read. Sending the supplier's legal name would put our
   * assumption into the document we are going to quote back as evidence.
   */
  orderForPayment(
    order: PaymentOrder,
    sentAt: string,
    amount: number,
  ): StpOrder & { firma?: string } {
    const reference = this.reference();
    const clave = claveRastreoFrom(
      STP_CLAVE_PREFIX,
      `${order.instructionId}${reference}`,
    );

    return {
      institucionContraparte: speiKeyOfClabe(order.beneficiaryAccount),
      empresa: this.config.empresa,
      fechaOperacion: sentAt.slice(0, 10).replace(/-/g, ""),
      claveRastreo: assertClaveRastreo(clave),
      institucionOperante: STP_SPEI_KEY,
      monto: amount,
      tipoPago: STP_PAYMENT_TYPE_THIRD_PARTY,
      tipoCuentaOrdenante: STP_ACCOUNT_TYPE_CLABE,
      nombreOrdenante: this.config.nombreOrdenante,
      cuentaOrdenante: this.config.clabeOrdenante,
      rfcCurpOrdenante: this.config.rfcOrdenante,
      tipoCuentaBeneficiario: STP_ACCOUNT_TYPE_CLABE,
      nombreBeneficiario: "",
      cuentaBeneficiario: order.beneficiaryAccount,
      rfcCurpBeneficiario: "ND",
      conceptoPago: assertNoIdentity(PAYMENT_DESCRIPTION),
      referenciaNumerica: reference,
    };
  }

  /** The cadena original of an order, exactly as STP concatenates it. */
  cadenaOriginal(order: StpOrder): string {
    const values = CADENA_ORIGINAL_FIELDS.map((field) => {
      const value = order[field];
      return value === undefined ? "" : String(value);
    });
    return `||${values.join("|")}||`;
  }

  /** RSA with SHA-256 over the cadena original, base64, as `firma`. */
  sign(order: StpOrder): string {
    const signer = createSign("RSA-SHA256");
    signer.update(this.cadenaOriginal(order), "utf8");
    return signer.sign(this.config.privateKeyPem, "base64");
  }
}

/**
 * `institucionContraparte`: the receiving participant's clave SPEI.
 *
 * The first three digits of a CLABE are the institution code, and the class prefix
 * in front of them is what makes a five-character clave SPEI: 40 banca multiple,
 * 37 banca de desarrollo, 90 every other participant. The catalogue in
 * `@hackmty/core` carries the kind, so the prefix is read off it rather than
 * assumed to be 40.
 *
 * An institution the snapshot does not carry, and Banxico itself, throw instead of
 * being guessed: a clave SPEI this file invented would be an order sent to a
 * participant nobody chose. `unknown_institution` is already the soft signal the
 * CLABE control raises for the same case, and it asks a person to look.
 */
export function speiKeyOfClabe(clabe: string): string {
  const code = clabe.replace(/\D+/g, "").slice(0, 3);
  const institution = code.length === 3 ? lookupInstitution(code) : undefined;
  const prefix =
    institution === undefined ? undefined : SPEI_CLASS_PREFIX[institution.kind];

  if (prefix === undefined) {
    throw new RailConfigError(
      `${clabe.slice(0, 3)} is not an institution in the Banxico snapshot of ${BANXICO_INSTITUTION_SNAPSHOT.fetchedAt} that this rail can name as a counterparty, so the order is not built`,
    );
  }
  return `${prefix}${code}`;
}

/**
 * Class prefix of a clave SPEI, per the catalogue's own note on the five-character
 * participant keys. Banxico's own key is absent because the snapshot does not
 * publish it, and a payment order is not the place to guess one.
 */
const SPEI_CLASS_PREFIX: Readonly<
  Partial<Record<ClabeInstitution["kind"], string>>
> = {
  banca_multiple: "40",
  banca_desarrollo: "37",
  otros_participantes: "90",
};

/** Up to seven digits, unique enough per day. Injected in a test. */
function defaultReference(): number {
  return Number(String(Date.now()).slice(-7));
}

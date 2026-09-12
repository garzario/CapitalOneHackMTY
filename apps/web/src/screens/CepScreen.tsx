/**
 * The CEP viewer and the registry of verified beneficiaries.
 *
 * A CEP is the strongest evidence in the whole product: Banxico signs it, the
 * signature validates offline against their certificate, and it names the
 * account holder. So the screen shows three things next to each other and
 * nothing else: the fields, whether the signature validated, and how the holder
 * name compares with the legal name on the supplier's CFDI.
 *
 * The tracking key is shown in full on purpose, so a judge can re-verify the
 * transfer on the Banxico portal instead of believing this page.
 */

import type { Finding } from "@hackmty/core";
import { useCallback, useState } from "react";
import {
  Amount,
  Field,
  SectionHeader,
  SyntheticMark,
} from "../components/Primitives";
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  SourceNotice,
} from "../components/States";
import { getBeneficiaries, verifyCep } from "../lib/api";
import type { CepVerification, NameMatch } from "../lib/contract";
import { formatClabe, formatDate, formatDateTime } from "../lib/format";
import { NAME_MATCH_BADGE, NAME_MATCH_LABEL } from "../lib/labels";
import { BENEFICIARIES, MOCK_CEP, SUPPLIERS } from "../lib/mock";
import { useResource } from "../lib/resource";

/** The public portal where a CEP can be verified by hand. */
const BANXICO_CEP_URL = "https://www.banxico.org.mx/cep/";

function registryFallback() {
  return { items: BENEFICIARIES };
}

/**
 * The legal name to compare against. The detector puts it in the evidence; when
 * it is not there, the synthetic supplier list is the only other place it lives
 * in the browser.
 */
function legalNameFor(rfc: string, finding: Finding | null): string | null {
  const fromEvidence = finding?.evidence.razon_social_cfdi;

  if (typeof fromEvidence === "string") {
    return fromEvidence;
  }

  return SUPPLIERS.find((item) => item.rfc === rfc)?.legalName ?? null;
}

type VerifyState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "done"; result: CepVerification; rfc: string }
  | { status: "failed"; message: string };

/** The example the screen shows before anything has been verified. */
const EXAMPLE: CepVerification = {
  cep: MOCK_CEP,
  nameMatch: "match",
  finding: {
    id: "fnd-example-cep",
    detector: "beneficiary_cep",
    severity: "info",
    state: "comprobable",
    subject: { kind: "supplier", id: "SYN070707GGG" },
    amountAtRisk: 0,
    explanation:
      "El titular de la cuenta en el CEP firmado coincide con la razon social del CFDI.",
    evidence: {
      razon_social_cfdi: MOCK_CEP.beneficiaryName,
      firma_valida: MOCK_CEP.signatureValid,
    },
    createdAt: MOCK_CEP.transferredAt,
  },
};

export function CepScreen() {
  const loadRegistry = useCallback(
    (signal: AbortSignal) => getBeneficiaries({ signal }),
    [],
  );
  const { resource: registry, reload: reloadRegistry } = useResource(
    loadRegistry,
    { fallback: registryFallback },
  );

  const [claveRastreo, setClaveRastreo] = useState("");
  const [supplierRfc, setSupplierRfc] = useState("");
  const [xml, setXml] = useState("");
  const [state, setState] = useState<VerifyState>({ status: "idle" });

  const onVerify = useCallback(async () => {
    const rfc = supplierRfc.trim().toUpperCase();

    if (rfc === "") {
      setState({
        status: "failed",
        message: "Falta el RFC del proveedor con el que se compara el titular.",
      });

      return;
    }

    setState({ status: "sending" });

    /* Two ways in, same answer: the tracking key, which the API resolves against
       Banxico, or the signed XML pasted by hand when the network is hostile. */
    const result =
      xml.trim() === ""
        ? await verifyCep({
            claveRastreo: claveRastreo.trim(),
            date: new Date().toISOString().slice(0, 10),
            amount: 0.01,
            senderBank: "",
            beneficiaryBank: "",
            beneficiaryAccount: "",
            supplierRfc: rfc,
          })
        : await verifyCep({ xml: xml.trim(), supplierRfc: rfc });

    setState(
      result.ok
        ? { status: "done", result: result.data, rfc }
        : { status: "failed", message: result.error.message },
    );
  }, [claveRastreo, supplierRfc, xml]);

  const shown = state.status === "done" ? state.result : EXAMPLE;
  const shownRfc = state.status === "done" ? state.rfc : "SYN070707GGG";
  const isExample = state.status !== "done";
  const legalName = legalNameFor(shownRfc, shown.finding);

  return (
    <>
      <SectionHeader
        title="Comprobante Electronico de Pago"
        description="Se manda un SPEI de un centavo desde el banco de la empresa, se trae el CEP que firma Banxico y se compara el titular de la cuenta con la razon social del CFDI. La cuenta queda en el registro de beneficiarios verificados."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] [&>*]:min-w-0">
        <div className="flex flex-col gap-5">
          <section
            aria-labelledby="verify-heading"
            className="panel flex flex-col gap-4 p-5"
          >
            <h2 id="verify-heading" className="t-lg">
              Verificar un beneficiario
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="cep-clave">
                  Clave de rastreo
                </label>
                <input
                  id="cep-clave"
                  className="input code"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="CEP20260902SYN0707"
                  value={claveRastreo}
                  onChange={(event) => setClaveRastreo(event.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="cep-rfc">
                  RFC del proveedor
                </label>
                <input
                  id="cep-rfc"
                  className="input code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="SYN070707GGG"
                  value={supplierRfc}
                  onChange={(event) => setSupplierRfc(event.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="cep-xml">
                O pega el XML firmado
              </label>
              <textarea
                id="cep-xml"
                className="textarea code"
                spellCheck={false}
                placeholder="&lt;?xml version=&quot;1.0&quot;?&gt;"
                value={xml}
                onChange={(event) => setXml(event.target.value)}
              />
              <p className="subtle t-xs">
                El XML se guarda byte por byte, porque la firma valida los bytes
                y no una reserializacion.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-accent btn-lg"
              aria-busy={state.status === "sending"}
              disabled={state.status === "sending"}
              onClick={() => {
                void onVerify();
              }}
            >
              {state.status === "sending" ? "Verificando" : "Verificar"}
            </button>

            {state.status === "failed" ? (
              <ErrorBlock
                title="No se pudo verificar"
                message={state.message}
                onRetry={() => {
                  void onVerify();
                }}
              />
            ) : null}
          </section>

          <section
            aria-labelledby="cep-heading"
            className={`panel flex flex-col gap-4 p-5 ${isExample ? "watermark-tile" : ""}`.trim()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 id="cep-heading" className="t-lg">
                {isExample ? "Ejemplo de un CEP" : "CEP verificado"}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <SyntheticMark when={shown.cep.synthetic} />
                <span
                  className={
                    shown.cep.signatureValid
                      ? "badge badge-release"
                      : "badge badge-verify"
                  }
                >
                  {shown.cep.signatureValid
                    ? "Firma valida"
                    : "Firma sin verificar"}
                </span>
              </div>
            </div>

            {isExample ? (
              <p className="subtle t-xs">
                Asi se ve la respuesta. Verifica una clave de rastreo para ver
                la tuya.
              </p>
            ) : null}

            <NameComparison
              nameMatch={shown.nameMatch}
              holder={shown.cep.beneficiaryName}
              legalName={legalName}
            />

            <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Clave de rastreo">
                <span className="code">{shown.cep.claveRastreo}</span>
              </Field>
              <Field label="Fecha de la transferencia">
                {formatDateTime(shown.cep.transferredAt)}
              </Field>
              <Field label="Importe">
                <Amount value={shown.cep.amount} />
              </Field>
              <Field label="Cuenta del beneficiario">
                <span className="code">
                  {formatClabe(shown.cep.beneficiaryAccount)}
                </span>
              </Field>
              <Field label="Banco ordenante">{shown.cep.senderBank}</Field>
              <Field label="Banco beneficiario">
                {shown.cep.beneficiaryBank}
              </Field>
              <Field label="Ordenante">{shown.cep.senderName}</Field>
              <Field label="Titular del beneficiario">
                {shown.cep.beneficiaryName}
              </Field>
            </dl>

            <p className="t-sm">
              <a
                href={BANXICO_CEP_URL}
                target="_blank"
                rel="noreferrer noopener"
              >
                Verificar este CEP en banxico.org.mx
              </a>
            </p>
            {/* TODO(fabbyyyy): confirm the exact query parameters the portal
                takes so the link can arrive prefilled with the tracking key,
                the date and the amount. */}
            <p className="subtle t-xs">
              El enlace abre el portal. Llenarlo con la clave de rastreo de
              arriba esta pendiente de confirmar.
            </p>
          </section>
        </div>

        <section
          aria-labelledby="registry-heading"
          className="panel flex h-fit flex-col gap-3 p-5"
        >
          <h2 id="registry-heading" className="eyebrow">
            Beneficiarios verificados
          </h2>

          {registry.status === "loading" ? (
            <LoadingBlock label="Cargando el registro" rows={3} />
          ) : null}

          {registry.status === "error" ? (
            <ErrorBlock message={registry.message} onRetry={reloadRegistry} />
          ) : null}

          {registry.status === "ready" ? (
            <>
              <SourceNotice notice={registry.notice} />
              {registry.data.items.length === 0 ? (
                <EmptyBlock
                  title="Registro vacio"
                  description="Ninguna cuenta se ha verificado con un CEP todavia. La primera verificacion crea el registro."
                />
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {registry.data.items.map((item) => (
                    <li
                      key={`${item.supplierRfc}-${item.clabe}`}
                      className="panel-sunken flex flex-col gap-1 p-3"
                    >
                      <span className="code">{item.supplierRfc}</span>
                      <span className="code muted t-xs">
                        {formatClabe(item.clabe)}
                      </span>
                      <span className="subtle t-xs">
                        verificada el {formatDate(item.verifiedAt)}, clave{" "}
                        {item.cep.claveRastreo}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </section>
      </div>
    </>
  );
}

function NameComparison({
  nameMatch,
  holder,
  legalName,
}: {
  nameMatch: NameMatch;
  holder: string;
  legalName: string | null;
}) {
  return (
    <div className="panel-sunken flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">Comparacion de nombre</span>
        <span className={NAME_MATCH_BADGE[nameMatch]}>
          {NAME_MATCH_LABEL[nameMatch]}
        </span>
      </div>
      <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Titular en el CEP">{holder}</Field>
        <Field label="Razon social en el CFDI">
          {legalName ?? <span className="muted">no disponible</span>}
        </Field>
      </dl>
    </div>
  );
}

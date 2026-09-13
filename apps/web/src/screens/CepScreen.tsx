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
import { Amount, Field, SyntheticMark } from "../components/Primitives";
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  SourceNotice,
} from "../components/States";
import { NameComparison, VerifyAccountPanel } from "../components/Verification";
import { getBeneficiaries, verifyCep } from "../lib/api";
import {
  BANXICO_CEP_URL,
  portalClipboardText,
  portalFields,
} from "../lib/cep-portal";
import { sealVerdict } from "../lib/cep-seal";
import type { CepVerification, VerifiedBeneficiary } from "../lib/contract";
import { readLegalName } from "../lib/evidence";
import { formatClabe, formatDate, formatDateTime } from "../lib/format";
import {
  BENEFICIARIES,
  CEP_EXAMPLE_RFC,
  mockCepVerification,
  SUPPLIERS,
} from "../lib/mock";
import { useResource } from "../lib/resource";
import { useRouteQuery } from "../lib/router";

function registryFallback() {
  return { items: BENEFICIARIES };
}

/**
 * The legal name to compare against. The detector puts it in the evidence, under
 * whichever of the three vocabularies wrote the finding; when it is not there at
 * all, the synthetic supplier list is the only other place it lives in the
 * browser.
 */
function legalNameFor(rfc: string, finding: Finding | null): string | null {
  return (
    readLegalName(finding) ??
    SUPPLIERS.find((item) => item.rfc === rfc)?.legalName ??
    null
  );
}

type VerifyState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "done"; result: CepVerification; rfc: string }
  | { status: "failed"; message: string };

/**
 * The example the screen shows before anything has been verified.
 *
 * It is the answer `POST /api/v1/cep/verify` gives for the one-cent probe on the
 * released line of the synthetic run, finding and all, rather than a
 * `CepVerification` written here. The one this screen used to carry claimed
 * `comprobable` over a seal nobody had checked, which is the single claim the
 * sixth control refuses to make: `buildFinding` in `@hackmty/engine` is only
 * allowed to say `comprobable` when the seal validated.
 */
const EXAMPLE: CepVerification = mockCepVerification();

export function CepScreen() {
  /* Two ways to arrive, and this screen answers both. A beneficiary finding
     links here with the supplier it is about, which fills the field and stops
     there: the verification is a request against Banxico and a person decides
     when it goes. The instruction detail links here with the folio, and then
     the panel loads itself so nobody retypes an id in front of a judge. The key
     remounts the panel when that link changes, which is what resets its state. */
  const query = useRouteQuery();
  const prefilledRfc = query.get("rfc") ?? "";
  const fromLink = query.get("instruction") ?? "";

  const loadRegistry = useCallback(
    (signal: AbortSignal) => getBeneficiaries({ signal }),
    [],
  );
  const { resource: registry, reload: reloadRegistry } = useResource(
    loadRegistry,
    { fallback: registryFallback },
  );

  const [claveRastreo, setClaveRastreo] = useState("");
  const [supplierRfc, setSupplierRfc] = useState(prefilledRfc);
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
  const shownRfc = state.status === "done" ? state.rfc : CEP_EXAMPLE_RFC;
  const isExample = state.status !== "done";
  const legalName = legalNameFor(shownRfc, shown.finding);
  const seal = sealVerdict(shown.cep.signatureValid, shown.cep.signatureReason);

  return (
    <>
      {/* The top bar carries the page's name, so this is the sentence under it
          and not a second title. The cent, the clave, the seal and the holder,
          in the order they happen. */}
      <p className="muted max-w-prose t-sm">
        Un SPEI de un centavo viaja en la misma corrida que el pago grande, el
        banco devuelve la clave de rastreo y Banxico firma el CEP que dice a
        nombre de quien esta la cuenta. Se compara con la razon social del CFDI,
        y la cuenta queda en el registro de beneficiarios verificados.
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] [&>*]:min-w-0">
        <div className="flex flex-col gap-5">
          <VerifyAccountPanel
            key={fromLink}
            instructionId={fromLink}
            onCepStored={reloadRegistry}
          />

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
                  placeholder={CEP_EXAMPLE_RFC}
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
                <span className={seal.badge}>{seal.label}</span>
              </div>
            </div>

            {isExample ? (
              <p className="subtle t-xs">
                Asi se ve la respuesta. Verifica una clave de rastreo para ver
                la tuya.
              </p>
            ) : null}

            {/* Three states and not two. "No verificada" and "no valida" are
                different claims about a Banxico seal, and only one of them is
                ours to make. src/lib/cep-seal.ts holds the wording. */}
            <p className="panel-sunken muted m-0 p-3 t-xs">{seal.detail}</p>

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

            <PortalHandoff cep={shown.cep} />
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
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {groupBySupplier(registry.data.items).map((group) => (
                    <li
                      key={group.supplierRfc}
                      className="panel-sunken flex flex-col gap-2 p-3"
                    >
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="code">{group.supplierRfc}</span>
                        <span className="subtle t-xs">
                          {group.accounts.length === 1
                            ? "1 cuenta verificada"
                            : `${group.accounts.length} cuentas verificadas`}
                        </span>
                      </span>
                      <ul className="m-0 flex list-none flex-col gap-1 p-0">
                        {group.accounts.map((item) => (
                          <li key={item.clabe} className="flex flex-col">
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

/**
 * The registry, one entry per supplier rather than one per account.
 *
 * A supplier with three verified accounts is the interesting row: it is the
 * history that makes a fourth account a question. A flat list of accounts
 * hides exactly that, because the same RFC appears three times and reads as
 * three suppliers at a glance.
 *
 * Newest verification first inside each supplier, and suppliers ordered by
 * their own newest, so the account verified during the demo is at the top.
 */
export function groupBySupplier(
  items: readonly VerifiedBeneficiary[],
): Array<{ supplierRfc: string; accounts: VerifiedBeneficiary[] }> {
  const byRfc = new Map<string, VerifiedBeneficiary[]>();

  for (const item of items) {
    const rows = byRfc.get(item.supplierRfc);
    if (rows === undefined) {
      byRfc.set(item.supplierRfc, [item]);
      continue;
    }
    rows.push(item);
  }

  const groups = [...byRfc.entries()].map(([supplierRfc, accounts]) => ({
    supplierRfc,
    accounts: [...accounts].sort((left, right) =>
      right.verifiedAt.localeCompare(left.verifiedAt),
    ),
  }));

  return groups.sort((left, right) => {
    const leftAt = left.accounts[0]?.verifiedAt ?? "";
    const rightAt = right.accounts[0]?.verifiedAt ?? "";
    return rightAt.localeCompare(leftAt);
  });
}

/**
 * The handoff to Banxico.
 *
 * The portal takes a POST form and a session, so no link can arrive prefilled.
 * Rather than a bare link and an apology, the six values it asks for are on
 * screen in its own order and its own date format, with one button that puts
 * them on the clipboard. The judge checks the transfer against Banxico instead
 * of against this page, which is the whole reason a CEP is worth showing.
 */
function PortalHandoff({ cep }: { cep: CepVerification["cep"] }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="panel-sunken flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">Revisalo en Banxico</span>
        <a href={BANXICO_CEP_URL} target="_blank" rel="noreferrer noopener">
          Abrir el portal
        </a>
      </div>

      <p className="subtle m-0 t-xs">
        El portal pide los datos en un formulario, no en la direccion, asi que
        no hay enlace que llegue lleno. Estos son los valores, en su orden.
      </p>

      <dl className="m-0 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {portalFields(cep).map((field) => (
          <Field key={field.label} label={field.label}>
            <span className="code">{field.value}</span>
          </Field>
        ))}
      </dl>

      <button
        type="button"
        className="btn"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(portalClipboardText(cep))
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
      >
        {copied ? "Copiado" : "Copiar los datos"}
      </button>
    </div>
  );
}

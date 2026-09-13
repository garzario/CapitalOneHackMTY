/**
 * Intake, for a phone held in one hand.
 *
 * This is the page behind the QR code: a judge scans it, pastes the message a
 * supplier sent or photographs the CLABE on a printed invoice, and the decision
 * comes back on their own screen. It is also the honest part of the demo, since
 * the instruction they create is the one that appears on the big screen through
 * the event stream.
 *
 * Single column, large touch targets, 16px inputs so iOS Safari does not zoom.
 */

import type { InstructionSource } from "@hackmty/core";
import type { FormEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { FindingPanel } from "../components/Findings";
import {
  Amount,
  DecisionBadge,
  SectionHeader,
  SyntheticMark,
} from "../components/Primitives";
import { EmptyBlock, ErrorBlock } from "../components/States";
import { createInstruction } from "../lib/api";
import type { InstructionDetail } from "../lib/contract";
import { formatMoney } from "../lib/format";
import { SOURCE_LABEL } from "../lib/labels";
import { EXAMPLE_SUPPLIER_RFC, mockIntakeExample } from "../lib/mock";
import { useRouteQuery } from "../lib/router";

const SOURCES: InstructionSource[] = [
  "whatsapp",
  "email",
  "pdf",
  "portal",
  "manual",
];

/** A phone photograph is a megabyte or three. Anything past this is a mistake. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** The API takes bare base64, so the data URL prefix comes off here. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");

      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

type Submission =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "done"; detail: InstructionDetail }
  | { status: "failed"; message: string };

export function IntakeScreen() {
  const query = useRouteQuery();
  const [supplierRfc, setSupplierRfc] = useState(query.get("rfc") ?? "");
  const [amount, setAmount] = useState(query.get("amount") ?? "");
  const [clabe, setClabe] = useState(query.get("clabe") ?? "");
  const [source, setSource] = useState<InstructionSource>("whatsapp");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submission, setSubmission] = useState<Submission>({ status: "idle" });
  const [showExample, setShowExample] = useState(false);

  /** The layout of the answer, for a reviewer working without a backend. */
  const example = useMemo(() => mockIntakeExample(), []);

  const parsedAmount = Number(amount.replace(/[^\d.]/g, ""));
  const amountIsValid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!amountIsValid) {
        setSubmission({
          status: "failed",
          message: "El importe tiene que ser un numero mayor que cero.",
        });

        return;
      }

      if (file && file.size > MAX_IMAGE_BYTES) {
        setSubmission({
          status: "failed",
          message: "La foto pesa mas de 4 MB. Toma otra con menos resolucion.",
        });

        return;
      }

      setSubmission({ status: "sending" });

      let image: string | undefined;

      if (file) {
        try {
          image = await readAsBase64(file);
        } catch {
          setSubmission({
            status: "failed",
            message: "No se pudo leer la imagen en este navegador.",
          });

          return;
        }
      }

      const result = await createInstruction({
        amount: parsedAmount,
        source,
        ...(supplierRfc.trim() === ""
          ? {}
          : { supplierRfc: supplierRfc.trim().toUpperCase() }),
        ...(clabe.trim() === "" ? {} : { clabe: clabe.replace(/\D/g, "") }),
        ...(text.trim() === "" ? {} : { text: text.trim() }),
        ...(image === undefined ? {} : { image }),
      });

      setSubmission(
        result.ok
          ? { status: "done", detail: result.data }
          : { status: "failed", message: result.error.message },
      );
    },
    [amountIsValid, clabe, file, parsedAmount, source, supplierRfc, text],
  );

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <SectionHeader
        title="Alta de una instruccion"
        description="Pega el mensaje que llego o toma una foto de la CLABE. Se corren los seis detectores y la decision aparece aqui y en la pantalla de la corrida."
      />

      <form className="panel flex flex-col gap-4 p-5" onSubmit={onSubmit}>
        <div>
          <label className="label" htmlFor="intake-amount">
            Importe en pesos
          </label>
          <input
            id="intake-amount"
            className="input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="184300.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
          {amount !== "" && !amountIsValid ? (
            <p className="t-xs" style={{ color: "var(--c-hold-ink)" }}>
              Solo numeros y un punto decimal.
            </p>
          ) : null}
          {amountIsValid ? (
            <p className="subtle t-xs">{formatMoney(parsedAmount)}</p>
          ) : null}
        </div>

        <div>
          <label className="label" htmlFor="intake-source">
            Como llego
          </label>
          <select
            id="intake-source"
            className="input"
            value={source}
            onChange={(event) =>
              setSource(event.target.value as InstructionSource)
            }
          >
            {SOURCES.map((item) => (
              <option key={item} value={item}>
                {SOURCE_LABEL[item]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="intake-rfc">
            RFC del proveedor, si lo traes
          </label>
          <input
            id="intake-rfc"
            className="input code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={EXAMPLE_SUPPLIER_RFC}
            value={supplierRfc}
            onChange={(event) => setSupplierRfc(event.target.value)}
          />
          <p className="subtle t-xs">
            Usa un RFC sintetico. Los RFC reales solo se consultan en la
            pantalla de la lista 69-B.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="intake-clabe">
            CLABE, si viene escrita
          </label>
          <input
            id="intake-clabe"
            className="input code"
            inputMode="numeric"
            autoComplete="off"
            placeholder="18 digitos"
            value={clabe}
            onChange={(event) => setClabe(event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="intake-text">
            Mensaje recibido
          </label>
          <textarea
            id="intake-text"
            className="textarea"
            placeholder="Buenas tardes, cambiamos de cuenta. Favor de depositar a la CLABE..."
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="intake-photo">
            O toma una foto de la CLABE
          </label>
          <input
            id="intake-photo"
            className="input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p className="subtle t-xs">
            La CLABE se extrae de la imagen y se guarda con la confianza del
            OCR. Maximo 4 MB.
          </p>
        </div>

        {/* Pinned to the bottom of the viewport on a phone, where this page is
            actually used: the judge is holding the invoice in the other hand
            and the button used to be five fields below the fold. Static again
            above the small breakpoint, where the form fits and a fixed bar is
            just a bar in the way. */}
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-accent btn-lg w-full"
            aria-busy={submission.status === "sending"}
            disabled={submission.status === "sending"}
          >
            {submission.status === "sending" ? "Revisando" : "Revisar el pago"}
          </button>
        </div>
      </form>

      {submission.status === "sending" ? (
        <p role="status" className="panel-sunken muted px-4 py-2 t-sm">
          Corriendo los seis controles sobre esta instruccion.
        </p>
      ) : null}

      {submission.status === "failed" ? (
        <div className="panel">
          <ErrorBlock
            title="No se registro la instruccion"
            message={`${submission.message} Los datos del formulario siguen aqui, se puede reintentar.`}
            onRetry={() => setSubmission({ status: "idle" })}
          />
        </div>
      ) : null}

      {submission.status === "done" ? (
        <section aria-label="Resultado" className="flex flex-col gap-4">
          <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="flex flex-col">
              <span className="eyebrow">Decision</span>
              <DecisionBadge action={submission.detail.decision.action} />
            </div>
            <Amount value={submission.detail.instruction.amount} size="xl" />
            <SyntheticMark when={submission.detail.instruction.synthetic} />
          </div>
          {submission.detail.findings.length === 0 ? (
            <div className="panel">
              <EmptyBlock
                title="Sin hallazgos"
                description="Los seis controles corrieron sobre esta instruccion y ninguno encontro nada que revisar. Ya aparece en la corrida de esta semana."
              />
            </div>
          ) : (
            submission.detail.findings.map((finding) => (
              <FindingPanel
                key={finding.id}
                finding={finding}
                proposedClabe={submission.detail.instruction.clabe}
              />
            ))
          )}
        </section>
      ) : null}

      {submission.status === "idle" && example ? (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            className="btn"
            aria-expanded={showExample}
            onClick={() => setShowExample((value) => !value)}
          >
            {showExample ? "Ocultar el ejemplo" : "Ver como se ve el resultado"}
          </button>
          {showExample ? (
            <div className="watermark-tile flex flex-col gap-3">
              <p className="subtle t-xs">
                Ejemplo con datos sinteticos, no es el resultado de este
                formulario.
              </p>
              {example.findings.map((finding) => (
                <FindingPanel
                  key={finding.id}
                  finding={finding}
                  proposedClabe={example.instruction.clabe}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

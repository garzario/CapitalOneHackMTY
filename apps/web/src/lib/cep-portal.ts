/**
 * What a judge has to type into the Banxico portal to check a CEP themselves.
 *
 * The portal at banxico.org.mx/cep takes a POST form and a session, so there
 * is no query string that arrives prefilled: a link can open the page and
 * nothing more. That was left as an open TODO on the screen, which in practice
 * meant a judge was told to go and verify without being told with what.
 *
 * So instead of a link that pretends, the screen prints the exact field values
 * the portal asks for, in the portal's own order and in its own date format.
 * The judge copies six values into six boxes and gets an answer from Banxico
 * that has nothing to do with us, which is the entire point of showing a CEP
 * at all.
 *
 * The field names come from `buildValidaForm` in `packages/cep`, which is the
 * form our own fetch posts, so the two cannot drift apart without a test
 * noticing.
 */

import type { Cep } from "@hackmty/core";

export const BANXICO_CEP_URL = "https://www.banxico.org.mx/cep/";

export interface PortalField {
  /** The label as the portal spells it. */
  label: string;
  value: string;
}

/** `2026-09-09T15:00:00.000Z` becomes `09-09-2026`, which is what the form takes. */
export function portalDate(instant: string): string {
  const day = instant.slice(0, 10);
  const [year, month, date] = day.split("-");

  if (year === undefined || month === undefined || date === undefined) {
    return day;
  }

  return `${date}-${month}-${year}`;
}

/** The six values, in the order the portal asks for them. */
export function portalFields(cep: Cep): PortalField[] {
  return [
    { label: "Fecha", value: portalDate(cep.transferredAt) },
    { label: "Criterio de busqueda", value: "Clave de rastreo" },
    { label: "Clave de rastreo", value: cep.claveRastreo },
    { label: "Banco emisor", value: cep.senderBank },
    { label: "Banco receptor", value: cep.beneficiaryBank },
    { label: "Cuenta beneficiaria", value: cep.beneficiaryAccount },
    { label: "Monto", value: cep.amount.toFixed(2) },
  ];
}

/** The same values as one block, for the copy button. */
export function portalClipboardText(cep: Cep): string {
  return portalFields(cep)
    .map((field) => `${field.label}: ${field.value}`)
    .join("\n");
}

/**
 * Fiscal document fixtures, all of them invented.
 *
 * Three rules hold for every file in this folder, and they are the reason a judge
 * can be handed the repository without a disclaimer.
 *
 * 1. **No real taxpayer.** Every RFC starts with SY and matches nobody. The
 *    documents are a coherent story between one synthetic supplier,
 *    SYN010101AAA, and one synthetic buyer, SYN950505BB2.
 * 2. **Parsed with `synthetic: true`.** The flag lives on the domain record, not
 *    on the XML, so a caller has to say out loud that this is generated data.
 *    Renaming the supplier cannot turn a fixture into real evidence.
 * 3. **No real signature.** `Sello`, `Certificado` and `SelloSAT` are obvious
 *    placeholders, never truncated copies of a real stamp.
 *
 * These are the documents the parser tests read, and they are also what the
 * seeder and the demo start from, so a change here is a change to the demo.
 */

export { CFDI_INGRESO_PPD_XML } from "./cfdi-ingreso-ppd";
export { CFDI_INGRESO_PUE_XML } from "./cfdi-ingreso-pue";
export { PAGO_COMPLEMENTO_XML } from "./pago-complemento";

/** What every fixture must be parsed with. Passing this is the watermark. */
export const SYNTHETIC_PARSE_OPTIONS = { synthetic: true } as const;

/**
 * Banxico participant catalogue, which is what the first three digits of a CLABE
 * encode.
 *
 * THIS IS A SNAPSHOT, NOT A FEED. It is a copy taken at one instant from the
 * catalogue Banxico serves to its own CEP viewer:
 *
 *   https://www.banxico.org.mx/cep/instituciones.do?fecha=11-09-2026
 *
 * That endpoint answers with five-character SPEI participant keys. The leading
 * characters are the participant class, "40" banca multiple, "37" banca de
 * desarrollo, "90" every other participant (SOFIPO, IFPE, casa de bolsa), and
 * "2" for Banxico itself. The last three characters are the institution code
 * that opens a CLABE, and that is what this table is keyed by.
 *
 * TODO(garzario): re-fetch the URL above and diff it before the demo, and again
 * before any release. Participants are added, renamed and merged continuously.
 * A code missing from this file is therefore reported as `unknown_institution`,
 * a soft signal that asks a person to look, and never as an invalid CLABE. The
 * check digit is arithmetic and cannot go stale; this table can, so the detector
 * is built so that the half which can go stale is only ever allowed to ask a
 * question.
 */

/** Participant class, taken from the prefix of the SPEI key. */
export type InstitutionKind =
  | "banca_multiple"
  | "banca_desarrollo"
  | "otros_participantes"
  | "banco_central";

export interface ClabeInstitution {
  /** Three digits, positions 1 to 3 of a CLABE. */
  code: string;
  /** Short name exactly as Banxico publishes it, casing included. */
  name: string;
  kind: InstitutionKind;
}

/** Provenance of the table below, so anyone can re-run the fetch themselves. */
export const BANXICO_INSTITUTION_SNAPSHOT = {
  source: "https://www.banxico.org.mx/cep/instituciones.do",
  /** Value of the `fecha` query parameter, in the format the endpoint demands. */
  operatingDate: "11-09-2026",
  fetchedAt: "2026-09-12",
  rows: 97,
} as const;

/** Institution code to participant. Keys are the three digits, zero padded. */
export const BANXICO_INSTITUTIONS: Readonly<Record<string, ClabeInstitution>> =
  {
    "001": { code: "001", name: "BANXICO", kind: "banco_central" },
    "002": { code: "002", name: "BANAMEX", kind: "banca_multiple" },
    "006": { code: "006", name: "BANCOMEXT", kind: "banca_desarrollo" },
    "009": { code: "009", name: "BANOBRAS", kind: "banca_desarrollo" },
    "012": { code: "012", name: "BBVA MEXICO", kind: "banca_multiple" },
    "014": { code: "014", name: "SANTANDER", kind: "banca_multiple" },
    "019": { code: "019", name: "BANJERCITO", kind: "banca_desarrollo" },
    "021": { code: "021", name: "HSBC", kind: "banca_multiple" },
    "030": { code: "030", name: "BAJIO", kind: "banca_multiple" },
    "036": { code: "036", name: "INBURSA", kind: "banca_multiple" },
    "042": { code: "042", name: "MIFEL", kind: "banca_multiple" },
    "044": { code: "044", name: "SCOTIABANK", kind: "banca_multiple" },
    "058": { code: "058", name: "BANREGIO", kind: "banca_multiple" },
    "059": { code: "059", name: "INVEX", kind: "banca_multiple" },
    "060": { code: "060", name: "BANSI", kind: "banca_multiple" },
    "062": { code: "062", name: "AFIRME", kind: "banca_multiple" },
    "072": { code: "072", name: "BANORTE", kind: "banca_multiple" },
    "106": { code: "106", name: "BANK OF AMERICA", kind: "banca_multiple" },
    "108": { code: "108", name: "MUFG", kind: "banca_multiple" },
    "110": { code: "110", name: "JP MORGAN", kind: "banca_multiple" },
    "112": { code: "112", name: "BMONEX", kind: "banca_multiple" },
    "113": { code: "113", name: "VE POR MAS", kind: "banca_multiple" },
    "124": { code: "124", name: "CITI MEXICO", kind: "banca_multiple" },
    "127": { code: "127", name: "AZTECA", kind: "banca_multiple" },
    "128": { code: "128", name: "KAPITAL", kind: "banca_multiple" },
    "129": { code: "129", name: "BARCLAYS", kind: "banca_multiple" },
    "130": { code: "130", name: "COMPARTAMOS", kind: "banca_multiple" },
    "132": { code: "132", name: "MULTIVA BANCO", kind: "banca_multiple" },
    "133": { code: "133", name: "ACTINVER", kind: "banca_multiple" },
    "135": { code: "135", name: "NAFIN", kind: "banca_desarrollo" },
    "136": { code: "136", name: "INTERCAM BANCO", kind: "banca_multiple" },
    "137": { code: "137", name: "BANCOPPEL", kind: "banca_multiple" },
    "138": { code: "138", name: "UALA", kind: "banca_multiple" },
    "140": { code: "140", name: "CONSUBANCO", kind: "banca_multiple" },
    "141": { code: "141", name: "VOLKSWAGEN", kind: "banca_multiple" },
    "145": { code: "145", name: "BBASE", kind: "banca_multiple" },
    "147": { code: "147", name: "BANKAOOL", kind: "banca_multiple" },
    "148": { code: "148", name: "PAGATODO", kind: "banca_multiple" },
    "150": { code: "150", name: "INMOBILIARIO", kind: "banca_multiple" },
    "151": { code: "151", name: "DONDE", kind: "banca_multiple" },
    "152": { code: "152", name: "BANCREA", kind: "banca_multiple" },
    "154": { code: "154", name: "BANCO COVALTO", kind: "banca_multiple" },
    "155": { code: "155", name: "ICBC", kind: "banca_multiple" },
    "156": { code: "156", name: "SABADELL", kind: "banca_multiple" },
    "157": { code: "157", name: "SHINHAN", kind: "banca_multiple" },
    "158": { code: "158", name: "MIZUHO BANK", kind: "banca_multiple" },
    "159": { code: "159", name: "BANK OF CHINA", kind: "banca_multiple" },
    "160": { code: "160", name: "BANCO S3", kind: "banca_multiple" },
    "166": { code: "166", name: "BaBien", kind: "banca_desarrollo" },
    "167": { code: "167", name: "HEY BANCO", kind: "banca_multiple" },
    "168": { code: "168", name: "HIPOTECARIA FED", kind: "banca_desarrollo" },
    "170": { code: "170", name: "REVOLUT BANK", kind: "banca_multiple" },
    "600": { code: "600", name: "MONEXCB", kind: "otros_participantes" },
    "601": { code: "601", name: "GBM", kind: "otros_participantes" },
    "602": { code: "602", name: "MASARI", kind: "otros_participantes" },
    "605": { code: "605", name: "VALUE", kind: "otros_participantes" },
    "616": { code: "616", name: "FINAMEX", kind: "otros_participantes" },
    "617": { code: "617", name: "VALMEX", kind: "otros_participantes" },
    "620": { code: "620", name: "PROFUTURO", kind: "otros_participantes" },
    "631": { code: "631", name: "TRF", kind: "otros_participantes" },
    "634": { code: "634", name: "FINCOMUN", kind: "otros_participantes" },
    "638": { code: "638", name: "NUBANK", kind: "banca_multiple" },
    "646": { code: "646", name: "STP", kind: "otros_participantes" },
    "652": { code: "652", name: "CREDICAPITAL", kind: "otros_participantes" },
    "653": { code: "653", name: "KUSPIT", kind: "otros_participantes" },
    "656": { code: "656", name: "UNAGRA", kind: "otros_participantes" },
    "659": {
      code: "659",
      name: "ASP INTEGRA OPC",
      kind: "otros_participantes",
    },
    "660": { code: "660", name: "Altor", kind: "otros_participantes" },
    "661": { code: "661", name: "KLAR", kind: "otros_participantes" },
    "670": { code: "670", name: "LIBERTAD", kind: "otros_participantes" },
    "677": {
      code: "677",
      name: "CAJA POP MEXICA",
      kind: "otros_participantes",
    },
    "680": {
      code: "680",
      name: "CRISTOBAL COLON",
      kind: "otros_participantes",
    },
    "683": {
      code: "683",
      name: "CAJA TELEFONIST",
      kind: "otros_participantes",
    },
    "684": { code: "684", name: "TRANSFER", kind: "otros_participantes" },
    "685": { code: "685", name: "FONDO (FIRA)", kind: "otros_participantes" },
    "688": { code: "688", name: "CREDICLUB", kind: "otros_participantes" },
    "699": { code: "699", name: "FONDEADORA", kind: "otros_participantes" },
    "703": { code: "703", name: "TESORED", kind: "otros_participantes" },
    "706": { code: "706", name: "ARCUS FI", kind: "otros_participantes" },
    "710": { code: "710", name: "NVIO", kind: "otros_participantes" },
    "714": { code: "714", name: "PPBALANCEMX", kind: "otros_participantes" },
    "715": { code: "715", name: "CASHI CUENTA", kind: "otros_participantes" },
    "720": { code: "720", name: "MexPago", kind: "otros_participantes" },
    "721": { code: "721", name: "albo", kind: "otros_participantes" },
    "722": { code: "722", name: "Mercado Pago W", kind: "otros_participantes" },
    "723": { code: "723", name: "Cuenca", kind: "otros_participantes" },
    "725": { code: "725", name: "COOPDESARROLLO", kind: "otros_participantes" },
    "727": {
      code: "727",
      name: "TRANSFER DIRECT",
      kind: "otros_participantes",
    },
    "728": { code: "728", name: "SPIN BY OXXO", kind: "otros_participantes" },
    "729": { code: "729", name: "Dep y Pag Dig", kind: "otros_participantes" },
    "730": { code: "730", name: "Clip", kind: "otros_participantes" },
    "732": { code: "732", name: "Peibo", kind: "otros_participantes" },
    "734": { code: "734", name: "FINCO PAY", kind: "otros_participantes" },
    "738": { code: "738", name: "FINTOC", kind: "otros_participantes" },
    "901": { code: "901", name: "CLS", kind: "otros_participantes" },
    "902": { code: "902", name: "INDEVAL", kind: "otros_participantes" },
    "903": { code: "903", name: "CoDi Valida", kind: "otros_participantes" },
  };

/**
 * The participant that owns an institution code, or undefined when the code is
 * not in the snapshot.
 *
 * `Object.hasOwn` rather than a bare index read, because a `Record<string, T>`
 * lies about missing keys under this tsconfig and a silent `undefined` typed as
 * `ClabeInstitution` would surface as "institution: undefined" on a chip.
 */
export function lookupInstitution(code: string): ClabeInstitution | undefined {
  return Object.hasOwn(BANXICO_INSTITUTIONS, code)
    ? BANXICO_INSTITUTIONS[code]
    : undefined;
}

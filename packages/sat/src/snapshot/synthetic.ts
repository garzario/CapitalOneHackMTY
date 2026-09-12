/**
 * A twenty-row SYNTHETIC stand-in for the Article 69-B list, for tests only.
 *
 * Read this before using it anywhere near a screen:
 *
 * - Every RFC here starts with `SYN` and is invented. None of them is on the real
 *   list, and none of them is on any list.
 * - Every name here contains the word SINTETICA or SINTETICO. The supplier
 *   catalogue in @hackmty/seed does not do that, because a supplier is only
 *   synthetic data. A row on a fiscal blacklist is an accusation, so an invented
 *   blacklist entry has to be unmistakable as invented even when it is read out of
 *   context, in a screenshot, with the watermark cropped off.
 * - The real list is never committed. `./README.md` says where it goes and how to
 *   fetch it, and ADR-0002 restricts real RFCs to the read-only lookup box.
 *
 * The rows are the source of truth and the CSV is rendered from them, so there is
 * one place to edit and the two cannot drift. The CSV layout is a documented subset
 * of the published file, which is why the loader must be finished against an actual
 * download and not against this constant. See `./README.md`.
 */

import type { SatListEntry } from "@hackmty/core";
import { SAT_STATUS_LABELS } from "../status";

/** DOF publication date of this fixture, which is also its version id. */
export const SYNTHETIC_LIST_VERSION = "2026-08-14";

/**
 * Eight presunto, six definitivo, three desvirtuado, three sentencia favorable.
 * The mix is deliberate: a fixture that is all definitivo never exercises the case
 * the product cares most about getting right, which is not alerting on a taxpayer
 * who already cleared their name.
 */
export const SYNTHETIC_SNAPSHOT_ENTRIES: readonly SatListEntry[] = [
  {
    rfc: "SYN010203AB1",
    name: "COMERCIALIZADORA SINTETICA UNO SA DE CV",
    status: "definitivo",
    publishedAt: "2024-03-15",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN020304BC2",
    name: "SERVICIOS INTEGRALES SINTETICOS DOS SA DE CV",
    status: "presunto",
    publishedAt: "2026-06-02",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN030405CD3",
    name: "GRUPO SINTETICO TRES S DE RL DE CV",
    status: "desvirtuado",
    publishedAt: "2025-01-20",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN040506DE4",
    name: "DISTRIBUIDORA SINTETICA CUATRO SA DE CV",
    status: "definitivo",
    publishedAt: "2024-11-08",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN050607EF5",
    name: "CONSTRUCTORA SINTETICA CINCO SA DE CV",
    status: "presunto",
    publishedAt: "2026-07-11",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN060708FG6",
    name: "ASESORIA SINTETICA SEIS S DE RL DE CV",
    status: "sentencia_favorable",
    publishedAt: "2025-09-30",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN070809GH7",
    name: "LOGISTICA SINTETICA SIETE SA DE CV",
    status: "definitivo",
    publishedAt: "2025-05-16",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN080910HI8",
    name: "MATERIALES SINTETICOS OCHO SA DE CV",
    status: "presunto",
    publishedAt: "2026-05-22",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN091011IJ9",
    name: "PROMOTORA SINTETICA NUEVE SA DE CV",
    status: "desvirtuado",
    publishedAt: "2025-03-07",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN101112JK0",
    name: "OPERADORA SINTETICA DIEZ SA DE CV",
    status: "definitivo",
    publishedAt: "2024-08-23",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN111213KL1",
    name: "CORPORATIVO SINTETICO ONCE SA DE CV",
    status: "presunto",
    publishedAt: "2026-04-18",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN121213LM2",
    name: "SUMINISTROS SINTETICOS DOCE SA DE CV",
    status: "presunto",
    publishedAt: "2026-02-14",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN130115MN3",
    name: "INMOBILIARIA SINTETICA TRECE SA DE CV",
    status: "definitivo",
    publishedAt: "2025-11-29",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN140216NP4",
    name: "TRANSPORTES SINTETICOS CATORCE SA DE CV",
    status: "sentencia_favorable",
    publishedAt: "2026-01-09",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN150317PQ5",
    name: "CONSULTORIA SINTETICA QUINCE S DE RL DE CV",
    status: "presunto",
    publishedAt: "2026-03-27",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN160418QR6",
    name: "MANTENIMIENTO SINTETICO DIECISEIS SA DE CV",
    status: "definitivo",
    publishedAt: "2025-07-04",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN170519RS7",
    name: "ARRENDADORA SINTETICA DIECISIETE SA DE CV",
    status: "desvirtuado",
    publishedAt: "2025-10-17",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    // The only name with a comma in it, so a parser that ignores RFC 4180 quoting
    // fails here instead of failing in front of a judge.
    rfc: "SYN180620ST8",
    name: "IMPORTACIONES SINTETICAS DIECIOCHO, SA DE CV",
    status: "presunto",
    publishedAt: "2026-08-01",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN190721TU9",
    name: "PUBLICIDAD SINTETICA DIECINUEVE SA DE CV",
    status: "presunto",
    publishedAt: "2026-07-30",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
  {
    rfc: "SYN200822UV0",
    name: "INGENIERIA SINTETICA VEINTE SA DE CV",
    status: "sentencia_favorable",
    publishedAt: "2026-02-28",
    listVersion: SYNTHETIC_LIST_VERSION,
  },
];

/**
 * The column layout this fixture is rendered in. A documented SUBSET of the
 * published file, which carries an oficio number and a DOF date per status rather
 * than one of each. `./README.md` has the detail and the open question.
 */
export const SYNTHETIC_SNAPSHOT_COLUMNS: readonly string[] = [
  "No",
  "RFC",
  "Nombre del Contribuyente",
  "Situacion del contribuyente",
  "Fecha de publicacion (DOF)",
];

/** RFC 4180: a field is quoted when it holds a comma, a quote or a newline. */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Renders entries in the fixture layout, so the rows stay the single source. */
export function toOfficialCsv(entries: readonly SatListEntry[]): string {
  const header = SYNTHETIC_SNAPSHOT_COLUMNS.join(",");
  const lines = entries.map((entry, index) =>
    [
      String(index + 1),
      entry.rfc,
      entry.name,
      SAT_STATUS_LABELS[entry.status],
      entry.publishedAt,
    ]
      .map(csvField)
      .join(","),
  );
  return [header, ...lines].join("\r\n");
}

/** The same twenty rows as text, for exercising the loader end to end. */
export const SYNTHETIC_SNAPSHOT_CSV: string = toOfficialCsv(
  SYNTHETIC_SNAPSHOT_ENTRIES,
);

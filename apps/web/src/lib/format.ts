/**
 * Formatting for the screen, and nothing else. No business rule lives here:
 * these functions turn a number or a string into the exact characters a clerk
 * reads, in Mexican conventions, and stop there.
 *
 * The formatters are built once at module load because a table redraws them
 * hundreds of times per render.
 */

const LOCALE = "es-MX";

const moneyFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const moneyShortFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "MXN",
  notation: "compact",
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Pesos with two decimals, for anything a person has to reconcile. */
export function formatMoney(amount: number): string {
  return moneyFormatter.format(amount);
}

/** Pesos rounded, for a total read from across the room. */
export function formatMoneyShort(amount: number): string {
  return moneyShortFormatter.format(amount);
}

const decimalFormatter = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 2,
});

export function formatCount(value: number): string {
  return integerFormatter.format(value);
}

/** Thousands separated, up to two decimals. For evidence values. */
export function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}

/** A ratio in 0 to 1 rendered as a percentage with one decimal. */
export function formatPercent(ratio: number, fractionDigits = 1): string {
  if (!Number.isFinite(ratio)) {
    return "n/d";
  }

  return `${(ratio * 100).toFixed(fractionDigits)} %`;
}

/** CFDI dates, SAT publication dates and Nessie dates are all date-only. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A date-only string is a calendar date, not an instant. `new Date("2026-09-07")`
 * parses as UTC midnight, which renders as the sixth in Monterrey and would put
 * every CFDI on screen one day early. Date-only strings are therefore built from
 * their parts, at local midnight, and left alone by the timezone.
 */
function toDate(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parts = DATE_ONLY.exec(value);

  if (parts) {
    const date = new Date(
      Number(parts[1]),
      Number(parts[2]) - 1,
      Number(parts[3]),
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date): string {
  const date = toDate(value);

  return date ? dateFormatter.format(date) : "fecha invalida";
}

export function formatDateTime(value: string | Date): string {
  const date = toDate(value);

  return date ? dateTimeFormatter.format(date) : "fecha invalida";
}

export function formatTime(value: string | Date): string {
  const date = toDate(value);

  return date ? timeFormatter.format(date) : "--:--:--";
}

/**
 * A CLABE in its four meaningful blocks: bank, plaza, account, control digit.
 * Splitting it on screen is not decoration, it is what lets a clerk see that
 * the bank changed without counting digits.
 */
export function splitClabe(clabe: string): {
  bank: string;
  plaza: string;
  account: string;
  control: string;
} {
  const digits = clabe.replace(/\D/g, "");

  return {
    bank: digits.slice(0, 3),
    plaza: digits.slice(3, 6),
    account: digits.slice(6, 17),
    control: digits.slice(17, 18),
  };
}

export function formatClabe(clabe: string): string {
  const { bank, plaza, account, control } = splitClabe(clabe);

  return [bank, plaza, account, control].filter(Boolean).join(" ");
}

/**
 * Indexes at which two strings differ, compared position by position. The
 * detector decides what the difference means; this only says where it is, so
 * the panel can paint those digits.
 */
export function diffPositions(a: string, b: string): number[] {
  const length = Math.max(a.length, b.length);
  const positions: number[] = [];

  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) {
      positions.push(index);
    }
  }

  return positions;
}

export function formatRfc(rfc: string): string {
  return rfc.trim().toUpperCase();
}

/** Shortens a UUID to the head a person can still match by eye. */
export function shortUuid(uuid: string, head = 8): string {
  return uuid.length <= head ? uuid : `${uuid.slice(0, head)}...`;
}

/** Title case for a sentence-cased Spanish label, without touching accents. */
export function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

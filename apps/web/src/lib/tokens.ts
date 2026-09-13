/**
 * Reading a design token as a number, for the one kind of consumer that cannot
 * take a CSS value.
 *
 * `tokens.css` is the only file allowed to hold a radius or a font size, and
 * everything in the app honours that by writing `var(--radius-md)` and letting
 * the browser resolve it. Recharts cannot: its `radius`, `barSize` and tick
 * `fontSize` props are numbers that end up in generated path data and in SVG
 * attributes, never in a stylesheet, so a `var()` string there is dropped
 * silently and the chart falls back to square corners nobody notices.
 *
 * This hook is the single sanctioned way out of that, and it is deliberately
 * the only one: the token still lives in `tokens.css`, this reads what the
 * browser computed for it, and no component ever types the number. If a second
 * library needs the same escape hatch it uses this file rather than growing its
 * own copy.
 *
 * Colours do not come through here. SVG resolves `var(--c-hold)` in a `fill`
 * attribute the same way CSS does, so a colour handed to Recharts stays a token
 * string and keeps following the theme.
 */

import { useMemo } from "react";

/**
 * The computed value of a custom property on the document root, as pixels.
 *
 * `rem` is converted against the root font size rather than assumed to be 16,
 * because a person who enlarged text in their browser changed exactly that
 * number and a chart that ignores it is a chart that stops matching the type
 * beside it.
 */
function readTokenPx(name: string, fallback: number): number {
  if (typeof document === "undefined") {
    return fallback;
  }

  const root = document.documentElement;
  const raw = getComputedStyle(root).getPropertyValue(name).trim();

  if (raw === "") {
    return fallback;
  }

  const value = Number.parseFloat(raw);

  if (Number.isNaN(value)) {
    return fallback;
  }

  if (raw.endsWith("rem")) {
    const rootSize = Number.parseFloat(getComputedStyle(root).fontSize);

    return Number.isNaN(rootSize) ? fallback : value * rootSize;
  }

  return value;
}

/**
 * A token as a number of pixels, read once per mount.
 *
 * Once is enough: the tokens this is used for -- radii and type sizes -- are
 * the ones `tokens.css` says never change with the theme, so there is nothing
 * to subscribe to. The fallback is what the chart draws if the property is
 * missing, which only happens if the token is renamed out from under it.
 */
export function useToken(name: string, fallback: number): number {
  return useMemo(() => readTokenPx(name, fallback), [name, fallback]);
}

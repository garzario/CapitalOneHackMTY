/**
 * The responsive, keyboard and contrast audit for issue #96, run against the
 * real built app rather than against the source.
 *
 * Three things are checked, all of them in the page where the answers actually
 * live: whether anything pushes the document wider than the viewport at the
 * four widths the issue names, whether every interactive element can be
 * reached and named by a keyboard user, and whether the colour tokens clear
 * WCAG AA in both themes.
 *
 * Contrast in particular cannot be checked by reading `tokens.css`. Half the
 * values are `rgba` over a surface, `color-scheme` resolves differently per
 * theme, and what matters is the composited pixel, not the declaration. So the
 * ratios are computed in the browser from `getComputedStyle`.
 *
 * No dependency. Chrome is driven over the DevTools protocol, the same way
 * `../brand/shoot.ts` captures the screenshots.
 *
 * Usage, with the app already served:
 *   bun run apps/web/audit/audit.ts http://localhost:4173
 *
 * Exits non-zero when something fails, so it can be wired into CI later.
 */

import { spawn } from "node:child_process";
import {
  HERO_INSTRUCTION_IDS,
  LISTED_SUPPLIER_RFC,
} from "../src/lib/mock-data";

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * Overridable for the reason `../brand/shoot.ts` states at its own constant, and
 * named the same way: two Chromes launched with one `--user-data-dir` are one
 * Chrome, and the second caller ends up driving the first caller's page. On a
 * build night with four people on one machine that turns an audit of this branch
 * into an audit of somebody else's, with no error anywhere.
 */
const PORT = Number(process.env.AUDIT_PORT ?? 9334);

/**
 * The line the audit opens, read off the synthetic run rather than written down.
 *
 * A hardcoded folio here is a route that renders the error state the day the seed
 * moves, and an audit that passes on an error state has audited nothing.
 */
const DETAIL_PATH = `/instructions/${HERO_INSTRUCTION_IDS[0] ?? ""}`;

/**
 * The supplier expediente, read off the mock for the same reason the folio above
 * is: it is the one RFC the generated company guarantees has a listing, a plaza
 * and a week of invoices behind it, so the route renders its full self rather
 * than four empty blocks that pass every check by having nothing in them.
 */
const SUPPLIER_PATH = `/suppliers/${LISTED_SUPPLIER_RFC}`;

/** The widths issue #96 names: a small phone, a tablet, a laptop, a projector. */
const WIDTHS = [390, 768, 1440, 1920];

/**
 * The paths carry their `#`, and that is load bearing, for the reason
 * `../brand/shoot.ts` gives about the screenshots.
 *
 * `apps/web` is a hash router and `App.tsx` rewrites an empty hash to the payment
 * run on the first paint. So navigating to `/metrics` serves index.html, the app
 * finds no hash, replaces it with `#/run`, and the audit measures the run screen
 * inside a row labelled "metrics". That is what happened: every row of this
 * report was the same screen, which is why all seven of them answered with the
 * same focusable count to the digit.
 */
const ROUTES = [
  { path: "#/run", name: "payment run" },
  { path: `#${DETAIL_PATH}`, name: "instruction detail" },
  { path: "#/intake", name: "QR intake" },
  { path: "#/sat", name: "Article 69-B" },
  { path: "#/cep", name: "CEP viewer" },
  { path: "#/metrics", name: "metrics" },
  { path: "#/payments", name: "payments" },
  /* Both of these were added after this audit was written and neither had ever
     been measured: the entry screen in issue #215 and the supplier expediente in
     issue #213. The expediente is the one that most needed it, because it is the
     widest screen in the product: a plaza table and a weekly chart side by side,
     which is exactly the shape that breaks first at 390. */
  { path: "#/entrada", name: "entry and settings" },
  { path: `#${SUPPLIER_PATH}`, name: "supplier profile" },
  /* The token sheet, which is not in the navigation. It is audited because it
     is the one route where every chip, button and state is on screen at once,
     so a component that overflows at 390 or a control nobody named is caught
     here before it reaches a screen. */
  { path: "#/design", name: "token sheet" },
];

const SCHEMES = ["light", "dark"] as const;

/**
 * Reduced motion has to reach the tokens, not just the media query. The design
 * system's claim is that one switch stops the whole app moving, and a
 * component that hard-codes a duration quietly opts out of it.
 */
const MOTION_PROBE = `(() => {
  const root = getComputedStyle(document.documentElement);
  const read = (name) => root.getPropertyValue(name).trim();

  // Anything that still animates for longer than a frame after the request.
  const moving = [];
  for (const el of document.querySelectorAll("body *")) {
    const style = getComputedStyle(el);
    for (const raw of style.transitionDuration.split(",")) {
      const ms = raw.trim().endsWith("ms") ? parseFloat(raw) : parseFloat(raw) * 1000;
      if (ms > 16) {
        moving.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute("class") || "").slice(0, 50),
          duration: raw.trim(),
        });
        break;
      }
    }
    if (moving.length >= 8) break;
  }

  return {
    fast: read("--motion-fast"),
    base: read("--motion-base"),
    slow: read("--motion-slow"),
    matches: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    moving,
  };
})()`;

class Devtools {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const frame = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };

      if (frame.id === undefined) return;

      const waiter = this.pending.get(frame.id);
      if (!waiter) return;

      this.pending.delete(frame.id);

      if (frame.error) waiter.reject(new Error(frame.error.message));
      else waiter.resolve(frame.result);
    });
  }

  static async connect(url: string): Promise<Devtools> {
    const socket = new WebSocket(url);

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error(url)), {
        once: true,
      });
    });

    return new Devtools(socket);
  }

  send<T = unknown>(method: string, params: unknown = {}): Promise<T> {
    const id = this.nextId++;

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluates in the page and returns the awaited value. */
  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.send<{
      result: { value?: T };
      exceptionDetails?: { text: string; exception?: { description: string } };
    }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text,
      );
    }

    return result.result.value as T;
  }

  close(): void {
    this.socket.close();
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pageSocket(): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = (await response.json()) as Array<{
        type: string;
        webSocketDebuggerUrl?: string;
      }>;
      const page = targets.find(
        (target) => target.type === "page" && target.webSocketDebuggerUrl,
      );

      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }

    await wait(100);
  }

  throw new Error("Chrome never exposed a page target");
}

/* ------------------------------------------------------------- in-page code */

/**
 * Anything that makes the document wider than the viewport. Reported with the
 * element that did it, because "the page scrolls sideways" is not actionable
 * and "this table is 1180 wide inside a 390 viewport" is.
 */
const OVERFLOW_PROBE = `(() => {
  const limit = document.documentElement.clientWidth;
  // A position:fixed box is laid out against the initial containing block, and
  // under device emulation that block follows window.innerWidth rather than the
  // layout viewport: at a 390 override with a 751 px window, a bar anchored with
  // left and right measures 719 and reports a break that does not exist on a
  // phone, where the two numbers are the same. It cannot scroll the document
  // either, being out of flow. So a fixed subtree is measured against its own
  // containing block, which still catches one that is genuinely too wide.
  const fixedLimit = Math.max(limit, window.innerWidth);
  const guilty = [];

  for (const el of document.querySelectorAll("body *")) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    let fixed = false;
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).position === "fixed") { fixed = true; break; }
    }
    const bound = fixed ? fixedLimit : limit;

    if (rect.right <= bound + 1 && rect.left >= -1) continue;

    // Off-screen to the left is the skip-link pattern, not a break. It is
    // pulled back on focus and it never makes the page scroll.
    if (rect.right < 0) continue;

    // An element inside something that scrolls on purpose is not a break.
    // A wide table in an overflow-x container is the design, not a bug.
    let scroller = el.parentElement;
    let contained = false;
    while (scroller && scroller !== document.body) {
      const overflowX = getComputedStyle(scroller).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") { contained = true; break; }
      scroller = scroller.parentElement;
    }
    if (contained) continue;

    guilty.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute("class") || "").slice(0, 70),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
    });
  }

  // The body, not the documentElement. An absolutely positioned element parked
  // at left: -9999px inflates documentElement.scrollWidth without the page
  // scrolling anywhere, and that false positive is what the first run of this
  // audit reported on all six screens.
  const bodyScroll = document.body.scrollWidth;

  return {
    scrollWidth: bodyScroll,
    clientWidth: limit,
    overflows: bodyScroll > limit + 1 || guilty.length > 0,
    guilty: guilty.slice(0, 6),
  };
})()`;

/**
 * Every focusable element and whether a keyboard user can name it.
 *
 * Focus visibility is deliberately NOT checked here. The first version called
 * `el.focus()` and read the computed outline, and reported the entire header
 * navigation as invisible on all six screens. That was wrong: programmatic
 * focus does not match `:focus-visible`, which is the selector the app styles.
 * Whether the ring appears under a real Tab is checked by `tabOrder` below,
 * which presses the key.
 */
const KEYBOARD_PROBE = `(() => {
  const selector = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const nameless = [];
  let total = 0;

  for (const el of document.querySelectorAll(selector)) {
    if (el.hasAttribute("disabled")) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    total++;

    const name = (
      el.getAttribute("aria-label") ||
      el.textContent ||
      el.getAttribute("title") ||
      (el.labels && el.labels.length ? el.labels[0].textContent : "") ||
      el.getAttribute("placeholder") ||
      ""
    ).trim();

    if (name === "") {
      nameless.push({ tag: el.tagName.toLowerCase(), cls: (el.getAttribute("class") || "").slice(0, 50) });
    }
  }

  return { total, nameless };
})()`;

/** What the element under a real Tab press looks like. */
const FOCUSED_PROBE = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const style = getComputedStyle(el);
  const ring =
    !(style.outlineStyle === "none" || style.outlineWidth === "0px") ||
    style.boxShadow !== "none";

  return {
    tag: el.tagName.toLowerCase(),
    name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
    focusVisible: el.matches(":focus-visible"),
    ring,
  };
})()`;

/**
 * WCAG contrast over the composited pixel. `rgba` tokens are flattened against
 * the surface they are declared to sit on, which is the only honest way to
 * score the watermark and the scrim.
 */
const CONTRAST_PROBE = `(() => {
  const root = getComputedStyle(document.documentElement);
  const probe = document.createElement("span");
  document.body.appendChild(probe);

  const resolve = (token) => {
    probe.style.color = "";
    probe.style.color = "var(" + token + ")";
    const value = getComputedStyle(probe).color;
    return value;
  };

  const parse = (css) => {
    const nums = css.match(/[\\d.]+/g) || [];
    return { r: +nums[0], g: +nums[1], b: +nums[2], a: nums.length > 3 ? +nums[3] : 1 };
  };

  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });

  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance = (c) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  const ratio = (a, b) => {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  const PAIRS = [
    ["--c-ink", "--c-canvas", 4.5, "body text on the page"],
    ["--c-ink", "--c-surface", 4.5, "body text on a panel"],
    ["--c-ink-muted", "--c-surface", 4.5, "secondary text on a panel"],
    ["--c-ink-subtle", "--c-surface", 4.5, "subtle text on a panel"],
    ["--c-ink-subtle", "--c-surface-sunken", 4.5, "subtle text on a sunken panel"],
    ["--c-accent", "--c-surface", 4.5, "link and focus on a panel"],
    ["--c-accent-ink", "--c-accent", 4.5, "text on the primary action"],
    ["--c-hold-ink", "--c-hold-soft", 4.5, "hold chip"],
    ["--c-verify-ink", "--c-verify-soft", 4.5, "verify chip"],
    ["--c-release-ink", "--c-release-soft", 4.5, "release chip"],
    ["--c-info-ink", "--c-info-soft", 4.5, "info chip"],
    ["--c-hold", "--c-surface", 3, "hold border and large figure"],
    ["--c-verify", "--c-surface", 3, "verify border and large figure"],
    ["--c-release", "--c-surface", 3, "release border and large figure"],
    ["--c-hold-ink", "--c-surface", 4.5, "hold figure as text"],
    ["--c-verify-ink", "--c-surface", 4.5, "verify figure as text"],
    ["--c-release-ink", "--c-surface", 4.5, "release figure as text"],
    ["--c-watermark-ink", "--c-surface", 4.5, "the synthetic watermark"],
    // The marked row on the 69-B sweep: the supplier an evidence link arrived
    // at, tinted so it is found without reading the list. Its subtle ink is
    // lifted to muted by primitives.css, which is why muted is what is
    // measured here.
    ["--c-ink", "--c-accent-soft", 4.5, "the marked sweep row on its tint"],
    ["--c-ink-muted", "--c-accent-soft", 4.5, "the RFC on the marked sweep row"],
    ["--c-border-strong", "--c-surface", 3, "a strong border"],
    // The pill button's boundary is the hairline and not the strong border.
    // WCAG 1.4.11 asks 3.0 of the boundary of an input, where the box is the
    // only thing saying the control exists; a secondary button whose own word
    // carries the affordance is not that case. Recorded at 1.0 so the number
    // is on the report rather than in an argument, and so the day somebody
    // puts this border on an input the pair is already here to be raised.
    ["--c-border", "--c-canvas", 1, "the pill button's boundary, and the bar of a control with no hits"],
    // The well: the ground every block on the run stands on, and the third
    // surface in the app after the page and the panel. All three inks are worn
    // on it -- a label, a caption and a count in the same cell.
    ["--c-ink", "--c-well", 4.5, "text on a well"],
    ["--c-ink-muted", "--c-well", 4.5, "a well's label"],
    ["--c-ink-subtle", "--c-well", 4.5, "a well's caption and glyph"],
    // The one dark card, which carries its own two inks the way the rail does.
    // Nothing else in the app is set on this ground.
    ["--c-card-dark-ink", "--c-card-dark", 4.5, "the figure on the dark card"],
    ["--c-card-dark-ink-muted", "--c-card-dark", 4.5, "the sentence and the link under it"],
    // The line around a well is a boundary between two surfaces and never the
    // edge of a control, so WCAG 1.4.11 does not reach it -- the same argument
    // as the pill button's border below. Recorded at 1.0 so the number is on
    // the report instead of in an argument.
    ["--c-well-line", "--c-canvas", 1, "the well's own boundary, a non-text edge"],
    // The chart sits straight on the page: the bar of a control with hits is
    // a non-text indicator on the canvas, and the label at the end of a quiet
    // bar is the sentence that says nothing was found.
    ["--c-hold", "--c-canvas", 3, "a control's bar in the chart"],
    ["--c-ink-subtle", "--c-canvas", 4.5, "the Sin hallazgos label on the chart"],
    // The rail is a navy brand panel with its own small palette. None of the
    // pairs above touch it, and it is the one surface on every screen.
    ["--c-rail-ink", "--c-rail", 4.5, "a rail item"],
    ["--c-rail-ink-muted", "--c-rail", 4.5, "a rail item at rest"],
    ["--c-rail-active-ink", "--c-rail-active", 4.5, "the current rail item"],
    ["--c-rail-ink", "--c-rail-active", 4.5, "a rail item on hover"],
    ["--c-rail-ink-muted", "--c-rail-active", 4.5, "muted ink on the active row"],
    // The level and the state of ADR-0009. They are words on a page now rather
    // than chips, so the ground is the ground they sit on and not a soft fill
    // that no longer renders: the run table is on the surface token and a detail
    // panel puts the same words on the canvas. Both are measured, because a pair
    // that passes on one and fails on the other is a word that disappears on
    // exactly one screen. The level aliases the decision triplets, and an alias
    // repointed at a new colour has to be caught here and not on the projector.
    //
    // No backticks in this block, and that is not a style choice: every line
    // from CONTRAST_PROBE down is inside a template literal, so one would end
    // the string and take the rest of the file with it.
    ["--c-level-alerta-ink", "--c-surface", 4.5, "alerta on a panel"],
    ["--c-level-alerta-ink", "--c-canvas", 4.5, "alerta on the page"],
    ["--c-level-precaucion-ink", "--c-surface", 4.5, "precaucion on a panel"],
    ["--c-level-precaucion-ink", "--c-canvas", 4.5, "precaucion on the page"],
    ["--c-level-confiable-ink", "--c-surface", 4.5, "confiable on a panel"],
    ["--c-level-confiable-ink", "--c-canvas", 4.5, "confiable on the page"],
    ["--c-state-rojo-ink", "--c-surface", 4.5, "rojo on a panel"],
    ["--c-state-rojo-ink", "--c-canvas", 4.5, "rojo on the page"],
    ["--c-state-cancelado-ink", "--c-surface", 4.5, "cancelado on a panel"],
    ["--c-state-cancelado-ink", "--c-canvas", 4.5, "cancelado on the page"],
    ["--c-state-enviado-ink", "--c-surface", 4.5, "enviado on a panel"],
    ["--c-state-enviado-ink", "--c-canvas", 4.5, "enviado on the page"],
    ["--c-state-liberado-ink", "--c-surface", 4.5, "liberado on a panel"],
    ["--c-state-liberado-ink", "--c-canvas", 4.5, "liberado on the page"],
    ["--c-state-pendiente-ink", "--c-surface", 4.5, "pendiente on a panel"],
    ["--c-state-pendiente-ink", "--c-canvas", 4.5, "pendiente on the page"],
    // The focus ring, which is the same colour as the accent and has to clear
    // 3:1 against every ground a control sits on.
    ["--c-focus", "--c-surface", 3, "the focus ring on a panel"],
    ["--c-focus", "--c-canvas", 3, "the focus ring on the page"],
    ["--c-focus", "--c-surface-sunken", 3, "the focus ring on a sunken panel"],
  ];

  const results = PAIRS.map(([fgToken, bgToken, need, what]) => {
    const bg = parse(resolve(bgToken));
    const fgRaw = parse(resolve(fgToken));
    const fg = fgRaw.a < 1 ? over(fgRaw, bg) : fgRaw;
    const value = ratio(fg, bg);
    return { what, fgToken, bgToken, need, ratio: Math.round(value * 100) / 100, pass: value >= need };
  });

  probe.remove();
  return results;
})()`;

/* ------------------------------------------------------------------ runner */

interface Failure {
  kind: string;
  where: string;
  detail: string;
}

async function main(): Promise<void> {
  const base = (process.argv[2] ?? "http://localhost:4173").replace(/\/$/, "");
  const failures: Failure[] = [];

  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=/tmp/sentryone-audit-${PORT}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    const devtools = await Devtools.connect(await pageSocket());
    await devtools.send("Page.enable");
    await devtools.send("Runtime.enable");

    console.log("## Responsive\n");

    for (const route of ROUTES) {
      const breaks: string[] = [];

      for (const width of WIDTHS) {
        await devtools.send("Emulation.setDeviceMetricsOverride", {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await devtools.send("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-reduced-motion", value: "reduce" }],
        });
        await devtools.send("Page.navigate", { url: `${base}/${route.path}` });
        await wait(1800);

        const probe = await devtools.evaluate<{
          scrollWidth: number;
          clientWidth: number;
          overflows: boolean;
          guilty: Array<{ tag: string; cls: string; width: number }>;
        }>(OVERFLOW_PROBE);

        if (probe.overflows) {
          const who = probe.guilty
            .map((g) => `${g.tag}.${g.cls.split(" ")[0]} (${g.width}px)`)
            .join(", ");
          breaks.push(`${width}px: document is ${probe.scrollWidth}px. ${who}`);
          failures.push({
            kind: "overflow",
            where: `${route.name} at ${width}`,
            detail: who,
          });
        }
      }

      console.log(
        breaks.length === 0
          ? `- ${route.name}: clean at ${WIDTHS.join(", ")}`
          : `- ${route.name}: ${breaks.join(" | ")}`,
      );
    }

    console.log("\n## Keyboard\n");

    await devtools.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    for (const route of ROUTES) {
      await devtools.send("Page.navigate", { url: `${base}/${route.path}` });
      await wait(1800);

      const probe = await devtools.evaluate<{
        total: number;
        nameless: Array<{ tag: string; cls: string }>;
      }>(KEYBOARD_PROBE);

      /* Real Tab presses, because `:focus-visible` is a browser heuristic and
         a programmatic `.focus()` does not satisfy it. Twenty-five is past the
         header and into the first rows of content on every screen. */
      const ringless: string[] = [];
      let reached = 0;

      for (let press = 0; press < 25; press++) {
        await devtools.send("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          windowsVirtualKeyCode: 9,
          key: "Tab",
          code: "Tab",
        });
        await devtools.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          windowsVirtualKeyCode: 9,
          key: "Tab",
          code: "Tab",
        });

        const focused = await devtools.evaluate<{
          tag: string;
          name: string;
          focusVisible: boolean;
          ring: boolean;
        } | null>(FOCUSED_PROBE);

        if (!focused) continue;

        reached++;
        if (focused.focusVisible && !focused.ring) {
          ringless.push(`${focused.tag} "${focused.name}"`);
        }
      }

      const notes: string[] = [];
      if (probe.nameless.length > 0) {
        notes.push(
          `${probe.nameless.length} with no accessible name: ${probe.nameless
            .map((n) => `${n.tag}.${n.cls.split(" ")[0]}`)
            .join(", ")}`,
        );
        failures.push({
          kind: "nameless control",
          where: route.name,
          detail: JSON.stringify(probe.nameless),
        });
      }
      if (ringless.length > 0) {
        notes.push(`no focus ring under Tab: ${ringless.join(", ")}`);
        failures.push({
          kind: "invisible focus",
          where: route.name,
          detail: ringless.join(", "),
        });
      }
      if (reached === 0) {
        notes.push("Tab reached nothing at all");
        failures.push({
          kind: "keyboard trap",
          where: route.name,
          detail: "25 Tab presses moved focus nowhere",
        });
      }

      console.log(
        notes.length === 0
          ? `- ${route.name}: ${probe.total} focusable, ${reached} reached by Tab, all named, all ringed`
          : `- ${route.name}: ${probe.total} focusable, ${reached} reached by Tab. ${notes.join(". ")}`,
      );
    }

    console.log("\n## Reduced motion\n");

    await devtools.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await devtools.send("Page.navigate", { url: `${base}#/run` });
    await wait(1800);

    const motion = await devtools.evaluate<{
      fast: string;
      base: string;
      slow: string;
      matches: boolean;
      moving: Array<{ tag: string; cls: string; duration: string }>;
    }>(MOTION_PROBE);

    console.log(
      `- media query matches: ${motion.matches}, tokens collapse to ${motion.fast} / ${motion.base} / ${motion.slow}`,
    );

    if (!motion.matches) {
      failures.push({
        kind: "reduced motion",
        where: "emulation",
        detail:
          "the media query did not match, so the rest of this section proves nothing",
      });
    }

    for (const [name, value] of [
      ["--motion-fast", motion.fast],
      ["--motion-base", motion.base],
      ["--motion-slow", motion.slow],
    ] as const) {
      if (value !== "1ms") {
        failures.push({
          kind: "reduced motion",
          where: name,
          detail: `resolved to ${value}, expected 1ms`,
        });
      }
    }

    if (motion.moving.length > 0) {
      console.log(
        `- still transitioning: ${motion.moving.map((m) => `${m.tag}.${m.cls.split(" ")[0]} (${m.duration})`).join(", ")}`,
      );
      failures.push({
        kind: "reduced motion",
        where: "components",
        detail: motion.moving
          .map((m) => `${m.tag}.${m.cls.split(" ")[0]} ${m.duration}`)
          .join(", "),
      });
    } else {
      console.log("- nothing on the page still transitions past one frame");
    }

    console.log("\n## Contrast\n");

    for (const scheme of SCHEMES) {
      await devtools.send("Emulation.setEmulatedMedia", {
        features: [
          { name: "prefers-color-scheme", value: scheme },
          { name: "prefers-reduced-motion", value: "reduce" },
        ],
      });
      await devtools.send("Page.navigate", { url: `${base}#/run` });
      await wait(1800);

      const pairs =
        await devtools.evaluate<
          Array<{
            what: string;
            fgToken: string;
            bgToken: string;
            need: number;
            ratio: number;
            pass: boolean;
          }>
        >(CONTRAST_PROBE);

      console.log(`### ${scheme}\n`);
      console.log("| Pair | Ratio | Needs | |");
      console.log("|---|---|---|---|");

      for (const pair of pairs) {
        console.log(
          `| ${pair.what} (\`${pair.fgToken}\` on \`${pair.bgToken}\`) | ${pair.ratio.toFixed(2)} | ${pair.need} | ${pair.pass ? "pass" : "FAIL"} |`,
        );

        if (!pair.pass) {
          failures.push({
            kind: "contrast",
            where: `${scheme}, ${pair.what}`,
            detail: `${pair.fgToken} on ${pair.bgToken} is ${pair.ratio.toFixed(2)}, needs ${pair.need}`,
          });
        }
      }

      console.log("");
    }

    devtools.close();
  } finally {
    chrome.kill();
  }

  if (failures.length > 0) {
    console.log(`\n${failures.length} failure(s).`);
    process.exit(1);
  }

  console.log("\nNo failures.");
}

await main();

/**
 * The recorrido, as an overlay over the real product.
 *
 * It is not a slideshow and it is deliberately not the `Drawer`. A tour that
 * renders its own pictures of the screens is a tour that goes stale the week after
 * it is written, and a judge who reads it learns what the screenshots looked like.
 * So this dims the real app, navigates it underneath with `navigate`, and cuts a
 * hole over the one element the step is talking about. Everything a visitor sees
 * through that hole is the product answering for itself.
 *
 * Five decisions worth their reasons.
 *
 * **It opens itself, once.** The first load of a browser gets the welcome card,
 * with `Saltar` and `Ver despues` on it, and after that only the `Recorrido`
 * button in the top bar or `#/run?tour=1` opens it. An invitation that has to be
 * found is an invitation nobody takes, and the alternative it replaced was a
 * banner on one screen that a visitor landing on the run never saw.
 *
 * **The card docks in the corner that does not cover the spotlight,** on both
 * axes. Bottom left is the default because it is the one corner of this app
 * nothing else uses -- the toasts and the assistant dock are both bottom right --
 * and `placeCard` in `lib/tour.ts` moves it to any of the four when the thing the
 * step points at is standing there. It used to choose between left and right
 * only, so the stop about the button that sends the run put its card on top of
 * that button whichever side it took.
 *
 * **The hole is four rectangles and not a clip path.** The four veils around the
 * target take the pointer, so a stray click cannot derail the tour, and the gap
 * between them does not, so the control the step is pointing at is still pressable.
 * A `box-shadow` ring would have been one element and would have left the whole
 * page clickable.
 *
 * **The rect is measured again and again while a step settles.** The step navigates
 * first, and a route change is a React render plus a layout plus, on three of the
 * stops, a fetch that replaces a skeleton with a table. One measurement is wrong in
 * both directions: too early lands on the loading state, and late enough to be safe
 * leaves a stale ring over the previous step while the visitor reads the new card.
 * So it polls for two seconds, then follows the element on resize and on scroll. A
 * target that never appears leaves the card with no ring, which is a stop that
 * still reads, rather than a ring drawn around nothing.
 *
 * **Escape and the arrows work everywhere except inside a field of this card.**
 * The last stop has a telephone number in it, and a left arrow inside that field
 * has to move the caret rather than the tour. The exemption is the card's own
 * fields and nothing else: the stop that opens the assistant drawer hands focus
 * to that panel's composer, which is a `TEXTAREA`, and while the exemption was
 * written by tag name alone that swallowed every arrow press from `Paso 3` on.
 *
 * It is a `dialog` with `aria-modal`, which is what the veil makes true: every
 * click outside the hole lands on a veil, so the card is the surface a visitor is
 * working in. Focus moves to the card on every step, so a screen reader reads the
 * new step, and leaving hands focus back to the button that opens the tour.
 */

import { motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { getTour } from "../lib/api";
import { closeAssistant, openAssistant } from "../lib/assistant-dock";
import { useResource } from "../lib/resource";
import { navigate } from "../lib/router";
import { useTheme } from "../lib/theme";
import {
  BACK_BUTTON,
  END_BUTTON,
  fieldKeepsKey,
  LATER_BUTTON,
  linksOf,
  mockTourConfig,
  NEXT_BUTTON,
  placeCard,
  SKIP_BUTTON,
  START_BUTTON,
  scrollTopFor,
  spotlightHole,
  stepLabel,
  TOUR_LENGTH_NOTE,
  TOUR_STEP_COUNT,
  type TourBox,
  type TourSize,
  type TourStep,
  tourSteps,
} from "../lib/tour";
import { closeTour, TOUR_LAUNCHER_ID, useTourOpen } from "../lib/tour-store";
import { ErrorBlock, LoadingBlock, SourceNotice } from "./States";
import { TourCall } from "./TourCall";

/**
 * How often the spotlight looks for its target, and for how long.
 *
 * A step is a navigation, a render and, on three of the stops, a request whose
 * answer replaces a skeleton with a table. None of that is on the tick the step
 * changed on, so the element is asked for on this interval for two seconds, and
 * a step that still has no target after two seconds is a card with no ring.
 */
const SETTLE_MS = 100;

/** Twenty of them, which is the two seconds the ring waits before giving up. */
const SETTLE_TICKS = 20;

/** The lockup, at the size the welcome card wears it, in its own proportion. */
const LOCKUP = {
  width: 152,
  height: 48,
  light: "/sentryone-lockup.svg",
  /* The reverse one, for the dark card. The rail wears it in both appearances
     because the rail is navy on either ground; this card is not. */
  dark: "/sentryone-lockup-dark.svg",
};

function sameBox(a: TourBox | null, b: TourBox | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }

  return (
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1
  );
}

function sameSize(a: TourSize, b: TourSize): boolean {
  return Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
}

function viewport(): TourSize {
  return { width: window.innerWidth, height: window.innerHeight };
}

const loadTour = (signal: AbortSignal) => getTour({ signal });

export function Tour() {
  const open = useTourOpen();
  const reduceMotion = useReducedMotion();
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<TourBox | null>(null);
  const [view, setView] = useState<TourSize>(() =>
    typeof window === "undefined" ? { width: 1440, height: 900 } : viewport(),
  );
  /* The card measures itself, because where it may stand depends on how big it
     is: the call stop is twice the height of a caption. */
  const [card, setCard] = useState<TourSize>({ width: 400, height: 300 });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  /* The same three data modes as every screen, through the same hook: the API
     answers which line the tour is about, `?data=mock` answers out of the
     generated run, and `auto` falls back with the reason printed on the card. It
     is held until the tour is open, because a page nobody toured must not spend a
     request on it. */
  const { resource, reload } = useResource(loadTour, {
    fallback: mockTourConfig,
    enabled: open,
  });

  const config = resource.status === "ready" ? resource.data : null;
  const steps = useMemo(
    () => (config === null ? [] : tourSteps(linksOf(config))),
    [config],
  );
  const step: TourStep | null = steps[index] ?? null;
  const total = steps.length;

  /* Whether this tour opened the assistant drawer, so that leaving closes what
     the tour opened and leaves alone what the visitor opened themselves. */
  const openedAssistant = useRef(false);

  const exit = useCallback(() => {
    if (openedAssistant.current) {
      closeAssistant();
      openedAssistant.current = false;
    }

    closeTour();

    /* Focus goes back to the control that opens the tour rather than to the top
       of the document, which is where a removed dialog leaves it. */
    window.requestAnimationFrame(() => {
      document.getElementById(TOUR_LAUNCHER_ID)?.focus();
    });
  }, []);

  /* The tour always starts at the beginning. A tour that resumes at step six is a
     tour that drops the second visitor into the middle of a story. */
  useEffect(() => {
    if (open) {
      setIndex(0);
    } else {
      setBox(null);
    }
  }, [open]);

  /* The step drives the app: it navigates, and it opens or closes the one panel
     that is part of the story. Both are effects of the step rather than of the
     click, so arriving at a step by keyboard does the same thing as arriving by
     button. */
  useEffect(() => {
    if (!open || step === null) {
      return;
    }

    if (step.route !== undefined) {
      navigate(step.route);
    }

    if (step.opensAssistant === true) {
      openAssistant();
      openedAssistant.current = true;
    } else if (openedAssistant.current) {
      closeAssistant();
      openedAssistant.current = false;
    }
  }, [open, step]);

  /* Focus moves to the card on every step, which is what makes a screen reader
     read the new step instead of staying where the last button was. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: `index` is the retrigger; the body deliberately reads nothing from it
  useEffect(() => {
    if (!open) {
      return;
    }

    cardRef.current?.focus();
  }, [open, index]);

  /* The card's own size, watched rather than measured once: the call stop grows
     when the result lands under the form, and a card that grew downwards out of a
     top corner would be a card that walked over its own spotlight. */
  useEffect(() => {
    const element = cardRef.current;

    if (!open || element === null || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      const next = { width: rect.width, height: rect.height };

      setCard((current) => (sameSize(current, next) ? current : next));
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [open]);

  /* The viewport, as state, because where the card may stand is computed from it
     and a resize changes the answer without changing the step. */
  useEffect(() => {
    if (!open) {
      return;
    }

    const onResize = () => {
      setView((current) => {
        const next = viewport();

        return sameSize(current, next) ? current : next;
      });
    };

    onResize();
    window.addEventListener("resize", onResize);

    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  const target = step?.target;

  /*
   * The spotlight.
   *
   * Measured on the frame the step opens on and then every hundred milliseconds
   * for two seconds, rather than once after a delay. A single measurement is the
   * version that was written first and it was wrong in both directions: too early
   * lands on the loading state of a screen whose table has not arrived, and late
   * enough to be safe leaves a stale ring over the previous step for most of a
   * second, which is what a visitor is looking at while they read the new card.
   * Re-measuring is one `querySelector` and one rect, so the cheap answer is to
   * keep asking until the screen has settled.
   *
   * The interval stops itself; `resize` and `scroll` are what keep the ring on
   * the element after that, because both move the rect without changing the step.
   */
  useEffect(() => {
    if (!open || target === undefined) {
      setBox(null);

      return;
    }

    let scrolled = false;
    let ticks = 0;

    const measure = (mayScroll: boolean) => {
      const element = document.querySelector<HTMLElement>(
        `[data-tour="${target}"]`,
      );

      if (element === null) {
        setBox(null);

        return;
      }

      /* Once, on the first measurement that found the element: scrolling on
         every tick would fight a person who scrolled the screen themselves.
         `scrollTopFor` puts the top of the target just under the sticky top
         bar, at both widths, which is what keeps the bar out of the hole and
         the foot of the screen free for the card.

         A panel that does not move with the page is left alone: the assistant
         drawer is `position: fixed`, so scrolling for it would move the screen
         underneath it and change nothing about where the ring lands. */
      if (mayScroll && !scrolled) {
        scrolled = true;

        if (window.getComputedStyle(element).position !== "fixed") {
          window.scrollTo({
            top: scrollTopFor(
              element.getBoundingClientRect().top,
              window.scrollY,
            ),
            behavior: reduceMotion ? "auto" : "smooth",
          });
        }
      }

      const rect = element.getBoundingClientRect();
      const next: TourBox = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };

      setBox((current) => (sameBox(current, next) ? current : next));
    };

    measure(true);

    const timer = window.setInterval(() => {
      ticks += 1;
      measure(true);

      if (ticks >= SETTLE_TICKS) {
        window.clearInterval(timer);
      }
    }, SETTLE_MS);

    const onMove = () => measure(false);

    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, { capture: true, passive: true });

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, { capture: true });
    };
  }, [open, target, reduceMotion]);

  const back = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  const forward = useCallback(() => {
    setIndex((current) => Math.min(total - 1, current + 1));
  }, [total]);

  /* The keyboard, on the window, because the card is not the only thing a visitor
     may have focus in: the step that opens the assistant hands the Tab order to
     that panel, which traps it by design. */
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        exit();

        return;
      }

      /* A field of this card keeps its own arrows, and nothing else does. The
         drawer the third stop opens takes focus into its composer, and while
         the exemption was by tag name alone the tour stopped there for good. */
      const node = event.target;
      const insideCard =
        node instanceof Node && cardRef.current?.contains(node) === true;

      if (
        node instanceof HTMLElement &&
        fieldKeepsKey(node.tagName, node.isContentEditable, insideCard)
      ) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        forward();
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, exit, forward, back]);

  if (!open) {
    return null;
  }

  const hole = box === null ? null : spotlightHole(box, view);
  const last = index === total - 1;
  const welcome = step?.kind === "welcome";
  /* Which corner the card docks in: the first of the four that does not touch
     the spotlight. A tour card that covers its own spotlight is the oldest
     mistake in the form. */
  const place = placeCard(hole, card, view);

  return (
    <>
      {/* The veil. One rectangle when the step points at nothing, and four around
          the hole when it does, so the element in the gap stays pressable while
          everything else takes the pointer. */}
      {hole === null ? (
        <motion.div
          aria-hidden="true"
          className="tour-veil"
          style={{ inset: 0 }}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
        />
      ) : (
        <>
          <div
            aria-hidden="true"
            className="tour-veil"
            style={{ top: 0, left: 0, right: 0, height: hole.top }}
          />
          <div
            aria-hidden="true"
            className="tour-veil"
            style={{
              top: hole.top + hole.height,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          <div
            aria-hidden="true"
            className="tour-veil"
            style={{
              top: hole.top,
              left: 0,
              width: hole.left,
              height: hole.height,
            }}
          />
          <div
            aria-hidden="true"
            className="tour-veil"
            style={{
              top: hole.top,
              left: hole.left + hole.width,
              right: 0,
              height: hole.height,
            }}
          />
          {/* The ring travels from the last target to this one under a CSS
              transition on its four sides, which is `--motion-base` and collapses
              to a millisecond under reduced motion with every other duration. */}
          <div
            aria-hidden="true"
            className="tour-ring"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
          />
        </>
      )}

      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="tour-card"
        data-side={place.side}
        data-vert={place.vert}
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: reduceMotion ? 0 : 0.2,
          ease: [0.2, 0.8, 0.2, 1],
        }}
      >
        <div className="tour-head">
          {welcome ? (
            /* The lockup, in the appearance a person chose. It is read off the
               theme store and not off a media query, because `lib/theme.ts`
               deliberately does not follow the operating system: the reverse
               lockup on a light card would be white on white. */
            <img
              className="tour-lockup"
              src={theme === "dark" ? LOCKUP.dark : LOCKUP.light}
              alt="SentryOne"
              width={LOCKUP.width}
              height={LOCKUP.height}
            />
          ) : (
            <span className="eyebrow">
              {stepLabel(index, total === 0 ? TOUR_STEP_COUNT : total)}
            </span>
          )}

          <button type="button" className="btn btn-sm" onClick={exit}>
            {SKIP_BUTTON}
          </button>
        </div>

        {/* One dot per stop, for the eye. The eyebrow above says the same thing in
            words, which is the version a screen reader gets, so this is hidden
            rather than read twice. */}
        {total > 0 ? (
          <div aria-hidden="true" className="tour-dots">
            {steps.map((dot, at) => (
              <span
                key={dot.id}
                className="tour-dot"
                data-state={
                  at < index ? "done" : at === index ? "now" : "ahead"
                }
              />
            ))}
          </div>
        ) : null}

        {resource.status === "loading" ? (
          <LoadingBlock label="Abriendo el recorrido" rows={3} />
        ) : null}

        {resource.status === "error" ? (
          <ErrorBlock
            title="No se pudo abrir el recorrido"
            message={resource.message}
            onRetry={reload}
          />
        ) : null}

        {step !== null && config !== null ? (
          <div className="tour-body" id={bodyId}>
            <h2 id={titleId} className={welcome ? "m-0 t-xl" : "m-0 t-lg"}>
              {step.title}
            </h2>

            {step.body.map((paragraph) => (
              <p key={paragraph.slice(0, 24)} className="muted m-0 t-sm">
                {paragraph}
              </p>
            ))}

            {/* The one line that says where to look, in its own style, because a
                visitor who reads nothing else on the card reads this one. */}
            {step.look !== undefined ? (
              <p className="tour-look m-0">{step.look}</p>
            ) : null}

            {step.kind === "call" ? <TourCall config={config} /> : null}

            <SourceNotice
              notice={resource.status === "ready" ? resource.notice : null}
              compact
            />
          </div>
        ) : null}

        <div className="tour-foot">
          {welcome ? (
            <>
              <button type="button" className="btn btn-pill" onClick={exit}>
                {LATER_BUTTON}
              </button>

              <span className="tour-foot-main">
                <span className="subtle t-xs">{TOUR_LENGTH_NOTE}</span>
                <button
                  type="button"
                  className="btn btn-pill btn-accent btn-lg"
                  onClick={forward}
                  disabled={total === 0}
                >
                  {START_BUTTON}
                </button>
              </span>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-pill" onClick={back}>
                {BACK_BUTTON}
              </button>

              {last ? (
                /* The primary of the last card is the telephone, and it is in the
                   form above: what a visitor is here to press is the one that
                   rings them as the owner, not a button that ends a tour they
                   have not taken yet. So this one is quiet. */
                <button type="button" className="btn btn-pill" onClick={exit}>
                  {END_BUTTON}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-pill btn-accent btn-lg"
                  onClick={forward}
                  disabled={total === 0}
                >
                  {NEXT_BUTTON}
                </button>
              )}
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}

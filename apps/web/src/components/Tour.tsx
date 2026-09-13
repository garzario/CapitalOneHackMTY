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
 * Four decisions worth their reasons.
 *
 * **The card is docked, not centred.** A modal in the middle of the viewport covers
 * the thing it is describing. Bottom left keeps the run's figures, the table and
 * the right-hand drawer visible, and it is the one corner nothing else in this app
 * uses: the toasts and the assistant dock are both bottom right.
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
 * So it measures on the frame the step opened on, then on a short interval until
 * the screen has stopped moving, and after that on resize and on scroll.
 *
 * **Escape and the arrows work everywhere except inside a field.** The last stop has
 * a telephone number in it, and a left arrow inside that field has to move the
 * caret rather than the tour.
 *
 * It is a `dialog` and `aria-modal` is false, which is the honest value rather than
 * a weaker one: the app behind is deliberately still there, one stop hands the Tab
 * order to the assistant drawer it just opened, and the spotlight leaves the
 * control it points at pressable. Focus moves to the card on every step, so a
 * screen reader reads the new step, and the card's own buttons are the first things
 * Tab reaches from there.
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
import {
  linksOf,
  mockTourConfig,
  TOUR_STEP_COUNT,
  type TourStep,
  tourSteps,
} from "../lib/tour";
import { closeTour, useTourOpen } from "../lib/tour-store";
import { ErrorBlock, LoadingBlock, SourceNotice } from "./States";
import { TourCall } from "./TourCall";

/**
 * How often the spotlight re-measures its target while a step settles.
 *
 * A step is a navigation, a render and, on three of the stops, a request whose
 * answer replaces a skeleton with a table. None of that is on the tick the step
 * changed on, so the rect is taken again on this interval until the screen has
 * stopped moving.
 */
const SETTLE_MS = 150;

/** How many of those before it stops asking: sixteen is two and a half seconds. */
const SETTLE_TICKS = 16;

/** Air around the target, so the ring does not sit on its own border. */
const SPOT_PAD = 8;

/** Every field a key press belongs to rather than to the tour. */
const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

type Box = { top: number; left: number; width: number; height: number };

function sameBox(a: Box | null, b: Box | null): boolean {
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

/** The hole, padded, clamped to the viewport so no veil gets a negative size. */
function holeOf(box: Box): Box {
  const top = Math.max(0, box.top - SPOT_PAD);
  const left = Math.max(0, box.left - SPOT_PAD);

  return {
    top,
    left,
    width: Math.max(
      0,
      Math.min(window.innerWidth - left, box.width + SPOT_PAD * 2),
    ),
    height: Math.max(
      0,
      Math.min(window.innerHeight - top, box.height + SPOT_PAD * 2),
    ),
  };
}

/**
 * Which bottom corner the card takes, given the hole it must not cover.
 *
 * The wider gap wins. On the widest targets -- a findings block, the person
 * picker -- both gaps are narrow and the card overlaps whichever side it is on;
 * it then keeps the default corner rather than flipping between two equally bad
 * answers on every step.
 */
function dockSide(hole: Box | null): "left" | "right" {
  if (hole === null || typeof window === "undefined") {
    return "left";
  }

  const right = window.innerWidth - (hole.left + hole.width);

  return right > hole.left ? "right" : "left";
}

const loadTour = (signal: AbortSignal) => getTour({ signal });

export function Tour() {
  const open = useTourOpen();
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
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

  const target = step?.target;

  /*
   * The spotlight.
   *
   * Measured on the frame the step opens on and then on a short interval for the
   * next two and a half seconds, rather than once after a delay. A single
   * measurement is the version that was written first and it was wrong in both
   * directions: too early lands on the loading state of a screen whose table has
   * not arrived, and late enough to be safe leaves a stale ring over the previous
   * step for most of a second, which is what a visitor is looking at while they
   * read the new card. Re-measuring is one `querySelector` and one rect, so the
   * cheap answer is to keep asking until the screen has settled.
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
         every tick would fight a person who scrolled the screen themselves. */
      if (mayScroll && !scrolled) {
        scrolled = true;
        element.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: reduceMotion ? "auto" : "smooth",
        });
      }

      const rect = element.getBoundingClientRect();
      const next: Box = {
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

      const node = event.target;
      const typing =
        node instanceof HTMLElement &&
        (TYPING.has(node.tagName) || node.isContentEditable);

      if (typing) {
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

  const hole = box === null ? null : holeOf(box);
  const progress = total === 0 ? 0 : ((index + 1) / total) * 100;
  const last = index === total - 1;
  /* Which corner the card docks in: the one with more room beside the thing the
     step is pointing at. A tour card that covers its own spotlight is the oldest
     mistake in the form, and the default corner covers the run's dark card and
     the left half of a finding. With no target it stays bottom left, which is
     the corner nothing else in this app uses. */
  const side = dockSide(hole);

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
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="tour-card"
        data-side={side}
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: reduceMotion ? 0 : 0.22,
          ease: [0.2, 0.8, 0.2, 1],
        }}
      >
        <div className="tour-head">
          <div className="tour-eyebrow">
            <span className="eyebrow">
              {`Recorrido · paso ${index + 1} de ${total === 0 ? TOUR_STEP_COUNT : total}`}
            </span>
            {step !== null ? (
              <span className="subtle t-xs">{step.eyebrow}</span>
            ) : null}
          </div>

          <button type="button" className="btn btn-sm" onClick={exit}>
            Salir
          </button>
        </div>

        {/* The bar repeats the count for the eye. The words above it are the
            accessible version, so this is hidden rather than read twice. */}
        <div aria-hidden="true" className="tour-progress">
          <span
            className="tour-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

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
            <h2 id={titleId} className="t-lg">
              {step.title}
            </h2>

            {step.body.map((paragraph) => (
              <p key={paragraph.slice(0, 24)} className="muted m-0 t-sm">
                {paragraph}
              </p>
            ))}

            {step.kind === "call" ? <TourCall config={config} /> : null}

            {step.look !== undefined ? (
              <div className="tour-look">
                <span className="eyebrow">Que mirar</span>
                <ul className="tour-look-list">
                  {step.look.map((line) => (
                    <li key={line} className="subtle t-xs">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <SourceNotice
              notice={resource.status === "ready" ? resource.notice : null}
              compact
            />
          </div>
        ) : null}

        <div className="tour-foot">
          <button
            type="button"
            className="btn btn-pill"
            onClick={back}
            disabled={index === 0}
          >
            Anterior
          </button>

          {last ? (
            <button
              type="button"
              className="btn btn-pill btn-accent"
              onClick={exit}
            >
              Terminar
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-pill btn-accent"
              onClick={forward}
              disabled={total === 0}
            >
              Siguiente
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}

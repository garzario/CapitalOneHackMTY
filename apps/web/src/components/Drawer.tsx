/**
 * The drawer: a panel that slides over the screen behind it and takes the
 * keyboard with it.
 *
 * One implementation, because a second one is how an app ends up with a dialog a
 * keyboard can enter and not leave. The supplier drawer uses it, and so does
 * anything else that needs to sit over the payment run without navigating away
 * from it.
 *
 * What it is responsible for, and none of it is decoration:
 *
 * - `role="dialog"` with `aria-modal` and a real label, read off the heading the
 *   caller passes rather than a string repeated in two places.
 * - Focus moves in on open and back to the element that opened it on close.
 *   Returning focus is the half people forget, and without it a keyboard user
 *   lands at the top of the document every time they close a panel.
 * - Tab is trapped. This was `TODO(FabriBanda)` in `apps/web/README.md`: focus
 *   used to walk out of the drawer into the run behind it, which is still on
 *   screen, still interactive and hidden behind a scrim, so the focus ring
 *   vanished under the overlay and the next Enter pressed a button nobody could
 *   see. The trap is a Tab handler over the focusable elements inside the panel
 *   rather than `inert` on the rest of the app, because `inert` would have to be
 *   applied to a parent this component does not own.
 * - Escape closes, and the scrim is a `<button>` rather than a div with a click
 *   handler, so closing by pointer and closing by keyboard are one control.
 * - The entrance reads the motion preference. Under `prefers-reduced-motion` the
 *   panel simply appears, which is what the tokens do for every CSS transition
 *   in the app and what `useReducedMotion` does for the ones in JavaScript.
 */

import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useId, useRef } from "react";
import { Button } from "./Button";

/** Everything a keyboard can land on, in document order. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type Props = {
  /** The heading, which is also what a screen reader announces. */
  title: ReactNode;
  /** A word above the title: what kind of thing this is. */
  eyebrow?: string;
  /** Under the title, for an identifier or a subtitle. */
  subtitle?: ReactNode;
  /** What the close button says. */
  closeLabel?: string;
  /** What the scrim announces, since it has no text of its own. */
  scrimLabel: string;
  onClose: () => void;
  children: ReactNode;
};

export function Drawer({
  title,
  eyebrow,
  subtitle,
  closeLabel = "Cerrar",
  scrimLabel,
  onClose,
  children,
}: Props) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  const focusables = useCallback((): HTMLElement[] => {
    const panel = panelRef.current;
    if (!panel) return [];

    return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (element) =>
        element.offsetWidth > 0 ||
        element.offsetHeight > 0 ||
        element === document.activeElement,
    );
  }, []);

  useEffect(() => {
    const opener = document.activeElement;

    /* The panel itself, not the first control. The heading is then the first
       thing read, instead of the close button that happens to sit beside it. */
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();

        return;
      }

      if (event.key !== "Tab") return;

      const reachable = focusables();
      if (reachable.length === 0) {
        /* Nothing to move to, so Tab must not leave either. */
        event.preventDefault();
        panelRef.current?.focus();

        return;
      }

      const first = reachable[0] as HTMLElement;
      const last = reachable[reachable.length - 1] as HTMLElement;
      const active = document.activeElement;
      const inside = panelRef.current?.contains(active as Node) ?? false;

      if (!inside) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();

        return;
      }

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();

        return;
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);

      if (opener instanceof HTMLElement) {
        opener.focus();
      }
    };
  }, [focusables, onClose]);

  return (
    <>
      <button
        type="button"
        className="scrim"
        aria-label={scrimLabel}
        onClick={onClose}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="drawer"
        initial={reduceMotion ? false : { x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{
          duration: reduceMotion ? 0 : 0.24,
          ease: [0.2, 0.8, 0.2, 1],
        }}
      >
        <div className="flex flex-col gap-5 p-5">
          <header className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
              <h2 id={titleId} className="t-lg">
                {title}
              </h2>
              {subtitle}
            </div>
            <Button onClick={onClose}>{closeLabel}</Button>
          </header>

          {children}
        </div>
      </motion.div>
    </>
  );
}

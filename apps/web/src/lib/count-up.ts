/**
 * A figure that travels to its new value instead of jumping to it.
 *
 * It exists for one beat of the demo and it earns its place there. When the SAT
 * publishes, the run re-scores itself in the same request and the screen re-reads
 * it with nobody touching the keyboard, so four of the five figures change at
 * once. A number that is replaced between two frames is a number nobody saw
 * change: the eye reads the new value and has no way to know it is new. A count
 * that takes about nine tenths of a second says "this moved, and by roughly
 * this much" in the only channel that is free while somebody is talking over it.
 *
 * Three properties, and each one is a line of the hook.
 *
 * **The first render is the final value.** A page that opens with every peso
 * figure counting up from zero is a page that is wrong for a second and a
 * screenshot that is wrong forever. The animation only runs when the value it is
 * given changes.
 *
 * **Reduced motion jumps.** `useReducedMotion` is the same preference the rest of
 * the app reads through `motion/react`, and here it does not shorten the
 * animation, it removes it.
 *
 * **It stops when the component goes.** `animate` returns playback controls and
 * the effect's cleanup calls `stop`, so a screen left mid-count does not keep a
 * frame loop alive setting state on something that unmounted.
 *
 * The curve is the app's own, `--ease-standard`, the one every other transition
 * uses. The duration is not a token and is deliberately longer than any of them:
 * `--motion-slow` is 360ms, which is the right length for a thing that moves
 * across the screen and the wrong length for six digits somebody has to read
 * while a peso figure changes under them. Nine tenths of a second is that
 * reading time, so it is argued here rather than borrowed from a token that
 * means something else. Both are written as numbers because `animate` takes
 * numbers and not CSS values, the same reason `useToken` exists for the charts,
 * and the animation is off entirely under reduced motion rather than relying on
 * a token being switched to 1ms.
 */

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** Seconds. Longer than every motion token on purpose; see the note above. */
const DURATION = 0.9;

/** `--ease-standard`, as the numbers `animate` takes. */
const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/**
 * The value on its way to `value`, which is exactly `value` on the first render
 * and again when the count finishes.
 */
export function useCountUp(value: number): number {
  const [shown, setShown] = useState(value);
  /** What is on screen right now, which is where the next count starts from. */
  const shownRef = useRef(value);
  /** What the last count was told to reach, so a re-render does not restart it. */
  const target = useRef(value);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const jump = () => {
      shownRef.current = value;
      target.current = value;
      setShown(value);
    };

    /* Also the path when the preference is turned on mid-count: the cleanup
       below has already stopped that animation, and without this the figure
       would sit wherever it had got to. */
    if (reduceMotion) {
      if (shownRef.current !== value) {
        jump();
      }

      return;
    }

    if (target.current === value) {
      return;
    }

    target.current = value;

    /* From what is on screen and not from the previous target: a second
       publication landing mid-count would otherwise snap the figure to the
       first one's total before starting. */
    const controls = animate(shownRef.current, value, {
      duration: DURATION,
      ease: EASE,
      onUpdate: (latest) => {
        shownRef.current = latest;
        setShown(latest);
      },
    });

    return () => controls.stop();
  }, [value, reduceMotion]);

  return shown;
}

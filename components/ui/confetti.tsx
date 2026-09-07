'use client';

import { useEffect, useMemo, useState } from 'react';
import { prefersReducedMotion } from '@/lib/motion';

/*
  A short burst of confetti from the middle of the screen, for the moment
  somebody upgrades.

  ⚠️ NO DEPENDENCY, AND THAT IS A DECISION RATHER THAN A CONSTRAINT.
  canvas-confetti is about 1.5KB gzipped and would be the thirteenth production
  dependency in a project that has twelve — on a client bundle that already
  carries a 261KB lesson (see lib/blog/author.ts). Eighty spans and one keyframe
  do the same job with nothing to keep updated.

  ⚠️ IT RENDERS NOTHING AT ALL UNDER prefers-reduced-motion, AND THE GLOBAL CSS
  CLAMP IS NOT ENOUGH HERE. globals.css clamps every animation-duration to
  0.01ms, which is the honest end state for a progress bar — it simply arrives.
  For confetti it means eighty squares appearing in the middle of the screen and
  disappearing in the same frame, which reads as a rendering fault rather than
  as a quieter celebration. So the preference is read in JS, the same way the
  help panel's reveal loop reads it.

  ⚠️ AND IT LEAVES. The pieces are removed from the DOM once the longest one has
  finished, because decoration that outlives its moment is litter — and a
  full-viewport fixed layer that stays behind is litter that can be in the way,
  even aria-hidden and pointer-events-none.
*/

/**
 * How many pieces.
 *
 * ⚠️ EIGHTY IS A DELIBERATE NUMBER, NOT A MAXIMUM. A burst from a single point
 * needs noticeably more than a curtain falling from the top does — the pieces
 * fan out and the eye reads the gaps — so this went from 30. Each one is a span
 * with a composited transform and no layout cost, which is why the jump is
 * affordable; it is not an invitation to keep going.
 */
const PIECES = 80;

/*
  Brand tokens only.

  ⚠️ NOT A NEW PALETTE. Confetti is the kind of thing that quietly introduces
  six colours nobody chose; these are the four this product already uses for
  emphasis, so the burst looks like it belongs to the same application.
*/
const COLOURS = ['bg-primary', 'bg-accent', 'bg-success', 'bg-navy'];

export function Confetti() {
  /*
    ⚠️ null UNTIL THE PREFERENCE HAS BEEN READ. This renders on the server too,
    where there is no reader to ask, and painting pieces before the check would
    show a burst to somebody who asked for no motion — for exactly one frame,
    which is the worst version of it.
  */
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    setShow(true);

    /* Longest piece: DURATION_MAX (2500ms) + DELAY_MAX (120ms), plus a beat. */
    const done = setTimeout(() => setShow(false), 2900);
    return () => clearTimeout(done);
  }, []);

  /*
    ⚠️ COMPUTED ONCE, NOT PER RENDER. Math.random() in the render body would
    deal every piece a new trajectory on any re-render, so the burst would
    visibly restart. useMemo with no dependencies is what pins it.
  */
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => {
        /*
          ⚠️ THE ANGLE IS EVENLY SPACED AND THEN JITTERED, NOT PURELY RANDOM.
          Eighty random angles clump — you get a dense wedge and a bare patch,
          which reads as a bug rather than as an explosion. Walking the circle
          and nudging each step keeps it even without looking like a fan.
        */
        const angle = (i / PIECES) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
        /* Square-rooted so pieces are not all bunched at the outer edge — an
           even spread of DISTANCE puts most of them near the rim, because the
           area out there is bigger. */
        const distance = 90 + Math.sqrt(Math.random()) * 330;

        return {
          id: i,
          colour: COLOURS[i % COLOURS.length],
          dx: `${Math.cos(angle) * distance}px`,
          dy: `${Math.sin(angle) * distance}px`,
          rot: `${Math.random() * 720 - 360}deg`,
          /* ⚠️ SMALL DELAYS. A burst is one event: spread these over half a
             second and it becomes a trickle from the middle instead. */
          delay: `${Math.random() * 120}ms`,
          dur: `${1800 + Math.random() * 700}ms`,
          /* A mix of squares and thin rectangles reads as paper rather than dots. */
          tall: i % 3 === 0,
        };
      }),
    [],
  );

  if (!show) return null;

  return (
    /*
      ⚠️ aria-hidden AND pointer-events-none ARE BOTH LOAD-BEARING. This covers
      the whole viewport, including the button the reader is about to press:
      without the second it would swallow that click for three seconds, and
      without the first a screen reader would announce eighty empty elements.
    */
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden print:hidden"
    >
      {pieces.map((p) => (
        /* ⚠️ CENTRED WITH MARGINS, NOT WITH translate(-50%, -50%). The
           transform belongs to the animation for the whole of its life, so
           anything that also needs it has to be expressed another way — a
           centring translate here would be overwritten on the first frame. */
        <span
          key={p.id}
          className={`motion-confetti absolute top-1/2 left-1/2 rounded-[1px] ${p.colour} ${
            p.tall ? '-mt-1.5 -ml-0.75 h-3 w-1.5' : '-mt-1 -ml-1 h-2 w-2'
          }`}
          style={
            {
              '--dx': p.dx,
              '--dy': p.dy,
              '--rot': p.rot,
              '--delay': p.delay,
              '--dur': p.dur,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

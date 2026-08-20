/**
 * A score as a ring.
 *
 * One number, so it's a dial rather than a chart — there's nothing to compare
 * it against and no series to plot. The ring exists to make the number feel
 * measured rather than asserted.
 *
 * The arc runs the brand gradient — primary into sky into accent — at every
 * value on purpose. Colouring it by band (red at 30, green at 90) would put
 * the verdict in hue alone, which carries no meaning for a colourblind reader
 * and none at all in print. The gradient is the same at 12 as it is at 98, so
 * it decorates without claiming anything; the band's meaning is stated in
 * words beside it instead.
 */

/*
  One id for every instance, and that is deliberate. SVG ids are document-wide,
  so two dials on one page share this definition — harmless, because the
  definition is identical for all of them. useId() is the usual fix and is not
  available here: this renders on the server, and hooks are not.
*/
const GRADIENT_ID = 'score-dial-arc';

export function ScoreDial({
  score,
  size = 'md',
}: {
  score: number;
  size?: 'sm' | 'md';
}) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;

  const box = size === 'sm' ? 'h-24 w-24' : 'h-32 w-32';
  const figure = size === 'sm' ? 'text-[1.5rem]' : 'text-[2rem]';

  return (
    <div className={`relative shrink-0 ${box}`}>
      <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
        <defs>
          {/*
            userSpaceOnUse rather than the default objectBoundingBox: the arc's
            bounding box shrinks as the score drops, and with the default the
            gradient would shrink with it — a 20 would show the full blue-to-
            cyan sweep compressed into its stub, so every score would end on
            the same colour. Pinned to the viewBox, the gradient stays put and
            a short arc is simply the first slice of it.

            gradientTransform undoes the arc's own rotate(-90). User space
            includes the referencing element's transform, so without this the
            gradient turns with the circle and the sweep starts mid-cyan at the
            top. Cancelling it lets the coordinates below mean what they read
            as: top of the dial to the bottom, deep blue brightening as the
            score climbs.

            The brand tokens arrive by `style`, not by attribute: var() is a
            CSS value, and a presentation attribute like stopColor="var(…)" is
            not read as CSS by every engine.
          */}
          <linearGradient
            id={GRADIENT_ID}
            gradientUnits="userSpaceOnUse"
            gradientTransform="rotate(90 60 60)"
            x1="60"
            y1="8"
            x2="60"
            y2="112"
          >
            <stop offset="0%" style={{ stopColor: 'var(--color-primary)' }} />
            <stop offset="55%" style={{ stopColor: 'var(--color-sky)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--color-accent)' }} />
          </linearGradient>
        </defs>

        {/* No track ring behind the arc. The unfilled remainder was the only
            grey on the card, and leaving it out lets the arc read as a mark
            rather than as a meter — the gap says the same thing the grey did.

            An SVG circle's path starts at 3 o'clock, so the arc is turned back
            a quarter to begin at the top. */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={`url(#${GRADIENT_ID})`}
          strokeWidth="8"
          /* A round cap on a zero-length dash still paints a dot, which reads
             as a rounding bug at the one score where the ring should be empty. */
          strokeLinecap={filled > 0 ? 'round' : 'butt'}
          strokeDasharray={`${filled} ${circumference}`}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-display text-navy leading-none font-extrabold tabular-nums ${figure}`}>
          {score}
        </span>
        <span className="text-slate mt-1 font-mono text-[0.625rem] tracking-wide uppercase">
          out of 100
        </span>
      </div>
    </div>
  );
}

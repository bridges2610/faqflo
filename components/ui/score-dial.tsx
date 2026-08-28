/**
 * A score as a ring.
 *
 * One number, so it's a dial rather than a chart — there's nothing to compare
 * it against and no series to plot. The ring exists to make the number feel
 * measured rather than asserted.
 *
 * ⚠️ TWO TONES, AND THE RULE THEY BOTH OBEY IS THE SAME ONE.
 *
 * `gradient` (the default, and what the audit score uses) runs primary into sky
 * into accent at EVERY value on purpose. The audit dial sits above a band label
 * and a summary sentence, but it is also the thing people screenshot and print
 * on its own — so its arc deliberately claims nothing. The gradient is the same
 * at 12 as it is at 98, and the meaning is carried entirely by the words.
 *
 * `band` paints one flat colour chosen by the caller's banding. That is NOT a
 * reversal of the rule above, which is that colour must never carry a verdict
 * ALONE: the only caller is the visibility panel, where the band's word sits
 * immediately beside the ring and the counts sit under it, so the hue is a
 * third encoding of something already said twice. Put this tone anywhere the
 * word is not adjacent and it becomes exactly what the gradient exists to
 * avoid — a colourblind reader sees an arc of some length, and a printed page
 * sees grey.
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
  caption = 'out of 100',
  stroke,
  figure,
  reverse = false,
}: {
  /** 0–100. Drives the arc length whatever the caption says the unit is. */
  score: number;
  size?: 'sm' | 'md';
  /** The mono line under the number. */
  caption?: string;
  /**
   * A flat colour for the arc, from the caller's banding.
   *
   * ⚠️ Only legal where the band's WORD is adjacent — see the header. Omitted,
   * the arc runs the brand gradient and claims nothing, which is the right
   * default and what every existing call site gets.
   *
   * Passing this also paints a track behind the arc: a banded ring is being
   * read as "how full", so the remainder needs to be visible. The gradient dial
   * deliberately has no track — there the gap says the same thing the grey did.
   */
  stroke?: string;
  /** Overrides the centre number, for a unit the score isn't in — "40%". */
  figure?: string;
  /**
   * For dark surfaces — flips the centre number and caption to white.
   *
   * ⚠️ IT HAS TO BE A PROP; A PARENT CLASS CANNOT DO THIS. The figure carries
   * `text-navy` and the caption `text-slate` in their own template literals, so
   * a `text-white` on any ancestor loses to them and the number renders
   * invisible on navy. That is the same trap components/ui/button.tsx documents
   * for its `light` variant: "overriding primary's colours through className is
   * a coin-flip — both land at the same specificity and whichever Tailwind
   * emits last wins."
   *
   * Named after Wordmark's `reverse`, which exists for exactly this and states
   * the rule: DARK backgrounds only. The arc needs no variant — its gradient
   * runs primary → sky → accent, all of which clear 7.9:1 on navy.
   */
  reverse?: boolean;
}) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;

  const box = size === 'sm' ? 'h-24 w-24' : 'h-32 w-32';
  const figureSize = size === 'sm' ? 'text-[1.5rem]' : 'text-[2rem]';

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

        {/* The track, and ONLY in band mode.

            The gradient dial has none: its unfilled remainder was the only grey
            on the card, and leaving it out lets the arc read as a mark rather
            than as a meter — the gap says the same thing the grey did. A banded
            ring is doing the opposite job. It is read as "how full", against a
            band word that names how full is full, and a proportion with no
            visible whole is half a statement. */}
        {stroke && (
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth="8"
          />
        )}

        {/* An SVG circle's path starts at 3 o'clock, so the arc is turned back
            a quarter to begin at the top. */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={stroke ?? `url(#${GRADIENT_ID})`}
          strokeWidth="8"
          /* A round cap on a zero-length dash still paints a dot, which reads
             as a rounding bug at the one score where the ring should be empty. */
          strokeLinecap={filled > 0 ? 'round' : 'butt'}
          strokeDasharray={`${filled} ${circumference}`}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* white 17.04:1 and white/60 6.79:1 on --color-navy; navy 17.04:1 and
            slate 7.46:1 on white. Every combination clears 4.5:1.

            ⚠️ REVERSE NEEDS A print: PARTNER, AND THIS WAS FOUND BY PRINTING.
            @media print forces the page white but leaves an explicit text-white
            alone, so a reversed dial rendered its number white on white — the
            figure simply vanished from the page. The caller cannot fix it from
            outside for the same reason `reverse` exists at all. */}
        <span
          className={`font-display leading-none font-extrabold tabular-nums ${
            reverse ? 'text-white print:text-navy' : 'text-navy'
          } ${figureSize}`}
        >
          {figure ?? score}
        </span>
        <span
          className={`mt-1 font-mono text-[0.625rem] tracking-wide uppercase ${
            reverse ? 'text-white/60 print:text-slate' : 'text-slate'
          }`}
        >
          {caption}
        </span>
      </div>
    </div>
  );
}

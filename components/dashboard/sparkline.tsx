/*
  A score's shape over time, small enough to sit inside a metric tile.

  Hand-rolled SVG for the same reason citation-chart.tsx is: there is no
  charting library in this project, and one line with no axes, no legend and no
  interaction does not justify adding one.

  ⚠️ THIS REFUSES TO DRAW MORE OFTEN THAN IT DRAWS, ON PURPOSE.

  A sparkline is a claim about a trend, and the fastest way to lose a customer's
  trust is to show them a shape that isn't in their data. Three rules enforce
  that, and none of them should be relaxed to make the tile look busier:

  1. FEWER THAN THREE POINTS AND IT RENDERS NOTHING. Two points is a straight
     line between them, which looks like a trend and is really one comparison —
     and the delta badge beside it already states that comparison honestly, with
     a number.

  2. THE CALLER FILTERS BY DEPTH. A quick run scores 3 findings across 2
     pillars; a full run scores ~40 across 6. They are not the same measurement,
     and plotting them together draws a cliff that never happened to the site.
     This component cannot see `depth`, so the rule lives with whoever passes
     the values — see the note at the call site.

  3. IT SCALES TO THE DATA RANGE, NOT TO 0–100. A four-point move inside a
     0–100 box is invisible, which is the same as not drawing it. The cost is
     that the line exaggerates small movement, so it is never labelled with
     values and never given an axis: it says "this is the shape", the number
     beside it says how much.
*/

const W = 96;
const H = 28;
const PAD = 3;

export function Sparkline({
  values,
  className = '',
  label,
}: {
  /** Oldest first. Already filtered to one comparable measurement. */
  values: number[];
  className?: string;
  /** What the shape is of, for anyone who can't see it. */
  label: string;
}) {
  if (values.length < 3) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const plotH = H - PAD * 2;
  const step = (W - PAD * 2) / (values.length - 1);

  /*
    A flat run is a real answer, not a missing one — a site that scored 62 three
    times running has a shape, and it is a straight line. Without this the
    normalisation divides by zero.
  */
  const points = values.map((v, i) => {
    const x = PAD + i * step;
    const y = span === 0 ? PAD + plotH / 2 : PAD + plotH - ((v - min) / span) * plotH;
    return [x, y] as const;
  });

  const last = points[points.length - 1];
  const first = values[0];
  const latest = values[values.length - 1];
  const direction = latest > first ? 'up' : latest < first ? 'down' : 'level';

  /*
    Gradient ids are document-global, so each one needs to be distinct — but
    useId() is a hook and would force this into a client component for a purely
    decorative fill. Deriving it from the label keeps it a server component, and
    two sparklines sharing a label would share an identical gradient, which
    changes nothing.
  */
  const fillId = `spark-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  /* Closed back along the baseline so the area under the line can be filled. */
  const area = `${points.map(([x, y]) => `${x},${y}`).join(' ')} ${last[0]},${H} ${points[0][0]},${H}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`h-7 w-24 overflow-visible ${className}`}
      role="img"
      aria-label={`${label}: ${values.length} checks, ${direction} from ${first} to ${latest}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Under the line, so the stroke stays crisp on top of it. */}
      <polygon points={area} fill={`url(#${fillId})`} />

      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* The latest point, so the eye lands on where they are now rather than
          on the whole line equally. */}
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="var(--color-primary)" />
    </svg>
  );
}

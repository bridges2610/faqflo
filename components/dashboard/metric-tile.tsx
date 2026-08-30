import Link from 'next/link';
import { Meter } from './meter';

/*
  One figure in the row across the top of the dashboard.

  This replaced StatTile, which it now completely subsumes.

  The two coexisted briefly because StatTile carried a `delta` prop documented
  as "a percentage against the previous period" — and a score that moves by 9
  points is not up 9%. It turned out `delta` was never passed at any of
  StatTile's seven call sites; that branch had never rendered. With the one
  genuine difference gone, keeping two components meant keeping two answers to
  "how do I show a number", so StatTile was deleted and its call sites on
  Results and Pages & topics moved here.

  `change` takes an explicit `unit` for that reason. Whatever a caller passes is
  printed as-is, so nothing can imply a percentage it did not measure.

  The row is one card with dividers rather than four separate cards, so these
  are cells and carry no border or shadow of their own.
*/
export function MetricTile({
  label,
  value,
  footer,
  change,
  chart,
  href,
  icon,
  tint = 'bg-cloud text-slate border-line border',
  status,
  progress,
}: {
  /**
   * The label above the figure. Short — this is a column heading, not a
   * sentence.
   *
   * ⚠️ SENTENCE CASE, NOT THE MONO SMALL-CAPS IT WAS. `font-mono uppercase
   * tracking-wide` is the house micro-label, and it is right on things that
   * ARE machine output — a status column, a code block's caption. These tiles
   * are the headline figures a business owner reads first, and small-caps mono
   * made "LINKED TO YOU" look like a system field rather than a sentence about
   * their business. Written as a normal label, it reads as one.
   *
   * Three screens carry these tiles — Results, Home and Opportunities — and the
   * objection applied equally to all three, which is why this changed in the
   * component rather than behind a prop.
   */
  label: string;
  value: string | number;
  footer?: string;
  /** Movement in whatever unit `value` is in. Never a percentage. */
  change?: { amount: number; unit: string } | null;
  chart?: React.ReactNode;
  /** When the figure is worth acting on, the whole cell is the link. */
  href?: string;
  icon?: React.ReactNode;
  /**
   * Chip colours. Identity, not interaction — this says which metric you're
   * looking at, so it never changes with the value.
   *
   * ⚠️ `--color-accent` is fill-only at ~1.9:1 on white. A cyan chip pairs with
   * `text-teal-ink`, never `text-accent`.
   */
  tint?: string;
  /**
   * A dot beside the footer, for a metric with a graded state.
   *
   * ⚠️ ONLY valid when the footer already names the state in words.
   * score-dial.tsx refuses to colour its ring by band because "colour alone
   * carries no meaning for a colourblind reader and none at all in print" —
   * this passes only because the word is always right next to it. A dot with
   * no word would be exactly the thing that note forbids.
   */
  status?: string;
  /**
   * A hairline bar under the figure, for a value that IS a ratio.
   *
   * ⚠️ ONLY when the tile's own value already prints both halves — "1/2" — so
   * the bar is a second encoding of something readable rather than the only
   * place the proportion exists. That is meter.tsx's standing contract.
   *
   * Most tiles must not have one. A count with no denominator ("5 answers",
   * "5 gaps") has no proportion to draw, and a bar under it would invent a
   * ceiling nobody set.
   */
  progress?: { value: number; total: number } | null;
}) {
  const up = (change?.amount ?? 0) > 0;

  const body = (
    <>
      <div className="flex items-center gap-2">
        {icon && (
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${tint}`}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <p className="text-slate text-xs font-semibold">{label}</p>
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-display text-navy text-[1.75rem] leading-none font-extrabold tabular-nums ${
              href ? 'group-hover:text-primary transition-colors duration-150' : ''
            }`}
          >
            {value}
          </span>

          {/* In words as well as sign. A bare ▲ carries no meaning for anyone
              who can't distinguish the colour, and none at all in print — the
              same reasoning as the deltas on the audit page. */}
          {change && change.amount !== 0 && (
            <span
              className={`text-[0.6875rem] font-semibold ${up ? 'text-success-ink' : 'text-error-ink'}`}
            >
              {up ? 'Up' : 'Down'} {Math.abs(change.amount)} {change.unit}
            </span>
          )}
        </div>

        {chart}
      </div>

      {progress && progress.total > 0 && (
        <Meter
          className="mt-3"
          value={(progress.value / progress.total) * 100}
          animate
        />
      )}

      {footer && (
        <p className="text-slate mt-2 flex items-center gap-1.5 text-xs leading-relaxed">
          {status && (
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status}`} aria-hidden="true" />
          )}
          {footer}
        </p>
      )}
    </>
  );

  if (!href) return <div className="p-5">{body}</div>;

  return (
    <Link href={href} className="group block p-5">
      {body}
    </Link>
  );
}

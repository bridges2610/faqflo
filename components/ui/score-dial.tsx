/**
 * A score as a ring.
 *
 * One number, so it's a dial rather than a chart — there's nothing to compare
 * it against and no series to plot. The ring exists to make the number feel
 * measured rather than asserted.
 *
 * The arc is drawn in `primary` at every value on purpose. Colouring it by
 * band — red at 30, green at 90 — would put the verdict in hue alone, which
 * carries no meaning for a colourblind reader and none at all in print. The
 * band's meaning is stated in words beside it instead.
 */
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
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#2563EB"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
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

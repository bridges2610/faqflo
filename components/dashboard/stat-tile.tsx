import { Card } from '@/components/ui/card';

/**
 * One number and what it means.
 *
 * `delta` is a percentage against the previous period. It's rendered in words
 * as well as colour — "up 12%" rather than a green ▲ alone — because colour on
 * its own carries no meaning for anyone who can't distinguish it.
 */
export function StatTile({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string | number;
  hint?: string;
  delta?: number | null;
}) {
  const showDelta = typeof delta === 'number' && Number.isFinite(delta) && delta !== 0;
  const up = (delta ?? 0) > 0;

  return (
    <Card className="p-5">
      <p className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">{label}</p>
      <p className="font-display text-navy mt-2 text-[1.75rem] leading-none font-extrabold tabular-nums">
        {value}
      </p>
      {(hint || showDelta) && (
        <p className="mt-2 text-xs leading-relaxed">
          {showDelta && (
            <span className={up ? 'text-success-ink font-semibold' : 'text-error-ink font-semibold'}>
              {up ? 'Up' : 'Down'} {Math.abs(delta!).toFixed(0)}%{' '}
            </span>
          )}
          {hint && <span className="text-slate">{hint}</span>}
        </p>
      )}
    </Card>
  );
}

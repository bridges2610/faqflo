import type { TrackingRun } from '@/lib/dashboard/provider';
import { Meter } from './meter';

/**
 * How far a run has got.
 *
 * ⚠️ INDETERMINATE UNTIL THE FIRST PASS RETURNS. How much there is to do is a
 * server-side question — the route works out what has not been checked today —
 * so before the first response there is no denominator. A bar sitting at 0%
 * would claim a measurement we have not taken, which is the rule the rest of
 * this page follows about unmeasured things. So: an animated bar with no
 * position, and no percentage, until we actually know.
 */
export function RunProgress({ run, className = '' }: { run: TrackingRun; className?: string }) {
  const total = run.remaining === null ? null : run.checked + run.remaining;
  const pct = total && total > 0 ? (run.checked / total) * 100 : null;

  return (
    <div className={className}>
      {pct === null ? (
        <div className="bg-cloud h-1.5 w-full overflow-hidden rounded-full" aria-hidden="true">
          <div className="bg-primary/40 h-full w-full animate-pulse rounded-full" />
        </div>
      ) : (
        // Meter already animates its width, so the bar eases between passes
        // rather than jumping.
        <Meter value={pct} />
      )}

      <p className="text-slate mt-1.5 text-xs">
        {pct === null ? (
          'Asking the engines…'
        ) : (
          <>
            {run.checked} of {total} questions checked
            {run.remaining === 0 ? ' · finishing up' : ` · ${run.remaining} to go`}
          </>
        )}
      </p>
    </div>
  );
}

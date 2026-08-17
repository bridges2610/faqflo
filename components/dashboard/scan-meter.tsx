'use client';

import type { ScanJob } from '@/lib/dashboard/use-scan-job';

/*
  How far through the first scan.

  ⚠️ SEGMENTED, NOT A SINGLE PERCENTAGE, AND THAT IS A HONESTY DECISION RATHER
  THAN A VISUAL ONE.

  The three stages are not comparable. Audit and questions are one slice each
  and report nothing but "finished"; tracking is several slices and is the only
  one that counts anything real. Rolled into one 0-100% figure the bar would
  jump 0 → 33 → 55 and only move smoothly at the end, and the number in between
  would be invented. This file already has a rule about that: run-progress.tsx
  refuses to draw 0% for an unknown denominator because it "would claim a
  measurement not taken".

  Three segments say the same thing without the fabrication — a finished stage
  is solid because it finished, the running one pulses because it is running,
  and tracking fills by a count we actually have.

  ⚠️ WEIGHTED 1:1:3 BY EXPECTED SLICES, not by a guess at wall-clock. Tracking
  takes about seven slices for a full watch list against one apiece for the
  others, so it gets the room. Weighting by seconds would mean inventing
  durations nobody measured, which is the thing being avoided.
*/

const SEGMENTS = [
  { key: 'audit', weight: 1, label: 'reading your site' },
  { key: 'questions', weight: 1, label: 'finding your questions' },
  { key: 'tracking', weight: 3, label: 'asking the AI engines' },
] as const;

const ORDER = ['audit', 'questions', 'tracking', 'done'] as const;

/** How full one segment is, 0 to 1. */
function fillFor(job: ScanJob, index: number): number {
  const current = ORDER.indexOf(job.stage);

  if (job.status === 'done') return 1;
  if (index < current) return 1;
  if (index > current) return 0;

  /*
    The active segment. Only tracking can say how far into itself it is; the
    other two are a single slice with no interior, so they stay empty and pulse
    rather than pretending to a position.

    ⚠️ Capped below 1. A segment that reads as full while its stage is still
    running is the exact lie this component exists to avoid — and it would show
    up as a bar sitting at 100% next to a spinner.
  */
  if (job.stage !== 'tracking') return 0;

  const { checked, total } = job.progress ?? {};
  if (typeof checked !== 'number' || typeof total !== 'number' || total === 0) return 0;
  return Math.min(0.95, checked / total);
}

/** The sentence under the bar. Never a number we did not measure. */
export function scanStatusLine(job: ScanJob): string {
  if (job.status === 'failed') return 'Stopped early';
  if (job.status === 'done') return 'All done';

  const index = ORDER.indexOf(job.stage);
  const segment = SEGMENTS[index];
  if (!segment) return 'Finishing up';

  const { checked, total } = job.progress ?? {};
  if (job.stage === 'tracking' && typeof checked === 'number' && typeof total === 'number' && total > 0) {
    return `Step 3 of 3 · ${checked} of ${total} questions asked`;
  }

  return `Step ${index + 1} of 3 · ${segment.label}`;
}

export function ScanMeter({ job, className = '' }: { job: ScanJob; className?: string }) {
  const current = ORDER.indexOf(job.stage);
  const stalled = job.status === 'failed';

  return (
    /*
      ⚠️ aria-hidden, with the caller printing the state as text — the same
      contract meter.tsx sets out. A bar that is the only carrier of progress is
      invisible to a screen reader, and this one is the primary signal on the
      page a customer stares at for two minutes after paying.
    */
    <div className={`flex gap-1 ${className}`} aria-hidden="true">
      {SEGMENTS.map((segment, i) => {
        const fill = fillFor(job, i);
        const active = i === current && !stalled && job.status !== 'done';
        return (
          <div
            key={segment.key}
            className="bg-cloud h-1.5 overflow-hidden rounded-full"
            style={{ flexGrow: segment.weight, flexBasis: 0 }}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                stalled ? 'bg-line' : 'bg-primary'
              } ${active && fill === 0 ? 'animate-pulse' : ''}`}
              // An active segment with nothing to report still shows a sliver,
              // so "in progress" is visible rather than indistinguishable from
              // "not started".
              style={{ width: active && fill === 0 ? '18%' : `${fill * 100}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

import { Card } from '@/components/ui/card';
import { Check } from '@/components/ui/check';
import { formatPlainDate, timeUntil } from '@/lib/dashboard/format';
import type { MilestoneView } from '@/lib/dashboard/types';
import { MicroLabel } from './micro-label';
import { SectionTitle } from './section-title';

/*
  When the checks happen, on a plan where the customer does not press anything.

  This replaces a button. That is the whole design brief: somebody arriving at
  Results on Get Cited used to find a control, and now finds five dates — so the
  page has to answer "when does it happen next" as directly as the button
  answered "how do I make it happen".

  ⚠️ A DONE CHECK SHOWS WHEN IT RAN, NOT WHEN IT WAS DUE. The sweep is daily and
  Vercel fires it within the hour, so a day-7 check routinely lands on day 7 or
  8. Printing the due date would be a claim the customer can disprove against
  the dates on their own chart, and the whole product's posture is that it does
  not show what it did not measure.

  ⚠️ A SKIPPED CHECK IS NOT A FAILED ONE. Sites that predate the schedule get
  their already-passed milestones marked skipped rather than fired in a burst —
  those days genuinely never happened for them, and dressing that up as an error
  would invent a fault nobody has.
*/

const LABELS: Record<MilestoneView['status'], string> = {
  done: 'Checked',
  running: 'Running now',
  pending: 'Due',
  skipped: 'Not scheduled',
  failed: 'Didn’t complete',
};

export function CheckSchedule({ milestones }: { milestones: MilestoneView[] }) {
  if (milestones.length === 0) return null;

  const next = milestones.find((m) => m.status === 'pending' || m.status === 'running');
  const remaining = milestones.filter((m) => m.status === 'pending').length;

  return (
    <Card className="p-5 sm:p-7">
      <MicroLabel>Your checks</MicroLabel>
      <SectionTitle className="mt-2">
        {next
          ? `Next check ${timeUntil(next.dueAt)}`
          : /* Nothing left to run. Said as a finished thing rather than as an
               absence, and paired with what survives it — the results are the
               deliverable, and the page they live on is theirs for good. */
            'All your checks are done'}
      </SectionTitle>
      <p className="text-slate mt-1.5 text-[0.9375rem] leading-relaxed">
        {next
          ? `We ask the engines your questions on a schedule — ${remaining} ${
              remaining === 1 ? 'check' : 'checks'
            } still to come. Nothing to press.`
          : 'Everything below stays here for good. Stay Cited starts new checks again, weekly and whenever you ask.'}
      </p>

      <ol className="mt-5 space-y-3.5">
        {milestones.map((milestone) => {
          const done = milestone.status === 'done';
          const isNext = milestone === next;

          return (
            <li key={milestone.day} className="flex gap-3.5">
              <span
                className={`font-display mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done
                    ? 'bg-success/12 text-success-ink'
                    : milestone.status === 'failed'
                      ? 'bg-error/12 text-error-ink'
                      : isNext
                        ? 'bg-primary-soft text-primary'
                        : 'bg-cloud text-slate border-line border'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : milestone.day}
              </span>

              <div className="min-w-0 flex-1">
                <p className={`text-sm leading-snug ${done ? 'text-slate' : 'text-navy'}`}>
                  Day {milestone.day}
                  {/* The state in words beside the colour, never instead of it —
                      the rule every status dot in this dashboard follows. */}
                  <span className="text-slate"> · {LABELS[milestone.status]}</span>
                </p>
                <p className="text-slate mt-0.5 text-xs leading-relaxed">
                  {milestone.status === 'failed' && milestone.error
                    ? milestone.error
                    : formatPlainDate(milestone.finishedAt ?? milestone.dueAt)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

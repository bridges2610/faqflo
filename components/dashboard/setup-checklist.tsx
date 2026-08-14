'use client';

import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check } from '@/components/ui/check';
import { Meter } from './meter';
import type { SetupStep } from '@/lib/dashboard/worklist';

/*
  Getting set up, for somebody who has just arrived.

  There was no onboarding at all before this: a new account landed on "Nothing
  set up yet" and a button, and nothing anywhere said how many more of those
  there were going to be.

  ⚠️ IT RETIRES ITSELF. Once all four steps are done this stops rendering, for
  good, and there is no dismiss state stored anywhere — the steps are answered
  from real data, so the data already knows whether they are through.

  That is the difference between this and the old "The loop" card, which showed
  the same five stages permanently. Permanent progress furniture teaches the
  customer OUR pipeline every time they visit; onboarding that knows when it is
  finished gets out of the way.

  Only the current step gets a button. A checklist with four buttons is four
  decisions, and the whole point of a checklist is that there is one.
*/
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  const currentIndex = steps.findIndex((s) => !s.done);

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        {/* 15px/700 with normal tracking, not the h2 default of 18px/800. The
            global -0.02em is tuned for large display headings and reads as
            cramped and heavy at card-title size. */}
        <h2 className="text-[0.9375rem] font-bold tracking-normal">Getting set up</h2>
        <p className="text-slate font-mono text-[0.6875rem] tracking-wide tabular-nums uppercase">
          {done} of {steps.length} done
        </p>
      </div>

      {/* Progress as a bar as well as a count. The bar is decoration; the count
          beside it is what actually carries the meaning, since a length is not
          readable to somebody using a screen reader. */}
      <Meter className="mt-3" value={(done / steps.length) * 100} />

      <ol className="mt-5 space-y-4">
        {steps.map((step, i) => {
          const current = i === currentIndex;

          return (
            <li key={step.id} className="flex gap-3.5">
              <span
                className={`font-display mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step.done
                    ? 'bg-success/12 text-success-ink'
                    : current
                      ? 'bg-primary-soft text-primary'
                      : 'bg-cloud text-slate border-line border'
                }`}
              >
                {step.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <h3
                  className={`text-sm leading-snug ${
                    step.done ? 'text-slate font-normal line-through' : 'text-navy font-medium'
                  }`}
                >
                  {step.label}
                </h3>

                {/* The reason only appears on the step they're on. On a done
                    step it is noise, and on a later one it is a decision they
                    do not have to make yet. */}
                {current && (
                  <>
                    <p className="text-slate mt-1 text-sm leading-relaxed">{step.why}</p>
                    <ButtonLink href={step.href} size="sm" className="mt-3">
                      {step.label}
                    </ButtonLink>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Confetti } from '@/components/ui/confetti';
import { TRACKING_PLANS } from '@/lib/dashboard/plans';
import { TickIcon } from './nav-icons';

/*
  The moment after paying.

  ⚠️ THIS REVERSES A DECISION /dashboard/checkout/return USED TO ARGUE FOR, and
  the note there has been rewritten rather than left contradicting the code. It
  said "nobody buys an audit in order to arrive at a receipt, and a page whose
  only purpose is a button is a page that gets closed" — which is why paying
  used to redirect straight through. Marking the upgrade is worth a beat; the
  auto-advance below is what keeps that objection answered. It is a moment, not
  a destination.

  ⚠️ IT RENDERS ONLY ON `granted`. The return page calls fulfilment before this
  point, so "You're on Pro" is a claim earned on this request rather than
  assumed. A bank debit still settling gets the pending card and no confetti —
  congratulating somebody whose payment has not cleared is a promise we cannot
  keep.
*/

/** Long enough to read two short lines, short enough not to feel stuck. */
const ADVANCE_MS = 5000;

export function UpgradeCelebration() {
  const router = useRouter();
  const [advancing, setAdvancing] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!advancing) return;

    timer.current = setTimeout(() => router.push('/dashboard'), ADVANCE_MS);

    /* ⚠️ CLEARED ON UNMOUNT, or it pushes a route after this is gone — which
       lands somebody back on the dashboard from wherever they navigated to in
       the meantime. */
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [advancing, router]);

  return (
    <>
      <Confetti />

      {/*
        ⚠️ FOCUS CANCELS THE TIMER, AND THAT IS WCAG 2.2.1 RATHER THAN A
        FLOURISH. A time limit that moves the page under somebody is the exact
        failure that rule describes, and the reader most likely to be caught by
        it is the one reading slowest — a keyboard or screen-reader user working
        through this card. Touching anything in here hands them the pace;
        everybody else gets the button or the five seconds.

        ⚠️ ON A WRAPPER, NOT ON Card. components/ui/card.tsx takes a fixed prop
        list rather than spreading DOM attributes, and adding a passthrough to a
        component used on every screen for one handler here is the wrong trade.
      */}
      <div onFocusCapture={() => setAdvancing(false)}>
        <Card className="mx-auto max-w-lg p-6 text-center sm:p-8">
          <span
            aria-hidden="true"
            className="bg-success/12 text-success-ink mx-auto flex h-12 w-12 items-center justify-center rounded-full"
          >
            <TickIcon className="h-6 w-6" />
          </span>

          <h1 className="text-navy mt-4 text-2xl leading-tight tracking-tight">
            You&rsquo;re on Pro 🎉
          </h1>

          {/* ⚠️ THE COUNT COMES FROM THE PLAN TABLE, NOT FROM THIS SENTENCE.
            lib/dashboard/plans.ts is what the pricing page sells; a number typed
            here is the copy that outlives a pricing change. */}
          <p className="text-slate mt-3 text-[0.9375rem] leading-relaxed">
            Every page of your site gets checked now, your answers get written
            for you, and {TRACKING_PLANS.pro.promptCap} questions are watched
            every week.
          </p>

          <div className="mt-6 flex flex-col items-center gap-3">
            <Button size="md" onClick={() => router.push('/dashboard')} arrow>
              Go to my dashboard
            </Button>

            {/* ⚠️ THE PAGE SAYS WHAT IT IS ABOUT TO DO. An unannounced redirect
              five seconds after arriving reads as a bug; saying so turns it into
              a convenience, and the sentence disappears the moment the timer
              does so it never describes something that is no longer true. */}
            {advancing && (
              <p className="text-slate/70 text-xs">
                Taking you there in a moment…
              </p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

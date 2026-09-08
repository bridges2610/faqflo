'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CloseIcon } from '@/components/ui/icons';
import { Sparkle } from '@/components/ui/doodle';
import { PRO_PRICE } from '@/lib/dashboard/plans';
import { dismissFloating, isFloatingDismissed, upgradeScope } from '@/lib/floating-visibility';

/*
  The offer, for a free account, in the chrome.

  ⚠️ IT EXISTS BECAUSE EVERY OTHER UPGRADE SURFACE CAN BE MISSED. UpgradeCard
  appears on Home, Audit, Content, Opportunities, AI Mentions and Publish, and
  the sidebar's plan box ends in the same link — but the cards live inside pages
  a reader may never open, and below `lg` the sidebar is a drawer, so its CTA is
  invisible until somebody taps the menu. This is the one that is always there.

  ⚠️ AND IT IS THE ONLY PERSISTENT ONE, SO IT STAYS QUIET. A tint, one line and
  a link. The gated pages are where the argument gets made; a bar that repeated
  it would be shouting over the product on every screen.
*/

/**
 * Routes where the offer would be in the way.
 *
 * ⚠️ CHECKOUT'S RETURN PAGE IS THE ONE THAT MATTERS. Somebody lands there
 * having just paid, to confetti and "You're on Pro" — and `user` is read from
 * data loaded before that request, so an upgrade bar can still believe they are
 * free. Congratulating and soliciting in the same viewport is the worst frame
 * this component could produce.
 *
 * The plan page and checkout itself are simpler: the reader is already doing
 * the thing the bar asks for.
 */
const HIDDEN_ON = ['/dashboard/plan', '/dashboard/checkout'];

export function UpgradeBar({ userId }: { userId: string }) {
  /*
    ⚠️ STARTS false AND IS FILLED IN BY AN EFFECT, NOT READ DURING RENDER.
    sessionStorage does not exist on the server, so reading it while rendering
    makes the first client paint disagree with the markup React was given.
    help-bubble.tsx reads its own dismissal exactly this way.

    The cost is that a dismissed bar can paint for one frame after a reload. It
    is the right way round: showing an offer a moment too long is a smaller
    fault than a hydration mismatch in the shell every account renders.
  */
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(isFloatingDismissed(upgradeScope(userId))), [userId]);

  const pathname = usePathname();

  if (dismissed) return null;
  if (HIDDEN_ON.some((route) => pathname.startsWith(route))) return null;

  return (
    /*
      ⚠️ NOT role="alert", AND NOT aria-live. Nothing has happened. Announcing
      an advert over whatever a screen-reader user was reading is precisely the
      interruption the rest of this product avoids — the help button waits
      fifteen seconds rather than arrive during someone's first look at a page.

      print:hidden for the reason free-home.tsx gives its own UpgradeCard: a
      printed report ending in an advert reads as an advert stapled to a
      document.
    */
    <div className="border-line bg-primary-soft/60 border-t px-4 py-2 sm:px-6 print:hidden">
      <div className="flex items-center justify-between gap-3">
        <p className="text-navy flex min-w-0 items-center gap-2 text-[0.8125rem] leading-snug">
          <Sparkle className="text-accent hidden h-3.5 w-3.5 shrink-0 sm:block" />
          {/*
            ⚠️ WHAT PRO ADDS, AND NO COUNT OF WHAT IS LEFT. The sidebar used to
            print "2 of 3 checks left" here-ish and it was deleted as a
            duplicate stripped of the context that made it mean something —
            prompt-ranking.tsx is now the only surface carrying the allowance,
            beside the button that spends it. A number in a bar on every page
            would put that back.

            ⚠️ AND IT AGREES WITH WHAT FREE ACTUALLY BUYS: one check. Not "more
            checks" or "unlimited" — plans.ts sells free as `runs: 1`,
            `schedule: 'once'`, and this line has to stay true beside it.
          */}
          <span className="min-w-0">
            <span className="font-semibold">Free is one check.</span>{' '}
            <span className="text-slate">
              Pro re-checks every week, so you can watch it move.
            </span>
          </span>
        </p>

        <div className="flex shrink-0 items-center gap-1">
          {/* Straight to the in-app plan page, never out to /#pricing — the
              reason PlanFooter gives: a signed-in customer sent to the
              marketing site lands on a page written for strangers. The price
              comes from the plan table so this cannot outlive a price change. */}
          <Link
            href="/dashboard/plan"
            className="text-primary hover:text-primary-hover rounded-input px-2 py-1 text-[0.8125rem] font-semibold whitespace-nowrap"
          >
            {/* The word "Upgrade" is dropped below sm: the price and the arrow
                are the offer, and the bar has a phone width to fit in. */}
            <span className="hidden sm:inline">Upgrade — </span>${PRO_PRICE.monthly}/mo →
          </Link>

          {/* ⚠️ THE NAME SAYS HOW LONG IT LASTS, NOT "Close". A × on an advert
              reads as "never again" unless it says otherwise, and this one
              comes back at the next sign-in — the same promise, and the same
              wording, as the help panel's own dismiss. */}
          <button
            type="button"
            onClick={() => {
              dismissFloating(upgradeScope(userId));
              setDismissed(true);
            }}
            aria-label="Hide this until you sign in again"
            className="text-slate/70 hover:text-navy hover:bg-line/40 rounded-input p-1.5"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

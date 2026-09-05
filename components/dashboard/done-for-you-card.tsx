import Image from 'next/image';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NEW_TAB, NewTabNote } from './new-tab';
import { AUTHOR, AUTHOR_AVATAR } from '@/lib/blog/posts';
import { SectionTitle } from './section-title';

/*
  The in-app pointer at /done-for-you.

  ⚠️ IT QUOTES NO PRICE, AND THAT IS THE WHOLE JOB IT IS DOING.

  It used to carry "Done for you · $497 once" plus the turnaround and the
  payment terms, which made it a small pricing table sitting inside a tool
  somebody was trying to use. (That price is itself long gone — the service is
  a setup fee plus a monthly now, which is more than a card could hold even if
  it should.) The number belongs on the landing page, where
  there is room to say what it covers and what it does not. Here the card only
  has to make one point — a person will do this for you — and hand over.

  ⚠️ SO DO NOT PUT THE PRICE BACK. A figure with no scope beside it is the
  version a customer misreads, and this card renders on four screens where
  none of that context exists. lib/done-for-you.ts is deliberately no longer
  imported here; if you find yourself adding that import, the thing you
  actually want is a sentence on /done-for-you.

  ⚠️ NOT A THIRD `EntitlementId`, AND NOT A VARIANT OF UpgradeCard. UpgradeCard
  is welded to Stripe — it branches on 'get_cited' vs 'stay_cited' when POSTing
  to /api/stripe/checkout and resolves the expired-window case against
  getCitedExpired(). Adding a third entitlement would ripple through
  lib/dashboard/plans.ts, lib/auth/entitlements.ts and the checkout route, all
  to describe a service that never touches Stripe: it is quoted, agreed by
  email and invoiced by hand.

  The photo is what makes it read as an offer from a person rather than an
  upsell from the software, which is the entire proposition. It has no state,
  no session lookup and no gating, so it still drops into a server component
  like the Start page without turning it into a client one.

  ⚠️ IT IS RENDERED ON FOUR SCREENS (Overview, Publish, Help, Start). Copy
  changes here reach all of them, which is the point — but so do tone changes.
  Keep it quiet and keep it short. It appears beside work somebody is in the
  middle of, and a card that reads like an interruption on the Publish page is
  a card that makes the Publish page worse for everyone who was never going to
  buy it.
*/
export function DoneForYouCard({
  title = 'Want me to just do it?',
  /* ⚠️ "I run it for you" RATHER THAN "by hand". The writing is FaqFlo's — my
     part is the setup, the editing and getting it published every month. This
     read "I'll set the whole thing up by hand", which claimed the writing too
     and described a one-off besides. Still no price: see the note above. */
  body = 'I’ll set it up, then run it for you every month — the articles edited into your voice and published to your site. You give me a login and half an hour.',
  tone = 'cloud',
  compact = false,
}: {
  title?: string;
  body?: string;
  /**
   * Which surface the card sits on.
   *
   * Cloud everywhere it lands beside white cards — Publish, Help, Start — so
   * it reads as an aside rather than more of the work. The overview rail is
   * the exception: it already alternates white then cloud, and a third cloud
   * card directly under the cloud "Learn" card merges the two into one block.
   *
   * ⚠️ Handed to Card's own `tone` prop, never applied as a bg-* class. See
   * the warning in components/ui/card.tsx: the two land at equal specificity
   * and whichever Tailwind emits last wins.
   */
  tone?: 'white' | 'cloud';
  /**
   * Tighter padding for narrow containers.
   *
   * ⚠️ `p-5 sm:p-7` is a VIEWPORT breakpoint, not a container one. In the
   * 20rem overview rail it resolves to p-7 on any desktop screen, which leaves
   * about 230px of text beside the photo. Same problem and same prop name as
   * UpgradeCard, which got here first.
   */
  compact?: boolean;
}) {
  return (
    <Card tone={tone} className={compact ? 'p-5' : 'p-5 sm:p-7'}>
      <div className="flex gap-4">
        {/*
          A face, not the SetupIcon that used to be here. The card's only claim
          is that a person does this instead of the software, and a line-art
          glyph in an accent circle says the opposite — it looks like every
          other system message in the dashboard.

          alt="" because the name renders as text a few lines below, which is
          the same call components/marketing/author-bio.tsx makes and explains.
          Lazy by default: this is never above the fold on any of the four
          screens it appears on.
        */}
        <Image
          src={AUTHOR_AVATAR}
          alt=""
          width={40}
          height={40}
          className="bg-cloud h-10 w-10 shrink-0 rounded-full object-cover"
        />

        <div className="min-w-0">
          <SectionTitle as="h3">{title}</SectionTitle>
          <p className="text-slate mt-1.5 text-sm leading-relaxed">{body}</p>

          {/* The signature is what makes the photo legible as a person rather
              than a stock illustration — and it is what makes alt="" correct. */}
          <p className="text-navy mt-2 text-sm font-semibold">&mdash; {AUTHOR}</p>

          <ButtonLink
            href="/done-for-you"
            {...NEW_TAB}
            size="sm"
            variant="ghost"
            className="mt-4"
            arrow
          >
            See what I do
            <NewTabNote />
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}

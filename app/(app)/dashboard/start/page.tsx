import type { Metadata } from 'next';
import { DoneForYouCard } from '@/components/dashboard/done-for-you-card';
import { OnboardingExperience } from '@/components/dashboard/onboarding-experience';
import { OnboardingStart } from '@/components/dashboard/onboarding-start';
import { PageHeader } from '@/components/dashboard/page-header';
import { currentUser } from '@/lib/auth/dal';
import { canOfferDoneForYou } from '@/lib/auth/entitlements';

export const metadata: Metadata = { title: 'Setting up' };

/*
  Where a new account lands, and where the home page's "check my site" arrives.

  ⚠️ THIS USED TO BE THE POST-PAYMENT SCREEN. It replaced a redirect to
  /dashboard/audit?purchased=get_cited that auto-ran a full audit from a
  useEffect — an arrangement that filled in exactly one of four sections and
  left the other three empty until the customer found three more buttons. The
  audit runs as the first stage of a server-side job instead, so this page
  watches rather than works.

  The trigger moved from payment to signup with the free tier, so `?domain=`
  now matters: it is carried from the home page audit, and OnboardingStart
  turns it into a site row and the first check. This half only reads it —
  everything that writes happens in the POST the client half sends, because a
  link to this page is prefetched and a server component cannot tell a
  prefetch from a visit.
*/
export const dynamic = 'force-dynamic';

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  const { domain } = await searchParams;

  /*
    Only to decide whether the offer below renders. currentUser() is
    cache()-wrapped and the (app) layout already awaited it in this request, so
    this is a second read of the same row rather than a second query.
  */
  const user = await currentUser();

  return (
    <>
      <PageHeader
        title="Setting up your dashboard"
        description="We're reading your site and asking the AI engines about you."
      />
      <OnboardingStart domain={domain?.trim() || null} />

      {/*
        ⚠️ UNDER THE PROGRESS, NOT ABOVE IT. The first thing this screen owes
        somebody is proof that something is happening; a form above the progress
        bar reads as another hoop before the thing they asked for. Below it, the
        wait is the reason the form is there.

        It renders nothing until the site row exists, which is the reload
        OnboardingStart triggers after its POST — so on the first pass this is
        absent and the screen is unchanged.
      */}
      <OnboardingExperience />

      {/*
        ⚠️ PRO ONLY, WHICH IN PRACTICE MEANS ALMOST NOBODY SEES IT HERE.

        This is where new free signups land, so the gate removes the offer from
        onboarding for most of the people who reach this screen. That is the
        intent, not an oversight: /done-for-you quotes $497 without mentioning
        the subscription it sits on top of, and that page's own comment calls
        "every reader already pays" a load-bearing assumption. A free account
        reading the offer here is exactly the stranger that warning describes.

        The placement argument still holds for whoever does see it — the scan is
        running, they are watching a progress bar, and it is the calmest moment
        in the product to read an offer. It just no longer applies to the free
        account this screen was mostly built for.

        The guard wraps the spacer too, so a hidden card leaves no gap.
      */}
      {canOfferDoneForYou(user) && (
        <div className="mt-5">
          <DoneForYouCard
            title="Or skip the whole thing"
            body="While that runs — if you’d rather not do any of this yourself, I’ll do it all by hand. A login and half an hour is all I need."
          />
        </div>
      )}
    </>
  );
}

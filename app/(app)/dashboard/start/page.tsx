import type { Metadata } from 'next';
import { DoneForYouCard } from '@/components/dashboard/done-for-you-card';
import { OnboardingStart } from '@/components/dashboard/onboarding-start';
import { PageHeader } from '@/components/dashboard/page-header';

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

  return (
    <>
      <PageHeader
        title="Setting up your dashboard"
        description="We're reading your site and asking the AI engines about you."
      />
      <OnboardingStart domain={domain?.trim() || null} />

      {/*
        Offered here because this is the one screen with nothing to do on it.
        The scan is running and they are watching a progress bar — which is both
        the calmest moment in the product to read an offer and the last one
        before the work lands on them.

        Static, so this page stays a server component.
      */}
      <div className="mt-5">
        <DoneForYouCard
          title="Or skip the whole thing"
          body="While that runs — if you’d rather not do any of this yourself, I’ll do it all by hand. A login and half an hour is all I need."
        />
      </div>
    </>
  );
}

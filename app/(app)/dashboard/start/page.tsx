import type { Metadata } from 'next';
import { DoneForYouCard } from '@/components/dashboard/done-for-you-card';
import { PageHeader } from '@/components/dashboard/page-header';
import { ScanStart } from '@/components/dashboard/scan-start';

export const metadata: Metadata = { title: 'Setting up' };

/*
  Where a customer lands after paying.

  ⚠️ THIS REPLACED A REDIRECT TO /dashboard/audit?purchased=get_cited, which
  auto-ran a full audit from a useEffect. That arrangement filled in exactly one
  of four sections and left the other three empty until the customer found three
  more buttons — a staged signup confirmed it. The audit now runs as the first
  stage of a server-side job, so this page watches rather than works.
*/
export default function StartPage() {
  return (
    <>
      <PageHeader
        title="Setting up your dashboard"
        description="We're reading your site and asking the AI engines about you."
      />
      <ScanStart />

      {/*
        Offered here because this is the one screen with nothing to do on it.
        The customer has just paid, the scan is running, and they are watching
        a progress bar — which is both the calmest moment in the product to
        read an offer and the last one before the work lands on them.

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

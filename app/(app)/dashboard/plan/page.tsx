import type { Metadata } from 'next';
import { PageHeader } from '@/components/dashboard/page-header';
import { PlanWorkspace } from '@/components/dashboard/plan-workspace';

export const metadata: Metadata = { title: 'Your plan' };

/*
  Where every locked feature in the dashboard points, and where the pricing
  page's "Start Pro" lands.

  Sits under /dashboard so proxy.ts already treats it as protected: an arrival
  who is not signed in is bounced to /sign-up and comes straight back here
  afterwards. That is the whole flow the pricing CTA promises.

  ⚠️ THIS PAGE ONLY READS, and the writing half is a POST the client sends. A
  <Link> to this page is prefetched, and a server component cannot tell a
  prefetch from a visit — a checkout session created on GET would be created
  every time somebody's mouse crossed an upgrade button. Same rule the old
  /dashboard/checkout/start followed, and the reason it had a client half too.
*/
export default function PlanPage() {
  return (
    <>
      <PageHeader
        title="Your plan"
        description="What you have now, and what Pro adds."
      />
      <PlanWorkspace />
    </>
  );
}

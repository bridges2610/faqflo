import type { Metadata } from 'next';
import { requireUser, sitesForUser } from '@/lib/auth/dal';
import { CheckoutStart } from '@/components/dashboard/checkout-start';
import { PageHeader } from '@/components/dashboard/page-header';

export const metadata: Metadata = { title: 'Checkout' };

/*
  Where "Get set up" from the pricing page lands.

  Sits under /dashboard so proxy.ts already treats it as protected: an arrival
  who is not signed in is bounced to /sign-in?next=<this page, query and all>
  and comes straight back here afterwards. That is the whole flow the pricing
  CTA promises — click a price, sign in, pay — with no stop at the dashboard to
  hunt for a locked feature.

  This half only READS. Everything that writes happens in the POST the client
  half sends, because a <Link> to this page is prefetched and a server
  component cannot tell a prefetch from a visit.
*/
export const dynamic = 'force-dynamic';

export default async function CheckoutStartPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  const user = await requireUser();
  const { domain } = await searchParams;

  const sites = await sitesForUser(user.id);

  return (
    <>
      <PageHeader
        title="Get Cited"
        description="One payment for this site — the full audit, the answers, and the publish-ready export."
      />
      <CheckoutStart
        domain={domain?.trim() || null}
        sites={sites.map((s) => ({
          id: s.id,
          name: s.name,
          domain: s.domain,
          // So the picker can leave out sites that are already paid for rather
          // than offering a button that comes back 409.
          bought: Boolean(s.get_cited_at),
        }))}
      />
    </>
  );
}

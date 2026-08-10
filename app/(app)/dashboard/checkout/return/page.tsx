import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/dashboard/page-header';
import { fulfilCheckoutSession } from '@/lib/stripe/fulfil';

export const metadata: Metadata = { title: 'Thank you' };

/**
 * Where Stripe sends people after paying.
 *
 * This calls fulfilment directly rather than waiting for the webhook — not as
 * a replacement for it, but so somebody still sitting at their screen gets
 * access now instead of whenever delivery happens. Stripe recommends exactly
 * this pairing, and it is only safe because fulfilment is idempotent: the
 * webhook will run the same function again moments later and change nothing.
 *
 * The webhook remains the one that must not be skipped. This page is a page
 * somebody might close, lose signal before reaching, or never load at all.
 */
export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  const result = sessionId
    ? await fulfilCheckoutSession(sessionId).catch((err) => {
        /*
          Swallowed deliberately. If this fails the webhook will still fulfil,
          so the customer's purchase is not at risk — showing them a stack
          trace over something that is about to resolve itself would be
          alarming and wrong. Logged so it is not invisible to us.
        */
        console.error('Return-page fulfilment failed (webhook will retry):', err);
        return { status: 'pending' as const };
      })
    : { status: 'ignored' as const, reason: 'no session_id' };

  /*
    Granted means done — so don't make them read about it.

    This page used to be the destination: a thank-you card with a link onward.
    But nobody buys an audit in order to arrive at a receipt, and a page whose
    only purpose is a button is a page that gets closed. On success we send
    them into the thing they just paid for, and the confirmation rides along as
    ?purchased=1 for the workspace to acknowledge in a line.

    The redirect is deliberately AFTER fulfilment above: redirect() throws to
    unwind, so putting it earlier would skip the grant it is confirming.
  */
  if (result.status === 'granted') {
    redirect(
      result.product === 'get_cited'
        ? '/dashboard/audit?purchased=get_cited'
        : '/dashboard/tracking?purchased=stay_cited',
    );
  }

  /*
    Everything below is a case that genuinely needs a sentence rather than a
    destination: a bank debit still settling, or a return with no session to
    confirm. Redirecting those would drop somebody into a locked feature with
    no explanation of why it is still locked.
  */
  const pending = result.status === 'pending';

  return (
    <>
      <PageHeader
        title={pending ? 'Payment received' : 'Nothing to confirm'}
        description={
          pending
            ? 'Your bank is still settling the payment. We’ll unlock everything the moment it clears — no need to do anything.'
            : 'We couldn’t find a checkout to confirm. If you’ve just paid, it will still come through.'
        }
      />

      <Card className="p-6 sm:p-8">
        <p className="text-slate text-[0.9375rem] leading-relaxed">
          {pending
            ? 'Bank debits take a few days to clear. The webhook grants access the moment Stripe confirms it, whether or not this page is open.'
            : 'Nothing here needs your attention. If anything looks wrong in a few minutes, get in touch and we’ll sort it out.'}
        </p>

        <div className="mt-6">
          <ButtonLink href="/dashboard" size="md" arrow>
            Back to the dashboard
          </ButtonLink>
        </div>
      </Card>
    </>
  );
}

import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/dashboard/page-header';
import { UpgradeCelebration } from '@/components/dashboard/upgrade-celebration';
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
    Granted means done — and it is worth a beat.

    ⚠️ THIS USED TO REDIRECT STRAIGHT THROUGH, AND THE ARGUMENT FOR THAT IS
    RECORDED HERE BECAUSE IT IS STILL HALF RIGHT. It read: "nobody buys an audit
    in order to arrive at a receipt, and a page whose only purpose is a button
    is a page that gets closed." Both true — which is why what replaced it is
    not a receipt with a button, but a moment that leaves on its own after five
    seconds. Upgrading is the one thing in this product worth marking; being
    parked on a page to admire it is not.

    ⚠️ AND IT IS ONLY REACHED WHEN FULFILMENT GRANTED ON THIS REQUEST. The
    branches below — a debit still settling, a return with no session — get
    their sentence and no confetti. Congratulating somebody whose payment has
    not cleared is a promise this page cannot keep.

    ⚠️ THE CELEBRATION RENDERS AFTER fulfilCheckoutSession() ABOVE, for the same
    reason the redirect did: it is confirming the grant, so it must not run
    before it.
  */
  if (result.status === 'granted') {
    /*
      ⚠️ HOME, NOT THE AUDIT PAGE, AND THAT IS WHERE UpgradeCelebration SENDS
      THEM. The previous destination was /dashboard/audit?upgraded=pro, chosen
      because a new subscriber's score came from one page and Pro reads the
      whole site. Home is the screen with the headline numbers and the worklist,
      which reads as "here is everything now" — and the celebration has already
      said what changed, so the audit banner is no longer carrying that job.

      ⚠️ THE ?upgraded=pro BANNER IN audit-workspace.tsx STILL EXISTS and is
      still correct for anyone who reaches that URL; it is simply no longer on
      this path. Its note has been corrected to stop claiming subscribers land
      there.
    */
    return <UpgradeCelebration />;
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

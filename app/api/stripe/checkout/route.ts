import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth/dal';
import { isPro } from '@/lib/auth/entitlements';
import { createCheckoutSession } from '@/lib/stripe/checkout';
import { parsePurchase } from '@/lib/stripe/products';

/*
  Start a Checkout Session.

  Authenticated, and the identity is what gets carried into the session's
  metadata — the only thing the webhook will have to go on later.

  ⚠️ THE AUTHORISATION HERE USED TO BE MUCH HEAVIER, AND IT IS WORTH KNOWING WHY
  IT ISN'T NOW. Get Cited was bought per SITE, so this endpoint decided which
  site a payment would unlock, and a caller naming any site id could have their
  own payment grant somebody else's row. Ownership therefore had to be proved
  against the database before Stripe was touched at all.

  Pro belongs to the account, and the account is the session. There is no id to
  forge: the only thing this endpoint can buy is Pro, for whoever is signed in.
*/

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return fail('Sign in to buy.', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.', 400);
  }

  const purchase = parsePurchase((body ?? {}) as Record<string, unknown>);
  if (!purchase) return fail('Nothing to buy.', 400);

  /*
    Already paying. Checked before any Stripe call — creating a session first
    and validating after would leave an abandoned session behind for every
    rejected attempt.

    ⚠️ Read from the profile row, not from anything the client said. The upgrade
    card hides its button for a subscriber and the plan page shows "Manage
    billing" instead, but neither is a control: a POST straight to this endpoint
    is one line of fetch, and the result would be a second subscription on the
    same account — two invoices a month, one of which nobody can find.

    A subscriber who wants to switch monthly↔annual does it in the billing
    portal, which changes the price on the existing subscription rather than
    opening a second one.
  */
  if (isPro(user)) {
    return fail("You're already on Pro. Use Manage billing to change your plan.", 409);
  }

  try {
    // See lib/stripe/checkout.ts for why the metadata block must not be
    // rewritten anywhere else.
    const url = await createCheckoutSession(purchase, user);

    return NextResponse.json({ url });
  } catch (err) {
    // Same taxonomy shape as the Anthropic routes: most specific first.
    if (err instanceof Stripe.errors.StripeAuthenticationError) {
      return fail('The configured Stripe key was rejected.', 500);
    }
    if (err instanceof Stripe.errors.StripeConnectionError) {
      return fail("Couldn't reach Stripe. Check your connection and try again.", 502);
    }
    /*
      The switch-to-live failure, named.

      Test and live are separate namespaces: a price id or customer id from one
      simply does not exist in the other. Stripe reports that as
      `resource_missing` — "No such price" — which reads like a typo in an id
      rather than a key from the wrong mode, and costs an afternoon.

      Two ways to arrive here after going live: STRIPE_PRICE_* still holding
      test ids, or a profile still holding a stripe_customer_id created in test
      mode (that column is reused rather than recreated, so it survives the
      switch and poisons the account until it is cleared).
    */
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing') {
      console.error('Stripe resource_missing — test/live mismatch?', err.message);
      return fail(
        'That price or customer does not exist in this Stripe account. This usually means a test-mode id is configured against a live-mode key (or the reverse).',
        500,
      );
    }
    if (err instanceof Stripe.errors.StripeError) {
      console.error('Stripe error creating checkout session:', err.type, err.message);
      return fail('Stripe returned an error. Please try again.', 502);
    }
    console.error('Unexpected checkout error:', err);
    return fail('Something went wrong starting checkout. Please try again.', 500);
  }
}

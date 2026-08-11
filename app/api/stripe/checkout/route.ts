import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { currentUser, siteForUser, sitesForUser } from '@/lib/auth/dal';
import { createCheckoutSession } from '@/lib/stripe/checkout';
import { parsePurchase, type Purchase } from '@/lib/stripe/products';

/*
  Start a Checkout Session.

  Authenticated, and the authorisation here is the point: Get Cited is bought
  per SITE, so this endpoint decides which site a payment will unlock. A caller
  who could name any site id would be buying a stranger's upgrade — or, more
  usefully to them, could have their own payment grant somebody else's row.

  So ownership is proved from the database before Stripe is touched at all, and
  the verified ids are carried into the session's metadata. That metadata is
  the only thing the webhook will have to go on later.
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

  try {
    // Ownership and eligibility, before any Stripe call. Creating a session
    // first and validating after would leave abandoned sessions behind for
    // every rejected attempt.
    const guard = await checkPurchasable(purchase, user.id);
    if (guard) return guard;

    // Session creation itself is shared with /api/checkout/start — see
    // lib/stripe/checkout.ts for why the metadata block must not be rewritten.
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

/** Refuse anything that shouldn't reach Stripe. Returns a response, or null. */
async function checkPurchasable(purchase: Purchase, userId: string) {
  /*
    Stay Cited follows Get Cited, and this is where that is TRUE rather than
    merely displayed. The UI hides the button (components/dashboard/upgrade-card.tsx)
    and the pricing page points at Get Cited instead — but neither is a control.
    A POST straight to this endpoint is one line of fetch.

    The reason it is a rule at all: Stay Cited watches whether the answers Get
    Cited wrote are being cited. Subscribing with nothing set up buys a monthly
    report on an empty set, which we would then be charging $29/month for.
  */
  if (purchase.product === 'stay_cited') {
    const sites = await sitesForUser(userId);
    if (!sites.some((s) => s.get_cited_at)) {
      return fail('Get Cited comes first — set up a site before subscribing.', 409);
    }
    return null;
  }

  const site = await siteForUser(purchase.siteId, userId);
  // 404 rather than 403, as elsewhere: confirming a site id exists but belongs
  // to someone else answers a question that isn't ours to answer.
  if (!site) return fail('No such site on your account.', 404);

  /*
    ⚠️ Deliberately `get_cited_at` rather than "is the window still open".

    Get Cited is bought ONCE per site. A site whose 30 days have run out must
    not be sold another one — the fix for that customer is Stay Cited, and
    charging $129 for a window they have already had would be indefensible.
    lib/dashboard/plans.ts:getCitedExpired is what routes them to the right
    offer; this is the backstop if it ever doesn't.
  */
  if (site.get_cited_at) {
    return fail('Get Cited has already been bought for this site.', 409);
  }

  return null;
}

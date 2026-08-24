import 'server-only';

import { siteOrigin } from '@/lib/auth/origin';
import type { ProfileRow } from '@/lib/supabase/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from './client';
import { priceFor, type Purchase } from './products';

/**
 * Creating a Checkout Session, in one place.
 *
 * ⚠️ ONE CALLER NOW, AND IT STAYS A SEPARATE FUNCTION ANYWAY. There used to be
 * two routes starting checkout — one for a signed-in customer clicking a locked
 * feature, one for somebody arriving from the pricing page who might not have a
 * site yet — and they differed in how they worked out WHAT to buy. There is only
 * one thing to buy now, so /api/stripe/checkout is the only caller.
 *
 * ⚠️ What is not allowed to be reimplemented: the metadata block. It is the
 * only thing the webhook will have when it arrives, so a session created
 * without it takes the customer's money and grants nothing — and the failure
 * shows up minutes later in a log, not at the point of the mistake.
 *
 * ⚠️ AUTHORISATION IS NOT DONE HERE. This function bills whoever it is handed.
 * Proving that is the signed-in user, and that they are not already paying, is
 * the calling route's job before it gets this far.
 */

/** Where Stripe sends people afterwards. Both live under the dashboard. */
function urlsFor(origin: string) {
  return {
    // {CHECKOUT_SESSION_ID} is substituted by Stripe on redirect. The return
    // page uses it to fulfil immediately rather than waiting for delivery.
    success_url: `${origin}/dashboard/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard`,
  };
}

export async function createCheckoutSession(
  purchase: Purchase,
  user: Pick<ProfileRow, 'id' | 'email' | 'name'>,
): Promise<string> {
  const customerId = await customerForUser(user.id, user.email, user.name);
  const origin = await siteOrigin();

  const session = await stripe().checkout.sessions.create({
    // Always a subscription now. Get Cited was the only thing that was ever
    // 'payment', so checkoutMode() went with it rather than becoming a function
    // with one possible answer.
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceFor(purchase), quantity: 1 }],

    /*
      The "Add promotion code" field on Stripe's hosted page.

      ⚠️ THE DURATION CAVEAT NOW BITES, WHICH IT COULD NOT BEFORE. This flag used
      to be Get Cited-only precisely because "a percentage off a subscription
      repeats every month unless the coupon says otherwise", and there was a
      one-time price to put codes on instead. There isn't any more, so launch
      discounts have nowhere else to live and the flag is on — which makes a
      coupon's duration (once / repeating / forever) a real decision every time
      one is created. A `forever` coupon on Pro is a permanent price cut for that
      customer, granted by a dropdown.

      ⚠️ The codes themselves live in Stripe, not here. Create a Coupon, then a
      Promotion Code on it (the coupon is the discount; the promotion code is
      the string a customer types). They exist per MODE — codes made in test
      mode do not work in live, exactly like prices. Give any public code a
      redemption limit AND an expiry.

      ⚠️ Mutually exclusive with `discounts`. If a coupon ever needs applying
      automatically, that field replaces this one — passing both is an error,
      not a merge.
    */
    allow_promotion_codes: true,

    /*
      How fulfilment finds its way home.

      The webhook arrives with nothing but the session, so everything needed to
      grant the right thing to the right row has to be written here — where the
      caller has just proved it.
    */
    metadata: {
      userId: user.id,
      product: purchase.product,
      // Not read by fulfilment — the subscription object is the source of truth
      // for what is being paid for. Kept because a support question about a
      // charge is answered far faster by a session that says which price it was.
      period: purchase.period,
    },
    // Also stamped on the subscription itself, so its own events — which do
    // not carry the checkout session — can still be traced back to a person.
    subscription_data: { metadata: { userId: user.id, period: purchase.period } },

    ...urlsFor(origin),
  });

  if (!session.url) {
    throw new Error('Stripe created a checkout session without a URL.');
  }

  return session.url;
}

/**
 * The account's Stripe customer, created on first purchase.
 *
 * Reused rather than recreated so one person is one customer in Stripe — which
 * is what makes their payment history, the billing portal, and subscription
 * webhooks all refer to the same entity.
 *
 * Written with the service-role client because `stripe_customer_id` has no
 * grant for `authenticated`, deliberately: a browser that can rewrite it can
 * point its billing at somebody else's card.
 */
async function customerForUser(
  userId: string,
  email: string,
  name: string | null,
): Promise<string> {
  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle<{ stripe_customer_id: string | null }>();

  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const customer = await stripe().customers.create({
    email,
    name: name ?? undefined,
    // So a Stripe-side lookup can get back to the account without a join.
    metadata: { userId },
  });

  const { error } = await supabase
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId);

  if (error) throw new Error(`Failed to store Stripe customer id: ${error.message}`);

  return customer.id;
}

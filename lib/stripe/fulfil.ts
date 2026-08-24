import 'server-only';

import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from './client';

/**
 * Granting what someone paid for.
 *
 * ⚠️ THIS FILE GOT MUCH SMALLER, AND THE REASON IS WORTH KNOWING BEFORE ADDING
 * TO IT. It used to carry grantGetCited(), revokeGetCited(),
 * revokeForPaymentIntent() and a confirmation email, because Get Cited was a
 * one-time payment that had to be turned into a row by hand — with idempotence
 * guards, a send-once email flag, and a way to take it back on refund, all
 * written here because nothing else knew the purchase had happened.
 *
 * Pro is a subscription. Stripe already models "is this person currently
 * paying" and emits an event whenever the answer changes, so the only
 * fulfilment left is copying that answer onto the profile. Refunds, disputes,
 * cancellations and failed renewals all arrive as subscription events and all
 * land in applySubscription() — there is no second path to keep in step.
 *
 * fulfilCheckoutSession() is still called from two places, on purpose:
 *
 *   - the webhook, which is the RELIABLE path. Stripe's guidance is blunt
 *     about why it cannot be skipped: "someone can pay successfully in
 *     Checkout and then lose their connection to the internet before your
 *     landing page loads."
 *   - the return page, which is the FAST path, so a customer who is still
 *     sitting there sees access immediately rather than waiting on delivery.
 *
 * Which means it runs twice for most purchases, sometimes concurrently, and
 * Stripe retries failed deliveries for up to three days. Every write below is
 * an idempotent overwrite. Nothing here may increment, append, or charge.
 */

/** What happened, so the return page can say something true. */
export type Fulfilment =
  | { status: 'granted'; product: 'pro' }
  | { status: 'pending' }
  | { status: 'ignored'; reason: string };

/**
 * Fulfil a Checkout Session by id.
 *
 * The session is re-fetched from Stripe rather than trusted from the webhook
 * payload — the payload is a snapshot from when the event fired, and for
 * delayed payment methods `payment_status` can have moved on since.
 */
export async function fulfilCheckoutSession(sessionId: string): Promise<Fulfilment> {
  const session = await stripe().checkout.sessions.retrieve(sessionId);

  /*
    'unpaid' is the one status that must not grant anything. Bank debits and
    similar complete Checkout and settle later, so a session can exist, look
    finished to the customer, and still not be money yet. Those come back
    later as checkout.session.async_payment_succeeded.

    ⚠️ DENY-LIST, NOT AN ALLOW-LIST, AND THAT IS LOAD-BEARING.

    PaymentStatus is 'paid' | 'unpaid' | 'no_payment_required'. The third one
    is what a 100%-off promotion code produces, and Pro accepts promotion codes
    (see allow_promotion_codes in lib/stripe/checkout.ts). Testing for
    `=== 'unpaid'` grants it; the tempting "tightening" to `!== 'paid'` would
    silently refuse every fully-discounted redemption — the code would appear
    to work, the customer would be charged nothing, and nothing would unlock.
  */
  if (session.payment_status === 'unpaid') return { status: 'pending' };

  const product = session.metadata?.product;
  const userId = session.metadata?.userId;

  if (!userId) return { status: 'ignored', reason: 'no userId in session metadata' };
  if (product !== 'pro') {
    return { status: 'ignored', reason: `unknown product: ${product ?? 'none'}` };
  }

  /*
    ⚠️ NOTHING IS WRITTEN HERE, AND THAT IS NOT AN OVERSIGHT.

    The subscription's own events are the source of truth for whether it is
    active, and they keep arriving long after this one — renewals, failures,
    cancellations. Writing `plan: 'pro'` from the checkout session as well would
    mean two writers for one field, and the one that fires once would sometimes
    land after the one that fires forever: a cancellation processed, then
    overwritten by a redelivered checkout event from three days ago.

    The return page still gets a truthful answer. 'granted' answers "did this
    person just buy Pro?", which is what it needs to decide where to send them —
    not "has the database caught up yet".
  */
  return { status: 'granted', product: 'pro' };
}

/**
 * Set the account's plan from a Stripe subscription object.
 *
 * Derived from the CURRENT object every time rather than accumulated from the
 * event stream, because Stripe does not guarantee ordering: a `deleted` event
 * can arrive before the `updated` that preceded it. Reading the status off
 * whichever object we are holding makes the handler order-independent — the
 * last one to arrive wins, and it is telling us the present state.
 *
 * ⚠️ THIS IS ALSO THE REFUND PATH. There is no charge.refunded handler any
 * more; there does not need to be. Refunding a subscription without cancelling
 * it does not end the entitlement (and should not — the customer is still
 * subscribed), and cancelling it fires customer.subscription.deleted, which
 * lands here. Getting money back and losing access are separate acts in Stripe
 * and the person issuing the refund does both.
 */
export async function applySubscription(subscription: Stripe.Subscription): Promise<void> {
  const supabase = createAdminClient();

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  /*
    'active' and 'trialing' are entitled; everything else is not.

    past_due deliberately counts as NOT entitled. It means a renewal failed,
    and tracking costs us money on every run — continuing to spend it on an
    account that is not paying is the wrong side to err on. Stripe will retry
    the payment and send another event if it succeeds.
  */
  const entitled = subscription.status === 'active' || subscription.status === 'trialing';

  const { data, error } = await supabase
    .from('profiles')
    .update({
      plan: entitled ? 'pro' : 'free',
      /*
        The billing anniversary the monthly check budget is counted from.

        Cleared when it lapses, so the dashboard never shows a "member since"
        for a subscription that is not running — and so trackingPeriod() falls
        through to the free tier's lifetime window rather than walking months
        forward from a date that no longer means anything.
      */
      plan_since: entitled ? new Date(subscription.created * 1000).toISOString() : null,
    })
    .eq('stripe_customer_id', customerId)
    .select('id');

  if (error) {
    throw new Error(`Failed to apply subscription for customer ${customerId}: ${error.message}`);
  }

  const userId = data?.[0]?.id;
  if (!userId) {
    /*
      No profile carries this customer id. Logged rather than thrown: the most
      likely cause is a test-mode customer arriving at a live database (or the
      reverse), and turning that into a 500 makes Stripe retry a delivery that
      can never succeed for three days.
    */
    console.error(`No profile for Stripe customer ${customerId}; subscription not applied.`);
    return;
  }

  await setWeeklySchedule(supabase, userId, entitled);
}

/**
 * Start or stop the weekly automatic check for every site on an account.
 *
 * ⚠️ THE CURSOR AND THE ENTITLEMENT ARE TWO FACTS AND THEY CAN DISAGREE. This
 * is the only thing that keeps them together, so it runs on every subscription
 * event rather than only on the transitions — a renewal that arrives while
 * next_check_at is somehow null puts it back.
 *
 * Failures are logged, not thrown. claim_due_checks() re-checks profiles.plan
 * on every sweep (see 0012), so a cursor left set on a lapsed account spends
 * nothing — the query simply will not match it. The cost of a failure here is a
 * Pro customer waiting up to a week extra for their first check, which is worth
 * far less than turning a successful payment into a webhook retry storm.
 */
async function setWeeklySchedule(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  entitled: boolean,
): Promise<void> {
  /*
    now() rather than "a week from now" on upgrade: the first weekly check
    should happen on the day they pay, not seven days into a subscription they
    are still deciding about. The nightly sweep picks it up within the day.
  */
  const query = supabase
    .from('sites')
    .update({ next_check_at: entitled ? new Date().toISOString() : null })
    .eq('user_id', userId);

  // Only touch rows that need it, so a renewal does not reset a cadence that is
  // already running and shunt everyone's check day to the invoice date.
  const { error } = entitled
    ? await query.is('next_check_at', null)
    : await query.not('next_check_at', 'is', null);

  if (error) {
    console.error(`Could not update the check schedule for user ${userId}:`, error.message);
  }
}

/**
 * Claim a Stripe event id, or report that it was already handled.
 *
 * Insert-first rather than select-then-insert. Two concurrent deliveries of
 * the same event both pass a prior existence check and both fulfil; only the
 * primary key can arbitrate, because only it is atomic. `23505` is Postgres'
 * unique_violation — here it means somebody else got there first.
 */
export async function claimEvent(id: string, type: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('stripe_events').insert({ id, type });

  if (!error) return true;
  if (error.code === '23505') return false;

  throw new Error(`Failed to record Stripe event ${id}: ${error.message}`);
}

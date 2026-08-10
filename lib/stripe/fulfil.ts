import 'server-only';

import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from './client';

/**
 * Granting what someone paid for.
 *
 * Called from two places, on purpose:
 *
 *   - the webhook, which is the RELIABLE path. Stripe's guidance is blunt
 *     about why it cannot be skipped: "someone can pay successfully in
 *     Checkout and then lose their connection to the internet before your
 *     landing page loads."
 *   - the return page, which is the FAST path, so a customer who is still
 *     sitting there sees access immediately rather than waiting on delivery.
 *
 * Which means this runs twice for most purchases, sometimes concurrently, and
 * Stripe retries failed deliveries for up to three days. So every write below
 * is either an idempotent overwrite or guarded by a "has this already
 * happened" check. Nothing here may increment, append, or charge.
 */

/** What happened, so the return page can say something true. */
export type Fulfilment =
  | { status: 'granted'; product: 'get_cited' | 'stay_cited' }
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
  */
  if (session.payment_status === 'unpaid') return { status: 'pending' };

  const product = session.metadata?.product;
  const userId = session.metadata?.userId;

  if (!userId) return { status: 'ignored', reason: 'no userId in session metadata' };

  if (product === 'get_cited') {
    const siteId = session.metadata?.siteId;
    if (!siteId) return { status: 'ignored', reason: 'get_cited session without siteId' };

    await grantGetCited(siteId, userId);
    return { status: 'granted', product: 'get_cited' };
  }

  if (product === 'stay_cited') {
    /*
      Nothing to do here. The subscription's own events are the source of
      truth for whether it is active, and they keep arriving long after this
      one — renewals, failures, cancellations. Writing 'stay_cited' from the
      checkout session as well would mean two writers for one field, and the
      one that fires once would sometimes land after the one that fires
      forever.
    */
    return { status: 'granted', product: 'stay_cited' };
  }

  return { status: 'ignored', reason: `unknown product: ${product ?? 'none'}` };
}

/**
 * Mark a site as bought.
 *
 * Scoped by BOTH id and owner. The service-role client bypasses row-level
 * security, so this `eq('user_id', …)` is not a second opinion on top of a
 * policy — it is the only thing standing between a bad `siteId` and writing to
 * a stranger's row. The userId comes from session metadata we set ourselves at
 * checkout, after verifying ownership; it is never read from a request body.
 *
 * `is('get_cited_at', null)` makes the write idempotent: the first call sets
 * the timestamp, every retry matches nothing and changes nothing. Without it a
 * redelivered event would push the purchase date forward each time.
 */
async function grantGetCited(siteId: string, userId: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('sites')
    .update({ get_cited_at: new Date().toISOString() })
    .eq('id', siteId)
    .eq('user_id', userId)
    .is('get_cited_at', null);

  if (error) throw new Error(`Failed to grant Get Cited for site ${siteId}: ${error.message}`);
}

/**
 * Set the account's subscription from a Stripe subscription object.
 *
 * Derived from the CURRENT object every time rather than accumulated from the
 * event stream, because Stripe does not guarantee ordering: a `deleted` event
 * can arrive before the `updated` that preceded it. Reading the status off
 * whichever object we are holding makes the handler order-independent — the
 * last one to arrive wins, and it is telling us the present state.
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

  const { error } = await supabase
    .from('profiles')
    .update({
      subscription: entitled ? 'stay_cited' : 'none',
      // Cleared when it lapses, so the dashboard never shows a "member since"
      // for a subscription that is not running.
      subscription_since: entitled ? new Date(subscription.created * 1000).toISOString() : null,
    })
    .eq('stripe_customer_id', customerId);

  if (error) {
    throw new Error(`Failed to apply subscription for customer ${customerId}: ${error.message}`);
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

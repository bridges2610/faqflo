import 'server-only';

import type Stripe from 'stripe';
import { trySendEmail } from '@/lib/email/client';
import { setUpEmail } from '@/lib/email/templates';
import { GET_CITED_GRACE_DAYS, GET_CITED_WINDOW_DAYS } from '@/lib/dashboard/plans';
import { enqueueScan } from '@/lib/scan/enqueue';
import { createAdminClient } from '@/lib/supabase/admin';
import { cancelPendingMilestones, ensureMilestones } from '@/lib/tracking/schedule';
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

    ⚠️ DENY-LIST, NOT AN ALLOW-LIST, AND THAT IS LOAD-BEARING.

    PaymentStatus is 'paid' | 'unpaid' | 'no_payment_required'. The third one
    is what a 100%-off promotion code produces, and Get Cited accepts promotion
    codes (see allow_promotion_codes in lib/stripe/checkout.ts). Testing for
    `=== 'unpaid'` grants it; the tempting "tightening" to `!== 'paid'` would
    silently refuse every fully-discounted redemption — the code would appear
    to work, the customer would be charged nothing, and nothing would unlock.
  */
  if (session.payment_status === 'unpaid') return { status: 'pending' };

  const product = session.metadata?.product;
  const userId = session.metadata?.userId;

  if (!userId) return { status: 'ignored', reason: 'no userId in session metadata' };

  if (product === 'get_cited') {
    const siteId = session.metadata?.siteId;
    if (!siteId) return { status: 'ignored', reason: 'get_cited session without siteId' };

    const newlyGranted = await grantGetCited(siteId, userId);

    /*
      The confirmation email, only on the call that actually granted.

      This function runs at least twice per purchase — the return page for
      speed, the webhook for reliability — so gating on `newlyGranted` is the
      difference between one email and two. Awaited rather than fired and
      forgotten because the webhook may be torn down the moment it responds,
      and trySendEmail() cannot throw, so waiting costs latency and nothing else.

      ⚠️ The status returned below stays 'granted' either way. It answers
      "does this customer own it?", which is what the return page needs to
      decide where to send them — not "did anything change just now".
    */
    if (newlyGranted) await announceSetUp(siteId, userId, session.id);

    /*
      Start the first scan.

      ⚠️ NOT gated on `newlyGranted`, unlike the email above. This is
      deliberately the other way round: the email must send exactly once, and
      `newlyGranted` is the only thing that can promise it. The scan must EXIST
      exactly once, which is a different guarantee and one the database already
      makes — scan_jobs carries a partial unique index on site_id for live jobs
      (0010), so a second call is a duplicate the insert quietly absorbs.

      Gating on `newlyGranted` would have been the more obvious choice and would
      have been wrong: whichever of the two fulfilment paths lands first wins the
      flag, and if that one then failed to insert, the other would decline to try.
      A paid customer with no scan is the worst outcome here.

      ⚠️ Failures are logged, not thrown. app/api/stripe/webhook/route.ts:126
      claims the Stripe event BEFORE running this, so a throw here would have its
      retry discarded as a duplicate — the customer would have paid, been
      granted, and silently never scanned. The scan is recoverable by other
      means; the grant is not, so the grant is what gets to fail loudly.
    */
    await enqueueScan(siteId, userId);

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
 * Mark a site as bought. Returns whether THIS call was the one that did it.
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
 *
 * ⚠️ The RETURN VALUE is what makes the confirmation email sendable exactly
 * once. Fulfilment runs at least twice for every purchase — the return page
 * and the webhook, sometimes concurrently — and both would otherwise have
 * equal claim to "this was a successful purchase, send the email". Only the
 * row count can settle it, so `.select()` turns the idempotent write into an
 * answer rather than a silent no-op.
 */
async function grantGetCited(siteId: string, userId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const boughtAt = new Date();

  /*
    ⚠️ THE DEADLINE IS WRITTEN HERE, NOT COMPUTED LATER.

    Every read used to derive it from `get_cited_at` plus a constant, which meant
    changing that constant moved the deadline for every existing customer at
    once. Storing it at the moment of sale is what lets the number change for
    future buyers without touching anyone who has already paid.

    The stored date carries GET_CITED_GRACE_DAYS on top of the 90 the customer is
    quoted. That slack exists so the day-90 check, which is due at UTC midnight
    and fired by a once-a-day sweep, cannot land on the wrong side of its own
    window and be refused.
  */
  const expiresAt = new Date(boughtAt);
  expiresAt.setDate(expiresAt.getDate() + GET_CITED_WINDOW_DAYS + GET_CITED_GRACE_DAYS);

  const { data, error } = await supabase
    .from('sites')
    .update({
      get_cited_at: boughtAt.toISOString(),
      get_cited_expires_at: expiresAt.toISOString(),
    })
    .eq('id', siteId)
    .eq('user_id', userId)
    .is('get_cited_at', null)
    .select('id');

  if (error) throw new Error(`Failed to grant Get Cited for site ${siteId}: ${error.message}`);

  const granted = (data?.length ?? 0) > 0;

  /*
    Lay down the four scheduled checks the moment the sale lands, rather than
    waiting for the nightly sweep to notice this site.

    Not fatal if it fails: `ensureMilestones()` is idempotent against
    unique (site_id, day) and the sweep runs it again over every site each night,
    so the worst case is a schedule that appears a few hours late. Throwing here
    would turn a successful payment into a failed webhook and a retry storm.
  */
  if (granted) {
    try {
      await ensureMilestones(siteId);
    } catch (err) {
      console.error(`Could not schedule checks for site ${siteId}:`, err);
    }
  }

  return granted;
}

/**
 * Tell the customer their site is set up.
 *
 * Reads the name and email back rather than taking them from the Stripe
 * session: the session's customer details are whatever they typed into
 * checkout, and the account is the thing that actually owns the entitlement.
 * They are usually the same and occasionally not.
 *
 * ⚠️ CANNOT THROW, AND THAT IS LOAD-BEARING.
 *
 * The webhook claims each event BEFORE handling it, so an exception here would
 * return 500, Stripe would retry, and the retry would be discarded as a
 * duplicate — the purchase would be granted and the log would say it failed.
 * Worse, this is the last step of a flow where money has already moved. Mail
 * is a courtesy; it does not get a vote on whether payment succeeded.
 */
async function announceSetUp(siteId: string, userId: string, sessionId: string): Promise<void> {
  try {
    const supabase = createAdminClient();

    const [{ data: profile }, { data: site }] = await Promise.all([
      supabase.from('profiles').select('email, name').eq('id', userId).maybeSingle<{
        email: string;
        name: string | null;
      }>(),
      supabase.from('sites').select('name').eq('id', siteId).maybeSingle<{ name: string }>(),
    ]);

    if (!profile?.email || !site?.name) {
      console.error(`No profile or site for the set-up email (user ${userId}, site ${siteId}).`);
      return;
    }

    await trySendEmail(
      {
        to: profile.email,
        ...setUpEmail(profile.name, site.name),
        // Keyed on the checkout session, so the same purchase can never send
        // twice even if the database guard is somehow bypassed.
        idempotencyKey: `setup-${sessionId}`,
      },
      'set-up email',
    );
  } catch (err) {
    console.error('Set-up email failed (the purchase itself is unaffected):', err);
  }
}

/* ------------------------------------------------------------- revocation --- */

/** What a revocation did, so the caller can log something true. */
export type Revocation =
  | { status: 'revoked'; siteId: string }
  | { status: 'ignored'; reason: string };

/**
 * Take Get Cited back after a full refund or a chargeback.
 *
 * The hard part is not the write, it is knowing WHOSE. A charge knows about
 * money and nothing about sites, so the only honest route back is the Checkout
 * Session that produced it — which carries the `userId` and `siteId` we stamped
 * at checkout, after proving ownership.
 *
 * ⚠️ That indirection is the security property, not an inconvenience to
 * optimise away. Anything closer to hand — a customer id, an email on the
 * charge — would be identity inferred from a payment object rather than a fact
 * we established, and this runs with the service-role client, which is bound by
 * nothing.
 *
 * Deliberately narrow: `get_cited` only. Stay Cited is written by
 * applySubscription() from subscription events, and a refunded invoice is not a
 * cancellation — Stripe will say so itself if the subscription actually ends.
 * Two writers for one field is the thing that note warns about.
 */
export async function revokeForPaymentIntent(paymentIntentId: string): Promise<Revocation> {
  const sessions = await stripe().checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  });

  const session = sessions.data[0];
  if (!session) {
    return { status: 'ignored', reason: `no checkout session for ${paymentIntentId}` };
  }

  const product = session.metadata?.product;
  const userId = session.metadata?.userId;
  const siteId = session.metadata?.siteId;

  if (product !== 'get_cited') {
    return { status: 'ignored', reason: `not a Get Cited purchase (${product ?? 'no product'})` };
  }
  if (!userId || !siteId) {
    return { status: 'ignored', reason: 'session metadata is missing userId or siteId' };
  }

  await revokeGetCited(siteId, userId);
  return { status: 'revoked', siteId };
}

/**
 * Clear the purchase. The exact mirror of grantGetCited, including its guards.
 *
 * Scoped by BOTH id and owner: the service-role client bypasses row-level
 * security, so that `eq('user_id', …)` is not a second opinion on top of a
 * policy — it is the only thing standing between a bad id and a stranger's row.
 *
 * `.not('get_cited_at', 'is', null)` is the idempotence, matching the
 * `.is('get_cited_at', null)` on the grant: the first call clears it, every
 * retry matches nothing. Stripe redelivers for up to three days.
 *
 * Nulling rather than flagging is deliberate. It restores the row to exactly
 * the state it had before the purchase, which means the customer can buy again
 * — checkPurchasable() 409s on a non-null `get_cited_at`, so a "refunded" flag
 * would leave them permanently unable to repurchase the thing they refunded.
 */
async function revokeGetCited(siteId: string, userId: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('sites')
    .update({ get_cited_at: null, get_cited_expires_at: null })
    .eq('id', siteId)
    .eq('user_id', userId)
    .not('get_cited_at', 'is', null);

  if (error) throw new Error(`Failed to revoke Get Cited for site ${siteId}: ${error.message}`);

  /*
    ⚠️ AND CANCEL THE CHECKS THAT HAVE NOT RUN.

    Without this a refunded site keeps a schedule: the entitlement is gone, but
    four rows still say 'pending' and the nightly sweep would happily spend
    engine calls on somebody who has their money back. Completed rows stay —
    they record work that was really done, and deleting them would make the
    chart disagree with the checks table it is drawn from.
  */
  await cancelPendingMilestones(siteId);
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

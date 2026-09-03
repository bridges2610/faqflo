import 'server-only';

import type Stripe from 'stripe';
import { siteOrigin } from '@/lib/auth/origin';
import { enqueueTrackingJob } from '@/lib/scan/enqueue';
import { createAdminClient } from '@/lib/supabase/admin';
import { startWeeklySchedule, stopWeeklySchedule } from '@/lib/tracking/schedule';
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
 * ⚠️ THE WRITES THEMSELVES LIVE IN lib/tracking/schedule.ts NOW. This function
 * used to do them inline while that module sat unused, so there were two
 * implementations of "start the cadence" and only one of them ran. The stagger
 * belongs to whichever one is real, so there is now only one.
 *
 * Failures are logged, not thrown, inside those helpers. claim_due_checks()
 * re-checks profiles.plan on every sweep (see 0012), so a cursor left set on a
 * lapsed account spends nothing — the query simply will not match it. The cost
 * of a failure here is a Pro customer waiting for a check, which is worth far
 * less than turning a successful payment into a webhook retry storm.
 */
async function setWeeklySchedule(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  entitled: boolean,
): Promise<void> {
  if (!entitled) {
    await stopWeeklySchedule(userId);
    return;
  }

  await startWeeklySchedule(userId);

  /*
    ⚠️ AND ONE CHECK RIGHT NOW, BECAUSE THE CADENCE ALONE WOULD READ AS BROKEN.

    The cursor is staggered 0-6 days out so customers do not all fire on the same
    night. On its own that would mean somebody upgrades, and sees nothing new for
    up to a week — and there IS something new to see: free tracks 3 prompts and
    Pro tracks 25, so the first Pro run is what fills in the other 22. Paying and
    then waiting a week for the thing you paid for is the wrong first day.

    So: the recurring schedule is staggered, and the first run happens
    immediately. Only for accounts that already have questions to ask — a brand
    new signup's onboarding scan is doing this already, and enqueueTrackingJob
    would be refused by the one-live-job-per-site index anyway.
  */
  await runCheckNow(supabase, userId);
}

/**
 * Queue an immediate tracking run for every site on an upgraded account.
 *
 * ⚠️ QUEUED, NOT RUN. This is a Stripe webhook: it must answer fast or Stripe
 * retries it, and asking 25 prompts across 3 engines takes minutes. The work
 * goes to scan_jobs and /api/scan/tick slices through it, exactly as the nightly
 * cron does — see app/api/cron/tracking/route.ts, which this mirrors down to the
 * unawaited poke at the end.
 *
 * A refusal is not an error worth surfacing. `created: false` means a scan is
 * already live for that site, which on a fresh signup is the onboarding scan
 * doing this very job.
 */
async function runCheckNow(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.from('sites').select('id').eq('user_id', userId);

  if (error) {
    console.error(`Could not read sites to check for user ${userId}:`, error.message);
    return;
  }

  let queued = 0;
  for (const site of data ?? []) {
    const result = await enqueueTrackingJob(site.id as string, userId);
    if (result.ok && result.created) queued += 1;
  }

  if (queued === 0) return;

  /*
    Unawaited, like the cron's own poke: awaiting the chain would make this
    webhook wait for a check that takes minutes, and Stripe would give up on it
    long before it finished.
  */
  try {
    const base = await siteOrigin();
    void fetch(`${base}/api/scan/tick`, { method: 'POST' }).catch(() => {});
  } catch (err) {
    // The job is queued either way; tonight's sweep pokes the queue if this
    // failed, so a missing origin delays the first run rather than losing it.
    console.error('Could not poke the scan queue after an upgrade:', err);
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

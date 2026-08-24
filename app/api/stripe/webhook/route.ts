import type Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { stripe, webhookSecret } from '@/lib/stripe/client';
import { applySubscription, claimEvent, fulfilCheckoutSession } from '@/lib/stripe/fulfil';

/*
  Stripe's webhook. THE ONLY UNAUTHENTICATED WRITE PATH IN THE APP.

  Every other route asks who is calling. This one cannot — Stripe is the
  caller, and it has no session. The signature IS the authentication, which is
  why the verification below is not a formality: without it, anyone who knows
  this URL can POST a fabricated `checkout.session.completed` and grant
  themselves anything they like, for free.

  Three properties this handler must have, all from Stripe's own guidance:

  1. VERIFY AGAINST THE RAW BODY. "Stripe requires the raw body of the request
     to perform signature verification... Any manipulation to the raw body of
     the request causes the verification to fail."
  2. BE IDEMPOTENT. Stripe retries for up to three days and a fulfilment
     function "might be called multiple times, possibly concurrently, for the
     same Checkout Session."
  3. ANSWER QUICKLY. Checkout waits up to 10 seconds for this endpoint before
     redirecting the customer, so nothing slow belongs in the success path.

  Events also arrive out of order, so nothing here accumulates state — each
  handler reads the current object and writes what it says.
*/

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });

  /*
    ⚠️ .text(), never .json().

    Signature verification hashes the exact bytes Stripe sent. Parsing to JSON
    and re-serialising produces different bytes — different key order,
    different whitespace — and verification fails with a message that says
    nothing about the cause. This one line is the whole reason webhook
    integrations are hard to debug.
  */
  const raw = await request.text();

  /*
    ⚠️ Resolved BEFORE the try, and this placement is the whole point.

    It used to be an argument to constructEventAsync() inside the catch below,
    which meant a missing STRIPE_WEBHOOK_SECRET and a forged request came back
    identically: 400, "Invalid signature." Those are opposite problems. One is
    a stranger poking at the endpoint and can be ignored; the other is a
    production deploy where EVERY purchase takes the customer's money and
    grants nothing — and it looks exactly like the harmless one.

    That is not a theoretical worry: probing the deployed endpoint from outside
    could not distinguish them, so a broken deploy would have looked healthy.

    So: our fault is a 500, their fault is a 400. Stripe retries either way, but
    the dashboard now shows which of us to go and fix.
  */
  let client: Stripe;
  let secret: string;
  try {
    // BOTH of them. stripe() throws on a missing STRIPE_SECRET_KEY exactly as
    // webhookSecret() does on a missing signing secret, so leaving either one
    // inside the verification try reopens the same hole.
    client = stripe();
    secret = webhookSecret();
  } catch (err) {
    console.error('Stripe webhook is not configured:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    // The async variant: identical result, but it does not require a
    // synchronous crypto implementation, so it keeps working if this ever
    // moves off the Node runtime.
    event = await client.webhooks.constructEventAsync(raw, signature, secret);
  } catch (err) {
    /*
      Now unambiguous: the secret exists, so this is a signature that does not
      match it — a forgery, or a secret from the wrong environment (the test
      `stripe listen` value deployed to production is the classic). Log and
      refuse; never fall through to processing an unverified payload.
    */
    console.error('Stripe signature verification failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  try {
    /*
      Claim the event before acting on it. A redelivery loses the race for the
      primary key and returns here having changed nothing — which is the whole
      idempotency guarantee, in one insert.
    */
    const fresh = await claimEvent(event.id, event.type);
    if (!fresh) return NextResponse.json({ received: true, duplicate: true });

    await handle(event);

    return NextResponse.json({ received: true });
  } catch (err) {
    /*
      500 on purpose: a non-2xx tells Stripe to retry, which is what we want
      when our own database was briefly unavailable. The event id has been
      claimed, so a naive retry would be skipped as a duplicate — see the note
      in handle() about why that is acceptable here and what to do if it stops
      being.
    */
    console.error(`Stripe webhook failed for ${event.type} (${event.id}):`, err);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }
}

/**
 * Route one event.
 *
 * Only the types this integration actually needs. Stripe's advice is to
 * subscribe narrowly — "listening for extra events (or all events) puts undue
 * strain on your server" — so anything unrecognised is acknowledged and
 * dropped rather than inspected.
 *
 * ⚠️ Known limitation: the event is claimed before this runs, so if a handler
 * throws, Stripe's retry is treated as a duplicate and skipped. That is the
 * right trade at this volume — a double-grant is worse than a missed one,
 * because a missed one is visible to the customer and fixable from the Stripe
 * dashboard with "Resend". If fulfilment ever grows side effects that are
 * expensive to redo by hand, move the claim to AFTER a successful handle and
 * make each write idempotent on its own terms instead.
 */
async function handle(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    /*
      Two events, one meaning. `completed` covers cards, which settle
      instantly; `async_payment_succeeded` covers bank debits and the like,
      where Checkout finishes before the money arrives. Handling only the first
      means delayed-payment customers pay and never get access.
    */
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      await fulfilCheckoutSession(session.id);
      return;
    }

    /*
      The subscription's own lifecycle. `updated` is the one that matters most
      — it carries renewals, lapses, plan switches and cancellations-at-period-
      end alike, and applySubscription reads the resulting status rather than
      inferring anything from which event fired.
    */
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await applySubscription(event.data.object);
      return;
    }

    /*
      ⚠️ NO charge.refunded AND NO charge.dispute.created, AND THAT IS A CHANGE.

      Both used to be handled here, because Get Cited was a one-time payment:
      the only record that it had been bought was a column we wrote ourselves,
      so the only way to un-buy it was to watch the money and write the column
      back. A subscription has no such column to guard — Stripe holds the
      answer to "is this person currently paying", and every way that answer can
      change emits a customer.subscription.* event, which the case above already
      handles.

      Concretely: refunding an invoice without cancelling does not end the
      subscription, and it should not — the customer is still subscribed and
      still being served. Cancelling fires `deleted`. A dispute that goes
      unanswered ends in Stripe cancelling the subscription, which also fires
      `deleted`. Adding a charge-level handler back would be a second writer for
      profiles.plan, racing the first, for no case the first does not already
      cover.

      ⚠️ IF THESE ARE RE-ADDED, UNSUBSCRIBE THEM IN THE STRIPE DASHBOARD TOO —
      and the reverse: they are still listed on the webhook endpoint from the
      old model, where they are now delivered, claimed, and ignored. Harmless,
      but see step 7 of .env.example for the list that should be there.
    */
    default:
      return;
  }
}

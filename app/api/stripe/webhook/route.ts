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

  let event: Stripe.Event;
  try {
    // The async variant: identical result, but it does not require a
    // synchronous crypto implementation, so it keeps working if this ever
    // moves off the Node runtime.
    event = await stripe().webhooks.constructEventAsync(raw, signature, webhookSecret());
  } catch (err) {
    // A failure here is either a misconfigured secret or a forgery, and from
    // the outside those look the same. Log and refuse; never fall through to
    // processing an unverified payload.
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

    default:
      return;
  }
}

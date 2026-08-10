import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth/dal';
import { siteOrigin } from '@/lib/auth/origin';
import { stripe } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';

/*
  Open Stripe's hosted billing portal.

  Cancelling, changing a card, switching monthly/annual and downloading
  invoices all happen on Stripe's side. Building any of that ourselves would
  mean handling card details and proration rules for no benefit — and a
  cancellation flow we own is one a customer can be prevented from finishing,
  which is exactly the pattern people distrust.

  The customer id comes from the signed-in account's own row, never from the
  request. A portal session for an id supplied by the caller would let anyone
  who guessed a customer id read somebody else's invoices and cancel their
  subscription.
*/

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST() {
  const user = await currentUser();
  if (!user) return fail('Sign in to manage billing.', 401);

  try {
    const supabase = createAdminClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle<{ stripe_customer_id: string | null }>();

    // No customer means they have never bought anything, so there is no
    // billing to manage. The UI hides the link in that case; this is the
    // matching server-side answer rather than a Stripe error.
    if (!profile?.stripe_customer_id) {
      return fail('There is nothing to manage yet — no purchases on this account.', 404);
    }

    const origin = await siteOrigin();
    const session = await stripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/dashboard`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      console.error('Stripe error creating portal session:', err.type, err.message);
      /*
        The likeliest cause in a fresh account is that the portal has never
        been configured in the Stripe dashboard — Stripe returns an error
        rather than a default. Worth saying so, because the message otherwise
        reads as a bug in this app.
      */
      return fail(
        'Could not open the billing portal. If this is a new Stripe account, configure the Customer Portal in Settings → Billing first.',
        502,
      );
    }
    console.error('Unexpected portal error:', err);
    return fail('Something went wrong opening billing. Please try again.', 500);
  }
}

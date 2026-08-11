import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { currentUser, sitesForUser } from '@/lib/auth/dal';
import { normalizeDomain } from '@/lib/dashboard/domain';
import { createCheckoutSession } from '@/lib/stripe/checkout';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SiteRow } from '@/lib/supabase/types';

/*
  Buying Get Cited from the pricing page, without a detour through the product.

  The difference from /api/stripe/checkout is only in the first half. That
  route is for a customer already inside the dashboard, who has a site
  selected; this one is for somebody who has just clicked a price and may have
  no site at all. It works out WHAT to buy — creating the site if the domain
  they scanned on the home page has not been saved yet — and then hands over to
  the same createCheckoutSession().

  ⚠️ POST, and only POST. This creates database rows and Stripe sessions, and
  the entry point is a <Link>, which Next prefetches on hover. As a GET this
  would create a site every time somebody's mouse crossed the pricing button.
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

  const { domain: rawDomain, siteId } = (body ?? {}) as Record<string, unknown>;

  try {
    const site = await resolveSite(user.id, rawDomain, siteId);
    if ('error' in site) return fail(site.error, site.status);

    /*
      Already bought. Not an error worth showing a card decline screen for —
      they own it, so send them where they were trying to get to. This is the
      normal result of a double-submit or a back button, not a mistake.
    */
    if (site.row.get_cited_at) {
      return NextResponse.json({ url: '/dashboard/audit', alreadyOwned: true });
    }

    const url = await createCheckoutSession(
      { product: 'get_cited', siteId: site.row.id },
      user,
    );

    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeAuthenticationError) {
      return fail('The configured Stripe key was rejected.', 500);
    }
    if (err instanceof Stripe.errors.StripeConnectionError) {
      return fail("Couldn't reach Stripe. Check your connection and try again.", 502);
    }
    // The test/live mismatch. Same reasoning as the sibling route — this is the
    // path the pricing page uses, so it is the one a launch is most likely to
    // hit first. See app/api/stripe/checkout/route.ts for the full note.
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing') {
      console.error('Stripe resource_missing — test/live mismatch?', err.message);
      return fail(
        'That price or customer does not exist in this Stripe account. This usually means a test-mode id is configured against a live-mode key (or the reverse).',
        500,
      );
    }
    if (err instanceof Stripe.errors.StripeError) {
      console.error('Stripe error starting checkout:', err.type, err.message);
      return fail('Stripe returned an error. Please try again.', 502);
    }
    console.error('Unexpected checkout-start error:', err);
    return fail('Something went wrong starting checkout. Please try again.', 500);
  }
}

type Resolved = { row: SiteRow } | { error: string; status: number };

/**
 * Which site is being bought for.
 *
 * Three ways in, in order of how much the caller already knows:
 *
 *   siteId  — they picked one from their existing sites.
 *   domain  — carried from the home page scan, may or may not exist yet.
 *   neither — nothing to buy; the page asks.
 */
async function resolveSite(
  userId: string,
  rawDomain: unknown,
  siteId: unknown,
): Promise<Resolved> {
  const sites = await sitesForUser(userId);

  if (typeof siteId === 'string' && siteId) {
    const picked = sites.find((s) => s.id === siteId);
    // 404 rather than 403 — confirming an id exists but belongs to someone
    // else answers a question that isn't ours to answer.
    if (!picked) return { error: 'No such site on your account.', status: 404 };
    return { row: picked };
  }

  if (typeof rawDomain !== 'string' || !rawDomain.trim()) {
    return { error: 'Which site is this for?', status: 400 };
  }

  const domain = normalizeDomain(rawDomain);
  if (!domain.includes('.')) {
    return { error: "That doesn't look like a web address.", status: 400 };
  }

  /*
    Find before create. Someone who scanned the same domain twice, or who
    abandoned a checkout and came back, must land on the SAME row — otherwise
    they end up with two copies of their site and pay to set up the empty one.

    The (user_id, domain) unique index is what makes that reliable rather than
    merely likely: two tabs racing here both check, both miss, and one loses
    the insert. Catching 23505 and re-reading is the only version of this that
    is correct under concurrency.
  */
  const existing = sites.find((s) => s.domain === domain);
  if (existing) return { row: existing };

  return createSiteRow(userId, domain);
}

/**
 * Insert the site, tolerating the race.
 *
 * Uses the service-role client rather than the user's own. Not to bypass a
 * policy — a signed-in user may insert their own site — but because this runs
 * in a route handler with no browser session to borrow, and `user_id` is set
 * from the verified session id rather than anything in the request body.
 */
async function createSiteRow(userId: string, domain: string): Promise<Resolved> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('sites')
    // The name is the domain until they rename it. Asking someone to name
    // their own business before they have bought anything is a form to fill in
    // between the price and the card, and that is where people leave.
    .insert({ user_id: userId, name: domain, domain })
    .select()
    .single<SiteRow>();

  if (!error && data) return { row: data };

  // 23505 — the other tab won. Its row is the right one.
  if (error?.code === '23505') {
    const { data: won } = await supabase
      .from('sites')
      .select('*')
      .eq('user_id', userId)
      .eq('domain', domain)
      .maybeSingle<SiteRow>();

    if (won) return { row: won };
  }

  throw new Error(`Failed to create site for ${domain}: ${error?.message ?? 'no row returned'}`);
}

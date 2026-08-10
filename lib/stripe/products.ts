/**
 * What can be bought, and which Stripe price sells it.
 *
 * The two products are different shapes, and the difference is the whole
 * reason this file is not a flat list of price ids:
 *
 *   Get Cited  — one-time, and belongs to a SITE.    sites.get_cited_at
 *   Stay Cited — subscription, and belongs to the ACCOUNT. profiles.subscription
 *
 * That is the same split lib/dashboard/plans.ts describes, and it decides the
 * Checkout `mode` as well as which row fulfilment writes. A single "plan" enum
 * would have to pick one scope and be wrong about the other.
 *
 * Price ids live in env rather than in code so the amounts can change in the
 * Stripe dashboard without a deploy, and so test and live modes can differ
 * without a branch. ⚠️ The displayed prices in
 * components/marketing/pricing-teaser.tsx are NOT derived from these — Stripe
 * charges what its price says, the page says what it says, and keeping them in
 * agreement is a manual job. The pricing page's own header comment says the
 * same thing.
 */

export type Purchase =
  | { product: 'get_cited'; siteId: string }
  | { product: 'stay_cited'; period: 'monthly' | 'annual' };

export type ProductId = Purchase['product'];

/** Checkout mode follows from the product, not from the caller. */
export function checkoutMode(product: ProductId): 'payment' | 'subscription' {
  return product === 'get_cited' ? 'payment' : 'subscription';
}

/**
 * The Stripe price for a purchase.
 *
 * Throws rather than returning undefined: a missing price id means checkout
 * cannot happen, and finding that out at the point of use — with the name of
 * the variable to set — beats a Stripe error about a malformed request.
 */
export function priceFor(purchase: Purchase): string {
  const name =
    purchase.product === 'get_cited'
      ? 'STRIPE_PRICE_GET_CITED'
      : purchase.period === 'annual'
        ? 'STRIPE_PRICE_STAY_CITED_ANNUAL'
        : 'STRIPE_PRICE_STAY_CITED_MONTHLY';

  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured. See .env.example — it is a price id (price_…), not a product id.`);
  }

  return value;
}

/** Narrow an unvalidated request body into a Purchase, or null. */
export function parsePurchase(body: Record<string, unknown>): Purchase | null {
  if (body.product === 'get_cited') {
    return typeof body.siteId === 'string' && body.siteId
      ? { product: 'get_cited', siteId: body.siteId }
      : null;
  }

  if (body.product === 'stay_cited') {
    // Anything that isn't explicitly annual is monthly. A malformed period
    // should not silently bill someone for a year.
    return { product: 'stay_cited', period: body.period === 'annual' ? 'annual' : 'monthly' };
  }

  return null;
}

/**
 * What can be bought, and which Stripe price sells it.
 *
 * ⚠️ ONE PRODUCT NOW, IN TWO BILLING PERIODS. This file used to describe two
 * products of different shapes — Get Cited, one-time and belonging to a SITE,
 * and Stay Cited, recurring and belonging to the ACCOUNT — which is why it
 * carried a `checkoutMode()` that had to pick between 'payment' and
 * 'subscription', and a `Purchase` union whose two arms needed different
 * metadata. Both are retired. Pro is a subscription on the account, so the mode
 * is always 'subscription' and the only choice left is monthly or annual.
 *
 * Price ids live in env rather than in code so the amounts can change in the
 * Stripe dashboard without a deploy, and so test and live modes can differ
 * without a branch. ⚠️ The displayed prices in lib/dashboard/plans.ts (PRO_PRICE)
 * are NOT derived from these — Stripe charges what its price says, the app says
 * what it says, and keeping them in agreement is a manual job.
 */

export type BillingPeriod = 'monthly' | 'annual';

export type Purchase = { product: 'pro'; period: BillingPeriod };

export type ProductId = Purchase['product'];

/**
 * The Stripe price for a purchase.
 *
 * Throws rather than returning undefined: a missing price id means checkout
 * cannot happen, and finding that out at the point of use — with the name of
 * the variable to set — beats a Stripe error about a malformed request.
 */
export function priceFor(purchase: Purchase): string {
  const name =
    purchase.period === 'annual' ? 'STRIPE_PRICE_PRO_ANNUAL' : 'STRIPE_PRICE_PRO_MONTHLY';

  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not configured. See .env.example — it is a price id (price_…), not a product id.`,
    );
  }

  return value;
}

/**
 * Narrow an unvalidated request body into a Purchase, or null.
 *
 * ⚠️ ANYTHING THAT IS NOT EXPLICITLY 'annual' IS MONTHLY, and that default runs
 * in the safe direction on purpose: a malformed period should not silently bill
 * somebody $390 for a year. The reverse mistake costs us eleven months of
 * revenue we can ask for again; this one is a refund and an apology.
 */
export function parsePurchase(body: Record<string, unknown>): Purchase | null {
  if (body.product !== 'pro') return null;
  return { product: 'pro', period: body.period === 'annual' ? 'annual' : 'monthly' };
}

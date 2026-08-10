import 'server-only';

import Stripe from 'stripe';

/**
 * The Stripe client.
 *
 * No `apiVersion` passed, deliberately. The SDK pins its own — 22.4.0 ships
 * `2026-07-29.dahlia` — and its types are generated against exactly that.
 * Hardcoding a different string here is the classic way to get code that
 * typechecks against one shape and receives another; letting the SDK and its
 * types stay in lockstep means upgrading the package upgrades both together.
 *
 * Constructed per call rather than at module scope so a missing key fails with
 * the message below at the point of use, instead of throwing while the module
 * graph is still being evaluated — where it surfaces as an unrelated import
 * error three frames away.
 */
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not configured. See .env.example — use a test-mode key (sk_test_…) until the prices are final.',
    );
  }

  return new Stripe(key);
}

/** The signing secret for the webhook endpoint. Separate from the API key. */
export function webhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error(
      'STRIPE_WEBHOOK_SECRET is not configured. Locally it is printed by `stripe listen`; in production it comes from the webhook endpoint in the Stripe dashboard. They are different values.',
    );
  }

  return secret;
}

import 'server-only';

import { GET_CITED_WINDOW_DAYS, PAGE_BUDGET } from '@/lib/dashboard/plans';
import type { ProfileRow, SiteRow } from '@/lib/supabase/types';

/**
 * What the customer is entitled to, decided from database rows.
 *
 * The server-side twin of lib/dashboard/plans.ts. That file answers the same
 * questions for rendering — should this button be a button or an upgrade card
 * — from client state. This one answers them for enforcement, from rows the
 * customer cannot write. Both must exist: a UI that can't tell what you own
 * shows the wrong screen, and a server that trusts the UI has no security.
 *
 * The rule the API routes already state, at app/api/dashboard/generate/route.ts:29 —
 * "a client that tells the server which tier it is on is not authorization,
 * it's a bypass with extra steps." This file is what makes that avoidable.
 *
 * ⚠️ Two copies of a rule drift. The numbers are imported from plans.ts rather
 * than repeated, so a tier change lands in both at once, and the predicates
 * below are deliberately one-liners that are obvious to diff against theirs.
 * Note this imports only pure constants and types — not the dashboard's client
 * state — which is the distinction lib/audit/limits.ts:4 draws.
 */

/** Get Cited is one-time and belongs to a SITE. Permanent — never expires. */
export function hasGetCited(site: SiteRow | null): boolean {
  return Boolean(site?.get_cited_at);
}

/** Stay Cited is a subscription and belongs to the ACCOUNT. */
export function hasStayCited(user: ProfileRow | null): boolean {
  return user?.subscription === 'stay_cited';
}

/**
 * Bought, and still inside the 30-day window.
 *
 * ⚠️ The clock is the SERVER'S. plans.ts computes the same thing from the
 * browser's clock to decide what to render, and a browser clock can be set to
 * anything — which is exactly why this file exists and why the routes call
 * this copy rather than trusting a flag from the client.
 */
export function getCitedActive(site: SiteRow | null): boolean {
  if (!site?.get_cited_at) return false;

  const expiry = new Date(site.get_cited_at);
  expiry.setDate(expiry.getDate() + GET_CITED_WINDOW_DAYS);
  return expiry.getTime() > Date.now();
}

/**
 * May this site do work that costs us money right now?
 *
 * Every generating capability below is this predicate under a different name,
 * kept as separate one-liners so they stay obvious to diff against their twins
 * in plans.ts. Stay Cited is account-wide, so it re-opens a site whose own
 * window has closed — the upgrade path, and the reason these take `user` too.
 */
export function canGenerate(site: SiteRow | null, user: ProfileRow | null): boolean {
  return hasStayCited(user) || getCitedActive(site);
}

export function canRunFullAudit(site: SiteRow | null, user: ProfileRow | null): boolean {
  return canGenerate(site, user);
}

export function canContent(site: SiteRow | null, user: ProfileRow | null): boolean {
  return canGenerate(site, user);
}

export function canDiscover(site: SiteRow | null, user: ProfileRow | null): boolean {
  return canGenerate(site, user);
}

export function canRegenerate(site: SiteRow | null, user: ProfileRow | null): boolean {
  return canGenerate(site, user);
}

/**
 * Citation tracking — the subscription, and only the subscription.
 *
 * ⚠️ NOT an alias of canGenerate, unlike the four above. Get Cited does not buy
 * this at all, not even inside its 30 days: asking three search-backed engines
 * 25 questions four times a period is a recurring cost, and a one-off payment
 * cannot fund a recurring bill. It is the twin of canTrack in plans.ts, and the
 * only thing standing between a Get Cited customer and an unmetered spend on
 * somebody else's API.
 */
export function canTrack(user: ProfileRow | null): boolean {
  return hasStayCited(user);
}

/**
 * The publish-ready export. Permanent, and NOT gated on the window.
 *
 * The one capability here that deliberately outlives the subscription: it
 * hands back work already paid for rather than commissioning new work. See the
 * longer note in lib/dashboard/plans.ts.
 */
export function canPublish(site: SiteRow | null): boolean {
  return hasGetCited(site);
}

/**
 * How many pages an audit may read — computed here, never accepted from a body.
 *
 * app/api/audit/route.ts used to take `maxPages` from the request and merely
 * clamp it to the paid ceiling, which its own comment admitted "cannot enforce
 * the customer's actual tier". A free site asking for a hundred pages got a
 * hundred pages' worth of outbound requests to somebody else's server.
 *
 * Follows the window rather than the purchase: an expired site asking for a
 * hundred pages is the same outbound cost as a free one.
 */
export function pageBudgetFor(site: SiteRow | null, user: ProfileRow | null): number {
  return canGenerate(site, user) ? PAGE_BUDGET.paid : PAGE_BUDGET.free;
}

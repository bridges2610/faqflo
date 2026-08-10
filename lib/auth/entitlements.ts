import 'server-only';

import { PAGE_BUDGET } from '@/lib/dashboard/plans';
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

/** Get Cited is one-time and belongs to a SITE. */
export function hasGetCited(site: SiteRow | null): boolean {
  return Boolean(site?.get_cited_at);
}

/** Stay Cited is a subscription and belongs to the ACCOUNT. */
export function hasStayCited(user: ProfileRow | null): boolean {
  return user?.subscription === 'stay_cited';
}

export function canRunFullAudit(site: SiteRow | null): boolean {
  return hasGetCited(site);
}

export function canContent(site: SiteRow | null): boolean {
  return hasGetCited(site);
}

export function canDiscover(site: SiteRow | null): boolean {
  return hasGetCited(site);
}

export function canRegenerate(site: SiteRow | null, user: ProfileRow | null): boolean {
  return hasStayCited(user) || hasGetCited(site);
}

/**
 * How many pages an audit may read — computed here, never accepted from a body.
 *
 * app/api/audit/route.ts used to take `maxPages` from the request and merely
 * clamp it to the paid ceiling, which its own comment admitted "cannot enforce
 * the customer's actual tier". A free site asking for a hundred pages got a
 * hundred pages' worth of outbound requests to somebody else's server.
 */
export function pageBudgetFor(site: SiteRow | null): number {
  return hasGetCited(site) ? PAGE_BUDGET.paid : PAGE_BUDGET.free;
}

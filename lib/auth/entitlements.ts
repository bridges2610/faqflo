import 'server-only';

import {
  expiryFrom,
  PAGE_BUDGET,
  trackingPlan,
  type TrackingPlan,
} from '@/lib/dashboard/plans';
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
 * Bought, and still inside the window.
 *
 * ⚠️ The clock is the SERVER'S. plans.ts computes the same thing from the
 * browser's clock to decide what to render, and a browser clock can be set to
 * anything — which is exactly why this file exists and why the routes call
 * this copy rather than trusting a flag from the client.
 *
 * The deadline is the stored one since 0011, falling back to the constant for
 * rows written before it. Both halves live in expiryFrom() so the two twins
 * cannot disagree about a date that decides whether money gets spent.
 */
export function getCitedActive(site: SiteRow | null): boolean {
  if (!site?.get_cited_at) return false;

  const expiry = expiryFrom(site.get_cited_at, site.get_cited_expires_at);
  return Boolean(expiry && expiry.getTime() > Date.now());
}

/**
 * Which plan's tracking rules apply — the server twin of trackingPlanFor().
 *
 * The caps differ per plan now (15 questions against 35), and a cap read from
 * anywhere the customer can influence is not a cap. Every place that slices a
 * watch list or counts a budget takes it from here.
 */
export function trackingPlanFor(
  /* Pick<> rather than the whole row: lib/scan/run.ts selects a narrow shape of
     its own, and widening this to the full row would force that file to fetch
     columns it has no use for just to satisfy a signature. */
  site: Pick<SiteRow, 'get_cited_at' | 'get_cited_expires_at'> | null,
  user: Pick<ProfileRow, 'subscription'> | null,
): TrackingPlan | null {
  return trackingPlan({
    subscription: user?.subscription === 'stay_cited' ? 'stay_cited' : 'none',
    getCitedAt: site?.get_cited_at ?? null,
    getCitedExpiresAt: site?.get_cited_expires_at ?? null,
  });
}

/**
 * May the CUSTOMER start a check right now?
 *
 * ⚠️ Distinct from canTrack, which asks whether a check may run at all — the
 * scheduler needs that one. Get Cited runs on fixed days and has no button, so
 * the interactive route refuses it here rather than relying on the UI to hide
 * the control. A client that tells the server which tier it is on is not
 * authorization, it is a bypass with extra steps.
 */
export function canRunCheckNow(site: SiteRow | null, user: ProfileRow | null): boolean {
  return canTrack(site, user) && trackingPlanFor(site, user)?.schedule === 'weekly';
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
 * Running a citation check — the thing that spends money on engines.
 *
 * ⚠️ THIS USED TO BE SUBSCRIPTION-ONLY, AND THE REASON IT CHANGED MATTERS. The
 * old rule said Get Cited does not buy tracking "not even inside its 30 days",
 * because asking three search-backed engines 35 questions repeatedly is a
 * recurring cost and a one-off payment cannot fund a recurring bill. That risk
 * was real and has not gone away — it is now answered by a METER rather than a
 * closed door: the plan's `checksPerPeriod` is enforced in the tracking route
 * and in the milestone runner, so the ceiling on a Get Cited window is a fixed,
 * priced number of engine calls — 15 questions × 3 engines × 5 checks.
 *
 * ⚠️ IF THAT ENFORCEMENT IS EVER REMOVED, THIS MUST GO BACK TO hasStayCited.
 * The two changed together and only make sense together; an unmetered Get Cited
 * is exactly the unbounded spend the original comment warned about.
 *
 * Viewing past results is a different question — see canViewTracking.
 */
export function canTrack(site: SiteRow | null, user: ProfileRow | null): boolean {
  return canGenerate(site, user);
}

/**
 * Seeing citation results that were already collected. PERMANENT.
 *
 * The twin of canPublish, and for the same reason: it hands back work already
 * paid for rather than commissioning new work. A customer whose 30 days lapsed
 * keeps the report — the pricing page promises "everything you make stays yours
 * for good", and hiding measurements they paid to collect would contradict that
 * on the screen that sold it.
 *
 * Deliberately `hasGetCited` and not `getCitedActive`: the window governs what
 * may be RUN, never what may be READ.
 */
export function canViewTracking(site: SiteRow | null, user: ProfileRow | null): boolean {
  return hasGetCited(site) || hasStayCited(user);
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

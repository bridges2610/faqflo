import 'server-only';

import { PAGE_BUDGET, TRACKING_PLANS, type TrackingPlan } from '@/lib/dashboard/plans';
import type { PlanId } from '@/lib/dashboard/types';
import type { ProfileRow } from '@/lib/supabase/types';

/**
 * What the customer is entitled to, decided from database rows.
 *
 * The server-side twin of lib/dashboard/plans.ts. That file answers the same
 * questions for rendering — should this button be a button or an upgrade card
 * — from client state. This one answers them for enforcement, from rows the
 * customer cannot write. Both must exist: a UI that can't tell what you own
 * shows the wrong screen, and a server that trusts the UI has no security.
 *
 * The rule the API routes already state, at app/api/dashboard/generate/route.ts —
 * "a client that tells the server which tier it is on is not authorization,
 * it's a bypass with extra steps." This file is what makes that avoidable.
 *
 * ⚠️ Two copies of a rule drift. The numbers are imported from plans.ts rather
 * than repeated, so a plan change lands in both at once, and the predicates
 * below are deliberately one-liners that are obvious to diff against theirs.
 * Note this imports only pure constants and types — not the dashboard's client
 * state — which is the distinction lib/audit/limits.ts draws.
 *
 * ⚠️ THESE TAKE A PROFILE, NOT A SITE, AND THAT IS THE WHOLE SHAPE CHANGE. Get
 * Cited was per-site, so every predicate here used to take both and had to get
 * the precedence between them right. There is one account-level plan now. A
 * signature that still wants a site is a leftover — delete the argument rather
 * than passing null to satisfy it.
 */

/** The account's plan. Free is the answer for a missing profile, not an error. */
export function planOf(user: ProfileRow | null): PlanId {
  return user?.plan === 'pro' ? 'pro' : 'free';
}

/**
 * The one question. Every capability below is this under a different name.
 *
 * ⚠️ Read from the PROFILE ROW, which the browser cannot write — 0012 grants no
 * UPDATE on `plan` to `authenticated`, exactly as 0001 withheld it for
 * `subscription`. That is what makes this an authorization check rather than a
 * restatement of whatever the client believes.
 */
export function isPro(user: ProfileRow | null): boolean {
  return user?.plan === 'pro';
}

/** Which plan's tracking rules apply. Always one of them — free is a plan. */
export function trackingPlanFor(user: Pick<ProfileRow, 'plan'> | null): TrackingPlan {
  return TRACKING_PLANS[user?.plan === 'pro' ? 'pro' : 'free'];
}

/* ----------------------------------------------------------- capabilities --- */

export function canRunFullAudit(user: ProfileRow | null): boolean {
  return isPro(user);
}

export function canContent(user: ProfileRow | null): boolean {
  return isPro(user);
}

export function canDiscover(user: ProfileRow | null): boolean {
  return isPro(user);
}

/**
 * Writing answers with the model, in the dashboard — Pro only.
 *
 * The twin of canGenerate in lib/dashboard/plans.ts, which carries the
 * reasoning and the warning that goes with it: this gates
 * /api/dashboard/generate and NOTHING ELSE. The public tool at /free-report
 * posts to /api/generate and must stay open to strangers, or signing up makes
 * somebody worse off than not signing up.
 */
export function canGenerate(user: ProfileRow | null): boolean {
  return isPro(user);
}

/**
 * The publish-ready export.
 *
 * ⚠️ THIS WAS PERMANENT AND IS NOT ANY MORE. Under Get Cited it was gated on
 * "did they ever pay", because a one-time payment for a deliverable cannot be
 * revoked without it being a chargeback. Pro is a subscription: nothing is
 * bought outright, so nothing outlives it. What a lapsed account keeps instead
 * is the plain-text copy every free account gets. Do not "restore" the old
 * behaviour — the pricing page sells this one.
 */
export function canPublish(user: ProfileRow | null): boolean {
  return isPro(user);
}

/**
 * May we offer the done-for-you service to this account?
 *
 * The twin of canOfferDoneForYou in lib/dashboard/plans.ts, which carries the
 * reasoning. Unlike its neighbours here this enforces nothing — it decides
 * whether an advert renders on the two dashboard screens that are Server
 * Components, and there is no request to reject if somebody gets past it. A
 * stranger who reaches /done-for-you anyway still meets the form's own "On Pro
 * yet?" question, which is the actual backstop.
 */
export function canOfferDoneForYou(user: ProfileRow | null): boolean {
  return isPro(user);
}

/**
 * May a check run for this account at all — by anyone, including the scheduler?
 *
 * ⚠️ TRUE ON FREE, AND ONLY BECAUSE OF THE METER. Free buys three runs: three
 * questions across three engines, three times, counted against the plan's
 * checksPerPeriod over a period that never resets (see trackingPeriod in
 * plans.ts). The ceiling is enforced in app/api/dashboard/tracking/route.ts
 * and in lib/scan/run.ts.
 *
 * ⚠️ IF THAT ENFORCEMENT IS EVER REMOVED, THIS MUST GO BACK TO isPro. The two
 * changed together and only make sense together; an unmetered free tier is an
 * unbounded bill on somebody else's API, funded by nobody.
 *
 * Whether a PERSON may press a button is a different question — canRunCheckNow.
 */
export function canTrack(): boolean {
  return true;
}

/**
 * May the CUSTOMER start a check right now?
 *
 * ⚠️ Distinct from canTrack, which asks whether a check may run at all — the
 * onboarding scan and the weekly cron need that one. This one is about a
 * person pressing a button.
 *
 * ⚠️ IT USED TO BE isPro, AND THE REASON EXPIRED RATHER THAN BEING OVERRULED.
 * Free's run was automatic, single, and had no button, so the interactive route
 * refused it here. Free buys three runs now and the report has a Run button, so
 * refusing at this gate would refuse the feature.
 *
 * ⚠️ WHAT STILL REFUSES IS THE BUDGET, AND IT IS THE ONLY THING THAT NEEDS TO.
 * app/api/dashboard/tracking/route.ts counts citation_checks against
 * checksPerPeriod and 429s past it, and skips question/engine pairs already
 * stored today. Those two are the enforcement; this predicate is the plan's
 * permission. Do not fold the budget into it — a client that tells the server
 * which tier it is on is not authorization, it is a bypass with extra steps,
 * and the same is true of one that tells the server how much it has spent.
 */
export function canRunCheckNow(): boolean {
  return true;
}

/**
 * Seeing citation results that were already collected. PERMANENT.
 *
 * The plan governs what may be RUN, never what may be READ. Someone who
 * cancels keeps the readings they paid to collect; hiding them would be
 * rewriting their history to sell a resubscribe. Kept as a function rather than
 * inlined `true` so the reason stays attached to the decision.
 */
export function canViewTracking(): boolean {
  return true;
}

/**
 * How many pages an audit may read — computed here, never accepted from a body.
 *
 * app/api/audit/route.ts used to take `maxPages` from the request and merely
 * clamp it to the paid ceiling, which its own comment admitted "cannot enforce
 * the customer's actual tier". A free site asking for a hundred pages got a
 * hundred pages' worth of outbound requests to somebody else's server.
 */
export function pageBudgetFor(user: ProfileRow | null): number {
  return isPro(user) ? PAGE_BUDGET.pro : PAGE_BUDGET.free;
}

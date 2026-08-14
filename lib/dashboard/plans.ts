/**
 * What the customer is entitled to, and where each entitlement lives.
 *
 * ⚠️ SOURCE OF TRUTH FOR WHAT EACH TIER BUYS IS THE PRICING PAGE
 * (components/marketing/pricing-teaser.tsx). If a bullet changes there, change
 * it here in the same commit: a dashboard that grants more than the page sells
 * is a support ticket, and one that grants less is a refund.
 *
 * The important structural point: these are two DIFFERENT scopes.
 *
 *   Get Cited  — one-time, per SITE.    site.getCitedAt
 *   Stay Cited — subscription, ACCOUNT. user.subscription
 *
 * So the gating helpers take whichever object actually owns the answer. A
 * single "plan" enum would have to pick one scope and be wrong about the other.
 *
 * ⚠️ AND A THIRD AXIS: TIME. Get Cited buys the setup permanently and the
 * ability to GENERATE for 30 days. So `getCitedAt` answers two different
 * questions, and conflating them is the mistake this file is arranged to
 * prevent — see hasGetCited vs getCitedActive below.
 */

import type { DashboardData, Site, Subscription, User } from './types';

export const FREE_FAQ_CAP = 5;

/**
 * How long Get Cited keeps generating for.
 *
 * ⚠️ Deadlines are COMPUTED from `getCitedAt`, not stored. Changing this number
 * therefore moves the deadline for every existing customer, retroactively —
 * shortening it takes access away from people who already paid. If either that
 * or comping an individual extension is ever needed, add a stored
 * `sites.get_cited_expires_at` and read it here instead.
 */
export const GET_CITED_WINDOW_DAYS = 30;

/** When the window closes for a site, or null if it was never bought. */
export function getCitedExpiry(site: Site | null): Date | null {
  if (!site?.getCitedAt) return null;

  const expiry = new Date(site.getCitedAt);
  expiry.setDate(expiry.getDate() + GET_CITED_WINDOW_DAYS);
  return expiry;
}

/**
 * Whole days left in the window. Negative once it has closed, null if unbought.
 *
 * Rounded UP, so "1 day left" means there is still some of today rather than a
 * countdown that reads 0 while the feature is demonstrably still working.
 */
export function getCitedDaysLeft(site: Site | null, now: Date = new Date()): number | null {
  const expiry = getCitedExpiry(site);
  if (!expiry) return null;

  return Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);
}

/**
 * How many pages an audit may read.
 *
 * A BUDGET, NOT A GOAL. The crawler spends it on the pages most worth reading
 * rather than the first hundred it trips over — see scoreCandidate() in
 * lib/audit/fetcher.ts. The free tier is one page because that endpoint is
 * unauthenticated and every page is an outbound request to somebody else's
 * server.
 */
export const PAGE_BUDGET = { free: 1, paid: 100 } as const;

export function pageBudgetFor(site: Site | null, user: User | null): number {
  return canGenerate(site, user) ? PAGE_BUDGET.paid : PAGE_BUDGET.free;
}

/**
 * How many prompts a subscription may track.
 *
 * ⚠️ THIS IS NOT DERIVED FROM A PAGE COUNT, AND MUST NOT BE.
 *
 * Scanning is priced per page; tracking is priced per query. They scale
 * differently and belong to different jobs: someone with 30 pages might care
 * about 15 prompts, and someone with 3 pages might care about 40. Tying the two
 * would charge people for questions they never asked.
 *
 * A prompt is one question we watch. What it COSTS is derived from it —
 * engineChecksFor() below — so the cost is visible without being the unit
 * anyone has to reason in.
 */
export const STAY_CITED_PROMPT_CAP = 25;

/** How often each tracked prompt is put to the engines. Weekly. */
export const TRACKING_RUNS_PER_PERIOD = 4;

/** The real cost of a prompt allowance: every prompt, every engine, every run. */
export function engineChecksFor(promptCap: number, engines: number, runs: number): number {
  return promptCap * engines * runs;
}

export type EntitlementId = 'get_cited' | 'stay_cited';

export const ENTITLEMENTS: Record<
  EntitlementId,
  { label: string; price: string; scope: 'site' | 'account'; blurb: string }
> = {
  get_cited: {
    label: 'Get Cited',
    price: '$129 once',
    scope: 'site',
    blurb:
      'The full audit, the complete answer set, and the publish-ready export for this site — plus 30 days to work with them.',
  },
  /*
    ⚠️ The blurb leads on what this ACTUALLY does today, which is re-open
    generation across every site once its 30-day window closes. Citation
    tracking is the reason the subscription exists and is not built yet — there
    is no engine-querying code anywhere in this repo — so it is named as coming
    rather than sold as running. Anything here that promises a scheduled check
    is a promise nothing in the codebase can keep.
  */
  stay_cited: {
    label: 'Stay Cited',
    price: '$29/month',
    scope: 'account',
    blurb:
      'Keeps every site on your account generating after its 30 days — new audits and unlimited answers, for as long as you keep it. Citation tracking is coming.',
  },
};

/* ----------------------------------------------------------- capabilities --- */

/*
  ⚠️ THE TWO QUESTIONS `getCitedAt` ANSWERS, AND WHY THEY MUST STAY APART.

    hasGetCited(site)     — did they ever pay for this site?   PERMANENT.
    getCitedActive(site)  — are they still inside the window?  EXPIRES.

  What was bought is a deliverable plus a period of work. The deliverable —
  the audit they already have, the answers already written, the export — is
  theirs forever, because that is what "$129 once, yours to keep" on the
  pricing page promises and taking it back later would be a chargeback. The
  period of work — running NEW audits, generating NEW answers — is what the
  subscription sells, and it has to end or Stay Cited has nothing to offer.

  So: anything that SPENDS money when the customer clicks it (an LLM call, a
  crawl of somebody else's server) is gated on canGenerate. Anything that only
  reads back what they already paid for is gated on hasGetCited.
*/

/** Ever bought for this site. Permanent — never expires. */
export function hasGetCited(site: Site | null): boolean {
  return Boolean(site?.getCitedAt);
}

export function hasStayCited(user: User | null): boolean {
  return user?.subscription === 'stay_cited';
}

/** Bought, and still inside the 30-day window. */
export function getCitedActive(site: Site | null, now: Date = new Date()): boolean {
  const left = getCitedDaysLeft(site, now);
  return left !== null && left > 0;
}

/** Bought, but the window has closed and no subscription is covering it. */
export function getCitedExpired(site: Site | null, user: User | null): boolean {
  return hasGetCited(site) && !getCitedActive(site) && !hasStayCited(user);
}

/**
 * May this site do work that costs us money right now?
 *
 * The single predicate every generating feature defers to. Stay Cited is
 * account-wide, so it re-opens a site whose own window has closed — which is
 * the entire upgrade path, and the reason these take `user` as well as `site`.
 */
export function canGenerate(site: Site | null, user: User | null): boolean {
  return hasStayCited(user) || getCitedActive(site);
}

/** The full audit — the free score is on the marketing page, not in here. */
export function canRunFullAudit(site: Site | null, user: User | null): boolean {
  return canGenerate(site, user);
}

/** Discover: what people actually ask AI in this category. */
export function canDiscover(site: Site | null, user: User | null): boolean {
  return canGenerate(site, user);
}

/**
 * The publish-ready HTML, schema and llms.txt export.
 *
 * ⚠️ NOT time-limited, deliberately. This is how a customer takes what they
 * paid for away with them, and it reads from work already done rather than
 * commissioning any. Gating it on the window would mean selling someone their
 * own HTML and then locking the door — see the block above.
 */
export function canPublish(site: Site | null): boolean {
  return hasGetCited(site);
}

/**
 * The content plan: which pages the site is missing, and what to write next.
 *
 * Get Cited rather than free, for a reason that isn't only commercial — it is
 * built on the full crawl. A free audit reads exactly one page, and a
 * must-have-pages table derived from the home page alone would report every
 * other page as missing. The gate keeps the feature from lying.
 */
export function canContent(site: Site | null, user: User | null): boolean {
  return canGenerate(site, user);
}

/** Citation tracking is the subscription, and only the subscription. */
export function canTrack(user: User | null): boolean {
  return hasStayCited(user);
}

/** Regenerating an answer set — an LLM call, so it follows the window. */
export function canRegenerate(site: Site | null, user: User | null): boolean {
  return canGenerate(site, user);
}

/**
 * How many answers a site may hold.
 *
 * Keyed to hasGetCited rather than the window: this is a cap on what may be
 * KEPT, and shrinking it at day 31 would mean deleting answers somebody paid
 * to have written. What stops at day 31 is writing new ones — canRegenerate.
 */
export function faqCapFor(site: Site | null): number {
  return hasGetCited(site) ? Number.POSITIVE_INFINITY : FREE_FAQ_CAP;
}

/**
 * May this account start a Stay Cited subscription?
 *
 * Get Cited comes first: the subscription watches whether the answers Get
 * Cited wrote are being picked up, so subscribing with nothing set up buys a
 * monthly report on an empty set. Mirrored server-side in
 * app/api/stripe/checkout/route.ts, which is where it is actually enforced.
 */
export function canBuyStayCited(sites: Site[]): boolean {
  return sites.some((s) => Boolean(s.getCitedAt));
}

/** Sites are unlimited — the money is per site, so a cap would only cost us. */
export function canAddSite(): boolean {
  return true;
}

/* --------------------------------------------------------------- summary --- */

export type AccountSummary = {
  subscription: Subscription;
  sitesOwned: number;
  sitesWithGetCited: number;
};

export function summarise(data: DashboardData): AccountSummary {
  return {
    subscription: data.user.subscription,
    sitesOwned: data.sites.length,
    sitesWithGetCited: data.sites.filter((s) => s.getCitedAt).length,
  };
}

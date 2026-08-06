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
 */

import type { DashboardData, Site, Subscription, User } from './types';

export const FREE_FAQ_CAP = 5;

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

export function pageBudgetFor(site: Site | null): number {
  return hasGetCited(site) ? PAGE_BUDGET.paid : PAGE_BUDGET.free;
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
    blurb: 'The full audit, the complete answer set, and the publish-ready export for this site.',
  },
  stay_cited: {
    label: 'Stay Cited',
    price: '$29/month',
    scope: 'account',
    blurb: 'Citation tracking, monthly re-audits, and the gap loop across your sites.',
  },
};

/* ----------------------------------------------------------- capabilities --- */

/** Bought for this site. Everything in the Get Cited bundle keys off this. */
export function hasGetCited(site: Site | null): boolean {
  return Boolean(site?.getCitedAt);
}

export function hasStayCited(user: User | null): boolean {
  return user?.subscription === 'stay_cited';
}

/** The full audit — the free score is on the marketing page, not in here. */
export function canRunFullAudit(site: Site | null): boolean {
  return hasGetCited(site);
}

/** Discover: what people actually ask AI in this category. */
export function canDiscover(site: Site | null): boolean {
  return hasGetCited(site);
}

/** The publish-ready HTML, schema and llms.txt export. */
export function canPublish(site: Site | null): boolean {
  return hasGetCited(site);
}

/** Citation tracking is the subscription, and only the subscription. */
export function canTrack(user: User | null): boolean {
  return hasStayCited(user);
}

/**
 * Regenerating an answer set.
 *
 * Get Cited buys one properly-written set for a site. Unlimited regeneration is
 * a Stay Cited line on the pricing page, so a site with Get Cited alone gets a
 * finite number — otherwise the subscription's headline feature is free.
 */
export function canRegenerate(site: Site | null, user: User | null): boolean {
  return hasStayCited(user) || hasGetCited(site);
}

/** How many answers a site may hold. Free sites are capped; paid ones aren't. */
export function faqCapFor(site: Site | null): number {
  return hasGetCited(site) ? Number.POSITIVE_INFINITY : FREE_FAQ_CAP;
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

/**
 * What each paid plan is allowed to do.
 *
 * ⚠️ SOURCE OF TRUTH FOR THE FEATURE LIST IS THE PRICING PAGE.
 * Every limit here is transcribed from PLANS in
 * components/marketing/pricing-teaser.tsx. If a bullet changes there, change it
 * here in the same commit — a dashboard that grants more than the pricing page
 * sells is a support ticket, and one that grants less is a refund.
 *
 * Free isn't modelled: the free tier has no dashboard. It gets the rate-limited
 * generator on the homepage and nothing else.
 */

import type { PlanId } from './types';

export type PlanLimits = {
  label: string;
  /** Monthly price, matching the pricing card. */
  monthly: number;
  sites: number;
  /** 'basic' shows totals and the trend; 'full' adds the per-question table. */
  analytics: 'basic' | 'full';
  unansweredReport: boolean;
  concierge: boolean;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  pro: {
    label: 'Pro',
    monthly: 19,
    sites: 1,
    analytics: 'basic',
    unansweredReport: false,
    concierge: false,
  },
  business: {
    label: 'Business',
    monthly: 49,
    sites: 5,
    analytics: 'full',
    unansweredReport: true,
    concierge: true,
  },
};

export function limitsFor(plan: PlanId): PlanLimits {
  return PLAN_LIMITS[plan];
}

/**
 * Gating helpers. Components ask these questions rather than comparing plan
 * strings themselves, so adding a tier later touches this file only.
 */
export function canAddSite(plan: PlanId, currentSiteCount: number): boolean {
  return currentSiteCount < PLAN_LIMITS[plan].sites;
}

export function hasFullAnalytics(plan: PlanId): boolean {
  return PLAN_LIMITS[plan].analytics === 'full';
}

export function hasUnansweredReport(plan: PlanId): boolean {
  return PLAN_LIMITS[plan].unansweredReport;
}

/** The tier a locked feature lives on — used to word the upgrade prompt. */
export function nextPlanUp(plan: PlanId): PlanId | null {
  return plan === 'pro' ? 'business' : null;
}

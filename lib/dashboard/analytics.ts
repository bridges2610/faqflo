/**
 * Derived analytics.
 *
 * Everything here is a pure function of a SiteAnalytics bundle, so the same
 * numbers can be shown on the overview and the analytics page without either
 * of them recomputing it a slightly different way.
 */

import { percentChange } from './format';
import type { DayPoint, QuestionStat, SiteAnalytics } from './types';

export type Totals = {
  views: number;
  expands: number;
  /** Share of views where someone opened an answer. */
  expandRate: number;
  /** Percent change against the preceding window of equal length. */
  viewsDelta: number | null;
  expandsDelta: number | null;
};

function sum(points: DayPoint[], key: 'views' | 'expands'): number {
  return points.reduce((total, p) => total + p[key], 0);
}

/**
 * Totals for the last `window` days, compared with the `window` days before
 * them. Falls back to a null delta when there isn't a full prior window — a
 * comparison against three days of history isn't a trend, it's noise.
 */
export function totalsFor(daily: DayPoint[], window = 7): Totals {
  const recent = daily.slice(-window);
  const prior = daily.slice(-window * 2, -window);

  const views = sum(recent, 'views');
  const expands = sum(recent, 'expands');
  const hasPrior = prior.length === window;

  return {
    views,
    expands,
    expandRate: views === 0 ? 0 : (expands / views) * 100,
    viewsDelta: hasPrior ? percentChange(views, sum(prior, 'views')) : null,
    expandsDelta: hasPrior ? percentChange(expands, sum(prior, 'expands')) : null,
  };
}

/** Highest expand count first — the questions actually being read. */
export function rankedQuestions(questions: QuestionStat[], limit?: number): QuestionStat[] {
  const sorted = [...questions].sort((a, b) => b.expands - a.expands);
  return limit ? sorted.slice(0, limit) : sorted;
}

export function hasTraffic(analytics: SiteAnalytics | null): boolean {
  return Boolean(analytics && analytics.daily.length > 0);
}

/** Lifetime totals across the whole retained window. */
export function lifetimeTotals(daily: DayPoint[]): { views: number; expands: number } {
  return { views: sum(daily, 'views'), expands: sum(daily, 'expands') };
}

/**
 * Dashboard data model.
 *
 * Written to map onto Postgres tables rather than onto the current localStorage
 * store: every row carries its own id, every child row carries the id of what
 * owns it, and timestamps are ISO strings. When Supabase lands, these types
 * become the row types and nothing in the components has to change.
 *
 * Tone and Language are imported rather than redeclared — the dashboard may
 * only offer what the API will actually accept, and lib/faq.ts is where that's
 * decided.
 */

import type { Language, Tone } from '@/lib/faq';

export type PlanId = 'pro' | 'business';

export type User = {
  id: string;
  name: string;
  email: string;
  plan: PlanId;
  /** When the current plan started — shown on the billing line. */
  planSince: string;
};

export type Site = {
  /** Also the embed snippet's data-site value, so it's user-visible. */
  id: string;
  name: string;
  /** Bare host, no scheme and no trailing slash. */
  domain: string;
  createdAt: string;
  /** null until the snippet is seen for the first time. */
  installedAt: string | null;
  /** Last time the widget phoned home; drives the install pill. */
  lastSeenAt: string | null;
};

export type FaqStatus = 'published' | 'draft';

export type FaqEntry = {
  id: string;
  siteId: string;
  question: string;
  answer: string;
  /** Only published entries reach the widget and the JSON-LD. */
  status: FaqStatus;
  /** Explicit ordering — reordering swaps two positions rather than relying
      on array index, which wouldn't survive a real query's ORDER BY. */
  position: number;
  source: 'generated' | 'manual';
  tone: Tone;
  language: Language;
  createdAt: string;
  updatedAt: string;
};

/** One day of widget traffic — the shape a daily rollup table would return. */
export type DayPoint = { date: string; views: number; expands: number };

export type QuestionStat = {
  faqId: string;
  question: string;
  views: number;
  expands: number;
};

/** Something a visitor searched for that no published FAQ answered. */
export type UnansweredQuery = {
  query: string;
  count: number;
  lastAskedAt: string;
};

/** Per-site analytics bundle. Pre-aggregated, as the API would return it. */
export type SiteAnalytics = {
  siteId: string;
  daily: DayPoint[];
  questions: QuestionStat[];
  unanswered: UnansweredQuery[];
};

/** Everything the app keeps for one account. One row per key, in DB terms. */
export type DashboardData = {
  user: User;
  sites: Site[];
  faqs: FaqEntry[];
  analytics: SiteAnalytics[];
};

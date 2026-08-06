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

/**
 * What the account is subscribed to.
 *
 * Note this is NOT a tier ladder. Get Cited is a one-time purchase that belongs
 * to a SITE, so it lives on Site; Stay Cited is a subscription that belongs to
 * the ACCOUNT. Flattening them into one enum would make a Get Cited purchase
 * for one site silently unlock every other site the customer owns.
 */
export type Subscription = 'none' | 'stay_cited';

export type User = {
  id: string;
  name: string;
  email: string;
  subscription: Subscription;
  /** When the subscription started; null when there isn't one. */
  subscriptionSince: string | null;
};

export type Site = {
  id: string;
  name: string;
  /** Bare host, no scheme and no trailing slash. */
  domain: string;
  createdAt: string;
  /** When Get Cited was bought for this site. null = free tier for this site. */
  getCitedAt: string | null;
  /** When the export was last marked as pasted onto the live site. */
  publishedAt: string | null;
  /**
   * Fingerprint of the answer set at the moment it was published. Comparing it
   * with the current set is what powers the "your live copy is out of date"
   * nudge — the content is re-pasted by hand, so drift is expected and has to
   * be visible rather than assumed.
   */
  publishedHash: string | null;
  /** Latest stored audit for this site, if one has been run. */
  lastAudit: SiteAudit | null;
};

export type SiteAudit = {
  score: number;
  checkedAt: string;
  checks: { id: string; label: string; status: 'pass' | 'warn' | 'fail' | 'locked'; detail: string }[];
};

export type FaqStatus = 'published' | 'draft';

export type FaqEntry = {
  id: string;
  siteId: string;
  question: string;
  answer: string;
  /** Only published entries reach the export and the schema. */
  status: FaqStatus;
  /** Explicit ordering — reordering swaps two positions rather than relying
      on array index, which wouldn't survive a real query's ORDER BY. */
  position: number;
  source: 'generated' | 'manual' | 'discovered';
  tone: Tone;
  language: Language;
  createdAt: string;
  updatedAt: string;
};

/** A question people put to AI, surfaced by Discover. */
export type DiscoveredQuestion = {
  id: string;
  siteId: string;
  question: string;
  /** Rough monthly ask volume across the engines we sample. */
  volume: number;
  /** Whether an existing published answer already covers it. */
  covered: boolean;
  addedAt: string;
};

/** The engines we ask, and the only ones the UI may name. */
export const ENGINES = ['ChatGPT', 'Perplexity', 'Google AIO'] as const;
export type Engine = (typeof ENGINES)[number];

/**
 * One check of one question against one engine.
 *
 * `cited` means our customer's domain appeared as a source in the answer.
 * `mentioned` means the business was named without a link — worth knowing and
 * worth separating, because they're different outcomes.
 */
export type CitationCheck = {
  id: string;
  siteId: string;
  question: string;
  engine: Engine;
  outcome: 'cited' | 'mentioned' | 'absent';
  /** Who got cited instead, when we weren't. */
  citedInstead: string | null;
  checkedAt: string;
};

/** A day's citation counts per engine — the shape of a daily rollup row. */
export type CitationDay = {
  date: string;
  /** Questions where the customer's domain was a source, per engine. */
  byEngine: Record<Engine, number>;
  /** Questions checked that day, so a rate can be computed honestly. */
  checked: number;
};

export type CompetitorShare = {
  domain: string;
  /** Times this domain was cited across the checks we ran. */
  citations: number;
  isYou: boolean;
};

export type SiteTracking = {
  siteId: string;
  daily: CitationDay[];
  latest: CitationCheck[];
  competitors: CompetitorShare[];
  /**
   * Engine queries used this period against the plan's cap. Tracking costs
   * money every time it runs, so the cap is part of the product, not an
   * implementation detail — and it's shown rather than silently enforced.
   */
  queriesUsed: number;
  queryCap: number;
  periodResetsAt: string;
};

/** Everything the app keeps for one account. One row per key, in DB terms. */
export type DashboardData = {
  user: User;
  sites: Site[];
  faqs: FaqEntry[];
  questions: DiscoveredQuestion[];
  tracking: SiteTracking[];
};

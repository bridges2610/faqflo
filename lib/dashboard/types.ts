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

import type { AuditReport } from '@/lib/audit/types';
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
  /** Latest stored audit for this site, if one has been run. */
  lastAudit: SiteAudit | null;

  /**
   * What the business does and where — "Roofing contractor", "Rockland County, NY".
   *
   * Both null until something fills them: the audit reads them from the site's
   * own markup, an LLM infers them from the homepage when there is none, and
   * the customer can correct either. Content and Discover are both written
   * against a category and an area, and until now the copy promised that while
   * nothing supplied it.
   */
  industry: string | null;
  location: string | null;
  /**
   * How we came to believe the two fields above.
   *
   * Kept because they are not equally trustworthy and the UI has to say which
   * one it used — but mostly because `manual` is a promise: once a customer has
   * corrected us, no later audit or inference may overwrite their answer.
   */
  profileSource: 'schema' | 'inferred' | 'manual' | null;
};

/**
 * A set of answers bound to one page of the customer's site.
 *
 * Groups exist because a site has more than one page worth of questions: the
 * ones that belong on a service page are not the ones that belong on pricing.
 * Each group is exported, pasted and tracked separately, which is what lets the
 * schema point at the page the answers actually live on and lets the stale
 * nudge say which page needs re-pasting.
 */
export type FaqGroup = {
  id: string;
  siteId: string;
  /** What the customer calls it: "Service page". */
  name: string;
  /**
   * Path on the site, leading slash, no origin — "/services".
   *
   * A path rather than a full URL on purpose: the site already owns the domain,
   * and storing an absolute URL here would let the two disagree. The export
   * would then emit schema pointing at a domain the customer doesn't own.
   */
  path: string;
  /** Ordering on the Answers page. */
  position: number;
  createdAt: string;
  /** When this group's export was last marked as pasted onto the live page. */
  publishedAt: string | null;
  /**
   * Fingerprint of the answers at the moment they were pasted. Comparing it
   * with the current set is what powers the "your live copy is out of date"
   * nudge — the content is re-pasted by hand, so drift is expected and has to
   * be visible rather than assumed away.
   */
  publishedHash: string | null;
};

/**
 * The last audit run for a site.
 *
 * The full report rather than a summary: the Audit page should show what it
 * found when you come back to it, and the Overview's score tile should be the
 * same number that report arrived at — not a copy that can drift from it.
 */
export type SiteAudit = AuditReport;

export type FaqStatus = 'published' | 'draft';

export type FaqEntry = {
  id: string;
  /** The group owns the answer; the group knows its site. */
  groupId: string;
  question: string;
  answer: string;
  /** Only published entries reach the export and the schema. */
  status: FaqStatus;
  /** Ordering WITHIN the group — reordering swaps two positions rather than
      relying on array index, which wouldn't survive a real query's ORDER BY. */
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
   * The tracking budget, in the unit the customer actually buys.
   *
   * A PROMPT is one question we watch. It is deliberately independent of the
   * page budget: pages are scanned, prompts are asked, and the two scale
   * differently. Nothing here may ever be computed from a page count.
   *
   * `checksUsed` is the cost side — engine calls actually spent — shown so the
   * price of the allowance is visible, not so anyone has to think in it.
   */
  promptsTracked: number;
  promptCap: number;
  /** How many times each prompt is asked per period. */
  runsPerPeriod: number;
  checksUsed: number;
  periodResetsAt: string;
};

/**
 * A page the site ought to have, and whether it does.
 *
 * `slugs` is what makes this checkable without a second model call: the LLM
 * proposes the page set for the industry AND how to recognise each one, so
 * matching it against the crawl afterwards is ordinary string work. Without
 * them we'd be asking a model the same question on every render and getting a
 * slightly different answer each time.
 */
export type MustHavePage = {
  /** Stable key — 'about', 'services', 'pricing'. */
  role: string;
  /** What the customer calls it: "Services". */
  label: string;
  /** Why this industry needs it. Shown when the page is missing. */
  why: string;
  /** URL-path or title fragments that identify the page. */
  slugs: string[];
};

/** An article worth writing, and the reason it's worth writing. */
export type ArticleTopic = {
  title: string;
  /** The angle to take — what makes this piece different from the obvious one. */
  angle: string;
  /** What someone would type into a search box. */
  primaryKeyword: string;
  /** What someone would ask an assistant out loud. The AEO half. */
  aeoQuestion: string;
  why: string;
};

/**
 * The generated plan for one site. One per site, replaced on regenerate.
 *
 * Stored rather than derived because it costs a model call: without this the
 * page would bill on every visit and show a different answer each time, which
 * is not a plan so much as a slot machine.
 */
export type ContentPlan = {
  siteId: string;
  /** Resolved at generation time — what the plan was actually written for. */
  industry: string;
  location: string | null;
  mustHave: MustHavePage[];
  topics: ArticleTopic[];
  generatedAt: string;
};

/** Everything the app keeps for one account. One row per key, in DB terms. */
export type DashboardData = {
  user: User;
  sites: Site[];
  groups: FaqGroup[];
  faqs: FaqEntry[];
  questions: DiscoveredQuestion[];
  tracking: SiteTracking[];
  contentPlans: ContentPlan[];
};

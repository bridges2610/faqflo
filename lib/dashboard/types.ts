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
 * Which plan the account is on.
 *
 * ⚠️ A LADDER NOW, WHICH IT DELIBERATELY WAS NOT BEFORE. This type used to be
 * `'none' | 'stay_cited'` with a warning that flattening the two products into
 * one enum "would make a Get Cited purchase for one site silently unlock every
 * other site the customer owns" — true, because Get Cited belonged to a SITE
 * and Stay Cited to the ACCOUNT. Both are retired. There is one product, it
 * belongs to the account, and a ladder is now the honest shape.
 */
export type PlanId = 'free' | 'pro';

export type User = {
  id: string;
  name: string;
  email: string;
  plan: PlanId;
  /** When the current Pro subscription started; null on free. */
  planSince: string | null;
  /**
   * When the account was made.
   *
   * Not cosmetic: it anchors the free tier's lifetime check allowance, because
   * a period that never resets still needs somewhere to start counting from.
   * See trackingPeriod() in lib/dashboard/plans.ts.
   */
  createdAt: string | null;
};

export type Site = {
  id: string;
  name: string;
  /** Bare host, no scheme and no trailing slash. */
  domain: string;
  createdAt: string;
  /**
   * When the next automatic weekly check is due. Null when nothing is scheduled.
   *
   * ⚠️ A CURSOR, NOT A SETTING. The cron moves it forward a week each time it
   * fires; upgrading sets it and downgrading clears it. It is service-role only
   * for the obvious reason — a browser that could write it could set it to now()
   * in a loop and bill us for three engines every sweep.
   */
  nextCheckAt: string | null;
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
  /**
   * Which country the answer engines are asked from. Null = no location sent.
   *
   * ⚠️ Applies to ChatGPT and Perplexity only — Gemini rejects a location, so
   * its results are never labelled with this. See lib/tracking/gemini.ts.
   */
  country: string | null;
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

/**
 * A question people put to AI, surfaced by Discover.
 *
 * ⚠️ `volume` was required, was described as "rough monthly ask volume across
 * the engines we sample", and was rendered as "About 480 asks a month". No such
 * measurement exists anywhere in this product — there is no keyword provider and
 * no engine sampling — and the only values it ever held came from a hand-written
 * demo fixture. It is optional now, nothing writes it, and nothing renders it.
 *
 * It is kept rather than deleted only so a stored snapshot from before this
 * change still parses. If a real volume source is ever wired up, make it
 * required again in the same commit that starts populating it.
 */
export type DiscoveredQuestion = {
  id: string;
  siteId: string;
  question: string;
  /** @deprecated Never measured. See the note above. Do not render. */
  volume?: number;
  /** One sentence on why answering this would help this business get cited. */
  why?: string;
  /** What the asker is after — pricing, service, trust, logistics, problem. */
  intent?: string;
  /** Whether an existing published answer already covers it. */
  covered: boolean;
  /**
   * Who put this question on the list.
   *
   * ⚠️ LOAD-BEARING FOR SURVIVAL, NOT DECORATION. A Discover re-run replaces
   * the uncovered questions — right for a model's suggestions, which is what a
   * re-run produces a better version of, and wrong for something a person
   * typed. addQuestions() keeps `manual` rows through a replace for that reason.
   *
   * Optional because rows already in customers' localStorage predate it, and
   * absent means 'discovered' — those are all model-generated, so the default
   * is the truth rather than a guess.
   */
  source?: 'discovered' | 'manual';
  /**
   * Ordering on the AI Mentions page.
   *
   * ⚠️ A VALUE, BECAUSE THE ORDER USED TO BE AN ACCIDENT. The list was read
   * `.order('added_at')` — the order the model happened to return them in. The
   * owner drags them now, so it has to be stored. Same swap-two-positions idiom
   * as FaqEntry.position; 0015 added the column and backfilled it from
   * added_at so nobody's existing list reshuffled.
   */
  position: number;
  addedAt: string;
};

/**
 * The engines we ask, and the only ones the UI may name.
 *
 * ⚠️ THESE ARE APIs, NOT THE CONSUMER APPS, AND THE UI SAYS SO.
 *
 * "ChatGPT" here is the OpenAI API with its web search tool; "Gemini" is the
 * Gemini API with Google Search grounding. Neither is byte-identical to what a
 * person sees typing into chatgpt.com or gemini.google.com — different system
 * prompt, different retrieval, no personalisation. They are the closest honest
 * proxy available, and calling them the app would be the same overclaim
 * components/marketing/pricing-teaser.tsx already stripped out of our own
 * pricing copy.
 *
 * ⚠️ WAS 'Google AIO', AND THAT WAS NOT QUERYABLE. Google AI Overviews has no
 * API at all — tools that report on it collect Google result pages at scale.
 * Listing an engine we cannot ask would have made the third line of every chart
 * permanently zero, which reads as "you are never cited there" rather than "we
 * never looked". Gemini can actually be asked, so it is what we name.
 *
 * These exact strings key the chart's colour map (components/dashboard/
 * citation-chart.tsx) and the seed fixture. Renaming one means renaming it in
 * all three places.
 */
export const ENGINES = ['ChatGPT', 'Perplexity', 'Gemini'] as const;
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
  /**
   * What the engine actually said, capped at MAX_EXCERPT_CHARS below.
   *
   * ⚠️ THE EVIDENCE, AND THE ANSWER TO THE ONLY QUESTION THIS PAGE REALLY GETS.
   * "Why does it say I wasn't cited?" cannot be answered by a count. It was
   * stored from the first run (see the column comment in 0006) and read by
   * nothing for just as long — the outcome was shown and the reason for it was
   * not. Null on older rows, which renders as "not stored" rather than blank.
   */
  excerpt: string | null;
  /** Every source that answer cited, in the engine's own ranking. */
  sources: string[];
  checkedAt: string;
};

/**
 * How much of an answer we keep as evidence.
 *
 * Enough to see a mention in context; not the whole answer. This table gets one
 * row per prompt per engine per run, and full answers would quickly make it the
 * largest thing in the database — see the column comment in migration 0006.
 *
 * ⚠️ Lives in this client-safe module, not in lib/tracking/types.ts, because
 * BOTH sides need it: the classifier truncates with it on the server, and the
 * Results page needs it to tell a truncated excerpt from an engine that simply
 * stopped talking. lib/tracking/types.ts is `server-only`, so a component
 * importing it from there would pull server code into the browser bundle —
 * and copying the number instead is how the two quietly stop agreeing.
 */
export const MAX_EXCERPT_CHARS = 600;

/** A day's citation counts per engine — the shape of a daily rollup row. */
export type CitationDay = {
  date: string;
  /** Questions where the customer's domain was a source, per engine. */
  byEngine: Record<Engine, number>;
  /** Questions checked that day, so a rate can be computed honestly. */
  checked: number;
  /** That day's totals, so a change between run-days can be shown without
   *  re-deriving them from `byEngine` (which counts citations only). */
  cited: number;
  mentioned: number;
};

/**
 * A rival the customer NAMED.
 *
 * ⚠️ NOT CompetitorShare, WHICH IS BELOW AND IS THE OPPOSITE KIND OF THING.
 * That one is derived — every domain the engines actually cited, counted from
 * the checks, with no rows of its own precisely because nobody chose its
 * contents. This one is a short list the owner keeps: these are the businesses
 * I compete with, tell me how often AI names them.
 *
 * ⚠️ NO CITATION COUNT ON IT. How often a domain was cited is known only to the
 * measurements; storing a copy here would let the two drift. The page joins
 * them by `domain` at read time, which is why that field is a bare host —
 * matching Site.domain and the keys CompetitorShare uses.
 *
 * ⚠️ AND A WATCHED RIVAL WITH NO CITATIONS READS AS ZERO, NEVER AS BLANK. The
 * absence is the finding the owner asked us to watch for.
 */
export type Competitor = {
  id: string;
  siteId: string;
  /** What the owner calls them: "Summit Roofing". */
  name: string;
  /** Bare host, no scheme and no trailing slash. */
  domain: string;
  /** Ordering on the Competitors page. */
  position: number;
  createdAt: string;
};

/**
 * A fix the customer says they have done.
 *
 * ⚠️ A CLAIM, NOT A MEASUREMENT, AND THE TWO MUST NOT BLUR. The audit decides
 * whether a fix landed; this records that somebody ticked a box. `reportCheckedAt`
 * scopes the tick to the audit that raised it, so a newer scan clears the slate
 * rather than letting the report show "done" for something still failing.
 */
export type ActionTick = {
  id: string;
  siteId: string;
  /** The RECIPES constant from lib/audit/actions.ts — stable across runs. */
  actionId: string;
  reportCheckedAt: string;
  createdAt: string;
};

/**
 * Is this tick stamped with the report on screen?
 *
 * ⚠️ COMPARE THE INSTANT, NEVER THE STRING. The two stamps reach us in
 * different spellings of the same moment: `report.checkedAt` is a JSONB string
 * written by `new Date().toISOString()`, so it ends in `Z`, while a tick's
 * `report_checked_at` is a timestamptz column, which Postgres renders as
 * `+00:00`. `===` on those is false for the same millisecond.
 *
 * That is not a cosmetic bug. The tick held in memory keeps the `Z` form, so
 * the box ticks and stays ticked — until the page reloads and the value comes
 * back from Postgres, at which point every tick silently fails this gate and
 * the customer's progress looks discarded.
 */
export function sameReport(tickStamp: string, reportCheckedAt: string): boolean {
  const a = Date.parse(tickStamp);
  const b = Date.parse(reportCheckedAt);
  // An unparseable stamp is not a match. Falling back to === would resurrect
  // exactly the bug this exists to close.
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

export type CompetitorShare = {
  domain: string;
  /**
   * Times this domain appeared as a source across the checks we ran.
   *
   * ⚠️ THIS COUNTS EVERY SOURCE, NOT ONE PER CHECK. It used to be built from
   * `cited_instead` — the single domain that took the click when we didn't —
   * which threw away the rest of each answer's source list: 45 data points out
   * of 296 on a real site. An engine citing six publishers is six facts about
   * who is winning, not one.
   */
  citations: number;
  isYou: boolean;
};

/**
 * One of our own URLs, and how often an engine cited it.
 *
 * The actionable half of being cited: not "you were cited five times" but
 * "this page earned them". Full URLs are stored on every check, so this costs
 * nothing to derive.
 */
export type CitedPage = {
  url: string;
  citations: number;
};

/** How one engine answered, across every check in the window. */
export type EngineBreakdown = {
  engine: Engine;
  cited: number;
  mentioned: number;
  absent: number;
  /** Checks run against this engine — the denominator, never assumed equal. */
  checked: number;
};

export type SiteTracking = {
  siteId: string;
  daily: CitationDay[];
  latest: CitationCheck[];
  competitors: CompetitorShare[];
  /** Our own cited URLs, most-cited first. */
  citedPages: CitedPage[];
  /** Per-engine outcome counts, in ENGINES order so the UI reads consistently. */
  byEngine: EngineBreakdown[];
  /**
   * Source appearances in the window: ours, and everyone's.
   *
   * Kept as counts rather than a precomputed percentage because share of voice
   * is meaningless without its denominator — see the tiles, which print both.
   */
  sourceAppearances: { ours: number; total: number };
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
  /** How much of promptCap may be hand-written. Null falls back to the wider plan. */
  manualCap: number;
  /** How many times each prompt is asked per period. */
  runsPerPeriod: number;
  /** The enforced ceiling, so the meter stops recomputing it from three parts. */
  checksCap: number;
  checksUsed: number;
  /**
   * When the allowance refills. NULL MEANS NEVER, which is the free tier.
   *
   * ⚠️ Null is a real state, not a missing value. Free buys one run metered over
   * a period with no end, so "resets on the 3rd" would be a date that never
   * arrives. Anything rendering this must say "one check" rather than print a
   * fallback date.
   */
  periodResetsAt: string | null;

  /** Which plan's rules these numbers came from. */
  planId: PlanId;
  /**
   * 'once' — the onboarding run, no button. 'weekly' — scheduled and on demand.
   *
   * The Results page reads this to decide whether to show a Run button or an
   * explanation of why there isn't one.
   */
  schedule: 'once' | 'weekly';
  /** When the next automatic check is due. Null on free — there isn't one. */
  nextCheckAt: string | null;
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
  /** The rivals the customer named. Not the ones we measured — see Competitor. */
  competitors: Competitor[];
  /** Fixes ticked off the audit plan. See ActionTick. */
  actionTicks: ActionTick[];
};

/**
 * AI-visibility audit.
 *
 * The question the audit answers is narrow and literal: can the systems that
 * write AI answers reach this site, read it, understand who it belongs to, and
 * find something worth quoting?
 *
 * One rule runs through every type here: anything we did not measure is
 * labelled as not measured. It never becomes a guess, and it never counts
 * toward a score. See scoreOf() for how that's enforced.
 */

export type CheckStatus =
  | 'pass'
  | 'warn'
  | 'fail'
  /** Needs something we don't have — a paid engine query, a subscription. */
  | 'locked'
  /** Doesn't apply to this site, so counting it either way would be wrong. */
  | 'na';

export type PillarId =
  | 'visibility'
  | 'citation'
  | 'structure'
  | 'technical'
  | 'seo'
  | 'authority';

export type Finding = {
  id: string;
  pillar: PillarId;
  label: string;
  status: CheckStatus;
  /** One sentence a non-technical owner can act on. */
  detail: string;
  /** Share of its pillar's score. Ignored when locked or n/a. */
  weight: number;
  /** Where it was observed — URLs, counts, the offending values. */
  evidence?: string[];
};

export type PillarResult = {
  id: PillarId;
  label: string;
  /** How much this pillar contributes to the overall score. */
  weight: number;
  /** 0–100 across the findings that ran, or null when none did. */
  score: number | null;
  findings: Finding[];
  /** Findings that actually counted, for the "based on N checks" line. */
  scoredCount: number;
};

/** What the customer does next. The reason the audit exists. */
export type ActionItem = {
  id: string;
  /** Imperative and specific: "Add a title tag to /pricing". */
  what: string;
  /** One sentence tying it to being quoted. */
  why: string;
  /**
   * Points the overall score would gain, computed from the weights of the
   * findings this would flip. Null when the fix is worth doing but can't move
   * the score — better to say so than to invent a number.
   */
  impact: number | null;
  effort: '2 minutes' | '15 minutes' | 'an hour';
  action:
    | { kind: 'link'; label: string; href: string }
    /** The fix lives on the customer's site: hand over the exact snippet. */
    | { kind: 'copy'; label: string; snippet: string; where: string }
    | { kind: 'none' };
};

/** Something worth doing that came from FaqFlo's own data, not the crawl. */
export type Opportunity = {
  id: string;
  title: string;
  detail: string;
  href?: string;
};

export type AuditDepth = 'quick' | 'full';

export type CrawledPage = {
  url: string;
  status: number;
  /** After redirects — differs from `url` when the site moved us. */
  finalUrl: string;
  bytes: number;
  ms: number;
};

export type AuditReport = {
  depth: AuditDepth;
  url: string;
  domain: string;
  /** 0–100 across the pillars that ran. */
  score: number;
  /** Total findings that counted toward the score. */
  scoredCount: number;
  pillars: PillarResult[];
  actions: ActionItem[];
  opportunities: Opportunity[];
  /** Every page actually fetched, so the report can show its working. */
  crawled: CrawledPage[];
  /** Unique in-scope URLs found, read or not. Bigger than crawled on a big site. */
  discovered: number;
  /** Best-scoring URLs the budget didn't reach. */
  skipped: string[];
  /** Why the crawl ended — the difference between "that's the site" and
      "that's what we had budget for". */
  stoppedBecause: 'budget' | 'time' | 'exhausted';
  checkedAt: string;
};

/**
 * Does this object match the report shape the app currently renders?
 *
 * Persisted data outlives code. A report stored before a shape change — or
 * written while one was half-applied — will still be sitting in a browser long
 * after the code moved on, and handing it to the UI produces a crash on the
 * first missing array rather than anything a user could act on.
 *
 * Deliberately structural rather than a version number: the thing that matters
 * is whether the fields the renderer reads are there.
 */
export function isAuditReport(value: unknown): value is AuditReport {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<AuditReport>;

  return (
    typeof r.score === 'number' &&
    typeof r.checkedAt === 'string' &&
    typeof r.scoredCount === 'number' &&
    Array.isArray(r.pillars) &&
    Array.isArray(r.crawled) &&
    Array.isArray(r.actions) &&
    Array.isArray(r.opportunities) &&
    typeof r.discovered === 'number' &&
    Array.isArray(r.skipped) &&
    typeof r.stoppedBecause === 'string'
  );
}

/** Crawlers worth naming, in the order the report lists them. */
export const AI_CRAWLERS = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'PerplexityBot'] as const;
export type AiCrawler = (typeof AI_CRAWLERS)[number];

export const PILLARS: { id: PillarId; label: string; weight: number; blurb: string }[] = [
  {
    id: 'technical',
    label: 'Technical foundation',
    weight: 25,
    blurb: 'Whether a crawler can reach your pages and read them at all.',
  },
  {
    id: 'structure',
    label: 'Content structure & answerability',
    weight: 20,
    blurb: 'Whether what it reads is shaped like something quotable.',
  },
  {
    id: 'seo',
    label: 'Classic SEO on-page',
    weight: 20,
    blurb: 'The basics search engines have always wanted, still true.',
  },
  {
    id: 'citation',
    label: 'Citation & source readiness',
    weight: 15,
    blurb: 'Whether an assistant can tell who this is and credit you.',
  },
  {
    id: 'authority',
    label: 'Authority & trust',
    weight: 10,
    blurb: 'The signals that make a source worth repeating.',
  },
  {
    id: 'visibility',
    label: 'AI visibility',
    weight: 10,
    blurb: 'Whether you actually appear in the answers today.',
  },
];

/**
 * Findings the free teaser shows — the cheap, single-page ones.
 *
 * They're real check ids from the full engine, not a parallel set: the teaser
 * is a subset of the audit, so a stranger's first result can never contradict
 * what the paid audit later says.
 */
export const QUICK_FINDING_IDS = ['raw-html', 'crawlers', 'qa-markup'] as const;

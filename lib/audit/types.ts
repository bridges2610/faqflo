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

/**
 * What one page is about, kept for the Content page.
 *
 * `CrawledPage` proves a page was read; this says what was on it. The crawl
 * already parses all of this — titles, headings, JSON-LD — and until now threw
 * every bit of it away when the request ended, which meant the one thing a
 * customer most wants to know ("which of my pages have FAQs?") couldn't be
 * answered without crawling the site again.
 *
 * Every list here is capped. A hundred pages of unbounded headings would put
 * megabytes into localStorage, and the tail of a heading list has never decided
 * what a page is for.
 */
export type PageContent = {
  /** Post-redirect URL — the address the page actually lives at. */
  url: string;
  title: string;
  /** h1–h3 text, first 8. */
  headings: string[];
  /** How many of those headings read as questions. */
  questionHeadings: number;
  hasFaqSchema: boolean;
  /** Questions lifted from FAQPage markup, first 10. */
  faqQuestions: string[];
  wordCount: number;
};

/**
 * Who the business is and where it works.
 *
 * `source` is here because the three ways we can know this are not equally
 * trustworthy, and the UI has to be able to say which one it used. Schema is
 * the business's own statement; inferred is our reading of their homepage and
 * can be wrong; manual is the customer correcting us, and must therefore
 * survive every later run.
 */
export type BusinessProfile = {
  name: string | null;
  industry: string | null;
  location: string | null;
  source: 'schema' | 'inferred' | 'manual';
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

  /*
    Optional, and deliberately so — see isAuditReport below.

    A quick run reads one page and produces one entry; a full run produces one
    per page read. A report stored before this existed has none at all, which
    the Content page reads as "run a full audit" rather than as an error.
  */
  pages?: PageContent[];
  /** From the site's own Organization/LocalBusiness markup, when it has any. */
  profile?: BusinessProfile;
  /** Entry-page text, capped — what an LLM reads when there's no markup. */
  profileHint?: string;
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
 *
 * ⚠️ Only assert fields the report CANNOT render without. `pages`, `profile`
 * and `profileHint` are absent from every report written before they existed,
 * and this guard runs against stored data on every load — asserting them would
 * silently delete the last audit of every customer who has one, to add a page
 * they hadn't asked for. Anything optional stays out of this list.
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
 * The three checks that answer "can AI read this site at all".
 *
 * ⚠️ THIS WAS `QUICK_FINDING_IDS`, AND THE RENAME IS THE POINT. It used to be
 * the whole of what a quick audit kept: runAudit computed every technical and
 * structure check on the page it had already fetched, then filtered down to
 * these three and threw the rest away.
 *
 * That starved everything downstream. buildActionPlan can only propose a fix
 * for a finding it can see, and with three findings only four recipes could
 * ever fire — two of which collide on `qa-markup`, so the free report's "what
 * to do next" showed exactly ONE item on any site that was not badly broken.
 *
 * A quick audit now keeps what it computes (see quickFindings in run.ts), and
 * this list has one job left: the readability checklist on the free report,
 * which is a fixed set of three by design. Anything wanting "what a free audit
 * covers" should read the report's own findings, not this.
 *
 * They're real check ids from the full engine, not a parallel set — so a
 * stranger's first result can never contradict what the paid audit later says.
 */
export const READABILITY_IDS = ['raw-html', 'crawlers', 'qa-markup'] as const;

/**
 * Running an audit end to end.
 *
 * Two depths, one engine. The free teaser on the marketing page and the full
 * audit inside the dashboard run the same checks over the same parser — the
 * difference is how many pages get fetched and how many findings are kept.
 * That's deliberate: two implementations would eventually disagree, and the
 * one a stranger sees first is the one that has to be right.
 */

import { buildActionPlan, type ActionContext } from './actions';
import { authorityChecks, citationChecks } from './checks/identity';
import { seoChecks } from './checks/seo';
import { structureChecks } from './checks/structure';
import { technicalChecks } from './checks/technical';
import {
  allPages,
  fetchPageSet,
  fetchQuick,
  type CrawlBudget,
  type FetchedPage,
  type FetchFailure,
  type PageSet,
} from './fetcher';
import { isQuestion, schemaNodes } from './parse';
import { businessProfile, profileHint } from './profile';
import { buildPillars, overallScore } from './score';
import {
  QUICK_FINDING_IDS,
  type AuditDepth,
  type AuditReport,
  type Finding,
  type Opportunity,
  type PageContent,
} from './types';

export type RunOptions = {
  depth: AuditDepth;
  /** Page budget for a full run. Ignored by `quick`, which reads one page. */
  budget?: CrawlBudget;
  /**
   * Filled in by the caller from the account's own data — tracking for the AI
   * visibility pillar, and the loop's state for opportunities. The engine never
   * fabricates either: given nothing, the pillar stays locked.
   */
  visibility?: Finding[];
  opportunities?: Opportunity[];
  actionContext?: ActionContext;
};

const LOCKED_VISIBILITY: Finding = {
  id: 'cited',
  pillar: 'visibility',
  label: 'Cited in AI answers today',
  status: 'locked',
  detail:
    'Asking ChatGPT, Perplexity and Gemini what they say about you costs money per question, so it runs with tracking rather than on every audit.',
  weight: 0,
};

export type AuditResult =
  | { ok: true; report: AuditReport }
  | { ok: false; failure: FetchFailure };

/**
 * Failure carries a reason rather than a null.
 *
 * A null told the caller only that there was no report, so the route said
 * "check the address" to a firewall block and a typo alike. The reason travels
 * up untouched; turning it into words is the route's job, since that's where
 * the audience is.
 */
export async function runAudit(entryUrl: string, options: RunOptions): Promise<AuditResult> {
  const fetched =
    options.depth === 'quick'
      ? await fetchQuick(entryUrl)
      : await fetchPageSet(entryUrl, options.budget);
  if (!fetched.ok) return fetched;
  const set = fetched.set;

  const findings =
    options.depth === 'quick' ? quickFindings(set) : fullFindings(set, options.visibility);

  const pillars = buildPillars(findings);
  const domain = hostOf(set.entry.finalUrl);

  const ctx: ActionContext = options.actionContext ?? {
    domain,
    faqsHref: '/dashboard/faqs',
    publishHref: '/dashboard/publish',
    questionsHref: '/dashboard/questions',
  };

  return {
    ok: true,
    report: {
      depth: options.depth,
      url: set.entry.finalUrl,
      domain,
      score: overallScore(pillars),
      scoredCount: pillars.reduce((n, p) => n + p.scoredCount, 0),
      pillars,
      // The teaser sells the full audit; it doesn't pretend to be one.
      actions: options.depth === 'quick' ? [] : buildActionPlan(findings, ctx),
      opportunities: options.opportunities ?? [],
      crawled: set.crawled,
      discovered: set.discovered,
      skipped: set.skipped,
      stoppedBecause: set.stoppedBecause,
      checkedAt: new Date().toISOString(),
      /*
        What the Content page reasons over.

        Carried on the report rather than recomputed later because the HTML is
        gone the moment this function returns — this is the only point at which
        the parsed pages still exist.
      */
      pages: allPages(set).map(toContent),
      profile: businessProfile(set),
      profileHint: profileHint(set.entry),
    },
  };
}

/** Caps: the tail of a heading list has never decided what a page is for. */
const MAX_HEADINGS = 8;
const MAX_FAQ_QUESTIONS = 10;

const FAQ_TYPE = /^(FAQPage|QAPage|Question)$/;

/**
 * The questions a page's FAQ markup actually asks.
 *
 * `schemaTypes` already tells us a page HAS FAQ markup; this reads what's in
 * it. That distinction matters on the Content page: "your services page has
 * FAQs" is a tick, but showing which questions it answers is what tells someone
 * whether the right ones are covered.
 *
 * Handles both shapes in the wild — `mainEntity` as an array of Questions, and
 * a bare Question node — since plugins emit both and a missed one reads as
 * "no FAQs here", the same as having none.
 */
function faqQuestions(page: FetchedPage): string[] {
  const nodes = schemaNodes(page.facts.schemaRaw);
  const out: string[] = [];

  for (const node of nodes) {
    const type = node['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (!types.some((t) => typeof t === 'string' && FAQ_TYPE.test(t))) continue;

    const entities = Array.isArray(node.mainEntity)
      ? node.mainEntity
      : node.mainEntity
        ? [node.mainEntity]
        : [node];

    for (const entity of entities) {
      if (!entity || typeof entity !== 'object') continue;
      const name = (entity as Record<string, unknown>).name;
      if (typeof name === 'string' && name.trim()) out.push(name.trim());
      if (out.length >= MAX_FAQ_QUESTIONS) return out;
    }
  }

  return out;
}

/**
 * A fetched page, reduced to what survives the request.
 *
 * The counterpart to toCrawled() in the fetcher: that one keeps proof the page
 * was read, this one keeps what was on it.
 */
function toContent(page: FetchedPage): PageContent {
  const headings = page.facts.headings.filter((h) => h.level <= 3);

  return {
    url: page.finalUrl,
    title: page.facts.title ?? '',
    headings: headings.slice(0, MAX_HEADINGS).map((h) => h.text),
    // Counted across every heading, not just the ones we kept — this is a
    // measure of the page, and truncating it would understate long pages.
    questionHeadings: headings.filter((h) => isQuestion(h.text)).length,
    hasFaqSchema: page.facts.schemaTypes.some((t) => FAQ_TYPE.test(t)),
    faqQuestions: faqQuestions(page),
    wordCount: page.facts.wordCount,
  };
}

/**
 * The free check: three findings from a single page, plus the locked one.
 *
 * Pulled from the same technical/structure modules rather than reimplemented,
 * so a wording or threshold change lands in both places at once.
 */
function quickFindings(set: PageSet): Finding[] {
  const all = [...technicalChecks(set), ...structureChecks(set)];
  const wanted = new Set<string>(QUICK_FINDING_IDS);

  return [...all.filter((f) => wanted.has(f.id)), LOCKED_VISIBILITY];
}

function fullFindings(set: PageSet, visibility?: Finding[]): Finding[] {
  return [
    ...technicalChecks(set),
    ...structureChecks(set),
    ...seoChecks(set),
    ...citationChecks(set),
    ...authorityChecks(set),
    ...(visibility?.length ? visibility : [LOCKED_VISIBILITY]),
  ];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

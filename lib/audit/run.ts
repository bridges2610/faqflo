/**
 * Running an audit end to end.
 *
 * Two depths, one engine. The free teaser on the marketing page and the full
 * audit inside the dashboard run the same checks over the same parser. That's
 * deliberate: two implementations would eventually disagree, and the one a
 * stranger sees first is the one that has to be right.
 *
 * ⚠️ THE DIFFERENCE IS HOW MANY PAGES ARE FETCHED. It used to be that plus a
 * filter that kept three of the quick run's findings and discarded the rest;
 * see quickFindings below for what that cost. Quick reads one page and asks it
 * everything a single page can answer. Full walks the site, and earns the two
 * check families — citation and authority — that only a site can answer.
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
   * Told which part of the run is starting, as it starts.
   *
   * Optional, and every caller that does not pass it behaves exactly as before.
   * The route uses it to stream progress to a browser; nothing else needs it.
   */
  onPhase?: (phase: AuditPhase) => void;
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
    'Asking ChatGPT, Perplexity and Gemini what they say about you costs money per question, so it runs from the Results page rather than on every audit.',
  weight: 0,
};

/**
 * Which part of the run is happening now.
 *
 * ⚠️ THESE ARE REAL BOUNDARIES IN runAudit BELOW, NOT A TIMELINE. Each one is
 * emitted immediately before the work it names begins, so a caller showing them
 * is reporting where the function actually is rather than guessing from a
 * clock.
 *
 * ⚠️ AND `reading` OWNS ALMOST ALL THE WALL CLOCK. It is network I/O across up
 * to a hundred pages; the other two are local computation and take a moment.
 * Anything rendering these should expect the first to hold for most of the run
 * — that is the truth about where the time goes, not a stall.
 */
export type AuditPhase = 'reading' | 'checking' | 'scoring';

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
  // Optional by design: every existing caller passes nothing and behaves as before.
  const phase = options.onPhase ?? (() => {});

  phase('reading');
  const fetched =
    options.depth === 'quick'
      ? await fetchQuick(entryUrl)
      : await fetchPageSet(entryUrl, options.budget);
  if (!fetched.ok) return fetched;
  const set = fetched.set;

  phase('checking');
  const findings =
    options.depth === 'quick' ? quickFindings(set) : fullFindings(set, options.visibility);

  phase('scoring');
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
 * One page, checked properly.
 *
 * ⚠️ IT USED TO COMPUTE ALL OF THIS AND THEN THROW MOST OF IT AWAY. The old
 * body ran technicalChecks and structureChecks — every one of them — and
 * filtered the result down to three ids. The checks had already run against a
 * page already in memory, so the discarded twenty cost exactly as much to
 * produce as the three that were kept.
 *
 * What that cost instead was downstream: buildActionPlan can only propose a fix
 * for a finding it can see, so a free account's "what to do next" was drawn
 * from a pool of three. Two of the four matching recipes collide on `qa-markup`
 * and the second is dropped as already-claimed, so a site with readable content
 * and open crawlers got exactly ONE recommendation, forever.
 *
 * ⚠️ WHAT MAKES THIS QUICK IS THE CRAWL, NOT THE CHECKS. fetchQuick reads one
 * page; fetchPageSet walks up to the plan's budget. That is the real cost and
 * the real difference, and it is untouched. Running more assertions over one
 * already-fetched document is free.
 *
 * ⚠️ CITATION AND AUTHORITY STAY OUT, and that is deliberate rather than
 * leftover. Both reason about a SITE — pages linking to each other, an about
 * page, contact details, consistency across pages — and answering them from a
 * single page would mean reporting a site-wide verdict from one document. The
 * full audit gets them because it has the pages to earn them.
 */
function quickFindings(set: PageSet): Finding[] {
  return [
    ...technicalChecks(set),
    ...structureChecks(set),
    ...seoChecks(set),
    LOCKED_VISIBILITY,
  ];
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

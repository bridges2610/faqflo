/**
 * Findings → "do these five things this week".
 *
 * This is the part the audit exists for. A list of thirty findings is a report;
 * five ranked jobs with a button on each is a decision already made. For a solo
 * marketer the value isn't the diagnosis, it's not having to work out what to
 * do with it.
 *
 * Two rules keep it honest:
 *
 * 1. Impact is DERIVED. Each recipe names the findings it would flip, and the
 *    "+N points" is the difference between the current overall score and the
 *    score with exactly those findings passing — computed by scoreIfFixed(),
 *    not written by hand. A recipe that can't move the number reports null
 *    rather than inventing a figure.
 * 2. A button only appears where something can actually be done: a link when
 *    FaqFlo owns the fix, a copy-paste snippet when the fix lives on the
 *    customer's own site, and nothing at all when neither is true.
 */

import { scoreIfFixed, overallScore, buildPillars } from './score';
import type { ActionItem, Finding } from './types';

export type ActionContext = {
  domain: string;
  /** Where to send someone to write answers, when a group exists. */
  faqsHref: string;
  publishHref: string;
  questionsHref: string;
};

type Recipe = {
  id: string;
  /** Findings this fixes. Order matters only for readability. */
  fixes: string[];
  /**
   * A blocker the rest of the list depends on.
   *
   * Impact ÷ effort is the right ranking for comparable jobs, but it buries
   * prerequisites: on a site where a crawler sees two words, "get your content
   * into the HTML" scores a modest few points against an hour of work and
   * loses to four cheap wins — none of which a crawler could see either. When
   * one of these applies it goes to the top, because doing anything else first
   * is wasted work.
   */
  critical?: boolean;
  /** Runs against the failing/warning findings; false means "not applicable". */
  when: (byId: Map<string, Finding>) => boolean;
  what: (byId: Map<string, Finding>, ctx: ActionContext) => string;
  why: string;
  effort: ActionItem['effort'];
  action: (byId: Map<string, Finding>, ctx: ActionContext) => ActionItem['action'];
};

const failing = (f: Finding | undefined) => Boolean(f && (f.status === 'fail' || f.status === 'warn'));
const hardFail = (f: Finding | undefined) => Boolean(f && f.status === 'fail');

/*
  Recipes are ordered by how fundamental the fix is, but the final ranking is
  by derived impact ÷ effort — so a site with an unusual profile gets an
  unusual plan rather than the same generic list everyone else sees.
*/
const RECIPES: Recipe[] = [
  {
    id: 'unblock-crawlers',
    fixes: ['crawlers', 'googlebot'],
    critical: true,
    when: (m) => hardFail(m.get('crawlers')) || hardFail(m.get('googlebot')),
    what: () => 'Let the AI crawlers in',
    why: 'Nothing else on this list matters while robots.txt is turning the engines away at the door.',
    effort: '2 minutes',
    action: () => ({
      kind: 'copy',
      label: 'Copy the robots.txt rules',
      snippet: [
        'User-agent: GPTBot',
        'Allow: /',
        '',
        'User-agent: ClaudeBot',
        'Allow: /',
        '',
        'User-agent: Google-Extended',
        'Allow: /',
        '',
        'User-agent: PerplexityBot',
        'Allow: /',
      ].join('\n'),
      where: 'Add these to the robots.txt file at the root of your site.',
    }),
  },
  {
    id: 'server-render',
    fixes: ['raw-html'],
    critical: true,
    when: (m) => hardFail(m.get('raw-html')),
    what: () => 'Get your content into the HTML',
    why: "AI crawlers don't run JavaScript, so anything drawn after the page loads is invisible to them.",
    effort: 'an hour',
    action: () => ({ kind: 'none' }),
  },
  {
    id: 'publish-answers',
    fixes: ['qa-markup', 'question-headings'],
    when: (m) => failing(m.get('qa-markup')) || failing(m.get('question-headings')),
    what: () => 'Publish a set of question-and-answer content',
    why: 'A question with a short answer under it is the shape an assistant can lift whole — and the shape it looks for first.',
    effort: '15 minutes',
    action: (_m, ctx) => ({
      kind: 'link',
      label: 'Generate answers',
      href: ctx.faqsHref,
    }),
  },
  {
    id: 'paste-export',
    fixes: ['qa-markup', 'schema-valid'],
    when: (m) => failing(m.get('qa-markup')),
    what: () => 'Paste your answer block onto the site',
    why: 'Answers written in FaqFlo do nothing until the HTML is on your own domain, where the crawler can reach it.',
    effort: '15 minutes',
    action: (_m, ctx) => ({ kind: 'link', label: 'Get the code', href: ctx.publishHref }),
  },
  {
    id: 'identity-schema',
    fixes: ['org-schema', 'same-as', 'name-consistency'],
    when: (m) => failing(m.get('org-schema')),
    what: () => 'Tell machines which business this is',
    why: 'Without an identity in the markup an assistant can repeat your answer without ever naming you.',
    effort: '15 minutes',
    action: (_m, ctx) => ({
      kind: 'link',
      label: 'Get the schema block',
      href: ctx.publishHref,
    }),
  },
  {
    id: 'answer-first',
    fixes: ['answer-first', 'paragraphs'],
    when: (m) => failing(m.get('answer-first')) || failing(m.get('paragraphs')),
    what: () => 'Put the answer in the first two sentences',
    why: 'Assistants quote the opening of a section. If yours opens with preamble, that is what gets quoted — or nothing does.',
    effort: '15 minutes',
    action: (_m, ctx) => ({ kind: 'link', label: 'Review your answers', href: ctx.faqsHref }),
  },
  /*
    ⚠️ 'titles' AND 'meta-descriptions' WERE HERE AND WERE REMOVED ON PURPOSE.
    They read "Give every page its own title tag" and "Write meta descriptions
    for the pages missing one" — the two entries in this list that belonged to a
    general SEO tool rather than to a product about being quoted by assistants.
    A plan capped at five items should not spend two of them on <head> hygiene.

    ⚠️ THE CHECKS THEY CAME FROM ARE STILL RUNNING. lib/audit/checks/seo.ts still
    tests both and both still score, so the audit detail reports them and the
    number is unchanged. Deleting the checks instead would move the denominator
    and shift the score of every account already stored, without a single
    website having changed. What went is the advice, not the measurement.

    Do not helpfully re-add them: two gaps in an otherwise complete SEO list is
    what this note exists to explain.
  */
  {
    id: 'llms-txt',
    fixes: ['llms-txt'],
    when: (m) => failing(m.get('llms-txt')),
    what: () => 'Publish an llms.txt',
    why: 'A one-file summary addressed to language models. A convention rather than a standard, but it costs one file and FaqFlo writes it.',
    effort: '2 minutes',
    action: (_m, ctx) => ({ kind: 'link', label: 'Get your llms.txt', href: ctx.publishHref }),
  },
  {
    id: 'identity-pages',
    fixes: ['identity-pages', 'contactable'],
    when: (m) => failing(m.get('identity-pages')) || hardFail(m.get('contactable')),
    what: () => 'Add an about page and reachable contact details',
    why: 'A business a machine cannot identify or reach is a business it has no reason to recommend.',
    effort: 'an hour',
    action: () => ({ kind: 'none' }),
  },
  {
    id: 'sitemap',
    fixes: ['sitemap'],
    when: (m) => failing(m.get('sitemap')),
    what: (m) =>
      m.get('sitemap')?.status === 'fail'
        ? 'Publish a sitemap.xml'
        : 'Point robots.txt at your sitemap',
    why: 'It is how a crawler finds the pages nothing links to prominently.',
    effort: '2 minutes',
    action: (_m, ctx) => ({
      kind: 'copy',
      label: 'Copy the robots.txt line',
      snippet: `Sitemap: https://${ctx.domain}/sitemap.xml`,
      where: 'Add to the bottom of your robots.txt.',
    }),
  },
  {
    id: 'freshness',
    fixes: ['freshness'],
    when: (m) => failing(m.get('freshness')),
    what: () => 'Date your content',
    why: 'Assistants prefer sources they can tell are current, and an undated page ages badly by default.',
    effort: '15 minutes',
    action: () => ({ kind: 'none' }),
  },
  {
    id: 'specificity',
    fixes: ['specificity', 'lists'],
    when: (m) => failing(m.get('specificity')),
    what: () => 'Put real numbers in your answers',
    why: 'Prices, timeframes and coverage areas are what make an answer worth repeating. Vague copy gets skipped.',
    effort: '15 minutes',
    action: (_m, ctx) => ({ kind: 'link', label: 'Review your answers', href: ctx.faqsHref }),
  },
];

/** Just the path, for naming a page in an instruction without the noise. */
function path(url: string): string {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}

/**
 * What each effort band costs, for impact-over-effort ranking.
 *
 * Exported so lib/dashboard/worklist.ts can rank product tasks — "your live
 * copy is out of date", "three drafts have no answer" — on the same scale as
 * audit fixes. Those two lists are merged into one before the customer sees
 * them, and two lists ranked by different arithmetic do not merge into a
 * meaningful order.
 */
export const EFFORT_COST: Record<ActionItem['effort'], number> = {
  '2 minutes': 1,
  '15 minutes': 2,
  'an hour': 4,
};

export function buildActionPlan(findings: Finding[], ctx: ActionContext, limit = 5): ActionItem[] {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const base = overallScore(buildPillars(findings));

  const candidates = RECIPES.filter((r) => r.when(byId)).map((recipe) => {
    // Only claim credit for findings that are actually failing — a recipe that
    // touches three checks where two already pass is worth the one.
    const fixable = recipe.fixes.filter((id) => failing(byId.get(id)));
    const gain = scoreIfFixed(findings, fixable) - base;

    return {
      recipe,
      item: {
        id: recipe.id,
        what: recipe.what(byId, ctx),
        why: recipe.why,
        impact: gain > 0 ? gain : null,
        effort: recipe.effort,
        action: recipe.action(byId, ctx),
      } satisfies ActionItem,
      value: (gain > 0 ? gain : 0.5) / EFFORT_COST[recipe.effort],
    };
  });

  // Don't hand someone two jobs that fix the same finding — the second would
  // claim an impact it can no longer deliver once the first is done.
  const claimed = new Set<string>();
  const plan: ActionItem[] = [];

  // Blockers first, then everything else by value. Within each band the same
  // impact-over-effort ordering applies.
  const ranked = [...candidates].sort((a, b) => {
    const criticality = Number(b.recipe.critical ?? false) - Number(a.recipe.critical ?? false);
    return criticality !== 0 ? criticality : b.value - a.value;
  });

  for (const candidate of ranked) {
    const fixable = candidate.recipe.fixes.filter((id) => failing(byId.get(id)));
    if (fixable.length && fixable.every((id) => claimed.has(id))) continue;
    fixable.forEach((id) => claimed.add(id));
    plan.push(candidate.item);
    if (plan.length === limit) break;
  }

  return plan;
}

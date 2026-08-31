/**
 * The content plan: which pages a site of this kind ought to have, and what to
 * write next.
 *
 * The split here is the whole design. A model is good at "what does a roofing
 * company in Rockland County need on its site, and what should it write about";
 * it is unnecessary — and unrepeatable — for "does /about-us match the About
 * page". So the model returns the page set *and how to recognise each one*, and
 * matching those against the crawl is ordinary string work done here.
 *
 * That keeps the cost at one call per plan rather than one per render, and
 * means the same stored plan produces the same table every time it's opened.
 * A page list that reshuffled itself on each visit would not be a plan.
 */

import type { PageContent } from '@/lib/audit/types';
import type { ArticleTopic, MustHavePage } from '@/lib/dashboard/types';

/** How many topics to ask for. Ten is a quarter's writing, not a wish list. */
export const TOPIC_COUNT = 10;

/**
 * Cap on the page summary sent to the model.
 *
 * A hundred pages of titles and headings is roughly 16k tokens, which is
 * affordable but not free. Applied inside the prompt builder rather than at the
 * call site so no caller can forget it — the same reason lib/faq.ts truncates
 * where it does.
 */
export const MAX_PAGE_SUMMARY_CHARS = 40_000;

/** Enforced by the API via output_config.format — not merely requested. */
export const CONTENT_SCHEMA = {
  type: 'object',
  properties: {
    profile: {
      type: 'object',
      properties: {
        industry: { type: 'string' },
        location: { type: 'string' },
      },
      required: ['industry', 'location'],
      additionalProperties: false,
    },
    mustHave: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          role: { type: 'string' },
          label: { type: 'string' },
          why: { type: 'string' },
          slugs: { type: 'array', items: { type: 'string' } },
        },
        required: ['role', 'label', 'why', 'slugs'],
        additionalProperties: false,
      },
    },
    topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          angle: { type: 'string' },
          primaryKeyword: { type: 'string' },
          aeoQuestion: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['title', 'angle', 'primaryKeyword', 'aeoQuestion', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['profile', 'mustHave', 'topics'],
  additionalProperties: false,
} as const;

export type ContentGeneration = {
  profile: { industry: string; location: string };
  mustHave: MustHavePage[];
  topics: ArticleTopic[];
};

/**
 * One line per page — URL, title, and whether it answers anything.
 *
 * Headings are included because they're what distinguishes a services page from
 * a blog post when the URL doesn't. The FAQ flags are here so the model can see
 * which pages already answer questions and aim the topics at the gaps rather
 * than at what's covered.
 */
function pageSummary(pages: PageContent[]): string {
  return pages
    .map((p) => {
      const parts = [p.url];
      if (p.title) parts.push(`title: ${p.title}`);
      if (p.headings.length) parts.push(`headings: ${p.headings.join(' | ')}`);
      if (p.hasFaqSchema) parts.push(`FAQ markup: yes (${p.faqQuestions.length} questions)`);
      if (p.faqQuestions.length) parts.push(`asks: ${p.faqQuestions.join(' | ')}`);
      return parts.join('\n  ');
    })
    .join('\n')
    .slice(0, MAX_PAGE_SUMMARY_CHARS);
}

export function buildContentPrompt(opts: {
  domain: string;
  /** Known industry, when the site's markup or the customer has supplied one. */
  industry: string | null;
  location: string | null;
  /** Entry-page text, for inferring the two above when they're missing. */
  hint: string;
  pages: PageContent[];
}): string {
  const { domain, industry, location, hint, pages } = opts;

  const known = [
    industry ? `Industry: ${industry}` : null,
    location ? `Service area: ${location}` : null,
  ].filter(Boolean);

  return `You are an SEO and AEO strategist advising a small business on its website.

Site: ${domain}
${known.length ? known.join('\n') : 'Industry and service area are not yet known — infer them.'}

About the business, taken from its home page:
${hint}

Every page we could read on the site:
${pageSummary(pages)}

Return JSON with three parts.

1. "profile" — the industry and service area.
${
  known.length === 2
    ? 'Both are supplied above. Repeat them back exactly as given; do not revise them.'
    : 'Infer whichever is missing from the evidence above. Be specific: "Roofing contractor", not "Home services"; "Rockland County, NY", not "the local area". If the service area genuinely cannot be determined, use an empty string rather than guessing a place.'
}

2. "mustHave" — the pages a business of this kind is expected to have. Include the ones it already has as well as the ones it does not; we match them ourselves.
- Between 6 and 9 entries, ordered by how much each one matters to this business.
- "role" is a stable lowercase key, like "services" or "storm-damage".
- "label" is what the customer would call it, like "Storm & hail damage".
- "why" is one sentence of AT MOST 15 WORDS on why THIS industry needs it, written to the business owner. Say what it costs them not to have it. Fifteen words is a hard limit: this text is rendered in a report written for a reader at a sixth-grade level, and a longer sentence pushes the whole page above it.
- "slugs" are lowercase fragments that would appear in the URL path or page title of such a page — 2 to 4 of them, no slashes. These are how we detect the page, so give real-world variants: for an about page, ["about", "our-story", "who-we-are"].
- Go beyond the generic set. Name the pages that matter in this particular trade.

3. "topics" — exactly ${TOPIC_COUNT} articles worth writing.
- "title" is the headline as published.
- "angle" is one sentence on what makes it different from the obvious version of the piece.
- "primaryKeyword" is what someone types into a search box.
- "aeoQuestion" is what someone asks an assistant out loud — a full question, phrased as a person speaks.
- "why" is one sentence of AT MOST 15 WORDS to the owner on why this one earns its place. Fifteen is a hard limit, for the reading level of the report it lands in.

Rules for the topics:
- Ground them in the service area. A topic that would suit an identical business two states away is a wasted topic.
- Aim at gaps. Do not propose an article on something the pages above already answer.
- Each must answer a question a real customer would ask before buying — not industry commentary.
- Vary the intent: cost, comparison, timing, process, and problem-solving all pull different people.
- Write plainly. No "ultimate guide", no "unlock", no year-stuffed headlines unless the price or rule genuinely changes yearly.`;
}

export type MustHaveResult = MustHavePage & {
  /** The page that satisfies this role, or null when nothing matched. */
  page: PageContent | null;
};

/**
 * Collapse to one separator so hyphens, slashes and spaces all compare equal.
 *
 * The model returns URL-shaped slugs (`roof-repair`) but a page announces
 * itself in two different dialects: `/roof-repair/` in the path and
 * "Roof Repair in Rockland County" in the title. Without this, half the slugs
 * silently never match a title.
 */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

type Parts = { path: string; segments: string[]; title: string; depth: number };

function partsOf(page: PageContent): Parts {
  let path = '/';
  try {
    path = new URL(page.url).pathname;
  } catch {
    path = page.url;
  }
  const segments = path.split('/').filter(Boolean).map(normalise);
  return { path: normalise(path), segments, title: normalise(page.title), depth: segments.length };
}

/**
 * How well one page answers to one role. 0 means it doesn't.
 *
 * Scored rather than first-match-wins, because crawl order is arbitrary and
 * matching on it produces confidently wrong answers: on a real site the blog
 * post "How Summer Heat Affects Your Home's Siding" was claiming the Siding
 * role while the actual /siding-services/ page sat unmatched two rows below.
 *
 * The weights encode where a page states its purpose most reliably. A whole
 * path segment equal to the slug is a page named for the thing; the slug
 * appearing somewhere in the path is weaker; the title alone is weakest,
 * because titles mention subjects a page is merely about. Depth breaks the
 * remaining ties toward /services over /blog/2019/some-post-about-services.
 */
function score(page: PageContent, slugs: string[]): number {
  const parts = partsOf(page);

  // The home page contains a bit of everything and is nobody's services page.
  // Left out entirely rather than down-weighted: it would otherwise win the
  // first role it touched and report the real page as missing.
  if (parts.depth === 0) return 0;

  let best = 0;
  for (const raw of slugs) {
    const slug = normalise(raw);
    if (!slug) continue;

    if (parts.segments.includes(slug)) best = Math.max(best, 20);
    else if (parts.path.includes(slug)) best = Math.max(best, 12);
    else if (parts.title.includes(slug)) best = Math.max(best, 4);
  }

  return best ? best - (parts.depth - 1) * 2 : 0;
}

/**
 * Which page satisfies which role.
 *
 * No model call — the slugs did that thinking already, which is what keeps a
 * stored plan rendering the same table every time it's opened.
 *
 * One page may satisfy only one role. Without that, a single page mentioning
 * several services claims all of them and the site reports as complete when it
 * has one page. Roles are resolved in the order the model returned them, which
 * it was asked to sort by importance — so when two roles want the same page,
 * the one that matters more to the business gets it.
 */
export function matchMustHave(pages: PageContent[], mustHave: MustHavePage[]): MustHaveResult[] {
  const claimed = new Set<string>();

  return mustHave.map((entry) => {
    const page =
      pages
        .filter((p) => !claimed.has(p.url))
        .map((p) => ({ page: p, score: score(p, entry.slugs) }))
        .filter((c) => c.score > 0)
        // Shortest URL breaks a score tie: /roofing-services beats
        // /roofing-services-in-nyack-ny as the canonical page for a role.
        .sort((a, b) => b.score - a.score || a.page.url.length - b.page.url.length)[0]?.page ?? null;

    if (page) claimed.add(page.url);
    return { ...entry, page };
  });
}

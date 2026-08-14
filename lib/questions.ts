/**
 * Question discovery: what people actually ask assistants about a business like
 * this one, and whether this site answers it.
 *
 * ⚠️ THERE IS NO VOLUME FIGURE HERE, AND THERE MUST NOT BE ONE.
 *
 * The UI used to render "About 480 asks a month" against every discovered
 * question. That number came from a hand-written demo fixture. Nothing in this
 * product measures ask volume — there is no keyword provider, no SERP feed, and
 * a language model cannot know it. Asking one to produce it yields a plausible
 * invention presented as a measurement, which is the single thing this codebase
 * refuses to do everywhere else: lib/audit/score.ts drops unmeasured checks out
 * of the denominator rather than scoring them, and the AI-visibility pillar
 * carries weight 0 precisely so a locked check can't masquerade as a finding.
 *
 * What replaces it is `why` — one sentence on why this question matters to this
 * business. That is a judgment the model can actually make, and it is more use
 * to an owner deciding what to answer first than a fabricated number would be.
 *
 * The other half of the design is the same split lib/content.ts uses: the model
 * proposes questions, and matching them against what the site already answers is
 * ordinary string work done here. One call per run, not one per render.
 */

import type { PageContent } from '@/lib/audit/types';

/** How many questions to ask for. Enough to work through, not a backlog. */
export const QUESTION_COUNT = 15;

/** Same cap as the content plan, applied inside the builder so no caller can skip it. */
export const MAX_PAGE_SUMMARY_CHARS = 40_000;

/** Enforced by the API via output_config.format — not merely requested. */
export const QUESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          why: { type: 'string' },
          intent: { type: 'string', enum: ['pricing', 'service', 'trust', 'logistics', 'problem'] },
        },
        required: ['question', 'why', 'intent'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
} as const;

export type DiscoveredIntent = 'pricing' | 'service' | 'trust' | 'logistics' | 'problem';

export type GeneratedQuestion = {
  question: string;
  why: string;
  intent: DiscoveredIntent;
};

export type QuestionGeneration = { questions: GeneratedQuestion[] };

/**
 * One line per page, so the model can see what is already answered.
 *
 * `asks` matters more here than it does for the content plan: a question the
 * site already answers well is not an opportunity, and proposing it back to the
 * customer as a gap is the fastest way to make the feature look stupid.
 */
function pageSummary(pages: PageContent[]): string {
  return pages
    .map((p) => {
      const parts = [p.url];
      if (p.title) parts.push(`title: ${p.title}`);
      if (p.headings.length) parts.push(`headings: ${p.headings.join(' | ')}`);
      if (p.faqQuestions.length) parts.push(`already answers: ${p.faqQuestions.join(' | ')}`);
      return parts.join('\n  ');
    })
    .join('\n')
    .slice(0, MAX_PAGE_SUMMARY_CHARS);
}

export function buildQuestionsPrompt(opts: {
  domain: string;
  industry: string | null;
  location: string | null;
  /** Entry-page text from the audit, when there is no usable schema. */
  hint: string;
  pages: PageContent[];
  /** Questions the customer has already published, so they aren't proposed again. */
  answered: string[];
}): string {
  const { domain, industry, location, hint, pages, answered } = opts;

  const known = [
    industry ? `Industry: ${industry}` : null,
    location ? `Service area: ${location}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `You are advising a small business on the questions real people put to AI assistants — ChatGPT, Perplexity, Google's AI Overviews — when they are looking for a business like this one.

Website: ${domain}
${known || 'The industry and service area are not yet known — work them out from the pages below.'}

${hint ? `What the home page says:\n${hint}\n` : ''}
Pages on the site:
${pageSummary(pages)}

${answered.length ? `The business already publishes answers to these, so do NOT propose them again:\n${answered.map((q) => `- ${q}`).join('\n')}\n` : ''}
Give exactly ${QUESTION_COUNT} questions.

What makes a good one:
- It is phrased the way a person actually talks to an assistant — full sentences, natural wording, often longer than a search query. "How much does it cost to replace a roof in Franklin?" not "roof replacement cost".
- It is specific to THIS business's trade and area, not generic to all businesses.
- It is a question this business could genuinely answer well. Do not propose questions that would need information they do not have.
- It is not already answered on the site above.

Spread them across the reasons people ask, and label each with its intent:
- pricing — what things cost, what affects the price, whether there are hidden fees
- service — what they do, what they don't, what's included
- trust — are they any good, licensed, insured, how long they've been going
- logistics — how soon, how long it takes, what areas they cover, how to book
- problem — the symptom that sent someone looking in the first place

For "why", write ONE sentence on why answering this particular question would help this particular business get cited. Be concrete about this business, not about AEO in general. Do not mention search volume, traffic estimates or how often anything is asked — you do not know those and neither do we.

No preamble, no numbering inside the question text.`;
}

/** Normalised for comparison: case, punctuation and spacing all ignored. */
export function questionKey(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

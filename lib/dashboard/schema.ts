/**
 * FAQPage JSON-LD — the artefact the whole product exists to produce.
 *
 * Generalises the hand-written block in components/marketing/site-faq.tsx, so
 * FaqFlo's own page and a customer's page are marked up by the same rules.
 *
 * Two rules that aren't negotiable:
 *  - Only PUBLISHED entries go in. Schema describing content a visitor can't
 *    see on the page is exactly the mismatch Google penalises.
 *  - The text is the answer verbatim. Nothing is summarised or trimmed, because
 *    the markup has to match what's rendered.
 */

import type { FaqEntry, Site } from './types';

export type FaqPageSchema = {
  '@context': 'https://schema.org';
  '@type': 'FAQPage';
  mainEntity: {
    '@type': 'Question';
    name: string;
    acceptedAnswer: { '@type': 'Answer'; text: string };
  }[];
};

export function buildFaqPageSchema(faqs: FaqEntry[]): FaqPageSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs
      .filter((f) => f.status === 'published')
      .sort((a, b) => a.position - b.position)
      .map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
  };
}

/** Pretty-printed, because this is meant to be read and pasted by a human. */
export function schemaToString(schema: FaqPageSchema): string {
  return JSON.stringify(schema, null, 2);
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export type ReadinessCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
};

/*
  Thresholds below are judgement calls, and they're written down rather than
  buried in a component so they can be argued with:

  - 3 published FAQs is the floor worth marking up at all.
  - Answers under ~40 characters rarely say enough to be quoted usefully.
  - Answers over ~1000 characters stop being an answer and become a page.
  - A question that doesn't read as a question is the single most common reason
    a set never gets quoted, so it's a hard fail rather than a warning.
*/
const MIN_PUBLISHED = 3;
const MIN_ANSWER_CHARS = 40;
const MAX_ANSWER_CHARS = 1000;

export function readinessChecks(site: Site, faqs: FaqEntry[]): ReadinessCheck[] {
  const published = faqs.filter((f) => f.status === 'published');

  const short = published.filter((f) => f.answer.trim().length < MIN_ANSWER_CHARS);
  const long = published.filter((f) => f.answer.trim().length > MAX_ANSWER_CHARS);
  const notQuestions = published.filter((f) => !f.question.trim().endsWith('?'));

  const seen = new Set<string>();
  const duplicates = published.filter((f) => {
    const key = f.question.trim().toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });

  return [
    {
      id: 'published',
      label: 'Enough published answers',
      status: published.length >= MIN_PUBLISHED ? 'pass' : published.length > 0 ? 'warn' : 'fail',
      detail:
        published.length >= MIN_PUBLISHED
          ? `${published.length} published and included in your schema.`
          : published.length > 0
            ? `${published.length} published. ${MIN_PUBLISHED} or more gives an answer engine something to choose from.`
            : 'Nothing is published yet, so your schema is empty.',
    },
    {
      id: 'installed',
      label: 'Widget installed',
      status: site.installedAt ? 'pass' : 'fail',
      detail: site.installedAt
        ? `Detected on ${site.domain}.`
        : 'Your schema only reaches search engines once the snippet is on the site.',
    },
    {
      id: 'phrasing',
      label: 'Questions read as questions',
      status: notQuestions.length === 0 ? 'pass' : 'fail',
      detail:
        notQuestions.length === 0
          ? 'Every published question is phrased as one.'
          : `${notQuestions.length} ${notQuestions.length === 1 ? 'entry doesn' : 'entries don'}'t end in a question mark — assistants match on the question, so phrasing matters.`,
    },
    {
      id: 'length',
      label: 'Answer length',
      status: short.length === 0 && long.length === 0 ? 'pass' : 'warn',
      detail:
        short.length === 0 && long.length === 0
          ? 'All answers are a quotable length.'
          : [
              short.length ? `${short.length} too short to be useful` : null,
              long.length ? `${long.length} long enough to get truncated` : null,
            ]
              .filter(Boolean)
              .join(', ') + '.',
    },
    {
      id: 'duplicates',
      label: 'No duplicate questions',
      status: duplicates.length === 0 ? 'pass' : 'warn',
      detail:
        duplicates.length === 0
          ? 'Every question is distinct.'
          : `${duplicates.length} duplicate ${duplicates.length === 1 ? 'question' : 'questions'} — repeats split the signal between them.`,
    },
  ];
}

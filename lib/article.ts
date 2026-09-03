/**
 * Article generation: the schema, the prompt, and the word count.
 *
 * The sibling of lib/faq.ts, and deliberately shaped like it — a schema the API
 * enforces through `output_config.format`, a prompt builder, and small coercion
 * helpers — so the two routes read the same way.
 *
 * ⚠️ THE OUTPUT IS STRUCTURE, NOT PROSE WITH MARKUP IN IT. See ArticleSection
 * in lib/dashboard/types.ts: a schema with a heading field cannot come back
 * without headings, which is what makes "use proper H2s" a guarantee instead of
 * a request. It also means nothing has to parse a model's markdown to build the
 * HTML — the builder in lib/dashboard/export.ts maps fields through
 * escapeHtml() and interprets nothing.
 */

import type { ArticleSection } from '@/lib/dashboard/types';

/**
 * The ceiling, in words.
 *
 * ⚠️ ASKED FOR, THEN MEASURED — NEVER ENFORCED BY CUTTING. Truncating a model's
 * output at exactly the limit ends the article mid-sentence, which is a worse
 * artefact than one that runs a hundred words long. The prompt states the
 * limit, the route measures what came back with countWords(), and the number
 * shown to the customer is the measured one.
 *
 * Raised from 1,000 to 1,200 at Beau's request. Nothing else depends on the
 * value — max_tokens has headroom for it, and the copy that quotes the figure
 * builds it from this constant rather than repeating it.
 */
export const MAX_ARTICLE_WORDS = 1200;

/** How many H2 sections to ask for. Enough to be a structure, not an outline. */
export const ARTICLE_SECTIONS = { min: 4, max: 6 } as const;

/** A brief longer than this is a pasted document, not a note. */
export const MAX_BRIEF_CHARS = 2000;

const ARTICLE_PROPERTY = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    intro: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['heading', 'body'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'intro', 'sections'],
  additionalProperties: false,
} as const;

/**
 * The response shape.
 *
 * ⚠️ IT USED TO TAKE A `withFaq` FLAG AND RETURN FAQs ALONGSIDE THE ARTICLE.
 * That went when the topic rows dropped to one button: FAQs are now written
 * AFTER an article exists, from the finished text, on the article's own page —
 * which is better material than the one-line brief this call gets, and it went
 * through /api/dashboard/generate, which already existed. Nothing called the
 * combined form afterwards, so it was deleted rather than left as a branch
 * nobody exercises.
 */
export function articleSchema() {
  return {
    type: 'object',
    properties: { article: ARTICLE_PROPERTY },
    required: ['article'],
    additionalProperties: false,
  };
}

export type ArticleGeneration = {
  article: { title: string; intro: string; sections: ArticleSection[] };
};

/**
 * Words in a finished article, counted the way a person would count them.
 *
 * Runs of whitespace collapse, so a double space is one gap; the title counts
 * because it is part of what gets published. This is the ONLY thing that sets
 * Article.wordCount — see the warning on that field.
 */
export function countWords(input: {
  title: string;
  intro: string;
  sections: ArticleSection[];
}): number {
  const text = [
    input.title,
    input.intro,
    ...input.sections.flatMap((s) => [s.heading, s.body]),
  ].join(' ');

  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

export function buildArticlePrompt(opts: {
  domain: string;
  businessName: string;
  industry: string | null;
  location: string | null;
  /** What the owner typed. Empty when they just pressed the button. */
  brief: string;
  /** Headings and titles from the crawl, so it writes about the real business. */
  siteSummary: string;
  /** Questions the site does not answer yet — the best article subjects. */
  openQuestions: string[];
}): string {
  const { domain, businessName, industry, location, brief, siteSummary, openQuestions } = opts;

  const known = [
    industry ? `Trade: ${industry}` : null,
    location ? `Service area: ${location}` : null,
  ].filter(Boolean);

  return `You are writing one article for a small business's own website. It will be published under their name, not yours.

Business: ${businessName} (${domain})
${known.length ? known.join('\n') : 'Trade and service area are not stated — work them out from the pages below.'}

What is already on their site:
${siteSummary}

${
  openQuestions.length
    ? `Questions their customers ask that the site does not answer yet:\n${openQuestions.map((q) => `- ${q}`).join('\n')}`
    : 'No unanswered questions have been recorded for them.'
}

${
  brief
    ? `What the owner asked for, in their words. This governs the subject — follow it:\n${brief.slice(0, MAX_BRIEF_CHARS)}`
    : 'The owner gave no instructions, so choose the subject yourself: pick the one unanswered question above that a paying customer is most likely to ask before buying. If there are none, write about the decision their customers find hardest.'
}

Return JSON with an "article" object.

The article:
- "title" is the headline as published. Plain and specific. No "ultimate guide", no "unlock", no year stuffing.
- "intro" is the opening, before the first heading: two or three short paragraphs that answer the question directly. Someone who reads only this should already have the answer.
- "sections" is ${ARTICLE_SECTIONS.min} to ${ARTICLE_SECTIONS.max} entries. Each has a "heading" and a "body".
  - "heading" is a section title of a few words. It becomes an H2 on the page, so write it as a heading, not a sentence, and do not put a number or a "#" in it.
  - "body" is the prose under that heading. Separate paragraphs with a blank line. Do not use markdown: no "#", no "**", no bullet characters, no links. Plain sentences only.

Hard rules:
- THE WHOLE ARTICLE MUST BE UNDER ${MAX_ARTICLE_WORDS} WORDS, title and headings included. Aim for ${MAX_ARTICLE_WORDS - 150}. This is a real limit, not a target to overshoot.
- Write it so a sixth-grader can follow it. Short sentences. Everyday words. If a trade term is unavoidable, say what it means the first time.
- Be concrete about this business and this area. An article that would suit an identical company two states away is a failed article.

Voice:
- Helpful and authoritative. Mostly neutral, informational writing: explain how the thing works and what it depends on.
- Address the reader as "you" ("your roof", "your quote").
- Use first person — "we", "our", "in our experience" — where the sentence conveys ${businessName}'s own expertise, experience or recommendation. This is published under their name, so that is their voice. A few times across the piece, not in every sentence: an article that is all "we" reads as a brochure, and one with none of it reads as a stranger's explainer.
- Never invent a fact you were not given — no prices, no statistics, no awards, no years in business, no customer names, no job counts. This applies with MORE force to first-person sentences, not less: "in our experience most roofs last twenty years" is a specific claim the owner never made. Say what a thing depends on instead of inventing the number, and keep first person for judgment ("we usually recommend…") rather than for data.
- No call to action at the end, no "contact us today". The owner adds that themselves.`;
}

/* ------------------------------------------------- watching it get written --- */

/**
 * Where a run has got to. Every one of these is a real boundary.
 *
 * ⚠️ THERE IS NO PERCENTAGE AND THERE MUST NOT BE ONE. A model call reports no
 * progress figure, so any bar that crept between these would be, in the words
 * already on components/dashboard/audit-notice.tsx, "a clock pretending to be a
 * measurement". `thinking` lasts until the first token arrives, `writing` until
 * the last one does, and `saving` covers parsing and counting. What fills the
 * long middle is the headings themselves, which are real output.
 */
export type ArticleStreamPhase = 'thinking' | 'writing' | 'saving';

/**
 * Every COMPLETED value of one key in a half-written JSON document.
 *
 * ⚠️ ESCAPE-AWARE, AND A NAIVE VERSION IS WRONG IN TWO WAYS AT ONCE. The
 * obvious pattern `"heading"\s*:\s*"([^"]*)"` would (1) stop at the first
 * escaped quote inside a heading, emitting half of it, and (2) match a string
 * that has not finished arriving, because the closing quote it found belongs to
 * the next key. `(?:[^"\\]|\\.)*` consumes escape pairs as units, so the
 * quote it terminates on is always the real one — which also means a string
 * still being streamed simply does not match yet, and is emitted on a later
 * pass once it closes.
 *
 * Values come back unescaped, in document order. The caller tracks how many it
 * has already sent, so re-scanning the whole buffer each time is not a bug: the
 * accumulated JSON is a few kilobytes and the scan is what makes "emit each one
 * exactly once" a property of the caller rather than of a parser's state.
 */
export function completedStrings(json: string, key: string): string[] {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'g');
  const out: string[] = [];

  for (const match of json.matchAll(pattern)) {
    try {
      // Back through JSON so \n, \" and \uXXXX all come out as characters.
      out.push(JSON.parse(`"${match[1]}"`) as string);
    } catch {
      // A capture that will not parse is a fragment we should not show. Skipping
      // it costs one poll; the next pass sees the finished string.
    }
  }

  return out;
}

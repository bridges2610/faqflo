/**
 * FAQ generation types, prompt, and option validation.
 *
 * Ported from the original Express server. The prompt below is carried over
 * word for word — it produces good output and this rebuild is not the place to
 * retune it. The one change is the response shape: the original asked for a
 * bare JSON array and then regex-scraped it out of the reply (which is why the
 * old server had a "Claude returned an unexpected format" error path). We now
 * ask for an object and enforce it with structured outputs, so that failure
 * mode is gone.
 */

export type Faq = { q: string; a: string };

export const TONES = ['Professional', 'Casual', 'Authoritative'] as const;
export type Tone = (typeof TONES)[number];

export const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Dutch', 'Japanese'] as const;
export type Language = (typeof LANGUAGES)[number];

export const MIN_FAQ_COUNT = 3;
/**
 * The ANONYMOUS generator's ceiling: 5 pairs per generation, no account.
 *
 * ⚠️ NOT THE SAME NUMBER AS FREE_FAQ_CAP, and the two must not be merged. This
 * caps one model call on a public, unauthenticated endpoint. FREE_FAQ_CAP (10)
 * caps how many answers a signed-in free account may KEEP, across any number of
 * generations. Signing up is meant to visibly double what you get, which is
 * only true while these differ.
 */
export const MAX_FAQ_COUNT = 5;
export const DEFAULT_FAQ_COUNT = 5;

/**
 * Ceiling for the dashboard generator on Pro. Higher than the anonymous cap
 * because Pro advertises an unlimited generator, but still finite — one request
 * is one model call, and an unbounded count is an unbounded bill.
 */
export const MAX_FAQ_COUNT_PRO = 12;
export const DEFAULT_FAQ_COUNT_PRO = 6;

/** Anthropic input cap. Also applied when extracting text from a URL. */
export const MAX_CONTENT_CHARS = 8000;

/** Enforced by the API via output_config.format — not merely requested. */
export const FAQ_SCHEMA = {
  type: 'object',
  properties: {
    faqs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          a: { type: 'string' },
        },
        required: ['q', 'a'],
        additionalProperties: false,
      },
    },
  },
  required: ['faqs'],
  additionalProperties: false,
} as const;

const TONE_GUIDE: Record<Tone, string> = {
  Professional:
    'Use clear, formal, business-appropriate language. Be precise and polished without being stiff.',
  Casual:
    'Use friendly, conversational language as if chatting with a friend. Keep it warm, approachable, and jargon-free.',
  Authoritative:
    'Use confident, expert language backed by specifics. Be definitive and data-driven. Establish credibility.',
};

/**
 * The dashboard's shape: the same answers, plus a name for the set.
 *
 * ⚠️ A SIBLING OF FAQ_SCHEMA, NOT A REPLACEMENT, AND THE PUBLIC ROUTE IS WHY.
 * /api/generate serves /free-report to people with no account, and its response
 * shape is a contract the marketing page sells. Adding a required field to the
 * schema they share would change what a stranger gets in order to tidy a
 * dashboard list. This one is used only by /api/dashboard/generate.
 */
export const FAQ_SET_SCHEMA = {
  type: 'object',
  properties: {
    topic: { type: 'string' },
    faqs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          a: { type: 'string' },
        },
        required: ['q', 'a'],
        additionalProperties: false,
      },
    },
  },
  required: ['topic', 'faqs'],
  additionalProperties: false,
} as const;

export function buildPrompt(opts: {
  content: string;
  count: number;
  tone: Tone;
  language: Language;
  /**
   * Ask for a name for the set as well.
   *
   * ⚠️ OPT-IN, SO THE PUBLIC ROUTE'S PROMPT IS BYTE-IDENTICAL TO WHAT IT WAS.
   * Only the dashboard needs a label, because only the dashboard keeps the set
   * and has to list it.
   */
  withTopic?: boolean;
}): string {
  const { content, count, tone, language, withTopic } = opts;

  return `You are an FAQ expert. Based on the following content, generate exactly ${count} frequently asked questions with clear, concise answers. These FAQs should reflect what real users would ask about this topic.

Tone: ${tone} — ${TONE_GUIDE[tone]}

Return a JSON object with a "faqs" array${withTopic ? ' and a "topic" string' : ''}. Format:
{${withTopic ? '"topic": "What the set is about",\n ' : ''}"faqs": [
  {"q": "Question here?", "a": "Answer here (2-4 sentences)."},
  ...
]}
${
  withTopic
    ? `
The topic:
- Two to five words naming what this set of answers is about, as a heading — "Roof replacement costs", "Insurance claims".
- Not a sentence, not a question, and no trailing punctuation.
- It labels a row in a list, so it has to make sense with no other context.
`
    : ''
}
Rules:
- Questions must be natural and conversational, as a real person would type them
- Answers must be accurate based ONLY on the provided content
- Each answer must be 2–3 sentences maximum — clear, concise, and direct
- Apply the specified tone consistently to both questions and answers
- Do not number the questions
- Return exactly ${count} items
- Write all questions and answers in ${language}

Content:
${content.slice(0, MAX_CONTENT_CHARS)}`;
}

/**
 * Coerce a requested count into the allowed range, falling back to the default
 * for anything out of range or not an integer.
 *
 * `max` defaults to the free ceiling so existing callers are unaffected; the
 * dashboard route passes MAX_FAQ_COUNT_PRO. The fallback is clamped to `max`
 * too, so a lower ceiling can never return a default above it.
 */
export function clampCount(value: unknown, max: number = MAX_FAQ_COUNT): number {
  const fallback = Math.min(DEFAULT_FAQ_COUNT, max);
  return Number.isInteger(value) && (value as number) >= MIN_FAQ_COUNT && (value as number) <= max
    ? (value as number)
    : fallback;
}

export function coerceTone(value: unknown): Tone {
  return TONES.includes(value as Tone) ? (value as Tone) : 'Professional';
}

export function coerceLanguage(value: unknown): Language {
  return LANGUAGES.includes(value as Language) ? (value as Language) : 'English';
}

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
export const MAX_FAQ_COUNT = 7;
export const DEFAULT_FAQ_COUNT = 6;

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

export function buildPrompt(opts: {
  content: string;
  count: number;
  tone: Tone;
  language: Language;
}): string {
  const { content, count, tone, language } = opts;

  return `You are an FAQ expert. Based on the following content, generate exactly ${count} frequently asked questions with clear, concise answers. These FAQs should reflect what real users would ask about this topic.

Tone: ${tone} — ${TONE_GUIDE[tone]}

Return a JSON object with a "faqs" array. Format:
{"faqs": [
  {"q": "Question here?", "a": "Answer here (2-4 sentences)."},
  ...
]}

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

export function clampCount(value: unknown): number {
  return Number.isInteger(value) &&
    (value as number) >= MIN_FAQ_COUNT &&
    (value as number) <= MAX_FAQ_COUNT
    ? (value as number)
    : DEFAULT_FAQ_COUNT;
}

export function coerceTone(value: unknown): Tone {
  return TONES.includes(value as Tone) ? (value as Tone) : 'Professional';
}

export function coerceLanguage(value: unknown): Language {
  return LANGUAGES.includes(value as Language) ? (value as Language) : 'English';
}

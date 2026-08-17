import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import type { PageContent } from '@/lib/audit/types';
import {
  buildQuestionsPrompt,
  QUESTION_COUNT,
  QUESTIONS_SCHEMA,
  type QuestionGeneration,
} from '@/lib/questions';

/*
  The model call behind question discovery, lifted out of its route.

  ⚠️ WHY THIS IS ITS OWN MODULE. The onboarding scan runs discovery from
  app/api/scan/tick/route.ts, with no request to read a body from and no
  browser to send one. Leaving the call inside the route handler would have
  meant the runner POSTing to our own endpoint with a forged session, or a
  second copy of the prompt, the model choice, the caps and the error taxonomy —
  and two copies drift. The route keeps auth, entitlement and rate limiting,
  which are about the caller; this holds everything about the request, which is
  not.

  ⚠️ NOT in lib/questions.ts, which looks like the obvious home. That file
  exports questionKey() and is imported by lib/dashboard/store.ts, which is
  client code — putting the Anthropic SDK in it would pull the whole SDK into
  the browser bundle. `server-only` above makes that a build error rather than
  a surprise in a network tab.
*/

/*
  Opus rather than the Haiku the FAQ routes use, for the same reason the content
  plan uses it. Turning supplied text into questions and answers is
  transcription. Working out what a roofer's customers in a particular county
  would actually ask an assistant — and which of those this site fails to
  answer — is judgment, and the judgment IS the feature.
*/
const MODEL = 'claude-opus-5';

/* Thinking is on by default on Opus 5 and max_tokens caps thinking and text
   together. Smaller than the content plan's 16k because the output is a flat
   list rather than a plan with three sections. */
const MAX_TOKENS = 12_000;

/** Guard against a caller pasting an entire crawl of somebody else's site. */
export const MAX_PAGES = 120;

/** Cap on how many published questions we echo back into the prompt. */
export const MAX_ANSWERED = 60;

/** Trusted only for shape — this may have come from a client, and clients lie. */
export function isPageContent(value: unknown): value is PageContent {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<PageContent>;
  return typeof p.url === 'string' && typeof p.title === 'string' && Array.isArray(p.headings);
}

/**
 * Discriminated rather than thrown.
 *
 * ⚠️ The `status` travels with the failure because the route has to turn it
 * back into an HTTP code, and the scan runner has to decide whether the stage
 * is worth retrying. Collapsing every failure to one string, as a throw would,
 * loses the difference between "the key is wrong" (never retry) and "rate
 * limited" (retry shortly) — and the runner would spend money finding out.
 */
export type QuestionsResult =
  | { ok: true; questions: QuestionGeneration['questions'] }
  | { ok: false; error: string; status: number };

export type QuestionsInput = {
  domain: string;
  industry: string | null;
  location: string | null;
  hint?: string;
  pages: PageContent[];
  answered?: string[];
};

/**
 * Ask Claude what this site's customers would put to an assistant.
 *
 * Callers own auth, entitlements and rate limiting. This owns the prompt, the
 * model, the caps and the error taxonomy.
 */
export async function generateQuestions(input: QuestionsInput): Promise<QuestionsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-your-key-here') {
    return { ok: false, error: 'ANTHROPIC_API_KEY is not configured.', status: 500 };
  }

  /*
    A full audit is a prerequisite, not a nicety. Without the crawl there is
    nothing to tell the model what this business does — and worse, no way to
    know which questions the site already answers, so it would propose things
    the customer has covered and look like it hadn't read their site.
  */
  const clean = input.pages.filter(isPageContent).slice(0, MAX_PAGES);
  if (clean.length === 0) {
    return {
      ok: false,
      error: 'Run a full check of your site first — there are no pages to read.',
      status: 400,
    };
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: {
        // Medium for the same reason as the content plan: the reasoning is wide
        // rather than deep, and high spends thinking tokens without the answer
        // getting more correct.
        effort: 'medium',
        format: { type: 'json_schema', schema: QUESTIONS_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: buildQuestionsPrompt({
            domain: input.domain,
            industry: input.industry?.trim() || null,
            location: input.location?.trim() || null,
            hint: input.hint ?? '',
            pages: clean,
            answered: (input.answered ?? []).slice(0, MAX_ANSWERED),
          }),
        },
      ],
    });

    // Checked before the content is read: on a refusal there is nothing in it.
    if (message.stop_reason === 'refusal') {
      return { ok: false, error: 'Claude declined to suggest questions for that site.', status: 400 };
    }
    if (message.stop_reason === 'max_tokens') {
      return { ok: false, error: 'The list came back too long to finish. Please try again.', status: 500 };
    }

    const text = message.content.find((block) => block.type === 'text')?.text;
    if (!text) return { ok: false, error: 'No questions came back. Please try again.', status: 500 };

    const generated = JSON.parse(text) as QuestionGeneration;
    if (!Array.isArray(generated.questions) || generated.questions.length === 0) {
      return { ok: false, error: 'No questions came back. Please try again.', status: 500 };
    }

    return { ok: true, questions: generated.questions.slice(0, QUESTION_COUNT) };
  } catch (err) {
    // Same taxonomy as the other routes — APIConnectionError extends APIError in
    // the TS SDK, so it has to be tested first.
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: 'The configured API key was rejected.', status: 500 };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return {
        ok: false,
        error: "We're getting a lot of requests right now. Try again in a moment.",
        status: 429,
      };
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return {
        ok: false,
        error: "Couldn't reach Claude. Check your connection and try again.",
        status: 502,
      };
    }
    if (err instanceof Anthropic.APIError) {
      console.error('Anthropic API error:', err.status, err.message);
      return { ok: false, error: 'Claude returned an error. Please try again.', status: 502 };
    }
    console.error('Unexpected question discovery error:', err);
    return { ok: false, error: 'Something went wrong. Please try again.', status: 500 };
  }
}

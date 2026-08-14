import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import type { PageContent } from '@/lib/audit/types';
import {
  buildQuestionsPrompt,
  QUESTION_COUNT,
  QUESTIONS_SCHEMA,
  type QuestionGeneration,
} from '@/lib/questions';
import { currentUser, siteForUser } from '@/lib/auth/dal';
import { canDiscover, hasGetCited } from '@/lib/auth/entitlements';
import { checkRateLimit, limitKey, QUESTIONS_RATE_LIMIT } from '@/lib/rate-limit';

/*
  Question discovery — the thing the Opportunities screen has always claimed to
  do and never did.

  The empty state used to say "we look at what people ask assistants about your
  category — check back shortly after setup." Nothing was coming: addQuestions()
  existed in the store with no caller, and the only questions that ever appeared
  were eight hard-coded roofing examples in the dev seed.

  Structured exactly like the content-plan route next door, deliberately: same
  auth order, same gate, same 404-not-403 for a site that isn't yours, same
  error taxonomy. Two routes that spend money on a model should not have two
  different shapes for deciding whether they are allowed to.
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
const MAX_PAGES = 120;

/** Cap on how many published questions we echo back into the prompt. */
const MAX_ANSWERED = 60;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Trusted only for shape — this came from a client, and clients lie. */
function isPageContent(value: unknown): value is PageContent {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<PageContent>;
  return typeof p.url === 'string' && typeof p.title === 'string' && Array.isArray(p.headings);
}

export async function POST(request: Request) {
  // Identity first, so the rate limit is charged to the account rather than to
  // a shared office IP.
  const user = await currentUser();
  if (!user) return fail('Sign in to find questions.', 401);

  if (!checkRateLimit(`questions:${limitKey(user.id, request.headers)}`, QUESTIONS_RATE_LIMIT)) {
    return fail("That's the question searches for today. They reset at midnight UTC.", 429);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-your-key-here') {
    return fail('ANTHROPIC_API_KEY is not configured.', 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.', 400);
  }

  const { siteId, industry, location, hint, pages, answered } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof siteId !== 'string' || !siteId) {
    return fail('A site is required.', 400);
  }

  // The domain comes off the row, never the request body: a domain in a body is
  // an instruction to spend money on whatever the caller names.
  const site = await siteForUser(siteId, user.id);
  if (!site) return fail('No such site on your account.', 404);

  if (!canDiscover(site, user)) {
    return fail(
      hasGetCited(site)
        ? 'Your Get Cited window has ended for this site. Stay Cited keeps question discovery running.'
        : 'Finding the questions people ask is part of Get Cited for this site.',
      403,
    );
  }

  /*
    A full audit is a prerequisite, not a nicety. Without the crawl there is
    nothing to tell the model what this business does — and worse, no way to
    know which questions the site already answers, so it would propose things
    the customer has covered and look like it hadn't read their site.
  */
  if (!Array.isArray(pages) || pages.length === 0) {
    return fail('Run a full check of your site first — there are no pages to read.', 400);
  }

  const clean = pages.filter(isPageContent).slice(0, MAX_PAGES);
  if (clean.length === 0) {
    return fail('Those pages could not be read. Run the check again.', 400);
  }

  const alreadyAnswered = Array.isArray(answered)
    ? answered.filter((q): q is string => typeof q === 'string' && q.trim().length > 0).slice(0, MAX_ANSWERED)
    : [];

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
            domain: site.domain,
            industry: typeof industry === 'string' && industry.trim() ? industry.trim() : null,
            location: typeof location === 'string' && location.trim() ? location.trim() : null,
            hint: typeof hint === 'string' ? hint : '',
            pages: clean,
            answered: alreadyAnswered,
          }),
        },
      ],
    });

    // Checked before the content is read: on a refusal there is nothing in it.
    if (message.stop_reason === 'refusal') {
      return fail('Claude declined to suggest questions for that site.', 400);
    }
    if (message.stop_reason === 'max_tokens') {
      return fail('The list came back too long to finish. Please try again.', 500);
    }

    const text = message.content.find((block) => block.type === 'text')?.text;
    if (!text) return fail('No questions came back. Please try again.', 500);

    const generated = JSON.parse(text) as QuestionGeneration;
    if (!Array.isArray(generated.questions) || generated.questions.length === 0) {
      return fail('No questions came back. Please try again.', 500);
    }

    return NextResponse.json({ questions: generated.questions.slice(0, QUESTION_COUNT) });
  } catch (err) {
    // Same taxonomy as the other routes — APIConnectionError extends APIError in
    // the TS SDK, so it has to be tested first.
    if (err instanceof Anthropic.AuthenticationError) {
      return fail('The configured API key was rejected.', 500);
    }
    if (err instanceof Anthropic.RateLimitError) {
      return fail("We're getting a lot of requests right now. Try again in a moment.", 429);
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return fail("Couldn't reach Claude. Check your connection and try again.", 502);
    }
    if (err instanceof Anthropic.APIError) {
      console.error('Anthropic API error:', err.status, err.message);
      return fail('Claude returned an error. Please try again.', 502);
    }
    console.error('Unexpected question discovery error:', err);
    return fail('Something went wrong. Please try again.', 500);
  }
}

import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import type { PageContent } from '@/lib/audit/types';
import { buildContentPrompt, CONTENT_SCHEMA, TOPIC_COUNT, type ContentGeneration } from '@/lib/content';
import { checkRateLimit, clientIp, CONTENT_RATE_LIMIT } from '@/lib/rate-limit';

/*
  The content plan: the pages this industry expects, and ten things to write.

  ⚠️ THIS ROUTE IS NOT AUTHENTICATED YET.

  Same position as /api/dashboard/generate: there is no session to check, so the
  per-IP limit below is the only thing between a stranger and an unmetered
  Claude endpoint billed to this key. Gating on a real session is the auth
  stage's first job, and there is deliberately no `plan` or tier field read from
  the body — a client that declares its own entitlement is a bypass with extra
  steps.

  This one is worth more care than the FAQ routes: it is the most expensive call
  in the app, at roughly a sixth of a dollar per run.
*/

/*
  Not claude-haiku-4-5, which the two FAQ routes use.

  Their choice is right for what they do — turning supplied text into questions
  and answers is transcription, and Haiku is fast and cheap at it. This is a
  different job: read a company's home page, work out what trade it is in and
  where it operates, then reason about what pages that trade needs and what its
  customers would actually search for. That is judgment, and it is the whole
  value of the feature.
*/
const MODEL = 'claude-opus-5';

/*
  Larger than the 8192 the FAQ routes use, for a reason specific to this model:
  thinking is on by default on Claude Opus 5, and max_tokens caps thinking AND
  response text together. At 8192 a plan that reasons carefully about a hundred
  pages can run out of budget mid-answer. 16000 also keeps a non-streaming
  request inside the SDK's HTTP timeout.
*/
const MAX_TOKENS = 16_000;

/** Guard against a caller pasting an entire crawl of somebody else's site. */
const MAX_PAGES = 120;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Trusted only for shape — everything here came from a client we don't auth. */
function isPageContent(value: unknown): value is PageContent {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<PageContent>;
  return typeof p.url === 'string' && typeof p.title === 'string' && Array.isArray(p.headings);
}

export async function POST(request: Request) {
  if (!checkRateLimit(`content:${clientIp(request.headers)}`, CONTENT_RATE_LIMIT)) {
    return fail(
      "That's the content plans for today on this connection. They reset at midnight UTC.",
      429,
    );
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

  const { domain, industry, location, hint, pages } = (body ?? {}) as Record<string, unknown>;

  if (typeof domain !== 'string' || !domain.trim()) {
    return fail('A site is required.', 400);
  }
  if (!Array.isArray(pages) || pages.length === 0) {
    return fail('Run a full audit first — there are no pages to plan from.', 400);
  }

  const clean = pages.filter(isPageContent).slice(0, MAX_PAGES);
  if (clean.length === 0) {
    return fail('Those pages could not be read. Run the audit again.', 400);
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: {
        // Medium rather than the default high: the reasoning here is wide (a
        // hundred pages) but not deep, and high spends thinking tokens on a
        // problem that does not get more correct for having them.
        effort: 'medium',
        format: { type: 'json_schema', schema: CONTENT_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: buildContentPrompt({
            domain: domain.trim(),
            industry: typeof industry === 'string' && industry.trim() ? industry.trim() : null,
            location: typeof location === 'string' && location.trim() ? location.trim() : null,
            hint: typeof hint === 'string' ? hint : '',
            pages: clean,
          }),
        },
      ],
    });

    // Checked before the content is read: on a refusal there is nothing in it.
    if (message.stop_reason === 'refusal') {
      return fail('Claude declined to build a plan for that site.', 400);
    }
    if (message.stop_reason === 'max_tokens') {
      return fail('The plan came back too long to finish. Please try again.', 500);
    }

    const text = message.content.find((block) => block.type === 'text')?.text;
    if (!text) return fail('No plan came back. Please try again.', 500);

    const plan = JSON.parse(text) as ContentGeneration;
    if (!Array.isArray(plan.mustHave) || !Array.isArray(plan.topics) || !plan.topics.length) {
      return fail('No plan came back. Please try again.', 500);
    }

    return NextResponse.json({
      ...plan,
      topics: plan.topics.slice(0, TOPIC_COUNT),
    });
  } catch (err) {
    // Same taxonomy as the other routes — APIConnectionError extends APIError
    // in the TS SDK, so it has to be tested first.
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
    console.error('Unexpected content plan error:', err);
    return fail('Something went wrong. Please try again.', 500);
  }
}

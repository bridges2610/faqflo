import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import {
  buildPrompt,
  clampCount,
  coerceLanguage,
  coerceTone,
  FAQ_SCHEMA,
  MAX_FAQ_COUNT_PRO,
  type Faq,
} from '@/lib/faq';
import { currentUser, siteForUser } from '@/lib/auth/dal';
import { canRegenerate } from '@/lib/auth/entitlements';
import { checkRateLimit, DASHBOARD_RATE_LIMIT, limitKey } from '@/lib/rate-limit';

/*
  Generation for the dashboard: same model and same schema as the free route,
  at the paid ceiling (MAX_FAQ_COUNT_PRO) and a much higher daily limit.

  There is no `plan` field read from the request body, because "a client that
  tells the server which tier it is on is not authorization — it's a bypass with
  extra steps." Tier comes from the account row.

  ⚠️ This route used to check the session and nothing else, while its own
  comment claimed tier "is now enforced". It wasn't — canRegenerate was never
  imported — so any signed-in free account could POST here and receive the full
  paid ceiling of twelve answers. It now takes a siteId and gates on the same
  predicate every other generating feature defers to. A model call costs money;
  the whole point of canGenerate is that nothing spends it for free.
*/

const MODEL = 'claude-haiku-4-5';

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return fail('Sign in to generate answers.', 401);

  if (!checkRateLimit(`dash:${limitKey(user.id, request.headers)}`, DASHBOARD_RATE_LIMIT)) {
    return fail("You've hit today's generation limit. It resets at midnight UTC.", 429);
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

  const { content, count, tone, language, siteId } = (body ?? {}) as Record<string, unknown>;

  if (typeof content !== 'string' || content.trim().length < 10) {
    return fail('Content is required and must be at least 10 characters.', 400);
  }

  if (typeof siteId !== 'string' || !siteId) {
    return fail('Generating answers needs a site.', 400);
  }

  /* 404 rather than 403 for a site that isn't theirs — matching /api/audit.
     Telling a stranger that an id exists but isn't theirs is an answer they
     didn't earn. */
  const site = await siteForUser(siteId, user.id);
  if (!site) return fail('No such site on your account.', 404);

  if (!canRegenerate(user)) {
    return fail('Writing new answers is part of Pro.', 403);
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      output_config: { format: { type: 'json_schema', schema: FAQ_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: buildPrompt({
            content,
            count: clampCount(count, MAX_FAQ_COUNT_PRO),
            tone: coerceTone(tone),
            language: coerceLanguage(language),
          }),
        },
      ],
    });

    if (message.stop_reason === 'refusal') {
      return fail(
        'Claude declined to write FAQs for that content. Try different source material.',
        400,
      );
    }
    if (message.stop_reason === 'max_tokens') {
      return fail(
        'That content produced a response that was too long. Try shorter content or fewer questions.',
        500,
      );
    }

    const text = message.content.find((block) => block.type === 'text')?.text;
    if (!text) return fail('No FAQs came back. Please try again.', 500);

    const faqs = (JSON.parse(text) as { faqs: Faq[] }).faqs;
    if (!Array.isArray(faqs) || faqs.length === 0) {
      return fail('No FAQs came back. Please try again.', 500);
    }

    return NextResponse.json({ faqs });
  } catch (err) {
    // Same taxonomy as /api/generate — APIConnectionError extends APIError in
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
    console.error('Unexpected dashboard generate error:', err);
    return fail('Something went wrong. Please try again.', 500);
  }
}

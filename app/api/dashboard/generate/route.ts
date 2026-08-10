import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import {
  buildPrompt,
  clampCount,
  coerceLanguage,
  coerceTone,
  FAQ_SCHEMA,
  MAX_FAQ_COUNT_PAID,
  type Faq,
} from '@/lib/faq';
import { currentUser } from '@/lib/auth/dal';
import { checkRateLimit, DASHBOARD_RATE_LIMIT, limitKey } from '@/lib/rate-limit';

/*
  Generation for the dashboard: same model and same schema as the free route,
  at the paid ceiling (MAX_FAQ_COUNT_PAID) and a much higher daily limit.

  Authenticated. The rule this file has always stated is now enforced rather
  than deferred: there is no `plan` field read from the request body, because
  "a client that tells the server which tier it is on is not authorization —
  it's a bypass with extra steps." Tier comes from the account row.

  The paid ceiling is granted by the session, not by the caller asking for it.
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

  const { content, count, tone, language } = (body ?? {}) as Record<string, unknown>;

  if (typeof content !== 'string' || content.trim().length < 10) {
    return fail('Content is required and must be at least 10 characters.', 400);
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
            count: clampCount(count, MAX_FAQ_COUNT_PAID),
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

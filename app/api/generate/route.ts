import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import {
  buildPrompt,
  clampCount,
  coerceLanguage,
  coerceTone,
  FAQ_SCHEMA,
  type Faq,
} from '@/lib/faq';
import { checkRateLimit, clientIp, RATE_LIMIT } from '@/lib/rate-limit';

/*
  Kept on Haiku 4.5 — the model the Express version used. It's the right tier
  for a free, rate-limited tool, and changing it isn't this rebuild's call.
*/
const MODEL = 'claude-haiku-4-5';

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (!checkRateLimit(clientIp(request.headers))) {
    // Built from RATE_LIMIT so the message can never drift from the limit
    // actually enforced, or from the number advertised on the pricing card.
    return fail(
      `That's your ${RATE_LIMIT} free FAQ sets for today. Come back tomorrow, or upgrade for unlimited.`,
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
            count: clampCount(count),
            tone: coerceTone(tone),
            language: coerceLanguage(language),
          }),
        },
      ],
    });

    // Check why generation stopped before trusting the content.
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

    // The schema is enforced server-side, so this parse is a formality — but a
    // truncated or empty body would still throw, and that shouldn't 500 raw.
    const faqs = (JSON.parse(text) as { faqs: Faq[] }).faqs;
    if (!Array.isArray(faqs) || faqs.length === 0) {
      return fail('No FAQs came back. Please try again.', 500);
    }

    return NextResponse.json({ faqs });
  } catch (err) {
    // Typed SDK errors, most specific first. APIConnectionError extends
    // APIError in the TS SDK, so it must be checked before it.
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
    console.error('Unexpected generate error:', err);
    return fail('Something went wrong. Please try again.', 500);
  }
}

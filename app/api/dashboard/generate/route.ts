import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import {
  buildPrompt,
  clampCount,
  coerceLanguage,
  coerceTone,
  FAQ_SCHEMA,
  MAX_FAQ_COUNT,
  MAX_FAQ_COUNT_PRO,
  type Faq,
} from '@/lib/faq';
import { currentUser, siteForUser } from '@/lib/auth/dal';
import { isPro } from '@/lib/auth/entitlements';
import { checkRateLimit, DASHBOARD_RATE_LIMIT, limitKey, RATE_LIMIT } from '@/lib/rate-limit';

/*
  Generation for the dashboard: same model and same schema as the public route,
  metered by plan rather than closed to free.

  There is no `plan` field read from the request body, because "a client that
  tells the server which tier it is on is not authorization — it's a bypass with
  extra steps." Tier comes from the account row.

  ⚠️ THE PLAN SETS THE CEILING, IT DOES NOT SET THE LOCK — AND THAT IS A
  REVERSAL. This route used to refuse free accounts outright, while the
  generator on the public marketing home page wrote five answers for a total
  stranger with no account at all. Signing up therefore took something away,
  which is the wrong shape for a free tier and made the dashboard's own
  generator panel a trap: it rendered a full form with no client-side gate, and
  answered a free user's first click with a 403.

  So free gets exactly the anonymous deal — MAX_FAQ_COUNT per call, RATE_LIMIT
  per day — except that what it writes lands in their account and counts against
  FREE_FAQ_CAP when saved. Pro keeps the paid ceiling and the far higher limit.

  ⚠️ BOTH CLAMPS ARE LOAD-BEARING. A model call costs money and nothing else in
  the request bounds it: the count decides the size of one call and the rate
  limit decides how many. Widening either for free without widening the other
  is how this becomes an open tap.
*/

const MODEL = 'claude-haiku-4-5';

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return fail('Sign in to generate answers.', 401);

  /*
    Both ceilings come from the plan, and they are read once here so the count
    below and the limit above can never be scaled from different answers.
  */
  const pro = isPro(user);
  const dailyLimit = pro ? DASHBOARD_RATE_LIMIT : RATE_LIMIT;
  const perCall = pro ? MAX_FAQ_COUNT_PRO : MAX_FAQ_COUNT;

  if (!checkRateLimit(`dash:${limitKey(user.id, request.headers)}`, dailyLimit)) {
    /* Built from the limit rather than typed, so the number in the sentence
       cannot drift from the number enforced — the same rule the public route
       states about its own message. */
    return fail(
      pro
        ? "You've hit today's generation limit. It resets at midnight UTC."
        : `That's your ${dailyLimit} sets of answers for today. It resets at midnight UTC, or Pro lifts the limit.`,
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

  /* No plan gate here any more — see the header. What the plan decides is
     `perCall` and `dailyLimit` above, both already applied. */

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
            count: clampCount(count, perCall),
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

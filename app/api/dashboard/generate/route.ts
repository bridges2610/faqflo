import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import {
  buildPrompt,
  clampCount,
  coerceLanguage,
  coerceTone,
  FAQ_SET_SCHEMA,
  MAX_FAQ_COUNT,
  MAX_FAQ_COUNT_PRO,
  type Faq,
} from '@/lib/faq';
import { currentUser, siteForUser } from '@/lib/auth/dal';
import { canGenerate, isPro } from '@/lib/auth/entitlements';
import { claimFreeGeneration } from '@/lib/auth/free-allowance';
import { FREE_GENERATED_FAQ_SET_CAP } from '@/lib/dashboard/plans';
import { MAX_ARTICLE_FAQS } from '@/lib/article';
import {
  checkRateLimit,
  DASHBOARD_RATE_LIMIT,
  FREE_DASHBOARD_RATE_LIMIT,
  limitKey,
} from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

/*
  Generation for the dashboard: same model and same schema as the public route,
  metered by plan rather than closed to free.

  There is no `plan` field read from the request body, because "a client that
  tells the server which tier it is on is not authorization — it's a bypass with
  extra steps." Tier comes from the account row.

  ⚠️ PRO ONLY, AND THIS HAS NOW BEEN BOTH WAYS — READ BEFORE CHANGING IT BACK.

  It refused free accounts once, was opened to every plan, and is closed again.
  The middle step was not a mistake: at the time the free dashboard ENDED in an
  answer writer, and refusing here while the public marketing generator wrote
  five answers for a total stranger meant signing up took something away.

  What changed is not the argument, it is the product. The free report is one
  page and it ends in three prompts put to the engines — a diagnosis. Writing
  the answers is part of what Pro buys, and the pricing page says so in the same
  commit as this line.

  ⚠️ THE ANONYMOUS DEAL IS STILL ANONYMOUS, WHICH IS WHY THAT ARGUMENT DOES NOT
  APPLY. /free-report posts to /api/generate, not here, and is untouched. A
  stranger still gets five answers with no account. Gate that route too and the
  backwards tier is back — signing up would leave somebody worse off than not
  signing up, which is the shape this comment exists to prevent recurring.

  ⚠️ THE CLAMPS BELOW STAY EVEN THOUGH ONLY PRO REACHES THEM. A model call costs
  money and nothing else in the request bounds it: the count decides the size of
  one call and the rate limit decides how many. They are not free-tier
  scaffolding to be cleared away now that free is gone from this route.
*/

const MODEL = 'claude-haiku-4-5';

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return fail('Sign in to generate answers.', 401);

  /* Hiding the panel is not enforcement — the free report no longer renders a
     generator at all, and this is where that is true rather than merely
     displayed. See canGenerate() in lib/auth/entitlements.ts. */
  if (!canGenerate(user)) {
    return fail('Writing answers is part of Pro.', 403);
  }

  /*
    Both ceilings come from the plan, and they are read once here so the count
    below and the limit above can never be scaled from different answers.
  */
  const pro = isPro(user);
  /* ⚠️ FREE'S OWN CEILING, NOT THE ANONYMOUS ONE. This read RATE_LIMIT, which
     is /api/generate's limit for strangers — three a day, against a plan that
     sells five sets. See the note on FREE_DASHBOARD_RATE_LIMIT. */
  const dailyLimit = pro ? DASHBOARD_RATE_LIMIT : FREE_DASHBOARD_RATE_LIMIT;
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

  const { content, count, tone, language, siteId, articleId } = (body ?? {}) as Record<
    string,
    unknown
  >;

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

  /*
    ⚠️ RESOLVED ONCE, HERE, SO THE CLAIM AND THE PROMPT CANNOT DISAGREE. The
    count was clamped inline at the model call; spending an allowance meant it
    had to be known before that, and computing it twice is how the number
    charged for and the number written drift apart.
  */
  const wanted = clampCount(count, perCall);

  /*
    ⚠️ AN ARTICLE'S OWN FAQs ARE EXEMPT, AND THE EXEMPTION IS VERIFIED RATHER
    THAN TRUSTED.

    article-workspace.tsx posts here too — its comment says so approvingly,
    "NO NEW ENDPOINT… the article's plain text is just another piece of source
    material" — which was harmless until this route started spending an
    allowance. It meant adding FAQs to an article burned the Answers grant, and
    the Answers tab then refused work the plan had sold.

    ⚠️ A `forArticle: true` FLAG WOULD HAVE BEEN A BACK DOOR. Anyone could set
    it and generate for ever. So the request names an article, and this reads
    that article from the database: it must exist, it must belong to the caller,
    and it must have room under MAX_ARTICLE_FAQS. Lying gains nothing, because
    the ceiling comes from the stored row — the list is append-only, so room
    only shrinks, and a free account gets one article. Total exemption for a
    free account: one article's worth of FAQs, once.
  */
  let articleRoom: number | null = null;

  if (typeof articleId === 'string' && articleId) {
    const { data: article } = await createAdminClient()
      .from('articles')
      .select('faqs')
      .eq('id', articleId)
      .eq('user_id', user.id)
      .maybeSingle<{ faqs: unknown }>();

    /* 404, not 403 — matching /api/audit. Confirming an id exists but belongs to
       somebody else tells a guesser their guess was right. */
    if (!article) return fail('No such article on your account.', 404);

    const held = Array.isArray(article.faqs) ? article.faqs.length : 0;
    articleRoom = Math.max(0, MAX_ARTICLE_FAQS - held);

    if (articleRoom === 0) {
      return fail(`This article already has its ${MAX_ARTICLE_FAQS} answers.`, 409);
    }
  }

  /*
    ⚠️ FREE SPENDS A SET PER RUN; PRO SPENDS NOTHING BUT A RATE LIMIT. Free gets
    FREE_GENERATED_FAQ_SET_CAP runs in the Answers tab, ever — runs, not answers,
    so every set may be as large as the plan allows. Claimed before the model is
    asked, because a claim after a successful generation would hand out work
    already paid for.
  */
  let setsLeft: number | null = null;

  if (!pro && articleRoom === null) {
    const claimed = await claimFreeGeneration(user.id, 'faq_set', 1);

    /* ⚠️ TWO DIFFERENT FAILURES, TWO DIFFERENT ANSWERS. A spent allowance is the
       customer's news and a 429; a claim that could not run is ours and a 502.
       They shared a message once, and a stale claim function told people they
       had used five sets they had never written. */
    if (!claimed.ok && claimed.reason === 'error') {
      return fail('We could not check your writing allowance. Please try again.', 502);
    }
    if (!claimed.ok) {
      return fail(
        `That's the ${FREE_GENERATED_FAQ_SET_CAP} sets of answers your free plan writes. Pro writes as many as you need.`,
        429,
      );
    }
    setsLeft = claimed.left;
  }

  /* No plan gate here any more — see the header. What the plan decides is
     `perCall` and `dailyLimit` above, both already applied. */

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      /* ⚠️ FAQ_SET_SCHEMA, NOT FAQ_SCHEMA — the dashboard's shape, which adds a
         name for the set so the Answers list can group by it. The public route
         next door keeps the original; see the note on both in lib/faq.ts. */
      output_config: { format: { type: 'json_schema', schema: FAQ_SET_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: buildPrompt({
            content,
            count: wanted,
            tone: coerceTone(tone),
            language: coerceLanguage(language),
            withTopic: true,
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

    const parsed = JSON.parse(text) as { topic?: string; faqs: Faq[] };
    const faqs = parsed.faqs;
    if (!Array.isArray(faqs) || faqs.length === 0) {
      return fail('No FAQs came back. Please try again.', 500);
    }

    /* Trimmed and length-capped: this becomes a row label, and a model that
       ignores "two to five words" should not be able to push a paragraph into
       the list. An empty string is left for the caller to bucket. */
    const topic = typeof parsed.topic === 'string' ? parsed.topic.trim().slice(0, 80) : '';

    /* ⚠️ `left` IS null FOR PRO, NOT A BIG NUMBER. Pro has no answer allowance
       to report, and sending a made-up ceiling would put a limit on screen that
       nothing enforces. The panel shows the line only when a number arrives. */
    return NextResponse.json({ topic, faqs, left: setsLeft });
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

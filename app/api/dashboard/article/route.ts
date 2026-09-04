import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import type { PageContent } from '@/lib/audit/types';
import {
  articleSchema,
  buildArticlePrompt,
  completedStrings,
  countWords,
  MAX_ARTICLE_WORDS,
  MAX_BRIEF_CHARS,
  type ArticleGeneration,
} from '@/lib/article';
import { currentUser, siteForUser } from '@/lib/auth/dal';
import { canGenerate, isPro } from '@/lib/auth/entitlements';
import { claimFreeGeneration } from '@/lib/auth/free-allowance';
import { createAdminClient } from '@/lib/supabase/admin';
import { ARTICLE_CAP, FREE_ARTICLE_CAP, trackingPeriod } from '@/lib/dashboard/plans';
import { ARTICLE_RATE_LIMIT, checkRateLimit, limitKey } from '@/lib/rate-limit';

/*
  Writing one article, and optionally the FAQs that go with it.

  Same shape as its two neighbours in this folder: identity first, entitlement
  from the profile row, then the site looked up by id rather than trusted from
  the body. The rule /api/dashboard/generate states applies here unchanged —
  "a client that tells the server which tier it is on is not authorization, it's
  a bypass with extra steps."

  ⚠️ THIS IS THE ONLY ROUTE IN THE PRODUCT WITH A MONTHLY ALLOWANCE, and the
  allowance is spent by GENERATING, not by keeping. Deleting an article does not
  give the month back, because the model call is what cost money and it already
  happened. That is why the count below is `gte(created_at, period.start)` with
  no filter on what still exists — a row deleted from the dashboard has still
  been paid for. See ARTICLE_CAP in lib/dashboard/plans.ts.
*/

/*
  Between its two neighbours, and deliberately.

  The FAQ routes use claude-haiku-4-5 because turning supplied text into short
  questions and answers is close to transcription. The content plan uses
  claude-opus-5 because working out what an entire trade needs on its website is
  strategy. This is neither: it is a thousand words of prose that has to be
  accurate about a real business, readable by a sixth-grader, and free of the
  invented specifics a smaller model reaches for when it runs short of material.

  Sonnet gets that right at a fraction of Opus's cost, which matters because
  this button is pressed ten times a month rather than once per site.
*/
const MODEL = 'claude-sonnet-5';

/*
  A thousand words plus five FAQs is well inside this. The headroom is for the
  refusal case and for a model that pads before it stops — better to receive
  something over-long and report its real length than to have max_tokens cut a
  sentence in half, which is exactly what MAX_ARTICLE_WORDS refuses to do.
*/
const MAX_TOKENS = 8192;

/** Guard against a caller pasting an entire crawl of somebody else's site. */
const MAX_PAGES = 120;

/** Enough context to aim the article. More is padding the prompt with a backlog. */
const MAX_OPEN_QUESTIONS = 12;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Trusted only for shape — everything here came from a client we don't auth. */
function isPageContent(value: unknown): value is PageContent {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<PageContent>;
  return typeof p.url === 'string' && typeof p.title === 'string' && Array.isArray(p.headings);
}

/** One line per page: what it is called and what it covers. */
function summarise(pages: PageContent[]): string {
  return pages
    .slice(0, MAX_PAGES)
    .map((p) => {
      const parts = [p.url];
      if (p.title) parts.push(`title: ${p.title}`);
      if (p.headings.length) parts.push(`headings: ${p.headings.slice(0, 12).join(' | ')}`);
      return parts.join('\n  ');
    })
    .join('\n')
    .slice(0, 20_000);
}

export async function POST(request: Request) {
  // Identity before anything else — including before the rate limit, so the
  // limit is charged to the account rather than to a shared office IP.
  const user = await currentUser();
  if (!user) return fail('Sign in to write an article.', 401);

  /* The same predicate that gates the answer generator, not a second one. An
     articles-only entitlement would be a third thing to keep in step with the
     pricing page. See canGenerate() in lib/auth/entitlements.ts.

     ⚠️ IT IS A CONSTANT NOW AND THE REAL REFUSAL IS BELOW. Every plan may write;
     free's allowance is FREE_ARTICLE_CAP, claimed atomically further down. This
     line survives so the day writing is gated again there is one place to do
     it. */
  if (!canGenerate(user)) {
    return fail('Writing articles is part of Pro.', 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.', 400);
  }

  const { siteId, brief, pages, openQuestions, stream: wantsStream } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof siteId !== 'string' || !siteId) {
    return fail('Writing an article needs a site.', 400);
  }

  /* 404 rather than 403 for a site that isn't theirs — matching /api/audit and
     the answer generator. Telling a stranger that an id exists but isn't theirs
     is an answer they didn't earn. */
  const site = await siteForUser(siteId, user.id);
  if (!site) return fail('No such site on your account.', 404);

  /*
    The allowance, before the model call and before the rate limit.

    Order matters: being told "that's your ten for the month" is a real answer a
    customer can plan around, and it should not be pre-empted by a daily limit
    they would hit second. It also means a refused request never reaches
    Anthropic.
  */
  /*
    ⚠️ TWO BUDGETS OF DIFFERENT SHAPES, AND ONLY ONE OF THEM IS COUNTABLE FROM
    ROWS. Pro buys ARTICLE_CAP a month, counted from `articles` created since the
    billing anniversary — deleting one does hand it back, which is a small leak
    on ten a month and documented as such. Free buys FREE_ARTICLE_CAP ever, where
    the same leak would mean one article at a time forever, so its spend lives in
    a counter on the profile row that deleting cannot touch (0021).
  */
  let left: number | null = null;

  if (!isPro(user)) {
    const claimed = await claimFreeGeneration(user.id, 'article', 1);

    /* A claim that could not run is our fault, not a limit they reached — see
       the same split in the generate route. */
    if (!claimed.ok && claimed.reason === 'error') {
      return fail('We could not check your writing allowance. Please try again.', 502);
    }
    if (!claimed.ok) {
      return fail(
        `That's the ${FREE_ARTICLE_CAP === 1 ? 'one article' : `${FREE_ARTICLE_CAP} articles`} your free plan writes. Pro writes ${ARTICLE_CAP} a month.`,
        429,
      );
    }
    left = claimed.left;
  } else {
    const period = trackingPeriod({
      plan: user.plan,
      planSince: user.plan_since,
      accountCreatedAt: user.created_at,
    });

    if (!period) {
      // trackingPeriod() always answers for a real plan, so this means the profile
      // row is in a shape nothing anticipated. Refuse rather than spend against an
      // unknown budget — the same call /api/dashboard/tracking makes.
      console.error('No period for user', user.id);
      return fail('We could not work out your current month. Please contact support.', 409);
    }

    const db = createAdminClient();
    const { count: used, error: countError } = await db
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', period.start.toISOString());

    if (countError) {
      console.error('Could not read the article allowance:', countError);
      return fail('Could not check how many articles you have left. Please try again.', 502);
    }

    if ((used ?? 0) >= ARTICLE_CAP) {
      /* Built from the constant rather than typed, so the number in the sentence
         cannot drift from the number enforced. */
      return fail(
        period.end
          ? `That's all ${ARTICLE_CAP} articles for this month. Your allowance resets on ${period.end.toISOString().slice(0, 10)}.`
          : `That's all ${ARTICLE_CAP} articles on your plan.`,
        429,
      );
    }

    left = Math.max(0, ARTICLE_CAP - (used ?? 0) - 1);
  }

  if (!checkRateLimit(`article:${limitKey(user.id, request.headers)}`, ARTICLE_RATE_LIMIT)) {
    return fail("You've written a lot today. Try again tomorrow — it resets at midnight UTC.", 429);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-your-key-here') {
    return fail('ANTHROPIC_API_KEY is not configured.', 500);
  }

  const cleanBrief = typeof brief === 'string' ? brief.trim().slice(0, MAX_BRIEF_CHARS) : '';
  const cleanPages = Array.isArray(pages) ? pages.filter(isPageContent) : [];
  const cleanQuestions = Array.isArray(openQuestions)
    ? openQuestions
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .slice(0, MAX_OPEN_QUESTIONS)
    : [];

  /* Without pages and without a brief there is nothing to write from, and the
     model would invent a business. One or the other is enough. */
  if (cleanPages.length === 0 && !cleanBrief) {
    return fail(
      'Run a check on your site first, or tell us what the article should be about.',
      400,
    );
  }

  const client = new Anthropic({ apiKey });

  /* Built once so both modes below put exactly the same question to the model.
     Two copies of this object is two prompts that can quietly diverge. */
  const modelRequest = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { format: { type: 'json_schema' as const, schema: articleSchema() } },
    messages: [
      {
        role: 'user' as const,
        content: buildArticlePrompt({
          domain: site.domain,
          businessName: site.brand_name ?? site.name,
          industry: site.industry,
          location: site.location,
          brief: cleanBrief,
          siteSummary: cleanPages.length
            ? summarise(cleanPages)
            : 'No pages have been read for this site yet.',
          openQuestions: cleanQuestions,
        }),
      },
    ],
  };

  /* One place that turns a finished JSON string into the response payload, so
     the streaming and plain modes cannot disagree about what a result is. */
  const finish = (text: string) => {
    const parsed = JSON.parse(text) as ArticleGeneration;
    const article = parsed.article;

    if (!article?.title || !Array.isArray(article.sections) || article.sections.length === 0) {
      return null;
    }

    return {
      article,
      /*
        ⚠️ MEASURED HERE, AND NOTHING IS TRUNCATED. The prompt states the limit;
        this reports what actually arrived. Cutting the text at
        MAX_ARTICLE_WORDS would end it mid-sentence, which is a worse artefact
        than an article that runs a little long.
      */
      wordCount: countWords(article),
      limit: MAX_ARTICLE_WORDS,
      /* ⚠️ COMPUTED WHERE THE BUDGET WAS DECIDED, NOT RE-DERIVED HERE. The two
         plans count differently — a claim for free, a row count for Pro — so
         re-doing the arithmetic at this point would need both branches again
         and would drift from whichever one changed. `left` already holds what
         remains AFTER this article. */
      left,
    };
  };

  /*
    ⚠️ STREAMING IS OPT-IN AND ADDITIVE, EXACTLY AS IT IS ON /api/audit. A caller
    that does not ask for it posts the same body it always did and gets the same
    single JSON object back, so nothing already written can break.

    ⚠️ EVERY REFUSAL ABOVE THIS LINE STAYS PLAIN JSON IN BOTH MODES — the plan
    allowance, the entitlement 403, the ownership 404, the daily limit. They are
    decided before any work starts, so there is no stream to put them in, and a
    client that has to parse two shapes for "no" is a client that will get one
    wrong.

    What is streamed is not progress. It is the article: the title and each
    heading, sent the moment that string finishes arriving. There is no
    percentage and no timer, because a model call reports neither — the same
    rule components/dashboard/audit-notice.tsx states about its own bar.
  */
  if (wantsStream === true) {
    const encoder = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: unknown) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));

        try {
          send({ type: 'phase', phase: 'thinking' });

          const stream = client.messages.stream(modelRequest);

          let acc = '';
          let sawText = false;
          let titleSent = false;
          let headingsSent = 0;

          for await (const event of stream) {
            if (event.type !== 'content_block_delta' || event.delta.type !== 'text_delta') {
              continue;
            }

            acc += event.delta.text;

            if (!sawText) {
              // The first token IS the boundary between thinking and writing.
              // Nothing before this is measurable, and nothing after it is guessed.
              sawText = true;
              send({ type: 'phase', phase: 'writing' });
            }

            if (!titleSent) {
              const [title] = completedStrings(acc, 'title');
              if (title) {
                titleSent = true;
                send({ type: 'title', text: title });
              }
            }

            /* Re-scanned rather than tracked incrementally: completedStrings()
               only ever returns finished strings, so "how many have I sent" is
               the whole state this needs. See the note on that function. */
            const headings = completedStrings(acc, 'heading');
            for (; headingsSent < headings.length; headingsSent++) {
              send({ type: 'heading', text: headings[headingsSent] });
            }
          }

          const message = await stream.finalMessage();

          if (message.stop_reason === 'refusal') {
            send({
              type: 'error',
              error: 'Claude declined to write that article. Try describing the subject differently.',
            });
            return;
          }
          if (message.stop_reason === 'max_tokens') {
            send({ type: 'error', error: 'That article came back too long to finish. Please try again.' });
            return;
          }

          send({ type: 'phase', phase: 'saving' });

          const text = message.content.find((block) => block.type === 'text')?.text;
          const result = text ? finish(text) : null;

          if (!result) {
            send({ type: 'error', error: 'That article came back incomplete. Please try again.' });
            return;
          }

          send({ type: 'result', ...result });
        } catch (err) {
          console.error('Article stream failed:', err);
          send({ type: 'error', error: 'Something went wrong writing that. Please try again.' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(body, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        // Proxies that buffer would hold every heading back until the article
        // finished, which is the whole thing this mode exists to avoid.
        'X-Accel-Buffering': 'no',
      },
    });
  }

  try {
    const message = await client.messages.create(modelRequest);

    if (message.stop_reason === 'refusal') {
      return fail(
        'Claude declined to write that article. Try describing the subject differently.',
        400,
      );
    }
    if (message.stop_reason === 'max_tokens') {
      return fail('That article came back too long to finish. Please try again.', 500);
    }

    const text = message.content.find((block) => block.type === 'text')?.text;
    if (!text) return fail('Nothing came back. Please try again.', 500);

    const result = finish(text);
    if (!result) {
      return fail('That article came back incomplete. Please try again.', 500);
    }

    /* `left` inside is what remains AFTER this one. The client computes the
       same figure from its own rows for display; sending it means the number
       shown right after a write comes from the side that enforces it. */
    return NextResponse.json(result);
  } catch (err) {
    // Same taxonomy as the other generators — APIConnectionError extends
    // APIError in the TS SDK, so it has to be tested first.
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
    console.error('Unexpected article error:', err);
    return fail('Something went wrong. Please try again.', 500);
  }
}

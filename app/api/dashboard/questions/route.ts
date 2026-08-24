import { NextResponse } from 'next/server';
import { generateQuestions, isPageContent, MAX_ANSWERED } from '@/lib/questions-generate';
import { currentUser, siteForUser } from '@/lib/auth/dal';
import { canDiscover } from '@/lib/auth/entitlements';
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

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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

  /*
    ⚠️ RE-RUNNING discovery is what is gated, not seeing it. Every free signup
    gets one discovery pass during the onboarding scan and keeps the sample it
    produced; this refuses the SECOND model call, which is the part that costs
    money. See FREE_QUESTION_SAMPLE in lib/dashboard/plans.ts for the display
    side, which is a product gate rather than this one.
  */
  if (!canDiscover(user)) {
    return fail('Finding more questions is part of Pro.', 403);
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

  const alreadyAnswered = Array.isArray(answered)
    ? answered
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .slice(0, MAX_ANSWERED)
    : [];

  /*
    Everything from here — the prompt, the model, the caps, the error taxonomy —
    lives in lib/questions-generate.ts so the onboarding scan runner can call it
    too. This route keeps what is about the CALLER: who they are, whether they
    are allowed, and how often. See the note at the top of that file.
  */
  const result = await generateQuestions({
    domain: site.domain,
    industry: typeof industry === 'string' ? industry : null,
    location: typeof location === 'string' ? location : null,
    hint: typeof hint === 'string' ? hint : '',
    pages: pages.filter(isPageContent),
    answered: alreadyAnswered,
  });

  if (!result.ok) return fail(result.error, result.status);

  return NextResponse.json({ questions: result.questions });
}

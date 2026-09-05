import { NextResponse } from 'next/server';
import { buildContentPlan, isPageContent } from '@/lib/content-generate';
import { currentUser, siteForUser } from '@/lib/auth/dal';
import { canContent } from '@/lib/auth/entitlements';
import { checkRateLimit, CONTENT_RATE_LIMIT, limitKey } from '@/lib/rate-limit';

/*
  The content plan: the pages this industry expects, and ten things to write.

  Authenticated, and the most expensive call in the app at roughly a sixth of a
  dollar per run — which is why it takes a `siteId` and looks the site up,
  rather than taking the `domain` string it used to. A domain in a request body
  is an instruction to spend money on whatever the caller names; a site id
  checked against `user_id` is a claim we can refuse.

  The rule this route has always stated still holds and is now enforceable:
  there is no `plan` or tier field read from the body. Entitlement comes from
  the row, via lib/auth/entitlements.ts.

  ⚠️ THE MODEL CALL ITSELF NOW LIVES IN lib/content-generate.ts, and this route
  is only the caller-facing half: auth, rate limiting, ownership, and turning a
  failure back into an HTTP code. The onboarding scan builds a topic list from
  the same function with no request and no session to work from — see the note
  at the top of that module, and the identical split questions-generate.ts made
  first. The prompt, the model, the token budget and the page cap live there;
  none of them should reappear here.
*/

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  // Identity before anything else — including before the rate limit, so the
  // limit can be charged to the account rather than to a shared office IP.
  const user = await currentUser();
  if (!user) return fail('Sign in to build a content plan.', 401);

  if (!checkRateLimit(`content:${limitKey(user.id, request.headers)}`, CONTENT_RATE_LIMIT)) {
    return fail("That's the content plans for today. They reset at midnight UTC.", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.', 400);
  }

  const { siteId, industry, location, hint, pages } = (body ?? {}) as Record<string, unknown>;

  if (typeof siteId !== 'string' || !siteId) {
    return fail('A site is required.', 400);
  }

  // The domain comes off the row, not the request. This is the whole point of
  // the change: we spend money on a site the caller demonstrably owns.
  const site = await siteForUser(siteId, user.id);
  if (!site) return fail('No such site on your account.', 404);

  if (!canContent(user)) {
    return fail('The list of pages your industry expects is part of Pro.', 403);
  }

  if (!Array.isArray(pages) || pages.length === 0) {
    return fail('Run a full audit first — there are no pages to plan from.', 400);
  }

  /* Shape-filtered here as well as inside buildContentPlan, so a body of a
     hundred junk objects is refused with the message that names the fix rather
     than the generic one. */
  const clean = pages.filter(isPageContent);
  if (clean.length === 0) {
    return fail('Those pages could not be read. Run the audit again.', 400);
  }

  const result = await buildContentPlan({
    domain: site.domain,
    industry: typeof industry === 'string' && industry.trim() ? industry.trim() : null,
    location: typeof location === 'string' && location.trim() ? location.trim() : null,
    hint: typeof hint === 'string' ? hint : '',
    pages: clean,
  });

  if (!result.ok) return fail(result.error, result.status);

  return NextResponse.json(result.plan);
}

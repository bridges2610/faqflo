import { NextResponse } from 'next/server';
import { currentUser, siteForUser } from '@/lib/auth/dal';
import { claimFreeGeneration } from '@/lib/auth/free-allowance';
import { createAdminClient } from '@/lib/supabase/admin';
import { summaryPagesFor } from '@/lib/auth/entitlements';
import { FREE_SUMMARY_CAP } from '@/lib/dashboard/plans';
import { SUMMARY_PAGES, buildSummaryPrompt, factsHash } from '@/lib/dashboard/summary';
import type { SummaryFacts } from '@/lib/dashboard/summary';
import { SUMMARY_STREAM_HEADERS, replayStream, streamSummary } from '@/lib/summary-generate';
import { SUMMARY_RATE_LIMIT, checkRateLimit, limitKey } from '@/lib/rate-limit';

/*
  The help panel's writer.

  Order of business, and it is the order app/api/dashboard/generate/route.ts
  established: who are you, may you have this screen, is it your site, have I
  already written this, is there allowance left, are you hammering me — and only
  then does anything cost money.

  ⚠️ THE NUMBERS COME FROM THE BROWSER AND THE PERMISSIONS DO NOT. The facts in
  the body are what the customer's own screen is displaying, and re-deriving
  them here would be a second implementation that eventually disagrees with the
  first — a summary explaining "3 of 9" beside a screen reading "3 of 12". The
  plan, the allowance and the business name are read from the profile and site
  rows, because a client that tells the server which tier it is on is not
  authorization, it is a bypass with extra steps.

  What a tampered body can therefore do: make this account's own summary
  describe numbers its own screen does not show. What it cannot do: reach
  another account's site, a screen its plan does not include, or a fourth free
  summary.
*/

const fail = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

/** Shape check only — the values are the customer's own and are not second-guessed. */
function readFacts(value: unknown): SummaryFacts | null {
  if (typeof value !== 'object' || value === null) return null;
  const facts = value as Partial<SummaryFacts>;
  if (typeof facts.page !== 'string') return null;
  if (facts.schedule !== 'once' && facts.schedule !== 'weekly') return null;
  if (typeof facts.scanned !== 'boolean') return null;
  if (!Array.isArray(facts.lines) || facts.lines.some((l) => typeof l !== 'string')) return null;

  /* A cap, not a validation: the prompt is built from these, and an unbounded
     list is an unbounded bill. Every real fact block is well under twenty. */
  if (facts.lines.length > 40) return null;

  return facts as SummaryFacts;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return fail('Sign in to get a summary.', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('That request could not be read.', 400);
  }

  const { siteId, page, facts: rawFacts } = (body ?? {}) as {
    siteId?: unknown;
    page?: unknown;
    facts?: unknown;
  };

  if (typeof siteId !== 'string' || !siteId) return fail('Which site?', 400);

  const entry = SUMMARY_PAGES.find((p) => p.key === page);
  if (!entry) return fail('There is no summary for that screen.', 400);

  const facts = readFacts(rawFacts);
  if (!facts || facts.page !== entry.key) return fail('That request could not be read.', 400);

  /*
    ⚠️ SCOPE AND SPEND ARE DIFFERENT REFUSALS AND MUST NOT SHARE A SENTENCE.
    This one is "that screen is Pro"; the 429 further down is "that was your
    third". Answering the first with the second sends somebody to the pricing
    page to solve a problem upgrading will not solve, and answering the second
    with the first tells a customer who already has the feature that they do
    not.
  */
  const scope = summaryPagesFor(user);
  if (scope === 'home' && entry.key !== 'home') {
    return fail('Summaries of this screen are part of Pro.', 403);
  }

  /* 404 rather than 403 for someone else's row — the convention every dashboard
     route follows, because 403 confirms the id exists. */
  const site = await siteForUser(siteId, user.id);
  if (!site) return fail('That site could not be found.', 404);

  const db = createAdminClient();
  const hash = factsHash(facts);
  const isFree = scope === 'home';

  /*
    ⚠️ THE REPLAY CHECK COMES BEFORE THE ALLOWANCE, AND THAT ORDERING IS THE
    FEATURE. Reopening the panel on numbers that have not moved must cost
    nothing — otherwise three summaries is really "one summary you may look at
    three times", and a customer discovers that by losing two of them.

    tracking/route.ts:206-217 does the same thing for the same reason: it
    returns early and free when there is nothing pending, so a no-op press
    spends no allowance.
  */
  const { data: stored, error: storedError } = await db
    .from('page_summaries')
    .select('body, facts_hash')
    .eq('site_id', site.id)
    .eq('page_key', entry.key)
    .maybeSingle<{ body: string; facts_hash: string }>();

  /* ⚠️ READ, NOT IGNORED. supabase-js returns errors rather than throwing, so an
     unread one here would silently turn every replay into a fresh model call —
     a bill nobody would notice until the allowance ran out. */
  if (storedError) {
    console.error('Could not read stored summary:', storedError.message);
  }

  /* ⚠️ ?? 0 BECAUSE THE COLUMN MAY NOT EXIST YET. currentUser() reads the
     profile with select('*'), so between deploying this code and applying 0023
     the field is simply absent — and `CAP - undefined` is NaN, which would
     print "NaN of 3 free summaries left" on the replay path. The claim itself
     still refuses correctly in that window: the function raises `unknown kind
     summary`, which free-allowance.ts reports as 'error' rather than 'spent'. */
  const remaining = isFree ? Math.max(0, FREE_SUMMARY_CAP - (user.free_summaries_used ?? 0)) : null;

  if (stored && stored.facts_hash === hash) {
    return new Response(replayStream(stored.body, remaining), {
      headers: SUMMARY_STREAM_HEADERS,
    });
  }

  /*
    ⚠️ ALLOWANCE BEFORE RATE LIMIT, the order article/route.ts:131-143 sets out:
    "that's your third" must never be pre-empted by a daily-limit message about
    a ceiling the customer has not bought and cannot see.
  */
  let left: number | null = null;

  if (isFree) {
    const claim = await claimFreeGeneration(user.id, 'summary', 1);

    if (!claim.ok && claim.reason === 'error') {
      return fail('The summary service is unavailable right now. Please try again later.', 502);
    }
    if (!claim.ok) {
      return fail(
        `That was the last of your ${FREE_SUMMARY_CAP} free summaries. Pro explains every screen, and rewrites them as your numbers move.`,
        429,
      );
    }
    left = claim.left;
  }

  const withinLimit = checkRateLimit(
    `summary:${limitKey(user.id, request.headers)}`,
    SUMMARY_RATE_LIMIT,
  );
  if (!withinLimit) {
    return fail(`That is ${SUMMARY_RATE_LIMIT} summaries today. Try again tomorrow.`, 429);
  }

  const prompt = buildSummaryPrompt({
    /* ⚠️ brand_name, NOT name. `name` is usually the domain the customer typed,
       and "Here's how gikas-roofing-com is doing" is a sentence no human would
       write. Null falls through to the domain — see buildSummaryPrompt. */
    businessName: site.brand_name,
    domain: site.domain,
    pageLabel: entry.label,
    pagePurpose: entry.purpose,
    facts,
  });

  const result = streamSummary({
    prompt,
    left,
    onComplete: async (text) => {
      const { error } = await db.from('page_summaries').upsert(
        {
          site_id: site.id,
          user_id: user.id,
          page_key: entry.key,
          body: text,
          facts_hash: hash,
        },
        { onConflict: 'site_id,page_key' },
      );
      if (error) throw new Error(error.message);
    },
  });

  if (!result.ok) return fail(result.error, result.status);

  return new Response(result.stream, { headers: SUMMARY_STREAM_HEADERS });
}

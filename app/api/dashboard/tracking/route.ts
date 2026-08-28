import { NextResponse } from 'next/server';
import { currentUser, siteForUser } from '@/lib/auth/dal';
import { canRunCheckNow, trackingPlanFor } from '@/lib/auth/entitlements';
import { trackingPeriod } from '@/lib/dashboard/plans';
import type { Engine } from '@/lib/dashboard/types';
import { checkRateLimit, limitKey, TRACKING_RATE_LIMIT } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { ALL_ENGINES, checkBatch, PROMPTS_PER_RUN, type QuestionSlice } from '@/lib/tracking/run';

/*
  Run citation tracking for one site.

  The first route in this product that asks an answer engine anything. Until now
  every surface said so plainly rather than showing a zero — see the empty state
  in tracking-workspace.tsx and the `locked` visibility pillar.

  TWO THINGS ARE LOAD-BEARING HERE.

  1. IT RUNS A SLICE, NOT A PERIOD. A full run is 25 prompts × 3 engines = 75
     search-backed calls and will not fit in one request; this app holds itself
     to ~60s because that is roughly the platform's ceiling. So the route checks
     whatever has not been checked today, up to PROMPTS_PER_RUN, and reports
     what remains. The client asks again. Same shape as the crawler spending a
     page budget and saying where it stopped.

  2. THE CLIENT SUPPLIES THE QUESTIONS, THE SERVER SUPPLIES EVERYTHING ELSE.
     Discovered questions live in localStorage today, so the body is the only
     place they can come from — the same concession app/api/dashboard/content
     makes for `pages`. What the body may NOT decide is which site, how many
     prompts, or whether the customer is allowed: the domain is read off the
     owned row, the list is capped at the PLAN's promptCap here, and the plan is
     read from the profile row server-side. A domain in a body is an instruction
     to spend money on whatever the caller names.
*/

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Key for one question × engine pair.
 *
 * ⚠️ NUL as the separator, written as an escape and never as a literal byte.
 * Questions carry spaces, quotes and punctuation, so a printable delimiter
 * could in principle collide; a raw NUL in the source would make this file
 * non-text and silently invisible to `grep`. Same call, and the same reasoning,
 * as lib/dashboard/store.ts.
 */
function pairKey(question: string, engine: Engine): string {
  return `${question}\u0000${engine}`;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return fail('Sign in to run citation tracking.', 401);

  /*
    ⚠️ THE RATE LIMIT IS CHARGED FURTHER DOWN, NOT HERE — see below the
    `pending.length === 0` return. A request that turns out to have nothing left
    to ask spends no money and must cost no allowance, or the customer pays for
    pressing a button that did nothing. Everything above that point is reads.
  */

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.');
  }

  const { siteId, questions } = (body ?? {}) as Record<string, unknown>;
  if (typeof siteId !== 'string' || !siteId) return fail('A site is required.');

  const site = await siteForUser(siteId, user.id);
  // 404 rather than 403: confirming an id exists but belongs to someone else
  // tells an attacker their guess was right.
  if (!site) return fail('No such site on your account.', 404);

  const plan = trackingPlanFor(user);

  /*
    ⚠️ THIS USED TO READ `plan.schedule === 'once'`, WHICH WAS THE WRONG FIELD.

    It stood for "free has no button", and while free bought a single automatic
    run that was true — a manual press would have found nothing left and
    refused, which reads as broken. Free buys three runs now, so the premise is
    gone.

    But `schedule` never meant "may press the button" even when it gave the
    right answer. It describes the SCHEDULER: 'once' says nothing re-runs this
    account automatically, which is still true of free and is most of what Pro
    sells. Reading it as a permission conflated two questions that only happened
    to agree. canRunCheckNow() is the one actually being asked.

    ⚠️ WHAT STOPS A FREE ACCOUNT SPENDING FOREVER IS BELOW, NOT HERE. The period
    budget counts citation_checks against plan.checksPerPeriod — 27 on free,
    over a window that never ends — and the pair skip refuses anything already
    asked today. Those are the enforcement. This gate is the plan's permission,
    and the two must not be merged: an entitlement that also counted spend would
    have to be given the count, and the client is not allowed to supply it.

    ⚠️ STILL REFUSED BEFORE THE UPSERT BELOW, DELIBERATELY. Further down this
    handler writes `questions` into tracked_prompts. Refusing after that point
    would leave this route usable as a side door for growing a watch list past
    its cap. The cap itself (plan.promptCap, applied to `wanted`) is what holds
    that line now that free is allowed through.
  */
  if (!canRunCheckNow()) {
    return fail('Running a check yourself is part of Pro.', 403);
  }

  /*
    The watch list.

    Capped here rather than trusted from the client, and de-duplicated because
    the same question watched twice would spend the allowance twice for one
    answer. Strings are stored exactly as sent — see the byte-identical warning
    on the column in 0006; trimming here would break the loop that marks a
    question covered.

    The cap comes from the plan, not from a global: 25 on Pro and 3 on free,
    which is a good part of what the upgrade is sold on.
  */
  const wanted = Array.isArray(questions)
    ? [
        ...new Set(
          questions.filter((q): q is string => typeof q === 'string' && q.trim().length > 0),
        ),
      ].slice(0, plan.promptCap)
    : [];

  if (wanted.length === 0) {
    return fail('There are no questions to track yet. Find some on the Opportunities page.');
  }

  const db = createAdminClient();

  const { error: upsertError } = await db
    .from('tracked_prompts')
    .upsert(
      wanted.map((question) => ({ site_id: site.id, user_id: user.id, question })),
      { onConflict: 'site_id,question', ignoreDuplicates: true },
    );

  if (upsertError) {
    console.error('Could not save tracked prompts:', upsertError);
    return fail('Could not save your tracked questions. Please try again.', 502);
  }

  /*
    What still needs asking today.

    Computed from what has already been stored rather than from an offset the
    client keeps, so pressing the button twice, refreshing mid-run, or opening
    two tabs cannot double-spend the allowance. A day is the unit because the
    schedule this is heading towards is weekly — re-asking the same question
    twice in one day tells you nothing new and bills twice for it.
  */
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  const { data: doneRows, error: doneError } = await db
    .from('citation_checks')
    .select('question, engine')
    .eq('site_id', site.id)
    .gte('checked_at', since.toISOString());

  if (doneError) {
    console.error('Could not read existing checks:', doneError);
    return fail('Could not read your tracking history. Please try again.', 502);
  }

  /*
    ⚠️ THE PAIR IS THE UNIT, NOT THE QUESTION.

    Engines fail one at a time — Perplexity answered 429 for twelve of fifteen
    checks in one real run while the other two were fine. Treating a question as
    finished because *some* engine answered it stranded those twelve until
    midnight UTC, on questions the customer had already part-paid for, and the
    report quietly under-counted that engine with nothing to say it was short.

    So we ask what is missing per question per engine. A re-press fills only the
    gaps: engines that already answered are not asked again and not billed again,
    which is the same double-spend guarantee as before, held at a finer grain.
  */
  const done = new Set(
    (doneRows ?? []).map((r) => pairKey(r.question as string, r.engine as Engine)),
  );

  const pending: QuestionSlice[] = wanted
    .map((question) => ({
      question,
      engines: ALL_ENGINES.filter((engine) => !done.has(pairKey(question, engine))),
    }))
    .filter((slice) => slice.engines.length > 0);

  if (pending.length === 0) {
    return NextResponse.json({
      checked: 0,
      remaining: 0,
      tracked: wanted.length,
      failures: [],
      done: true,
    });
  }

  /*
    Charged here, at the last moment before we spend somebody's money.

    Deliberately after the early return above: repeat presses with nothing
    pending are free, which is what makes the allowance a budget for real runs
    rather than for clicks. TRACKING_RATE_LIMIT is sized for the several
    requests one honest run takes — see the note on the constant.
  */
  if (!checkRateLimit(`tracking:${limitKey(user.id, request.headers)}`, TRACKING_RATE_LIMIT)) {
    return fail("That's the tracking runs for today. They reset at midnight UTC.", 429);
  }

  /*
    The period budget — the ceiling that keeps a $39 subscription from funding
    an unbounded bill on somebody else's API.

    ⚠️ Counted from a STORED anchor, never a rolling window. trackingPeriod()
    keys off the billing anniversary (profiles.plan_since). A rolling 30 days
    would let checks age out one at a time, so a customer at the ceiling would
    trickle through instead of being told a date.

    ⚠️ SCOPED BY SITE, BUDGETED BY ACCOUNT — and with SITE_CAP at 1 those are the
    same thing today. If multi-site Pro ever arrives, the count below has to
    change with it: an account with three sites would otherwise get three times
    the allowance it pays for.
  */
  const period = trackingPeriod({
    plan: user.plan,
    planSince: user.plan_since,
    accountCreatedAt: user.created_at,
  });

  if (!period) {
    // trackingPeriod() always answers for a real plan, so this means the profile
    // row is in a shape nothing anticipated. Refuse rather than spend against an
    // unknown budget.
    console.error('No tracking period for site', site.id, 'user', user.id);
    return fail('We could not work out your current tracking period. Please contact support.', 409);
  }

  const { count: spent, error: spentError } = await db
    .from('citation_checks')
    .select('*', { count: 'exact', head: true })
    .eq('site_id', site.id)
    .gte('checked_at', period.start.toISOString());

  if (spentError) {
    console.error('Could not read the period budget:', spentError);
    return fail('Could not check your remaining allowance. Please try again.', 502);
  }

  const ceiling = plan.checksPerPeriod;
  const left = ceiling - (spent ?? 0);

  if (left <= 0) {
    /*
      `period.end` is null when the allowance never refills, so the sentence has
      to branch. Only Pro reaches this line today — free is refused further up
      for having no button at all — but printing "resets on 1970-01-01" the day
      that stops being true is the kind of wrong that survives a review.
    */
    return fail(
      period.end
        ? `That's all ${ceiling} engine checks for this month. Your allowance resets on ${period.end.toISOString().slice(0, 10)}.`
        : `That's all ${ceiling} engine checks included in your plan.`,
      429,
    );
  }

  /*
    Trimmed to what is left, not refused outright.

    A customer with thirty checks remaining should get thirty. Each question
    costs one check per engine, so the budget is divided by the engine count to
    turn it back into a number of questions.
  */
  const affordable = Math.max(1, Math.floor(left / ALL_ENGINES.length));
  const batch = pending.slice(0, Math.min(PROMPTS_PER_RUN, affordable));

  const { outcomes, failures } = await checkBatch(batch, {
    domain: site.domain,
    /*
      Null means "send no location", which is what every check before this did.
      Not guessed from sites.location — that holds free text like
      'Rockland County, NY', and inferring a country from it would present a
      guess as a setting.
    */
    country: site.country,
    /*
      The name the engines would actually say, falling back to the label.

      `brand_name` is what the audit read off the site's own schema.org markup;
      `name` is free text from the add-site form, and most people type their
      domain there. Matching a mention against "Letsroof" when the company is
      "Segelman Shaw Roofing" finds nothing and records `absent` — undercounting
      the customer against their own results. The fallback keeps a site that has
      never been audited working exactly as before.
    */
    name: site.brand_name ?? site.name,
  });

  /*
    Nothing to store means every engine failed. Say so rather than reporting a
    successful run of zero checks — the difference between "no engine answered"
    and "you were not cited" is the whole point of this table.
  */
  if (outcomes.length === 0) {
    return fail(
      failures.length
        ? `No engine answered. ${failures.map((f) => `${f.engine}: ${f.detail}`).join(' · ')}`
        : 'No engine answered.',
      502,
    );
  }

  const { error: insertError } = await db.from('citation_checks').insert(
    outcomes.map((o) => ({
      site_id: site.id,
      user_id: user.id,
      question: o.question,
      engine: o.engine,
      outcome: o.outcome,
      cited_instead: o.citedInstead,
      sources: o.sources,
      answer_excerpt: o.excerpt,
      /*
        ⚠️ WHAT THIS CHECK WAS ACTUALLY ASKED AS — null for Gemini, always.

        Gemini rejects a location parameter (see the note in gemini.ts), so its
        answers are not asked from anywhere in particular no matter what the
        site is set to. Stamping them with the site's country would record a
        targeting that did not happen, and a later comparison "US vs UK" would
        silently include rows that were neither.
      */
      country: o.engine === 'Gemini' ? null : site.country,
    })),
  );

  if (insertError) {
    console.error('Could not record citation checks:', insertError);
    return fail('The engines answered but we could not save the results.', 502);
  }

  return NextResponse.json({
    checked: batch.length,
    remaining: pending.length - batch.length,
    tracked: wanted.length,
    // Surfaced, not swallowed: a run where Gemini was unconfigured produced a
    // real but partial picture, and a low number with no explanation reads as
    // "nobody cites you".
    failures,
    done: pending.length - batch.length === 0,
  });
}

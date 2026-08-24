import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/*
  Put a site's first scan on the queue.

  ⚠️ ONE COPY, TWO CALLERS. /api/onboarding/start queues a scan the moment a
  site is created; /api/scan/start queues one when the customer asks, because
  the first attempt did not survive. Written twice, the copy nobody exercises is
  the one that runs when something has already gone wrong — which is precisely
  when it needs to work.

  ⚠️ THE TRIGGER MOVED FROM PAYMENT TO SIGNUP, AND THAT IS THE COST DECISION
  BEHIND THE FREE TIER. Stripe fulfilment used to queue this the moment somebody
  paid $129, so every scan was funded before it ran. Now every free signup gets
  one: a one-page crawl, an Opus discovery call, and five questions across three
  engines — roughly $0.50–$1.00 of somebody else's API per account, spent whether
  or not they ever come back. What bounds it is hasScanned() below, the
  per-account check meter, and SITE_CAP. Removing any of those three makes free
  signup an unbounded bill.
*/

/**
 * A Postgres error, said out loud.
 *
 * ⚠️ THIS EXISTS BECAUSE `console.error(msg, error)` PRINTS `{}`.
 *
 * PostgrestError's fields are not own-enumerable, so passing the object to
 * console.error logs an empty pair of braces. That is not a cosmetic problem:
 * a real purchase failed with `Could not queue the first scan for site …: {}`,
 * and the message it swallowed was "Could not find the table 'public.scan_jobs'"
 * — a one-line fix that instead took a database probe to find.
 *
 * Anything that logs a Supabase error should go through this.
 */
export function describeDbError(error: { code?: string; message?: string; details?: string | null }): string {
  return [error.code, error.message, error.details].filter(Boolean).join(' · ') || 'unknown error';
}

export type EnqueueResult =
  | { ok: true; created: boolean }
  | { ok: false; error: string };

/**
 * Has this site ever had a scan queued for it?
 *
 * ⚠️ THE FREE TIER'S "ONCE" IS ENFORCED WITH THIS, and it deliberately asks
 * about jobs rather than about results. Asking "has an audit ever completed"
 * would let a free account re-queue after any failure — including one it caused
 * by closing the tab — and a crawl plus an Opus call is spent whether or not the
 * run finished. A job that exists at all is a budget that was already committed.
 *
 * The cost of erring this way is a free account whose one scan genuinely broke
 * and cannot retry. That is a support email, and support can delete the row.
 * The other direction is a loop.
 *
 * Counts rows rather than reading them: the caller only needs the boolean, and
 * scan_jobs carries a progress blob per row.
 */
export async function hasScanned(siteId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { count, error } = await supabase
    .from('scan_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('site_id', siteId);

  if (error) {
    /*
      Fail CLOSED — treat an unreadable table as "already scanned".

      The failure this protects against is the expensive one: if the count
      cannot be read, letting the scan through means an unbounded number of
      free runs for as long as the error persists. Refusing means a customer
      sees "we could not start your check", which is visible and recoverable.
    */
    console.error(`Could not count scans for site ${siteId}:`, describeDbError(error));
    return true;
  }

  return (count ?? 0) > 0;
}

/**
 * Queue a scan, and give the site somewhere to put answers.
 *
 * ⚠️ THE "HOME PAGE" GROUP IS A BUG FIX RIDING ALONG, AND IT MATTERS MORE THAN
 * IT LOOKS. store.createSite() has always created one, but that runs only when
 * somebody adds a site by hand on the Sites page. The signup funnel — the
 * path essentially every customer takes — creates the row server-side in
 * app/api/onboarding/start/route.ts and never calls it. A staged signup confirmed
 * the result: an audit, and an Answers page with no group at all, so the first
 * thing a customer saw was a section with nothing in it.
 *
 * ⚠️ The scan does NOT generate answers into this group. Every other stage is a
 * measurement, true whether or not the customer agrees; answers are content in
 * their voice, and nothing in this product has ever saved model output without
 * a person accepting it first. The group is an empty page waiting for them.
 *
 * ⚠️ CALLERS ARE RESPONSIBLE FOR ENTITLEMENT. This spends money — a crawl, an
 * Opus call and fifteen search-backed engine calls — and deliberately does not
 * check the plan itself, because its callers ask different questions: onboarding
 * asks "is this account allowed a first scan", /api/scan/start asks "is this
 * account allowed ANOTHER one". Both go through hasScanned() and isPro(). A
 * permission check here would be a third opinion, and the weakest of the three.
 *
 * `created` distinguishes "queued one" from "one was already live". Both are
 * success; only the first is news.
 */
export async function enqueueScan(siteId: string, userId: string): Promise<EnqueueResult> {
  const supabase = createAdminClient();

  /*
    ⚠️ The returned error is checked, NOT a try/catch. supabase-js resolves with
    `{ error }` rather than throwing, so the try/catch that used to wrap this
    could never fire — a failure here was silent, and the missing group would
    have looked like a UI bug for as long as anyone cared to look.

    23505 is the unique index on (site_id, path): the group already exists,
    which is the expected outcome when fulfilment runs twice for one payment.
  */
  const { error: groupError } = await supabase.from('faq_groups').insert({
    id: `grp_${crypto.randomUUID()}`,
    site_id: siteId,
    user_id: userId,
    name: 'Home page',
    path: '/',
    position: 0,
  });

  if (groupError && groupError.code !== '23505') {
    console.error(`Could not create the default group for site ${siteId}:`, describeDbError(groupError));
  }

  const { error } = await supabase.from('scan_jobs').insert({
    id: `scan_${crypto.randomUUID()}`,
    site_id: siteId,
    user_id: userId,
    stage: 'audit',
    status: 'queued',
  });

  // 23505 is the partial unique index doing its job — a scan is already queued
  // or running for this site. That is the success case for the second caller,
  // not a failure.
  if (error?.code === '23505') return { ok: true, created: false };

  if (error) {
    const detail = describeDbError(error);
    console.error(`Could not queue the first scan for site ${siteId}:`, detail);
    return { ok: false, error: detail };
  }

  return { ok: true, created: true };
}

/**
 * Queue one weekly check, as a tracking-only job.
 *
 * ⚠️ STAGE 'tracking', NOT 'audit'. enqueueScan above starts at the beginning
 * because a new account has nothing yet; a weekly check has a crawl and a
 * question list already and only needs the engines asked. Starting at 'audit'
 * would re-crawl a hundred pages and re-run an Opus call every single week,
 * which is most of the cost of the product for none of the answer.
 *
 * ⚠️ NO MILESTONE ID ANY MORE. It used to travel on the job row so the tick
 * route could write an outcome back to tracking_milestones without being told
 * anything. There is no milestone to write back to: the cursor on the site row
 * has already moved forward, and what actually happened is the citation_checks
 * rows the job writes.
 */
export async function enqueueTrackingJob(siteId: string, userId: string): Promise<EnqueueResult> {
  const supabase = createAdminClient();

  const { error } = await supabase.from('scan_jobs').insert({
    id: `scan_${crypto.randomUUID()}`,
    site_id: siteId,
    user_id: userId,
    stage: 'tracking',
    status: 'queued',
  });

  /*
    23505 is the one-live-job-per-site index. Another scan is already running for
    this site — an onboarding scan, or last week's check still working through
    its slices. The caller re-arms the cursor for tomorrow rather than losing the
    week; see rearmCheck() in lib/tracking/schedule.ts.
  */
  if (error?.code === '23505') return { ok: true, created: false };

  if (error) {
    const detail = describeDbError(error);
    console.error(`Could not queue the scheduled check for site ${siteId}:`, detail);
    return { ok: false, error: detail };
  }

  return { ok: true, created: true };
}

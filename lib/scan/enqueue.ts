import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/*
  Put a site's first scan on the queue.

  ⚠️ ONE COPY, TWO CALLERS. Stripe fulfilment queues a scan the moment somebody
  pays; /api/scan/start queues one when the customer asks, because the first
  attempt did not survive. Written twice, the copy nobody exercises is the one
  that runs when something has already gone wrong — which is precisely when it
  needs to work.
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
 * Queue a scan, and give the site somewhere to put answers.
 *
 * ⚠️ THE "HOME PAGE" GROUP IS A BUG FIX RIDING ALONG, AND IT MATTERS MORE THAN
 * IT LOOKS. store.createSite() has always created one, but that runs only when
 * somebody adds a site by hand on the Sites page. The checkout funnel — the
 * path essentially every paying customer takes — creates the row server-side in
 * app/api/checkout/start/route.ts and never calls it. A staged signup confirmed
 * the result: an audit, and an Answers page with no group at all, so the first
 * thing a customer saw after paying was a section with nothing in it.
 *
 * ⚠️ The scan does NOT generate answers into this group. Every other stage is a
 * measurement, true whether or not the customer agrees; answers are content in
 * their voice, and nothing in this product has ever saved model output without
 * a person accepting it first. The group is an empty page waiting for them.
 *
 * ⚠️ CALLERS ARE RESPONSIBLE FOR ENTITLEMENT. This spends money — a crawl, an
 * Opus call and dozens of search-backed engine calls — and deliberately does not
 * check whether the customer has paid, because its two callers know different
 * things: fulfilment has just watched the payment succeed, and the route has a
 * session to check `canTrack` against. A permission check here would be a third
 * opinion, and the weakest of the three.
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
 * Queue one scheduled check, as a tracking-only job.
 *
 * ⚠️ STAGE 'tracking', NOT 'audit'. enqueueScan above starts at the beginning
 * because a new purchase has nothing yet; a milestone has a crawl and a question
 * list already and only needs the engines asked. Starting at 'audit' would
 * re-crawl a hundred pages and re-run an Opus call on every checkpoint, which is
 * most of the cost of the product for none of the answer.
 *
 * The milestone id travels ON THE JOB ROW rather than in the caller's memory, so
 * the tick route can write the outcome back without being told anything — the
 * property that lets it take no arguments and trust no caller.
 */
export async function enqueueTrackingJob(
  siteId: string,
  userId: string,
  milestoneId: string,
): Promise<EnqueueResult> {
  const supabase = createAdminClient();

  const { error } = await supabase.from('scan_jobs').insert({
    id: `scan_${crypto.randomUUID()}`,
    site_id: siteId,
    user_id: userId,
    stage: 'tracking',
    status: 'queued',
    milestone_id: milestoneId,
  });

  /*
    23505 is the one-live-job-per-site index. Another scan is already running for
    this site — a purchase scan, or yesterday's milestone still working through
    its slices. The caller puts the milestone back to 'pending' and the next
    daily sweep picks it up; a day late is a day late, but marking it done here
    would lose a check the customer was promised.
  */
  if (error?.code === '23505') return { ok: true, created: false };

  if (error) {
    const detail = describeDbError(error);
    console.error(`Could not queue the scheduled check for site ${siteId}:`, detail);
    return { ok: false, error: detail };
  }

  return { ok: true, created: true };
}

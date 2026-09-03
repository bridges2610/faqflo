import 'server-only';

import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SiteRow } from '@/lib/supabase/types';

/**
 * The weekly check schedule — one date per site, moved forward as it fires.
 *
 * ⚠️ THIS REPLACED A MILESTONE TABLE, AND THE SHAPE CHANGE IS THE POINT.
 *
 * Get Cited promised four checks on four named days (7, 30, 60, 90) inside a
 * fixed window, so the schedule was FINITE and had to be materialised: four rows
 * per site, each needing a status, because "was this specific promised check
 * delivered?" is a question rows can answer and a date cannot. It also needed a
 * 'skipped' status, so that an existing customer's already-passed milestones did
 * not all fire at once the moment the feature shipped.
 *
 * Pro promises a cadence. There is no list of promised dates to keep score
 * against — what ran is citation_checks.checked_at, and what is next is one
 * column. A milestone table would grow by one row per site per week, forever, to
 * store a fact that is already implied by "a week after the last one".
 *
 * ⚠️ THIS IS NOW THE ONLY WRITER OUTSIDE THE CLAIM. lib/stripe/fulfil.ts used to
 * carry a private setWeeklySchedule() that did the same job a second way, while
 * the functions here had no callers at all — dead code beside a duplicate. It
 * calls startWeeklySchedule/stopWeeklySchedule below now. claim_due_checks()
 * (0012) still moves the cursor forward as it fires, which is the one write that
 * belongs in SQL because it has to be atomic with the claim.
 */

/**
 * How many days after signing up a site's weekly check lands: 0-6, fixed.
 *
 * ⚠️ WITHOUT THIS EVERY CUSTOMER WHO SUBSCRIBES ON A TUESDAY CHECKS ON A TUESDAY,
 * FOREVER. The cursor used to be set to now() on upgrade, and claim_due_checks()
 * advances it by exactly seven days from the due date to hold a stable weekday —
 * so the subscribe day became the check day permanently, and a cohort that
 * signed up together stayed together. Migration 0012's backfill was worse: it
 * put every site that existed then on the same instant.
 *
 * ⚠️ DETERMINISTIC, NOT RANDOM, AND THAT IS THE REQUIREMENT. rearmCheck() runs
 * whenever a claimed site could not be enqueued, and anything drawn from a
 * random source would shuffle that customer's check day every time it fired.
 * The same id must always give the same day.
 *
 * ⚠️ THE FIRST BYTE OF MD5, MATCHING THE SQL IN 0020 EXACTLY. That migration
 * staggers the sites that already existed using
 * `get_byte(decode(md5(id), 'hex'), 0) % 7`, which is this same arithmetic —
 * so a site lands on the same day whether the backfill or this code placed it.
 * A byte is used rather than a wider slice because casting hex to a signed
 * integer in Postgres can go negative, and a negative offset is a check date in
 * the past.
 *
 * The distribution is very slightly uneven — 256 does not divide by 7, so days
 * 0-3 are drawn 37 times in 256 and days 4-6 are drawn 36. Immaterial for
 * spreading load; noted so nobody reads it as a bug later.
 */
export function staggerOffsetDays(siteId: string): number {
  return createHash('md5').update(siteId).digest()[0] % 7;
}

/** When a site's first automatic check should fall due. */
export function firstCheckAt(siteId: string, from: Date = new Date()): Date {
  const due = new Date(from);
  due.setUTCDate(due.getUTCDate() + staggerOffsetDays(siteId));
  return due;
}

/**
 * Start the weekly cadence for one site. Idempotent by intent.
 *
 * ⚠️ `from` IS THE ANCHOR, NOT THE DUE DATE. The stagger is added to it, so a
 * caller passing now() gets a date 0-6 days out rather than now().
 */
export async function scheduleNextCheck(siteId: string, from: Date = new Date()): Promise<void> {
  const db = createAdminClient();

  const { error } = await db
    .from('sites')
    .update({ next_check_at: firstCheckAt(siteId, from).toISOString() })
    .eq('id', siteId);

  if (error) console.error(`Could not schedule checks for site ${siteId}:`, error.message);
}

/**
 * Start the cadence for every site on an account that is not already running.
 *
 * ⚠️ ONLY ROWS WHOSE CURSOR IS NULL, which is why this reads before it writes.
 * Subscription events arrive on every renewal, and re-stamping a cadence that is
 * already running would shunt everybody's check day to their invoice date — the
 * exact clustering the stagger exists to prevent.
 *
 * ⚠️ ONE UPDATE PER SITE, NOT ONE FOR THE ACCOUNT. Each site's date is derived
 * from its own id, so they cannot share a statement. SITE_CAP is 1, so this is a
 * loop over one row in every real case.
 *
 * Failures are logged, not thrown: claim_due_checks() re-checks profiles.plan on
 * every sweep, so a cursor that fails to appear costs a delayed check rather
 * than money, and turning a successful payment into a webhook retry storm is far
 * worse than that.
 */
export async function startWeeklySchedule(userId: string): Promise<void> {
  const db = createAdminClient();

  const { data, error } = await db
    .from('sites')
    .select('id')
    .eq('user_id', userId)
    .is('next_check_at', null);

  if (error) {
    console.error(`Could not read sites to schedule for user ${userId}:`, error.message);
    return;
  }

  for (const site of data ?? []) await scheduleNextCheck(site.id as string);
}

/** Stop the cadence for every site on an account. */
export async function stopWeeklySchedule(userId: string): Promise<void> {
  const db = createAdminClient();

  const { error } = await db
    .from('sites')
    .update({ next_check_at: null })
    .eq('user_id', userId)
    .not('next_check_at', 'is', null);

  if (error) {
    console.error(`Could not clear the check schedule for user ${userId}:`, error.message);
  }
}

/**
 * Stop the weekly cadence for one site.
 *
 * ⚠️ NOT THE ONLY THING STANDING BETWEEN A LAPSED ACCOUNT AND A BILL, and it
 * must not become that. claim_due_checks() joins profiles and requires
 * plan = 'pro' on every sweep precisely so that a cursor left behind by a
 * failed clear costs nothing. This is tidiness; the join is the guard.
 */
export async function clearSchedule(siteId: string): Promise<void> {
  const db = createAdminClient();

  const { error } = await db
    .from('sites')
    .update({ next_check_at: null })
    .eq('id', siteId)
    .not('next_check_at', 'is', null);

  if (error) console.error(`Could not clear the schedule for site ${siteId}:`, error.message);
}

/**
 * Put back a check that was claimed but could not be enqueued.
 *
 * claim_due_checks() moves the cursor forward as it hands out work, which is
 * what makes two overlapping sweeps safe. The cost is that a refusal downstream
 * — a scan already running for this site, most often — would otherwise silently
 * cost the customer a week. This is the analogue of the milestone runner
 * resetting a row to 'pending' rather than marking it failed.
 *
 * ⚠️ Deliberately `now()` rather than the original due date. The refusal that
 * brings us here is nearly always "a job is already live for this site", and
 * re-arming to a moment in the past means the next sweep claims it again, hits
 * the same live job, and loops until that job finishes. Today, once.
 *
 * ⚠️ AND DELIBERATELY NOT STAGGERED, WHICH IS WHY IT NO LONGER CALLS
 * scheduleNextCheck(). The stagger places a site's cadence when it STARTS; this
 * is a retry of a check that was already due today. Routing it through the
 * staggered path would push a deferred check up to a week out — quietly costing
 * a customer the check the re-arm exists to save — and would move their
 * established check day as a side effect of a transient collision.
 */
export async function rearmCheck(siteId: string): Promise<void> {
  const db = createAdminClient();

  const { error } = await db
    .from('sites')
    .update({ next_check_at: new Date().toISOString() })
    .eq('id', siteId);

  if (error) console.error(`Could not re-arm the check for site ${siteId}:`, error.message);
}

/** The sites the sweep is about to run, for logging. Read-only. */
export type ClaimedSite = Pick<SiteRow, 'id' | 'user_id' | 'domain' | 'next_check_at'>;
